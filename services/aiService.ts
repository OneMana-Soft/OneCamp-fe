import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import { ensureValidToken } from "@/lib/axiosInstance";
import { useCallback, useState, useRef } from "react";

// --- Response Types ---

export interface SummarizeResponse {
    summary: string;
    message_count: number;
    channel_name?: string;
    provider: string;
}

export interface SourceRef {
    content_type: "post" | "chat" | "doc" | "task" | "comment";
    content_uuid: string;
    channel_uuid?: string;
    channel_name?: string;
    snippet?: string;
    score?: number;
}

export interface AskAIResponse {
    answer: string;
    sources?: SourceRef[];
    proposed_actions?: ProposedAction[];
    session_id: string;
    provider: string;
}

export interface AIStatusResponse {
    enabled: boolean;
    provider: string;
    model: string;
    embedding_model: string;
    circuit_state: string;
    rate_limit_remaining: number;
}

// --- Hooks ---

/**
 * Hook for channel/chat summarization ("Catch Me Up" feature).
 */
export const useSummarizeChannel = () => {
    const { makeRequest, isSubmitting } = usePost();

    const summarize = useCallback(
        async (channelUUID: string, messageCount?: number): Promise<SummarizeResponse | undefined> => {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const localTime = new Date().toISOString();

            return makeRequest<{ channel_uuid: string; message_count?: number; timezone?: string; local_time?: string }, SummarizeResponse>({
                apiEndpoint: PostEndpointUrl.AISummarizeChannel,
                payload: { 
                    channel_uuid: channelUUID, 
                    message_count: messageCount,
                    timezone,
                    local_time: localTime,
                },
                showToast: false,
            });
        },
        [makeRequest]
    );

    return { summarize, isSubmitting };
};

/**
 * Hook for 1:1 DM summarization.
 */
export const useSummarizeDM = () => {
    const { makeRequest, isSubmitting } = usePost();

    const summarize = useCallback(
        async (toUserUUID: string, messageCount?: number): Promise<SummarizeResponse | undefined> => {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const localTime = new Date().toISOString();

            return makeRequest<{ to_user_uuid: string; message_count?: number; timezone?: string; local_time?: string }, SummarizeResponse>({
                apiEndpoint: PostEndpointUrl.AISummarizeDM,
                payload: { 
                    to_user_uuid: toUserUUID, 
                    message_count: messageCount,
                    timezone,
                    local_time: localTime,
                },
                showToast: false,
            });
        },
        [makeRequest]
    );

    return { summarize, isSubmitting };
};

/**
 * Hook for Group Chat summarization.
 */
export const useSummarizeGroup = () => {
    const { makeRequest, isSubmitting } = usePost();

    const summarize = useCallback(
        async (chatGrpID: string, messageCount?: number): Promise<SummarizeResponse | undefined> => {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const localTime = new Date().toISOString();

            return makeRequest<{ chat_grp_id: string; message_count?: number; timezone?: string; local_time?: string }, SummarizeResponse>({
                apiEndpoint: PostEndpointUrl.AISummarizeGroup,
                payload: { 
                    chat_grp_id: chatGrpID, 
                    message_count: messageCount,
                    timezone,
                    local_time: localTime,
                },
                showToast: false,
            });
        },
        [makeRequest]
    );

    return { summarize, isSubmitting };
};

/**
 * Hook for AI Q&A with multi-turn conversation support.
 * Tracks session_id across requests for conversation continuity.
 */
export const useAskAI = () => {
    const { makeRequest, isSubmitting } = usePost();
    const [sessionId, setSessionId] = useState<string | null>(null);

    const ask = useCallback(
        async (question: string): Promise<AskAIResponse | undefined> => {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const localTime = new Date().toISOString();

            const result = await makeRequest<{ question: string; session_id?: string; timezone?: string; local_time?: string }, AskAIResponse>({
                apiEndpoint: PostEndpointUrl.AIAsk,
                payload: { 
                    question, 
                    session_id: sessionId || undefined,
                    timezone,
                    local_time: localTime,
                },
                showToast: false,
            });

            // Track session_id from response for conversation continuity
            if (result?.session_id) {
                setSessionId(result.session_id);
            }

            return result;
        },
        [makeRequest, sessionId]
    );

    // Clear the session to start a new conversation
    const clearSession = useCallback(() => {
        setSessionId(null);
    }, []);

    return { ask, isSubmitting, sessionId, clearSession };
};

/**
 * Return type for askStream — provides the final accumulated text and parsed actions
 * as synchronous values, eliminating the race condition with React state updates.
 */
export interface AskStreamResult {
    text: string;
    actions: ProposedAction[];
}

/**
 * Hook for streaming AI Q&A via Server-Sent Events.
 * Returns partial text as it arrives from the LLM, plus proposed actions.
 *
 * askStream() now returns a Promise<AskStreamResult> with the final text and
 * actions. This eliminates the race condition where React state (streamText,
 * streamActions) hadn't propagated to refs by the time the caller read them.
 */
export const useAskAIStream = () => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamText, setStreamText] = useState("");
    const [streamActions, setStreamActions] = useState<ProposedAction[]>([]);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const askStream = useCallback(
        async (question: string, sessionId?: string): Promise<AskStreamResult | null> => {
            setIsStreaming(true);
            setStreamText("");
            setStreamActions([]);
            setError(null);

            abortRef.current = new AbortController();

            // Track final values synchronously inside this closure — these are
            // the ground truth, immune to React batching / useEffect timing.
            let accumulated = "";
            let parsedActions: ProposedAction[] = [];

            try {
                const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, '');

                const token = await ensureValidToken();
                if (!token) throw new Error("Unauthenticated: Please log in again");

                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const localTime = new Date().toISOString();

                const response = await fetch(`${baseUrl}${PostEndpointUrl.AIAskStream}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "text/event-stream",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ 
                        question, 
                        session_id: sessionId,
                        timezone,
                        local_time: localTime,
                    }),
                    signal: abortRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`AI request failed: ${response.statusText}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n");

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.error) {
                                    setError(data.error);
                                    setIsStreaming(false);
                                    return null;
                                }
                                if (data.content) {
                                    const unescaped = data.content
                                        .replace(/\\n/g, "\n")
                                        .replace(/\\"/g, '"');
                                    accumulated += unescaped;
                                    setStreamText(accumulated);
                                }
                                // Server sends sanitized replacement after stream ends
                                // (uses json.Marshal on backend, so JSON.parse handles all escaping)
                                if (data.replace) {
                                    accumulated = data.replace;
                                    setStreamText(data.replace);
                                }
                                // Server sends parsed tool call actions
                                if (data.actions) {
                                    parsedActions = data.actions;
                                    setStreamActions(parsedActions);
                                }
                                if (data.done) {
                                    setIsStreaming(false);
                                    return { text: accumulated, actions: parsedActions };
                                }
                            } catch {
                                // Skip malformed JSON chunks
                            }
                        }
                    }
                }

                // Stream ended without explicit done event — return what we have
                return { text: accumulated, actions: parsedActions };
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError(err.message || "Streaming failed");
                }
                // Return accumulated text even on error so partial responses are usable
                return accumulated ? { text: accumulated, actions: parsedActions } : null;
            } finally {
                setIsStreaming(false);
            }
        },
        []
    );

    const cancelStream = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
    }, []);

    return { askStream, cancelStream, isStreaming, streamText, streamActions, error };
};

/**
 * Hook for checking AI service status.
 */
export const useAIStatus = () => {
    const [isLoading, setIsLoading] = useState(false);

    const getStatus = useCallback(async (): Promise<AIStatusResponse | undefined> => {
        setIsLoading(true);
        try {
            const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}${GetEndpointUrl.AIStatus}`, {
                credentials: "include",
            });
            if (!response.ok) return undefined;
            const json = await response.json();
            return json.data as AIStatusResponse;
        } catch {
            return undefined;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { getStatus, isLoading };
};

// --- Doc AI Types ---

export type DocAIAction = 'write' | 'expand' | 'summarize' | 'fix_grammar' | 'shorten' | 'rewrite';

export interface DocAIResponse {
    result: string;
    action: string;
    provider: string;
}

/**
 * Hook for AI Doc Assistant — streaming completion for document editing.
 * Supports 6 actions: write, expand, summarize, fix_grammar, shorten, rewrite.
 */
export const useDocAI = () => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamText, setStreamText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const completeStream = useCallback(
        async (action: DocAIAction, text: string, docId?: string, customPrompt?: string, context?: string) => {
            setIsStreaming(true);
            setStreamText("");
            setError(null);

            abortRef.current = new AbortController();

            try {
                const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, '');

                const token = await ensureValidToken();
                if (!token) throw new Error("Unauthenticated: Please log in again");

                const response = await fetch(`${baseUrl}${PostEndpointUrl.AIDocCompleteStream}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "text/event-stream",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        action,
                        text,
                        prompt: customPrompt || "",
                        doc_id: docId || "",
                        context: context || "",
                    }),
                    signal: abortRef.current.signal,
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error((errData as any)?.msg || `AI doc request failed: ${response.statusText}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                const decoder = new TextDecoder();
                let accumulated = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n");

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.error) {
                                    setError(data.error);
                                    setIsStreaming(false);
                                    return;
                                }
                                if (data.content) {
                                    const unescaped = data.content
                                        .replace(/\\n/g, "\n")
                                        .replace(/\\"/g, '"');
                                    accumulated += unescaped;
                                    setStreamText(accumulated);
                                }
                                if (data.done) {
                                    setIsStreaming(false);
                                    return;
                                }
                            } catch {
                                // Skip malformed JSON chunks
                            }
                        }
                    }
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError(err.message || "Doc AI streaming failed");
                }
            } finally {
                setIsStreaming(false);
            }
        },
        []
    );

    const complete = useCallback(
        async (action: DocAIAction, text: string, docId?: string, customPrompt?: string, context?: string): Promise<DocAIResponse | undefined> => {
            try {
                const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, '');

                const response = await fetch(`${baseUrl}${PostEndpointUrl.AIDocComplete}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        action,
                        text,
                        prompt: customPrompt || "",
                        doc_id: docId || "",
                        context: context || "",
                    }),
                });

                if (!response.ok) return undefined;
                const json = await response.json();
                return json.data as DocAIResponse;
            } catch {
                return undefined;
            }
        },
        []
    );

    const cancelStream = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
    }, []);

    const resetResult = useCallback(() => {
        setStreamText("");
        setError(null);
    }, []);

    return { completeStream, complete, cancelStream, resetResult, isStreaming, streamText, error };
};

// --- Agentic Action Types ---

export interface ProposedAction {
    tool_name: string;
    params: Record<string, string>;
    description: string;
}

export interface ExecuteActionResponse {
    success: boolean;
    message: string;
    result_uuid?: string;
    action_data?: Record<string, string>;
    provider: string;
}

/**
 * Hook for executing AI-proposed workspace actions.
 * Actions are never auto-executed — they require explicit user confirmation.
 */
export const useExecuteAction = () => {
    const { makeRequest, isSubmitting } = usePost();

    const executeAction = useCallback(
        async (toolName: string, params: Record<string, string>): Promise<ExecuteActionResponse | undefined> => {
            return makeRequest<{ tool_name: string; params: Record<string, string> }, ExecuteActionResponse>({
                apiEndpoint: PostEndpointUrl.AIExecuteAction,
                payload: { tool_name: toolName, params },
                showToast: true,
            });
        },
        [makeRequest]
    );

    return { executeAction, isSubmitting };
};
