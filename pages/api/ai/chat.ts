// Streaming chat endpoint with a tool-call loop.
//
// Wire protocol (Server-Sent Events, one JSON object per `data:` line):
//   { type: 'meta', conversationId, userMessageId }
//   { type: 'delta', text: '...' }                   // assistant content chunk
//   { type: 'tool_call', name, args }                // each tool invocation (after model emits it)
//   { type: 'tool_result', name, ok: true|false }    // after we execute the tool
//   { type: 'done', messageId, model }               // final assistant persisted
//   { type: 'error', message }                       // fatal error
//
// We cap the tool loop to MAX_TOOL_TURNS so a misbehaving model can't drive
// up cost indefinitely. We also limit message history sent to the model to
// HISTORY_LIMIT messages.

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { aiChat, aiChatStream, aiConfig, type ChatMessage } from '@/lib/aiClient';
import { AI_TOOLS, executeTool } from '@/lib/aiTools';

const MAX_TOOL_TURNS = 4;
const HISTORY_LIMIT = 20;

export const config = {
    api: {
        bodyParser: { sizeLimit: '64kb' },
        responseLimit: false
    }
};

interface ParsedBody {
    conversationId?: string;
    appId?: string;
    message: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const session = await requireSession(req, res);
    if (!session) return;

    let body: ParsedBody;
    try {
        body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ParsedBody;
    } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }
    const userText = (body?.message || '').toString().trim();
    if (!userText) return res.status(400).json({ error: 'Empty message' });
    if (userText.length > 4000) return res.status(400).json({ error: 'Message too long (max 4000 chars)' });

    let cfg;
    try {
        cfg = aiConfig();
    } catch (err: any) {
        return res.status(503).json({ error: err?.message || 'AI is not configured' });
    }

    // Load or create the conversation. Scoping by userId enforces auth.
    let conv = null;
    if (body.conversationId) {
        conv = await prisma.aiChatConversation.findFirst({
            where: { id: body.conversationId, userId: session.userId }
        });
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!conv) {
        conv = await prisma.aiChatConversation.create({
            data: {
                userId: session.userId,
                appId: body.appId || null,
                title: userText.slice(0, 80)
            }
        });
    } else if (!conv.title) {
        await prisma.aiChatConversation.update({
            where: { id: conv.id },
            data: { title: userText.slice(0, 80) }
        });
    }

    // Always keep the appId scope of the conversation in sync with the
    // currently-selected app on the client side. This lets the user switch
    // apps mid-conversation if they want to.
    if (body.appId && body.appId !== conv.appId) {
        await prisma.aiChatConversation.update({
            where: { id: conv.id },
            data: { appId: body.appId }
        });
        conv.appId = body.appId;
    }

    // Persist the user message.
    const userMsg = await prisma.aiChatMessage.create({
        data: { conversationId: conv.id, role: 'user', content: userText }
    });

    // Load recent history (oldest -> newest) for context.
    const history = await prisma.aiChatMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT
    });
    history.reverse();

    // Build the in-memory message list for the model. Convert persisted
    // messages back into the OpenAI chat format. For assistant messages
    // that contained tool calls, we stored the JSON tool-call payload in
    // `content` (role='assistant', toolName='__tool_calls__'). For
    // executed tool results, role='tool', toolName=<fn>, toolCallId=<id>.
    const sysPrompt = buildSystemPrompt(conv.appId);
    const messages: ChatMessage[] = [{ role: 'system', content: sysPrompt }];
    for (const m of history) {
        if (m.role === 'assistant' && m.toolName === '__tool_calls__') {
            try {
                const calls = JSON.parse(m.content);
                messages.push({ role: 'assistant', content: null, tool_calls: calls });
            } catch {
                // fall back to plain assistant
                messages.push({ role: 'assistant', content: m.content });
            }
        } else if (m.role === 'tool') {
            messages.push({
                role: 'tool',
                content: m.content,
                tool_call_id: m.toolCallId || undefined,
                name: m.toolName || undefined
            });
        } else if (m.role === 'user' || m.role === 'assistant') {
            messages.push({ role: m.role, content: m.content });
        }
    }

    // Begin SSE.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();

    const send = (obj: any) => {
        try {
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } catch {
            // socket may be closed
        }
    };

    send({ type: 'meta', conversationId: conv.id, userMessageId: userMsg.id });

    let aborted = false;
    req.on('close', () => {
        aborted = true;
    });

    try {
        let assistantContent = '';
        let finalModel = cfg.model;

        for (let turn = 0; turn < MAX_TOOL_TURNS + 1; turn++) {
            if (aborted) break;

            // Decide whether this is the final turn (force a text answer).
            const isFinalTurn = turn === MAX_TOOL_TURNS;
            const upstream = await aiChatStream({
                messages,
                tools: isFinalTurn ? undefined : AI_TOOLS,
                toolChoice: isFinalTurn ? undefined : 'auto',
                maxTokens: cfg.chatMaxTokens,
                temperature: cfg.chatTemperature
            });
            finalModel = upstream.headers.get('x-model') || finalModel;

            // Parse the SSE stream. Accumulate any tool_calls and forward
            // any text deltas straight to the client.
            const reader = upstream.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnText = '';
            const toolCallsAcc: Record<number, {
                id?: string;
                type?: string;
                function: { name?: string; arguments: string };
            }> = {};
            let finishReason: string | null = null;

            outer: while (true) {
                if (aborted) {
                    try { await reader.cancel(); } catch { /* ignore */ }
                    break;
                }
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let nl: number;
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const rawLine = buffer.slice(0, nl).replace(/\r$/, '');
                    buffer = buffer.slice(nl + 1);
                    if (!rawLine) continue;
                    if (!rawLine.startsWith('data:')) continue;
                    const data = rawLine.slice(5).trim();
                    if (!data) continue;
                    if (data === '[DONE]') break outer;

                    let parsed: any;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        continue;
                    }
                    if (parsed.model) finalModel = parsed.model;
                    const choice = parsed.choices?.[0];
                    if (!choice) continue;
                    const delta = choice.delta || {};
                    if (delta.content) {
                        turnText += delta.content;
                        send({ type: 'delta', text: delta.content });
                    }
                    if (Array.isArray(delta.tool_calls)) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCallsAcc[idx]) {
                                toolCallsAcc[idx] = { function: { arguments: '' } };
                            }
                            const slot = toolCallsAcc[idx];
                            if (tc.id) slot.id = tc.id;
                            if (tc.type) slot.type = tc.type;
                            if (tc.function?.name) slot.function.name = tc.function.name;
                            if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
                        }
                    }
                    if (choice.finish_reason) finishReason = choice.finish_reason;
                }
            }

            assistantContent += turnText;

            const toolCalls = Object.keys(toolCallsAcc)
                .sort((a, b) => Number(a) - Number(b))
                .map((k) => toolCallsAcc[Number(k)])
                .filter((tc) => tc.function?.name)
                .map((tc, i) => ({
                    id: tc.id || `call_${Date.now()}_${i}`,
                    type: 'function' as const,
                    function: { name: tc.function.name!, arguments: tc.function.arguments || '{}' }
                }));

            if (toolCalls.length === 0 || finishReason === 'stop') {
                // Done. Persist the assistant message and break.
                const saved = await prisma.aiChatMessage.create({
                    data: {
                        conversationId: conv.id,
                        role: 'assistant',
                        content: assistantContent
                    }
                });
                await prisma.aiChatConversation.update({
                    where: { id: conv.id },
                    data: { updatedAt: new Date() }
                });
                send({ type: 'done', messageId: saved.id, model: finalModel });
                break;
            }

            // Persist the assistant tool-call message so future turns see it.
            await prisma.aiChatMessage.create({
                data: {
                    conversationId: conv.id,
                    role: 'assistant',
                    content: JSON.stringify(toolCalls),
                    toolName: '__tool_calls__'
                }
            });

            // Append to in-memory messages list and execute each tool.
            messages.push({ role: 'assistant', content: assistantContent || null, tool_calls: toolCalls });

            for (const call of toolCalls) {
                send({ type: 'tool_call', name: call.function.name, args: safeParseArgs(call.function.arguments) });
                const result = await executeTool(call.function.name, call.function.arguments, {
                    appId: conv.appId
                });
                send({
                    type: 'tool_result',
                    name: call.function.name,
                    ok: !result.startsWith('{"error"')
                });

                await prisma.aiChatMessage.create({
                    data: {
                        conversationId: conv.id,
                        role: 'tool',
                        content: result,
                        toolName: call.function.name,
                        toolCallId: call.id
                    }
                });
                messages.push({
                    role: 'tool',
                    content: result,
                    tool_call_id: call.id,
                    name: call.function.name
                });
            }

            // Reset assistantContent for next turn (only the FINAL turn's
            // text body is the user-visible answer).
            assistantContent = '';
        }
    } catch (err: any) {
        console.error('ai chat error', err);
        send({ type: 'error', message: err?.message || 'Chat failed' });
    } finally {
        try {
            res.end();
        } catch {
            /* ignore */
        }
    }
}

function safeParseArgs(s: string): any {
    try {
        return JSON.parse(s || '{}');
    } catch {
        return { _raw: s };
    }
}

function buildSystemPrompt(appId: string | null): string {
    const base =
        'You are TelemetryX Assistant, an analytics chatbot embedded in an internal app-tracking dashboard. ' +
        'Your job is to answer questions about app adoption, feature usage, tags, users, and departments by calling the provided tools — never invent numbers.\n\n' +
        'Rules:\n' +
        '- Always call a tool to fetch real data before stating numbers.\n' +
        '- Prefer the smallest useful tool (e.g. get_overview before get_time_series).\n' +
        '- When the user references "this app", "the app", or "the current app", use the scoped appId without asking.\n' +
        '- You do NOT inherently know the current date (your training data has a cutoff). Whenever the user uses a relative date phrase ("today", "yesterday", "last week", "this month", "YTD", "the past 7 days", etc.), call get_current_datetime FIRST, then compute the ISO date range from its result.\n' +
        '- Date defaults: last 30 days. Always pass concrete ISO dates to other tools — never guess "today".\n' +
        '- Be concise; format answers in clean markdown with short bullets or small tables.\n' +
        '- If a tool returns an error or zero data, say so plainly; do not guess.\n' +
        '- Never expose internal IDs unless explicitly asked.';
    if (appId) {
        return base + `\n\nCurrent scope: appId=${appId}. All tool calls are automatically scoped to this app — you do not need to (and cannot) target a different app.`;
    }
    return base + '\n\nNo specific app is selected. Use list_apps to discover available apps, then call tools with an explicit appId.';
}
