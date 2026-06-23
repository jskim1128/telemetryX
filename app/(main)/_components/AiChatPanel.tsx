'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Tooltip } from 'primereact/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface UiMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    streaming?: boolean;
    toolCalls?: Array<{ name: string; ok?: boolean }>;
}

interface ConvSummary {
    id: string;
    title: string | null;
    appId: string | null;
    updatedAt: string;
}

interface Props {
    visible: boolean;
    onHide: () => void;
}

const SCOPED_SUGGESTIONS = [
    'Summarize how this app has been used in the last 7 days.',
    'What are the top features and who uses them most?',
    'Which departments are adopting this app the fastest?',
    'Compare this week vs last week.'
];

const GLOBAL_SUGGESTIONS = [
    'Which apps are most active right now?',
    'Show me the top features across all apps in the last 30 days.',
    'Which departments are using the platform the most?'
];

const AiChatPanel: React.FC<Props> = ({ visible, onHide }) => {
    const searchParams = useSearchParams();
    const appId = searchParams?.get('app') || null;

    const [conversations, setConversations] = useState<ConvSummary[]>([]);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<UiMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Auto-scroll on new content.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, sending]);

    // Load conversation list when opened or when appId changes.
    useEffect(() => {
        if (!visible) return;
        let aborted = false;
        (async () => {
            try {
                const res = await fetch('/api/ai/conversations', { cache: 'no-store' });
                if (!res.ok) return;
                const json = await res.json();
                if (aborted) return;
                setConversations(json.conversations || []);
            } catch {
                /* ignore */
            }
        })();
        return () => {
            aborted = true;
        };
    }, [visible]);

    // Cleanup any in-flight request when the panel closes.
    useEffect(() => {
        if (!visible && abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, [visible]);

    const loadConversation = async (id: string) => {
        setLoadingHistory(true);
        setError(null);
        try {
            const res = await fetch(`/api/ai/conversations/${id}`, { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to load');
            setConversationId(id);
            const msgs: UiMessage[] = (json.messages || []).map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content
            }));
            setMessages(msgs);
        } catch (err: any) {
            setError(err?.message || 'Failed to load conversation');
        } finally {
            setLoadingHistory(false);
        }
    };

    const startNewConversation = () => {
        setConversationId(null);
        setMessages([]);
        setError(null);
    };

    const handleDelete = async () => {
        if (!conversationId) return;
        const id = conversationId;
        try {
            await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
            setConversations((prev) => prev.filter((c) => c.id !== id));
            startNewConversation();
        } catch {
            /* ignore */
        }
    };

    const send = async (text: string) => {
        if (!text.trim() || sending) return;
        setError(null);

        const userMsg: UiMessage = {
            id: `local_${Date.now()}`,
            role: 'user',
            content: text.trim()
        };
        const assistantMsg: UiMessage = {
            id: `local_a_${Date.now()}`,
            role: 'assistant',
            content: '',
            streaming: true,
            toolCalls: []
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setInput('');
        setSending(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    appId,
                    message: text
                }),
                signal: controller.signal
            });

            if (!res.ok || !res.body) {
                let errText = `Request failed (${res.status})`;
                try {
                    const j = await res.json();
                    if (j?.error) errText = j.error;
                } catch {
                    /* ignore */
                }
                throw new Error(errText);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = buffer.indexOf('\n\n')) >= 0) {
                    const rawEvent = buffer.slice(0, nl);
                    buffer = buffer.slice(nl + 2);
                    const line = rawEvent.split('\n').find((l) => l.startsWith('data:'));
                    if (!line) continue;
                    const dataStr = line.slice(5).trim();
                    if (!dataStr) continue;
                    let evt: any;
                    try {
                        evt = JSON.parse(dataStr);
                    } catch {
                        continue;
                    }
                    if (evt.type === 'meta' && evt.conversationId) {
                        setConversationId(evt.conversationId);
                    } else if (evt.type === 'delta' && typeof evt.text === 'string') {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantMsg.id ? { ...m, content: m.content + evt.text } : m
                            )
                        );
                    } else if (evt.type === 'tool_call' && typeof evt.name === 'string') {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantMsg.id
                                    ? { ...m, toolCalls: [...(m.toolCalls || []), { name: evt.name }] }
                                    : m
                            )
                        );
                    } else if (evt.type === 'tool_result') {
                        setMessages((prev) =>
                            prev.map((m) => {
                                if (m.id !== assistantMsg.id) return m;
                                const tc = [...(m.toolCalls || [])];
                                for (let i = tc.length - 1; i >= 0; i--) {
                                    if (tc[i].name === evt.name && tc[i].ok === undefined) {
                                        tc[i] = { ...tc[i], ok: !!evt.ok };
                                        break;
                                    }
                                }
                                return { ...m, toolCalls: tc };
                            })
                        );
                    } else if (evt.type === 'done') {
                        setMessages((prev) =>
                            prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m))
                        );
                    } else if (evt.type === 'error') {
                        throw new Error(evt.message || 'Stream error');
                    }
                }
            }

            // Refresh conversation list in the background to pick up the new title.
            fetch('/api/ai/conversations', { cache: 'no-store' })
                .then((r) => (r.ok ? r.json() : null))
                .then((j) => j && setConversations(j.conversations || []))
                .catch(() => { });
        } catch (err: any) {
            if (controller.signal.aborted) {
                setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m))
                );
            } else {
                setError(err?.message || 'Chat failed');
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsg.id
                            ? { ...m, streaming: false, content: m.content || '_The assistant did not respond._' }
                            : m
                    )
                );
            }
        } finally {
            setSending(false);
            abortRef.current = null;
        }
    };

    const stop = () => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    const suggestions = appId ? SCOPED_SUGGESTIONS : GLOBAL_SUGGESTIONS;

    const conversationOptions = useMemo(
        () =>
            conversations.map((c) => ({
                label: c.title || 'Untitled conversation',
                value: c.id
            })),
        [conversations]
    );

    const header = (
        <div className="flex align-items-center gap-2">
            <i className="fi fi-rr-sparkles ai-icon text-primary flex align-items-center justify-content-center" style={{ width: '2.25rem', height: '2.25rem' }} />
            <div>
                <div className="ai-chat-header-title">TelemetryX Assistant</div>
                <div className="ai-chat-header-subtitle">
                    <i className="pi pi-circle-fill" style={{ fontSize: '0.45rem', color: 'var(--green-500)' }} />
                    {appId ? (
                        <>Scoped to current app</>
                    ) : (
                        <>Cross-app questions</>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <Sidebar
            visible={visible}
            onHide={onHide}
            position="right"
            className="ai-chat-sidebar"
            style={{ backdropFilter: "blur(10px)" }}
            modal={false}
            dismissable={true}
            header={header}
        >
            <div className="ai-chat-toolbar">
                <Dropdown
                    value={conversationId}
                    options={conversationOptions}
                    onChange={(e) => e.value && loadConversation(e.value)}
                    placeholder="New conversation"
                    className="flex-1"
                    emptyMessage="No past conversations"
                    showClear={false}
                    appendTo="self"
                />
                <Tooltip target=".ai-chat-new-btn" content="New chat" position="bottom" />
                <Button
                    className="ai-chat-new-btn"
                    icon="pi pi-plus"
                    text
                    rounded
                    onClick={startNewConversation}
                    aria-label="New chat"
                />
                {conversationId && (
                    <>
                        <Tooltip target=".ai-chat-del-btn" content="Delete this conversation" position="bottom" />
                        <Button
                            className="ai-chat-del-btn"
                            icon="pi pi-trash"
                            text
                            rounded
                            severity="danger"
                            onClick={handleDelete}
                            aria-label="Delete conversation"
                        />
                    </>
                )}
            </div>

            {error && (
                <div className="ai-chat-error">
                    <Message severity="error" text={error} className="w-full" />
                </div>
            )}

            <div className="ai-chat-messages" ref={scrollRef}>
                {loadingHistory && (
                    <div className="text-center text-500 py-3">
                        <i className="pi pi-spin pi-spinner mr-2" />
                        Loading conversation…
                    </div>
                )}

                {!loadingHistory && messages.length === 0 && (
                    <div className="ai-chat-empty">
                        <i className="fi fi-rr-sparkles" />
                        <h6>Ask anything about your tracking data</h6>
                        <div className="text-sm">
                            {appId ? (
                                <>Questions are scoped to the currently selected app.</>
                            ) : (
                                <>No app selected — questions can cover any app you have access to.</>
                            )}
                        </div>
                        <div className="ai-chat-suggestions">
                            {suggestions.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className="ai-chat-suggestion"
                                    onClick={() => send(s)}
                                    disabled={sending}
                                >
                                    <i className="pi pi-arrow-right mr-2 text-primary" style={{ fontSize: '0.75rem' }} />
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m) => (
                    <React.Fragment key={m.id}>
                        {m.toolCalls?.map((tc, i) => (
                            <div className="ai-chat-tool-chip" key={`${m.id}_tc_${i}`}>
                                <i
                                    className={
                                        tc.ok === undefined
                                            ? 'pi pi-spin pi-spinner'
                                            : tc.ok
                                                ? 'pi pi-check-circle'
                                                : 'pi pi-exclamation-circle'
                                    }
                                />
                                <span>
                                    {tc.ok === undefined ? 'Calling' : tc.ok ? 'Used' : 'Failed'} <code>{tc.name}</code>
                                </span>
                            </div>
                        ))}
                        <div className={`ai-chat-message ${m.role}`}>
                            <div className="ai-chat-avatar">
                                <i className={m.role === 'user' ? 'pi pi-user' : 'fi fi-rr-sparkles'} />
                            </div>
                            <div className="ai-chat-bubble">
                                {m.role === 'assistant' ? (
                                    m.content ? (
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                                    ) : m.streaming ? (
                                        <span className="text-500">Thinking…</span>
                                    ) : (
                                        <span className="text-500">(no response)</span>
                                    )
                                ) : (
                                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                                )}
                            </div>
                        </div>
                    </React.Fragment>
                ))}

                {sending && messages.length > 0 && messages[messages.length - 1].streaming && !messages[messages.length - 1].content && (
                    <div className="ai-chat-typing">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                    </div>
                )}
            </div>

            <div className="ai-chat-composer">
                <InputTextarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    autoResize
                    placeholder={appId ? 'Ask about this app…' : 'Ask about your apps…'}
                    disabled={sending}
                />
                {sending ? (
                    <Button
                        icon="pi pi-stop"
                        severity="secondary"
                        onClick={stop}
                        aria-label="Stop"
                        tooltip="Stop"
                        tooltipOptions={{ position: 'top' }}
                    />
                ) : (
                    <Button
                        icon="pi pi-send"
                        onClick={() => send(input)}
                        disabled={!input.trim()}
                        aria-label="Send"
                    />
                )}
            </div>
        </Sidebar>
    );
};

export default AiChatPanel;
