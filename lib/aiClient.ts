// Thin client around an OpenAI-compatible Chat Completions endpoint.
//
// The app currently targets a Portkey gateway in front of Vertex AI Claude
// (`https://ai.vortex.sandisk.com/v1`), but the interface is plain
// OpenAI Chat Completions, so any compatible provider works by swapping
// `AI_BASE_URL`, `AI_MODEL`, and (optionally) the one extra header pair.
//
// We deliberately avoid pulling in an SDK so the bundle stays small and
// we are not coupled to any single vendor's release cadence.

import crypto from 'crypto';

export interface AiConfig {
    baseUrl: string;
    model: string;
    apiKey: string;
    extraHeaderName: string | null;
    extraHeaderValue: string | null;
    summaryTtlMs: number;
    summaryMaxTokens: number;
    chatMaxTokens: number;
    summaryTemperature: number;
    chatTemperature: number;
}

let cached: AiConfig | null = null;

export function aiConfig(): AiConfig {
    if (cached) return cached;
    const baseUrl = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
    const model = process.env.AI_MODEL || '';
    const apiKey = process.env.AI_API_KEY || '';
    if (!baseUrl) throw new Error('AI_BASE_URL is not configured');
    if (!model) throw new Error('AI_MODEL is not configured');
    if (!apiKey) throw new Error('AI_API_KEY is not configured');

    const extraHeaderName = (process.env.AI_EXTRA_HEADER_NAME || '').trim() || null;
    const extraHeaderValue = (process.env.AI_EXTRA_HEADER_VALUE || '').trim() || null;

    const summaryTtlHours = Number(process.env.AI_SUMMARY_TTL_HOURS || '6');
    const summaryMaxTokens = Number(process.env.AI_SUMMARY_MAX_TOKENS || '700');
    const chatMaxTokens = Number(process.env.AI_CHAT_MAX_TOKENS || '1500');
    const summaryTemperature = Number(process.env.AI_SUMMARY_TEMPERATURE || '0.2');
    const chatTemperature = Number(process.env.AI_CHAT_TEMPERATURE || '0.3');

    cached = {
        baseUrl,
        model,
        apiKey,
        extraHeaderName,
        extraHeaderValue,
        summaryTtlMs: Math.max(0, summaryTtlHours) * 60 * 60 * 1000,
        summaryMaxTokens: Number.isFinite(summaryMaxTokens) && summaryMaxTokens > 0 ? summaryMaxTokens : 700,
        chatMaxTokens: Number.isFinite(chatMaxTokens) && chatMaxTokens > 0 ? chatMaxTokens : 1500,
        summaryTemperature: Number.isFinite(summaryTemperature) ? summaryTemperature : 0.2,
        chatTemperature: Number.isFinite(chatTemperature) ? chatTemperature : 0.3
    };
    return cached;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
    }>;
}

export interface ToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface ChatCompletionResponse {
    id: string;
    model: string;
    choices: Array<{
        index: number;
        finish_reason: string;
        message: ChatMessage;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

function buildHeaders(cfg: AiConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
    };
    if (cfg.extraHeaderName && cfg.extraHeaderValue) {
        headers[cfg.extraHeaderName] = cfg.extraHeaderValue;
    }
    return headers;
}

/**
 * Non-streaming chat completion. Returns the parsed response object.
 */
export async function aiChat(opts: {
    messages: ChatMessage[];
    tools?: ToolDef[];
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    maxTokens?: number;
    temperature?: number;
}): Promise<ChatCompletionResponse> {
    const cfg = aiConfig();
    const body: any = {
        model: cfg.model,
        messages: opts.messages,
        stream: false,
        max_tokens: opts.maxTokens ?? cfg.chatMaxTokens,
        temperature: opts.temperature ?? cfg.chatTemperature
    };
    if (opts.tools && opts.tools.length > 0) {
        body.tools = opts.tools;
        body.tool_choice = opts.toolChoice ?? 'auto';
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(cfg),
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI request failed (${res.status}): ${text.slice(0, 500)}`);
    }
    return (await res.json()) as ChatCompletionResponse;
}

/**
 * Streaming chat completion. Returns the raw SSE ReadableStream from the
 * upstream provider so the caller can forward it directly or parse it.
 */
export async function aiChatStream(opts: {
    messages: ChatMessage[];
    tools?: ToolDef[];
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    maxTokens?: number;
    temperature?: number;
}): Promise<Response> {
    const cfg = aiConfig();
    const body: any = {
        model: cfg.model,
        messages: opts.messages,
        stream: true,
        max_tokens: opts.maxTokens ?? cfg.chatMaxTokens,
        temperature: opts.temperature ?? cfg.chatTemperature
    };
    if (opts.tools && opts.tools.length > 0) {
        body.tools = opts.tools;
        body.tool_choice = opts.toolChoice ?? 'auto';
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(cfg),
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI request failed (${res.status}): ${text.slice(0, 500)}`);
    }
    return res;
}

/** Stable hash of a JSON-serializable value (sha256, hex, first 32 chars). */
export function hashObject(value: unknown): string {
    const json = JSON.stringify(value, Object.keys(value || {}).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
}
