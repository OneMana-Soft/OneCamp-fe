import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import axiosInstance from "@/lib/axiosInstance";
import { stopAnswer } from "@/services/answerRecovery";
import { usePost } from "@/hooks/usePost";
import { useCallback, useEffect, useState, useRef } from "react";
import { authedStreamFetch } from "@/lib/utils/streamFetch";
import { readSSE } from "@/lib/ai/sseReader";
import { getCatchUp, CatchUpRequest, CatchUpResult } from "@/services/catchUpService";

export interface SourceRef {
    content_type: "post" | "chat" | "doc" | "task" | "comment";
    content_uuid: string;
    channel_uuid?: string;
    channel_name?: string;
    snippet?: string;
    score?: number;
    // Chat routing: group chats use a 32-char chat_grp_id (no space); DMs
    // encode both user uuids separated by a space, and the other participant
    // is derived from chat_by_user_id / chat_to_user_id.
    chat_grp_id?: string;
    chat_by_user_id?: string;
    chat_to_user_id?: string;
    // Parent FKs for a comment source — deep-link to the parent it belongs to.
    post_uuid?: string;
    task_uuid?: string;
    doc_uuid?: string;
}

export interface AIStatusResponse {
    enabled: boolean;
    provider: string;
    model: string;
    embedding_model: string;
    circuit_state: string;
    rate_limit_remaining: number;
}

/**
 * Hook for "Catch me up" — an AI recap of exactly what the user missed in a
 * scope since they last looked (the unread window), rather than the last N
 * messages. Wraps POST /ai/catch-up. Self-describing result: enabled=false
 * (AI off) or has_unread=false (nothing missed) let the caller hide cleanly.
 */
export const useCatchUp = () => {
    const [isLoading, setIsLoading] = useState(false);

    const catchUp = useCallback(
        async (req: CatchUpRequest): Promise<CatchUpResult | undefined> => {
            setIsLoading(true);
            try {
                return await getCatchUp(req);
            } finally {
                setIsLoading(false);
            }
        },
        [],
    );

    return { catchUp, isLoading };
};

/**
 * Return type for askStream — provides the final accumulated text and parsed actions
 * as synchronous values, eliminating the race condition with React state updates.
 */
export interface AskStreamResult {
    /**
     * The conversation this exchange belongs to.
     *
     * The server sends it first, before any content, and mints one when the
     * client had none. Nothing did this before: the client started at null and
     * had no way to learn an id, so every question was answered with no
     * knowledge of the last and nothing was ever filed under a conversation.
     */
    sessionId?: string;
    text: string;
    actions: ProposedAction[];
    sources: SourceRef[];
    /**
     * Set when the backend shortened the prompt to fit the model's context window,
     * either by trimming before the request or by shrinking after the provider refused
     * it. Empty when the whole thread fitted, so the absence of a notice is itself
     * meaningful — a message that appears on every answer is one nobody reads.
     */
    notice: string;
    /** The plan's steps, when the server streamed any (it may not). */
    steps?: StreamStep[];
}

/** One step of the work behind an answer, as the server streams it. */
export interface StreamStep {
    id: string;
    text: string;
    state: "running" | "done" | "refused" | "failed" | "thought";
    ms?: number;
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
    // Set when the backend had to shorten the prompt to fit the model's context
    // window. Kept separate from `error` on purpose: this is a successful answer that
    // used less input than the whole thread, so presenting it as a failure would be
    // wrong, and hiding it would leave the answer quietly incomplete.
    const [streamNotice, setStreamNotice] = useState("");
    const [error, setError] = useState<string | null>(null);
    // The steps the answer is working through, when the server streams them
    // as `step` events ({ id, text, state, ms }); see components/ai/PlanSteps.
    // An older server sends none and the panel shows no plan.
    const [streamSteps, setStreamSteps] = useState<StreamStep[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    // The session the current answer belongs to, so a Stop can name it. Set
    // from the first event of the stream, which is where the id arrives.
    const liveSessionRef = useRef<string | undefined>(undefined);

    const askStream = useCallback(
        async (question: string, sessionId?: string): Promise<AskStreamResult | null> => {
            setIsStreaming(true);
            setStreamText("");
            setStreamActions([]);
            setStreamNotice("");
            setStreamSteps([]);
            setError(null);

            abortRef.current = new AbortController();
            liveSessionRef.current = sessionId;

            // Track final values synchronously inside this closure — these are
            // the ground truth, immune to React batching / useEffect timing.
            let accumulated = "";
            let parsedActions: ProposedAction[] = [];
            let streamedSessionId: string | undefined;
            let parsedSources: SourceRef[] = [];
            let parsedNotice = "";
            let parsedSteps: StreamStep[] = [];

            // Three exits reach the caller: an explicit done event, a stream
            // that stopped without one, and a failure part way through. The
            // session id was added at the first and silently missing from the
            // other two, which is how a dropped connection used to orphan a
            // conversation. Build the result once.
            const result = (): AskStreamResult => ({
                sessionId: streamedSessionId,
                text: accumulated,
                actions: parsedActions,
                sources: parsedSources,
                notice: parsedNotice,
                steps: parsedSteps,
            });

            try {
                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const localTime = new Date().toISOString();

                // Auth is carried by the cookie via `credentials: include`.
                // authedStreamFetch refreshes an expired access token and
                // retries once, so a stream started after the short-lived
                // Authorization cookie lapsed doesn't hard-fail with a 401.
                const response = await authedStreamFetch(PostEndpointUrl.AIAskStream, {
                    jsonBody: {
                        question,
                        session_id: sessionId,
                        timezone,
                        local_time: localTime,
                    },
                    signal: abortRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`AI request failed: ${response.statusText}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                // Each event's data, parsed once (JSON.parse undoes every
                // escape), whatever way the network cut the bytes.
                for await (const data of readSSE(reader)) {
                    if (data.error) {
                        setError(data.error);
                        setIsStreaming(false);
                        return null;
                    }
                    if (typeof data.content === "string" && data.content) {
                        accumulated += data.content;
                        setStreamText(accumulated);
                    }
                    // Server sends sanitized replacement after stream ends
                    // (uses json.Marshal on backend, so JSON.parse handles all escaping)
                    if (data.replace) {
                        accumulated = data.replace;
                        setStreamText(data.replace);
                    }
                    // Sent before any content, so the caller can adopt
                    // it even if the answer is cut short.
                    if (data.session_id) {
                        streamedSessionId = data.session_id;
                        liveSessionRef.current = data.session_id;
                    }
                    // Server sends parsed tool call actions
                    if (data.actions) {
                        parsedActions = data.actions;
                        setStreamActions(parsedActions);
                    }
                    // Server sends grounding sources (citations)
                    if (data.sources) {
                        parsedSources = data.sources;
                    }
                    // Server reports that the prompt was shortened to fit
                    // the model's window (trimmed pre-emptively, or shrunk
                    // after the provider refused it).
                    if (data.notice) {
                        parsedNotice = data.notice;
                        setStreamNotice(data.notice);
                    }
                    // A step of the plan, new or updated in place by id.
                    if (data.step && typeof data.step.id === "string") {
                        const step = data.step as StreamStep;
                        const at = parsedSteps.findIndex((x) => x.id === step.id);
                        parsedSteps = at >= 0 ? parsedSteps.map((x, i) => (i === at ? { ...x, ...step } : x)) : [...parsedSteps, step];
                        setStreamSteps(parsedSteps);
                    }
                    if (data.done) {
                        setIsStreaming(false);
                        return result();
                    }
                }

                // Stream ended without explicit done event, return what we have
                return result();
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError(err.message || "Streaming failed");
                }
                // Return accumulated text even on error so partial responses are
                // usable, and return the id even when there is no text: the
                // conversation exists on the server either way, and dropping it
                // here is what would send the next question somewhere else.
                return accumulated || streamedSessionId ? result() : null;
            } finally {
                setIsStreaming(false);
            }
        },
        []
    );

    // Stop is a message before it is an abort. The server lets an answer
    // outlive its connection, so an abort on its own would just mean the
    // answer finishes without us; telling the server first is what makes it
    // stop, and it keeps what was written so far. See services/answerRecovery.
    const cancelStream = useCallback(() => {
        const sid = liveSessionRef.current;
        setIsStreaming(false);
        void stopAnswer(sid).finally(() => abortRef.current?.abort());
    }, []);

    // Abort any in-flight stream when the consuming component unmounts
    // — without this, navigating away from the AI assistant mid-stream
    // leaves the fetch reading the response body, calling setState on
    // an unmounted component (React 19 swallows the warning, but the
    // network and CPU work continue).
    //
    // DELIBERATELY NO stopAnswer HERE. Leaving the screen is not a request to
    // stop; the answer finishes on the server and is in the conversation when
    // the person comes back.
    useEffect(() => () => {
        abortRef.current?.abort();
    }, []);

    return { askStream, cancelStream, isStreaming, streamText, streamActions, streamNotice, streamSteps, error };
};

/**
 * Hook for checking AI service status.
 */
export const useAIStatus = () => {
    const [isLoading, setIsLoading] = useState(false);

    const getStatus = useCallback(async (): Promise<AIStatusResponse | undefined> => {
        setIsLoading(true);
        try {
            const response = await authedStreamFetch(GetEndpointUrl.AIStatus, {
                method: "GET",
                accept: "application/json",
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

interface DocAIResponse {
    result: string;
    action: string;
    provider: string;
    /**
     * Set when the input was shortened to fit the model's context window, so the editor
     * can say the result came from part of the selection rather than all of it. Absent
     * when everything fitted.
     */
    notice?: string;
}

/**
 * Hook for AI Doc Assistant — streaming completion for document editing.
 * Supports 6 actions: write, expand, summarize, fix_grammar, shorten, rewrite.
 */
export const useDocAI = () => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamText, setStreamText] = useState("");
    // Set when the input was shortened to fit the model's context window. Separate from
    // `error` deliberately: the action succeeded, it just saw part of the selection.
    const [streamNotice, setStreamNotice] = useState("");
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const completeStream = useCallback(
        async (action: DocAIAction, text: string, docId?: string, customPrompt?: string, context?: string) => {
            setIsStreaming(true);
            setStreamText("");
            setError(null);

            abortRef.current = new AbortController();

            try {
                const response = await authedStreamFetch(PostEndpointUrl.AIDocCompleteStream, {
                    jsonBody: {
                        action,
                        text,
                        prompt: customPrompt || "",
                        doc_id: docId || "",
                        context: context || "",
                    },
                    signal: abortRef.current.signal,
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error((errData as any)?.msg || `AI doc request failed: ${response.statusText}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                let accumulated = "";

                for await (const data of readSSE(reader)) {
                    if (data.error) {
                        setError(data.error);
                        setIsStreaming(false);
                        return;
                    }
                    if (typeof data.content === "string" && data.content) {
                        accumulated += data.content;
                        setStreamText(accumulated);
                    }
                    // Sent just before "done" when the input was shortened
                    // to fit the model's window.
                    if (data.notice) {
                        setStreamNotice(data.notice);
                    }
                    if (data.done) {
                        setIsStreaming(false);
                        return;
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
                const response = await authedStreamFetch(PostEndpointUrl.AIDocComplete, {
                    jsonBody: {
                        action,
                        text,
                        prompt: customPrompt || "",
                        doc_id: docId || "",
                        context: context || "",
                    },
                    accept: "application/json",
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

    // Abort on unmount — see useAskAIStream for rationale.
    useEffect(() => () => {
        abortRef.current?.abort();
    }, []);

    const resetResult = useCallback(() => {
        setStreamText("");
        setStreamNotice("");
        setError(null);
    }, []);

    return { completeStream, complete, cancelStream, resetResult, isStreaming, streamText, streamNotice, error };
};

// --- Agentic Action Types ---

export interface ProposedAction {
    tool_name: string;
    params: Record<string, string>;
    description: string;
}

interface ExecuteActionResponse {
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

interface AnalyzeImageResponse {
    description: string;
}

/**
 * Hook for analyzing an image attachment with the configured vision model.
 * The caller passes identifiers it already holds from the rendered message
 * (attachment uuid + its source); the user never provides an id. Access is
 * enforced server-side. Returns undefined and surfaces a toast on failure
 * (e.g. no vision model configured, or no access).
 */
export const useAnalyzeImage = () => {
    const { makeRequest, isSubmitting } = usePost();

    const analyzeImage = useCallback(
        async (
            objUuid: string,
            srcKey: string,
            srcRef: string,
            prompt?: string,
        ): Promise<AnalyzeImageResponse | undefined> => {
            return makeRequest<
                { obj_uuid: string; src_key: string; src_ref: string; prompt?: string },
                AnalyzeImageResponse
            >({
                apiEndpoint: PostEndpointUrl.AIAnalyzeImage,
                payload: { obj_uuid: objUuid, src_key: srcKey, src_ref: srcRef, prompt },
                showToast: true,
            });
        },
        [makeRequest],
    );

    return { analyzeImage, isSubmitting };
};

/**
 * Hook for reading a document attachment with AI (DOCX / text-family): returns
 * a summary, or an answer to an optional prompt. Same identifier + access model
 * as useAnalyzeImage; the server sniffs the format and enforces access. The
 * `description` field carries the answer (shared response shape with images).
 */
export const useAnalyzeDocument = () => {
    const { makeRequest, isSubmitting } = usePost();

    const analyzeDocument = useCallback(
        async (
            objUuid: string,
            srcKey: string,
            srcRef: string,
            prompt?: string,
        ): Promise<AnalyzeImageResponse | undefined> => {
            return makeRequest<
                { obj_uuid: string; src_key: string; src_ref: string; prompt?: string },
                AnalyzeImageResponse
            >({
                apiEndpoint: PostEndpointUrl.AIAnalyzeDocument,
                payload: { obj_uuid: objUuid, src_key: srcKey, src_ref: srcRef, prompt },
                showToast: true,
            });
        },
        [makeRequest],
    );

    return { analyzeDocument, isSubmitting };
};

interface TranslateResponse {
    translation: string;
}

/**
 * Hook for translating text into a target language (name or BCP-47 code; blank
 * = English) with the member's model. Stateless + generic; the server enforces
 * limits and hardens against prompt injection. Surfaces a toast on failure.
 */
// getVoiceInputAvailable reports whether server-side voice dictation is
// configured (an OpenAI-compatible or Deepgram STT). Lets the composer only
// show the mic when it will work. Best-effort: false on any error.
export async function getVoiceInputAvailable(): Promise<boolean> {
    try {
        const res = await axiosInstance.get(GetEndpointUrl.AIVoiceInput, {
            // @ts-expect-error — background probe, no global loading bar
            silent: true,
        })
        return Boolean(res.data?.data?.available)
    } catch {
        return false
    }
}

// transcribeAudio uploads a short recorded clip and returns its transcript via
// the model-agnostic STT (the same engine used for call transcription).
export async function transcribeAudio(blob: Blob, filename = "audio.webm"): Promise<string> {
    const form = new FormData()
    form.append("audio", blob, filename)
    const res = await axiosInstance.post(PostEndpointUrl.AITranscribe, form)
    return (res.data?.data?.text as string) || ""
}

export const useTranslateText = () => {
    const { makeRequest, isSubmitting } = usePost();

    const translateText = useCallback(
        async (text: string, targetLanguage?: string): Promise<TranslateResponse | undefined> => {
            return makeRequest<
                { text: string; target_language?: string },
                TranslateResponse
            >({
                apiEndpoint: PostEndpointUrl.AITranslate,
                payload: { text, target_language: targetLanguage },
                showToast: true,
            });
        },
        [makeRequest],
    );

    return { translateText, isSubmitting };
};

/**
 * A past conversation with the assistant.
 *
 * These exist because a chat that cannot be reopened is a chat the product
 * forgot: the session id lived only in React state and the history only in Redis
 * under a 30 minute TTL, so closing the panel ended the conversation
 * permanently.
 */
export interface ChatSessionSummary {
    id: string
    title: string
    created_at: string
    updated_at: string
    message_count: number
}

interface ChatSessionMessage {
    role: "user" | "assistant"
    content: string
    created_at: string
}

/** A person's conversations, most recently active first. */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
    const res = await axiosInstance.get(GetEndpointUrl.AIChatSessions)
    return (res.data?.data as ChatSessionSummary[]) || []
}

/** Replays one conversation so it can be resumed where it was left. */
export async function getChatSession(sessionId: string): Promise<ChatSessionMessage[]> {
    return (await getChatSessionState(sessionId)).messages
}

/** A conversation and whether its last answer is still being written on the server. */
interface ChatSessionState {
    messages: ChatSessionMessage[]
    /** True while an answer for this session is being generated; the exchange lands in messages when it finishes. */
    live: boolean
}

export async function getChatSessionState(sessionId: string): Promise<ChatSessionState> {
    const res = await axiosInstance.get(`${GetEndpointUrl.AIChatSessions}/${sessionId}`)
    return {
        messages: (res.data?.data as ChatSessionMessage[]) || [],
        live: Boolean(res.data?.live),
    }
}

/** Removes a conversation from the list. */
export async function deleteChatSession(sessionId: string): Promise<void> {
    await axiosInstance.delete(`${GetEndpointUrl.AIChatSessions}/${sessionId}`)
}
