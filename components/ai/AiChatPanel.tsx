"use client";

import "./ai.css"
/**
 * OneCamp AI, as the right panel beside a page and as /app/ai (hub.md AI1 to
 * AI12, design v3).
 *
 *   - The header is 52 px: the agent-square mark (AI is agent identity), the
 *     name, the model chip, then New chat, History, More and Close.
 *   - Your words sit in a neutral bubble, right; the answer is flat text
 *     beside the mark, the way Claude and ChatGPT set a conversation, with its
 *     plan, its sources and an action row under it.
 *   - Before the first word the mark breathes beside a shimmering label (the
 *     plan's current step, or "Thinking…"). There is no spinner in the AI.
 *     Text appears as it arrives (components/ai/StreamingText).
 *   - The page keeps a 720 px column; empty, the composition and a wider
 *     composer sit together at 38% of the height, and the composer glides to
 *     the bottom (by transform) when the first question is asked.
 */
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useAskAIStream, type StreamStep } from "@/services/aiService";
import MarkdownMessage from "@/components/ai/MarkdownMessage";
import ActionConfirmation from "@/components/ai/ActionConfirmation";
import AiModelPicker from "@/components/ai/AiModelPicker";
import AiUsageIndicator from "@/components/ai/AiUsageIndicator";
import ReleaseNotesDialog from "@/components/ai/ReleaseNotesDialog";
import AiInstructionsDialog from "@/components/ai/AiInstructionsDialog";
import MyAgentWorkDialog from "@/components/ai/MyAgentWorkDialog";
import { AgentTeammatesMenuItem } from "@/components/ai/AgentTeammatesMenuItem";
import { ChatHistoryMenu, type ResumedConversation } from "@/components/ai/ChatHistoryMenu";
import { PhoneBarActions } from "@/components/navigationBar/mobile/phoneBarActions";
import SocialComposeDialog from "@/components/ai/SocialComposeDialog";
import AiScheduleDialog from "@/components/ai/AiScheduleDialog";
import { ProposedAction, getChatSessionState } from "@/services/aiService";
import { ANSWER_POLL_MS, nextRecoveryStep } from "@/services/answerRecovery";
import { forgetConversation, readLastConversation, rememberConversation } from "@/lib/ai/lastConversation";
import { sendTarget } from "@/lib/ai/sendTarget";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import {
    AlertCircle,
    ArrowDown,
    CalendarClock,
    Check,
    Copy,
    FileText,
    Hash,
    Lightbulb,
    Megaphone,
    MessageSquare,
    MoreHorizontal,
    RotateCcw,
    Scissors,
    SlidersHorizontal,
    SquarePen,
    X,
} from "@/lib/icons";
import { useVoiceDictation, dictationLabel } from "@/hooks/useVoiceDictation";
import { useToast } from "@/hooks/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMedia } from "@/context/MediaQueryContext";
import { useRouter } from "next/navigation";
import { getOtherUserId } from "@/lib/utils/getOtherUserId";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { withAI } from "@/components/common/withFeature";
import { AiMark } from "@/components/ai/AiMark";
import { AiEmpty } from "@/components/ai/AiEmpty";
import { AiComposer } from "@/components/ai/AiComposer";
import { StreamingAnswer } from "@/components/ai/StreamingText";
import { PlanSteps } from "@/components/ai/PlanSteps";
import { CitationContext, SourceChips, type SourceChipItem } from "@/components/ai/Citations";
import { numberCitations, orderSources } from "@/components/ai/citations";
import { suggestionsFrom, type Suggestion, type SuggestionContext } from "@/components/ai/suggestions";
import { getAttention } from "@/services/memoryService";
import { prefersReducedMotion } from "@/lib/celebrate";

// --- Client-side AI text sanitization ---
// Defense-in-depth: strip tool_call XML, UUIDs, and command syntax before display.
// The backend also sanitizes, but chunks may arrive with partial blocks during
// streaming — this ensures raw XML never reaches users.

const TOOL_CALL_BLOCK_RE = /(?:^|\n)?\s*<tool_call>[\s\S]*?<\/tool_call>\s*(?:\n|$)?/g;
const ORPHAN_XML_TAG_RE = /<\/?(?:tool_call|send_message|send_dm|send_group_chat|create_task|create_doc|set_reminder)[^>]*>/g;
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const COMMAND_SYNTAX_RE = /^[!/](?:message|send|create_task|set_reminder)\b.*$/gm;

function sanitizeAIText(text: string): string {
    let result = text;
    // Strip complete <tool_call>...</tool_call> blocks
    result = result.replace(TOOL_CALL_BLOCK_RE, "");
    // Strip orphan XML-like action tags
    result = result.replace(ORPHAN_XML_TAG_RE, "");
    // Strip UUID patterns
    result = result.replace(UUID_RE, "");
    // Strip /command syntax lines
    result = result.replace(COMMAND_SYNTAX_RE, "");
    // Collapse multiple blank lines
    while (result.includes("\n\n\n")) {
        result = result.replace(/\n\n\n/g, "\n\n");
    }
    return result.trim();
}

// --- Types ---

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: SourceDisplay[];
    actions?: ProposedAction[];
    /**
     * Set when the backend shortened the prompt to fit the model's context window.
     * Stored on the message rather than in panel state so it stays attached to the
     * answer it describes as the conversation scrolls on — a banner that moves to the
     * newest reply would be describing the wrong one.
     */
    notice?: string;
    /** The plan's steps, when the server streamed them (components/ai/PlanSteps). */
    steps?: StreamStep[];
    timestamp: Date;
}

interface SourceDisplay {
    content_type: string;
    content_uuid: string;
    channel_uuid?: string;
    channel_name?: string;
    snippet?: string;
    chat_grp_id?: string;
    chat_by_user_id?: string;
    chat_to_user_id?: string;
    post_uuid?: string;
    task_uuid?: string;
    doc_uuid?: string;
}

// searchHref is the graceful last resort for a source we can't deep-link.
// The search page reads the `query` param (NOT `q`), and we only build it when
// there's a non-empty snippet to search for — otherwise route home so the user
// never lands on an empty "no matches" Global Search.
function searchHref(snippet?: string): string {
    const q = (snippet || "").trim();
    return q ? `/app/search?query=${encodeURIComponent(q)}` : "/app/home";
}

// chatHref routes a chat source to the right conversation: group chats use the
// 32-char grouping id (no space); DMs encode both user uuids separated by a
// space, so we route to the OTHER participant (needs the current user id).
function chatHref(grp?: string, msgUuid?: string, currentUserId?: string): string {
    if (!grp) return "";
    if (!grp.includes(" ")) return `/app/chat/group/${grp}/${msgUuid}`;
    if (currentUserId) {
        const other = getOtherUserId(grp, currentUserId);
        if (other) return `/app/chat/${other}/${msgUuid}`;
    }
    return "";
}

// sourceHref maps a source ref to a deep link. Mirrors the briefing card's
// highlight routing so every citation opens its real content. Falls back to
// search (then home) only when no precise target can be built — never the
// old broken `?q=` empty-search link.
function sourceHref(src: SourceDisplay, currentUserId?: string): string {
    switch (src.content_type) {
        case "post":
            if (src.channel_uuid) return `/app/channel/${src.channel_uuid}/${src.content_uuid}`;
            return searchHref(src.snippet);
        case "task":
            return `/app/task/${src.content_uuid}`;
        case "doc":
            return `/app/doc/${src.content_uuid}`;
        case "chat":
            return chatHref(src.chat_grp_id, src.content_uuid, currentUserId) || searchHref(src.snippet);
        case "comment": {
            // A comment isn't separately addressable — route to its parent.
            if (src.post_uuid && src.channel_uuid) return `/app/channel/${src.channel_uuid}/${src.post_uuid}`;
            if (src.task_uuid) return `/app/task/${src.task_uuid}`;
            if (src.doc_uuid) return `/app/doc/${src.doc_uuid}/comment`;
            return searchHref(src.snippet);
        }
        case "memory":
            return `/app/ai/memory`;
        default:
            return searchHref(src.snippet);
    }
}

const SOURCE_LABEL: Record<string, string> = {
    post: "Post",
    chat: "Message",
    doc: "Doc",
    task: "Task",
    comment: "Comment",
    memory: "Memory",
};

// Context-aware starter prompts for the empty state. When the assistant is
// opened via the quick-invoke shortcut from a specific surface, we offer
// prompts about THAT surface (the AskAI backend already grounds answers in the
// user's accessible content, so these read naturally). Falls back to the
// generic workspace prompts on home / unrecognized surfaces.
const CONTEXT_SUGGESTIONS: Record<string, string[]> = {
    channel: [
        "Summarise recent activity in this channel",
        "What decisions were made in this channel?",
        "Are there open questions here I should answer?",
    ],
    doc: [
        "Summarise this doc",
        "What are the action items in this doc?",
        "Suggest improvements to this doc",
    ],
    task: [
        "Summarise this task and its discussion",
        "What's blocking this task?",
        "Draft a status update for this task",
    ],
    board: [
        "Summarise what's on this board",
        "What are the next steps from this board?",
    ],
    table: [
        "Summarise what's in this table",
        "What patterns stand out in this data?",
    ],
    chat: [
        "Summarise this conversation",
        "What did I miss in this conversation?",
        "Draft a reply",
    ],
    project: [
        "Summarise this project's status",
        "What tasks are overdue in this project?",
        "What decisions were made in this project?",
    ],
};

// cleanSnippet strips HTML markup and collapses whitespace so source previews
// read as plain text. Backend snippets sometimes carry raw doc markup (e.g.
// "<p xmlns=...>") — without this they leak tags into the citation strip.
function cleanSnippet(raw: string): string {
    return raw
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

const SOURCE_GLYPH: Record<string, React.ReactNode> = {
    post: <Hash />,
    chat: <MessageSquare />,
    doc: <FileText />,
    task: <Check />,
    comment: <MessageSquare />,
    memory: <Lightbulb />,
};

/** A source's chip title: where it is and what it says, in a few words. */
function sourceTitle(src: SourceDisplay): string {
    const preview = src.snippet ? cleanSnippet(src.snippet) : "";
    const label = SOURCE_LABEL[src.content_type] || src.content_type;
    if (src.channel_name) return preview ? `#${src.channel_name} · ${preview}` : `#${src.channel_name}`;
    return preview || label;
}

/** De-dupe by content: the same message cited twice is one source. */
function uniqueSources(sources: SourceDisplay[]): SourceDisplay[] {
    const seen = new Set<string>();
    return sources.filter((s) => {
        const key = `${s.content_type}:${s.content_uuid}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** What kind of trouble an error is: over a limit (a sun note) or a failure (a quiet card). */
export function aiErrorKind(message: string): "limit" | "error" {
    return /limit|quota|429|too many|allowance/i.test(message) ? "limit" : "error";
}

/** The label beside the breathing mark before the first word: the step being worked on. */
function thinkingLabel(steps: StreamStep[]): string {
    const running = [...steps].reverse().find((s) => s.state === "running");
    return running ? `${running.text.replace(/[.…]+$/, "")}…` : "Thinking…";
}

const ICON_BTN = "grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&_svg]:size-4";

/** One finished answer: the flat text with its markers, its plan, its sources, its card and its action row. */
function AssistantMessage({
    msg,
    showMark,
    last,
    page,
    currentUserId,
    onOpen,
    onRetry,
}: {
    msg: ChatMessage;
    showMark: boolean;
    last: boolean;
    page: boolean;
    currentUserId?: string;
    onOpen: (href: string) => void;
    onRetry?: () => void;
}) {
    const sources = useMemo(() => uniqueSources(msg.sources ?? []), [msg.sources]);
    const numbers = useMemo(() => numberCitations(msg.content, sources.length), [msg.content, sources.length]);
    const ordered = useMemo(() => orderSources(sources, numbers), [sources, numbers]);
    const [hovered, setHovered] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);
    const chips: SourceChipItem[] = ordered.map(({ source, n, index }) => ({
        key: `${source.content_type}:${source.content_uuid}:${index}`,
        n,
        title: sourceTitle(source),
        hint: source.snippet ? cleanSnippet(source.snippet) : undefined,
        glyph: SOURCE_GLYPH[source.content_type],
        onOpen: () => onOpen(sourceHref(source, currentUserId)),
    }));
    const ctx = useMemo(
        () => ({
            shown: numbers.shown,
            hovered,
            setHovered,
            open: (shown: number) => {
                const src = sources[numbers.order[shown - 1]];
                if (src) onOpen(sourceHref(src, currentUserId));
            },
        }),
        [numbers, hovered, sources, onOpen, currentUserId],
    );
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(msg.content);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        } catch {
            /* the clipboard refused: nothing to say */
        }
    };

    return (
        <div data-message="assistant" className="group/msg grid min-w-0 grid-cols-[24px_minmax(0,1fr)] gap-3">
            <span className="pt-px">{showMark ? <AiMark /> : null}</span>
            <div className="min-w-0">
                {msg.steps && msg.steps.length > 0 ? (
                    <div className="mb-2.5">
                        <PlanSteps steps={msg.steps} running={false} answering />
                    </div>
                ) : null}
                <CitationContext.Provider value={ctx}>
                    <div className={cn("text-pretty tracking-[-0.008em] text-foreground", page ? "text-body leading-6" : "text-ui leading-[23px]")}>
                        <MarkdownMessage content={msg.content} />
                    </div>
                    {chips.length > 0 ? <SourceChips items={chips} /> : null}
                </CitationContext.Provider>
                {msg.actions && msg.actions.length > 0 ? <ActionConfirmation actions={msg.actions} /> : null}
                {/* Always on the last answer, on hover for older ones. */}
                <div
                    data-action-row=""
                    className={cn(
                        "mt-2 flex gap-0.5 transition-opacity duration-[160ms]",
                        last ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                >
                    <button type="button" className={cn(ICON_BTN, "size-6 [&_svg]:size-3.5")} onClick={copy} aria-label={copied ? "Copied" : "Copy answer"} title="Copy">
                        {copied ? <Check /> : <Copy />}
                    </button>
                    {onRetry ? (
                        <button type="button" className={cn(ICON_BTN, "size-6 [&_svg]:size-3.5")} onClick={onRetry} aria-label="Ask again" title="Ask again">
                            <RotateCcw />
                        </button>
                    ) : null}
                </div>
                {/* A footnote, not a warning: the answer used less of the thread than you may assume. */}
                {msg.notice ? (
                    <div className="mt-1.5 flex items-start gap-1.5 text-meta text-ink-3" role="note">
                        <Scissors size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>{msg.notice}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/** An error, said quietly in the answer's column: a sunken card, never a red box. */
function AiErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
    if (aiErrorKind(message) === "limit") {
        return (
            <div data-ai-error="limit" className="ml-9 rounded-[10px] bg-camp-sun-tint px-3 py-2.5 text-ui text-camp-sun-ink" role="status">
                You&apos;ve used today&apos;s AI allowance. It resets at midnight UTC. An admin can raise it in AI settings.
            </div>
        );
    }
    return (
        <div data-ai-error="error" className="ai-inset ml-9 flex items-start gap-2 rounded-[10px] bg-sunken px-3 py-2.5" role="alert">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger-ink" aria-hidden />
            <span className="min-w-0 flex-1 text-ui text-foreground">{message}</span>
            {onRetry ? (
                <Button size="xs" variant="ghost" onClick={onRetry}>
                    Try again
                </Button>
            ) : null}
        </div>
    );
}

// --- Component ---

/**
 * `panel`: the right panel beside a page. `page`: /app/ai, where the panel is the
 * whole page: there is nothing to close on a computer, and the conversation keeps
 * a 720 px reading column.
 */
const AiChatPanel: React.FC<{ variant?: "panel" | "page"; initialAsk?: string }> = ({ variant = "panel", initialAsk }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const { toast } = useToast();
    const [sessionId, setSessionId] = useState<string | null>(null);
    // True while a restored conversation's last answer is still being written
    // on the server, so the screen can say why the last question has no
    // answer yet instead of looking as if it was never asked.
    const [awaitingAnswer, setAwaitingAnswer] = useState(false);
    // Set when the person sends something while the recovery loop is still
    // polling: from then on whatever it fetches is stale and must not replace
    // what is on screen. A ref, because the loop reads it between awaits.
    const recoverySuperseded = useRef(false);
    const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
    const [socialOpen, setSocialOpen] = useState(false);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    const [agentWorkOpen, setAgentWorkOpen] = useState(false);
    const [socialTopic, setSocialTopic] = useState("");
    const { askStream, cancelStream, isStreaming, streamText, streamSteps, error } = useAskAIStream();
    const [offline, setOffline] = useState(false);
    const lastQuestion = useRef("");

    // Reopening a past conversation replaces what is on screen AND adopts its
    // id, so the next question continues that thread rather than silently
    // starting a new one under the old messages.
    const handleResume = useCallback((conversation: ResumedConversation) => {
        setMessages(
            conversation.messages.map((m, i) => ({
                id: `${conversation.sessionId}-${i}`,
                role: m.role,
                content: m.content,
            })) as ChatMessage[],
        );
        setSessionId(conversation.sessionId);
    }, []);

    // Come back to where you were. A refresh kept no id and so had nothing to
    // ask for; the conversation was still on the server the whole time.
    const restored = useRef(false);
    useEffect(() => {
        if (restored.current) return;
        restored.current = true;

        const last = readLastConversation();
        if (!last) return;

        let cancelled = false;
        (async () => {
            try {
                // The answer to the last question may still be being written:
                // the server lets it outlive the connection that asked. Show
                // what is recorded now, say so, and keep asking until the
                // exchange lands or the server's own ceiling has passed.
                const startedAt = Date.now();
                for (;;) {
                    const state = await getChatSessionState(last);
                    if (cancelled || recoverySuperseded.current) return;
                    const adopt = (msgs: typeof state.messages) =>
                        handleResume({
                            sessionId: last,
                            messages: msgs.map((m) => ({ role: m.role, content: m.content })),
                        });
                    const step = nextRecoveryStep(state.live, Date.now() - startedAt);
                    if (step !== "wait") {
                        setAwaitingAnswer(false);
                        if (state.messages.length > 0) adopt(state.messages);
                        return;
                    }
                    if (state.messages.length > 0) adopt(state.messages);
                    setAwaitingAnswer(true);
                    await new Promise((r) => setTimeout(r, ANSWER_POLL_MS));
                    if (cancelled || recoverySuperseded.current) return;
                }
            } catch {
                // Deleted, expired, or someone else's. Start clean and stop
                // asking for it, rather than showing an error for something
                // the person did not ask to happen.
                setAwaitingAnswer(false);
                forgetConversation();
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [handleResume]);

    // Remember the conversation as soon as it has an id, so a refresh mid
    // answer still comes back to it.
    useEffect(() => {
        if (sessionId) rememberConversation(sessionId);
    }, [sessionId]);

    // Offline: the composer says so rather than failing on Send.
    useEffect(() => {
        const update = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const glideFrom = useRef<number | null>(null);
    const dispatch = useDispatch();
    const { isMobile } = useMedia();
    // Voice dictation into the assistant input (reuses the model-agnostic STT).
    const dictation = useVoiceDictation({
        onText: (t) => {
            setInput((prev) => (prev.trim() ? prev.trimEnd() + " " + t : t));
            inputRef.current?.focus();
        },
        onError: (m) => toast({ title: m, variant: "destructive" }),
    });
    const micBusy = dictation.transcribing || dictation.setup.progress !== null;
    const router = useRouter();

    // Current user id: needed to resolve DM source links to the OTHER
    // participant (a DM grouping id contains both user uuids).
    const { data: selfProfile } = useFetchOnlyOnce<{ data?: { user_uuid?: string } }>(GetEndpointUrl.SelfProfile);
    const currentUserId = selfProfile?.data?.user_uuid;

    // Surface hint set by the quick-invoke shortcut (Ctrl/Cmd+J): the
    // starter questions are about that surface. Otherwise they come from the
    // person's day: the channel they were last in, what is due, the next event.
    const aiContextType = useSelector((s: RootState) => s.rightPanel.rightPanelState.data.aiContextType);
    const recentChannel = useSelector((s: RootState) => s.recentItems?.items?.find((r) => r.type === "channel")?.title);
    const [dayContext, setDayContext] = useState<SuggestionContext>({});
    const empty = messages.length === 0 && !isStreaming && !awaitingAnswer;
    useEffect(() => {
        if (!empty || aiContextType) return;
        let live = true;
        // One shared request with Home's "what needs me" (memoryService), so
        // opening the panel asks the server nothing new.
        getAttention()
            .then((a) => {
                if (!live) return;
                const tasks = a.items.filter((i) => i.source === "task");
                const event = a.items.find((i) => i.source === "calendar");
                setDayContext({
                    tasksDue: tasks.length,
                    nextEvent: event ? { title: event.title, at: event.due_time ? new Date(event.due_time) : undefined } : undefined,
                    draft: tasks.find((t) => /^(write|draft)\b/i.test(t.title))?.title.replace(/^(write|draft)\s+/i, ""),
                });
            })
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [empty, aiContextType]);
    const suggestions: Suggestion[] = useMemo(() => {
        if (aiContextType && CONTEXT_SUGGESTIONS[aiContextType]) {
            return CONTEXT_SUGGESTIONS[aiContextType].map((text) => ({ text, hue: "agent" as const, icon: "spark" as const }));
        }
        return suggestionsFrom({ ...dayContext, recentChannel });
    }, [aiContextType, dayContext, recentChannel]);

    // Sanitize streaming text in real-time so <tool_call> blocks never render
    const sanitizedStreamText = useMemo(() => sanitizeAIText(streamText), [streamText]);

    // Keep the newest line in view while the reader is at the bottom; once
    // they scroll up, leave them there and offer "Jump to latest".
    const [atBottom, setAtBottom] = useState(true);
    const onScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
    }, []);
    const toBottom = useCallback((smooth: boolean) => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
    }, []);
    useEffect(() => {
        if (atBottom) toBottom(false);
    }, [messages, sanitizedStreamText, atBottom, toBottom]);

    // The page's glide: the composer was in the middle with the composition;
    // after the first question it is at the bottom. It moves there by
    // transform from where it was (FLIP), 320 ms, so nothing reflows per frame.
    useLayoutEffect(() => {
        const from = glideFrom.current;
        const el = composerRef.current;
        glideFrom.current = null;
        if (from !== null) inputRef.current?.focus();
        if (from === null || !el || prefersReducedMotion() || typeof el.animate !== "function") return;
        const dy = from - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }, [messages.length]);

    // Focus input on mount
    // Not on a phone: there it would raise the keyboard over the suggestions,
    // and the composer would wear its focus halo before anyone touched it.
    useEffect(() => {
        if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) return;
        const t = setTimeout(() => inputRef.current?.focus(), 200);
        return () => clearTimeout(t);
    }, []);

    /** Send what is in the box, or a specific question. See lib/ai/sendTarget. */
    const handleSend = useCallback(async (text?: string) => {
        const { text: q, clearDraft } = sendTarget(text, input);
        if (!q || isStreaming) return;
        // A new question outranks an answer still being recovered: the loop
        // must not paste an older record over this exchange when it lands.
        recoverySuperseded.current = true;
        setAwaitingAnswer(false);
        lastQuestion.current = q;
        if (messages.length === 0 && composerRef.current) glideFrom.current = composerRef.current.getBoundingClientRect().top;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: q,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setAtBottom(true);
        if (clearDraft) setInput("");

        // askStream returns the final text + actions synchronously as its
        // resolved value: no race with React state updates.
        const result = await askStream(q, sessionId || undefined);

        // Adopt the conversation the server minted, so the NEXT question
        // continues this one. Done before the text check on purpose: an
        // answer that arrived empty is still a conversation that happened.
        if (result?.sessionId && result.sessionId !== sessionId) {
            setSessionId(result.sessionId);
        }

        if (result && (result.text || result.actions.length > 0)) {
            let finalText = sanitizeAIText(result.text);
            const finalActions = result.actions;
            // An answer that is only a proposed action reads as one sentence; the card says the rest.
            if (!finalText && finalActions && finalActions.length > 0) {
                finalText = finalActions.length === 1 ? `I'll ${finalActions[0].description.toLowerCase()}.` : "Here is what I can do for you.";
            }

            const assistantMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: "assistant",
                content: finalText,
                actions: finalActions && finalActions.length > 0 ? finalActions : undefined,
                sources: result.sources && result.sources.length > 0 ? result.sources : undefined,
                steps: result.steps && result.steps.length > 0 ? result.steps : undefined,
                notice: result.notice || undefined,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
        }
    }, [input, isStreaming, askStream, sessionId, messages.length]);

    // A question the page arrived with (?ask=, from search): sent once, as a
    // fresh question, the first time it is known.
    const askedInitial = useRef<string | null>(null);
    useEffect(() => {
        if (!initialAsk || askedInitial.current === initialAsk || isStreaming) return;
        askedInitial.current = initialAsk;
        void handleSend(initialAsk);
    }, [initialAsk, isStreaming, handleSend]);

    const retry = useCallback(() => {
        if (lastQuestion.current) void handleSend(lastQuestion.current);
    }, [handleSend]);

    const handleNewChat = useCallback(() => {
        setMessages([]);
        setSessionId(null);
        // Asked for a blank panel, so a refresh should give one too.
        forgetConversation();
        setInput("");
        inputRef.current?.focus();
    }, []);

    const handleClose = useCallback(() => {
        if (isMobile) {
            router.back();
        } else {
            dispatch(closeRightPanel());
        }
    }, [dispatch, isMobile, router]);

    const openSource = useCallback((href: string) => router.push(href), [router]);

    const isPage = variant === "page";
    const column = isPage && !isMobile ? "mx-auto w-full max-w-[720px]" : "";
    const centred = isPage && !isMobile && empty;

    const composer = (
        <AiComposer
            boxRef={composerRef}
            inputRef={inputRef}
            value={input}
            onChange={setInput}
            onSend={() => void handleSend()}
            onStop={cancelStream}
            streaming={isStreaming}
            size={isPage ? "page" : "panel"}
            disabled={offline}
            disabledNote={offline ? "You're offline" : undefined}
            mic={{
                available: dictation.available,
                recording: dictation.recording,
                busy: micBusy,
                label: dictationLabel(dictation),
                toggle: dictation.toggle,
            }}
        />
    );

    // The phone's page: its tools ride in the phone's top bar.
    const phonePage = isPage && isMobile;
    const tools = (
        <>
            <button type="button" className={ICON_BTN} data-touch-target="" onClick={handleNewChat} title="New chat" aria-label="New conversation">
                <SquarePen />
            </button>
            {/* Past conversations, beside the tools menu: reopening yesterday's thread is a top-level thing to do. */}
            <ChatHistoryMenu onResume={handleResume} currentId={sessionId} />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" className={ICON_BTN} data-touch-target="" title="More tools" aria-label="More AI tools">
                        <MoreHorizontal />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <AiUsageIndicator variant="menu" refreshSignal={messages.length} />
                    <AgentTeammatesMenuItem onSelect={() => setAgentWorkOpen(true)} />
                    <DropdownMenuItem onClick={() => setInstructionsOpen(true)}>
                        <SlidersHorizontal className="h-4 w-4" />
                        Custom instructions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/app/ai/memory")}>
                        <Lightbulb className="h-4 w-4" />
                        Workspace memory
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                        <CalendarClock className="h-4 w-4" />
                        Find a meeting time
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReleaseNotesOpen(true)}>
                        <FileText className="h-4 w-4" />
                        Draft release notes
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSocialTopic(""); setSocialOpen(true); }}>
                        <Megaphone className="h-4 w-4" />
                        Draft social posts
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );

    return (
        <div data-ai-panel={variant} className={cn("flex h-full flex-col bg-sheet dark:bg-panel", !isPage && "border-l border-line")}>
            {/* One 52px row: the mark, the name and the model, then the tools.
                On the phone's page the top bar names it, and the tools go up
                into that bar (PhoneBarActions): one bar, not two. */}
            {phonePage ? (
                <PhoneBarActions>{tools}</PhoneBarActions>
            ) : (
            <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line pl-4 pr-2.5" data-ai-header="">
                <AiMark />
                <h2 className="min-w-0 truncate text-heading font-semibold text-foreground">OneCamp AI</h2>
                <span className="ml-1 min-w-0 shrink" data-ai-model="">
                    <AiModelPicker />
                </span>
                <span className="flex-1" />
                {/* 16px apart on a touch screen (44 less their 28). */}
                <div className="flex shrink-0 items-center gap-0.5 pointer-coarse:gap-4">
                    {tools}
                    {/* Closing means something in the side panel. */}
                    {!isPage && (
                        <button type="button" className={ICON_BTN} data-touch-target="" onClick={handleClose} title="Close (Esc)" aria-label="Close panel">
                            <X />
                        </button>
                    )}
                </div>
            </div>
            )}

            {centred ? (
                // The empty page: the composition and a wider composer together, at 38% of the height.
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
                    <div className="mx-auto flex w-full max-w-[720px] flex-col pt-[max(24px,calc(38vh-200px))]">
                        <AiEmpty suggestions={suggestions} onAsk={(q) => void handleSend(q)} layout="grid" className="pt-0">
                            <div className="mt-6 w-full text-left">{composer}</div>
                        </AiEmpty>
                    </div>
                </div>
            ) : (
                <>
                    <div className="relative min-h-0 flex-1">
                        <div ref={scrollContainerRef} onScroll={onScroll} className="custom-scrollbar h-full overflow-y-auto overflow-x-hidden px-4 py-5">
                            <div className={cn("flex min-w-0 flex-col gap-5", column)}>
                                {empty ? <AiEmpty suggestions={suggestions} onAsk={(q) => void handleSend(q)} /> : null}

                                {messages.map((msg, i) =>
                                    msg.role === "user" ? (
                                        <div key={msg.id} data-message="user" className="flex min-w-0 justify-end hub-fade-in">
                                            <div className="ai-user-bubble max-w-[80%] px-3.5 py-2.5 text-ui leading-[22px] tracking-[-0.008em] text-foreground md:max-w-[min(80%,560px)]">
                                                <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.content}</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <AssistantMessage
                                            key={msg.id}
                                            msg={msg}
                                            page={isPage}
                                            showMark={i === 0 || messages[i - 1].role === "user"}
                                            last={i === messages.length - 1 && !isStreaming}
                                            currentUserId={currentUserId}
                                            onOpen={openSource}
                                            onRetry={i === messages.length - 1 ? retry : undefined}
                                        />
                                    ),
                                )}

                                {/* An answer being written on the server for a question asked before this screen was opened. */}
                                {awaitingAnswer && !isStreaming && (
                                    <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3" role="status" aria-live="polite">
                                        <AiMark breathing />
                                        <span className="hub-shimmer text-ui">Still writing your answer…</span>
                                    </div>
                                )}

                                {/* The answer being written now. */}
                                {isStreaming && (
                                    <div data-message="streaming" className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] gap-3">
                                        <span className="pt-px">
                                            <AiMark breathing={sanitizedStreamText.length === 0} />
                                        </span>
                                        <div className="min-w-0">
                                            {streamSteps.length > 0 ? (
                                                <div className="mb-2.5">
                                                    <PlanSteps steps={streamSteps} running answering={sanitizedStreamText.length > 0} />
                                                </div>
                                            ) : null}
                                            {sanitizedStreamText.length === 0 ? (
                                                <span className="hub-shimmer flex h-6 items-center text-ui" role="status" aria-live="polite">
                                                    {thinkingLabel(streamSteps)}
                                                </span>
                                            ) : (
                                                <StreamingAnswer
                                                    text={sanitizedStreamText}
                                                    isStreaming
                                                    className={cn("text-pretty tracking-[-0.008em]", isPage ? "text-body leading-6" : "text-ui leading-[23px]")}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {error && <AiErrorNote message={error} onRetry={lastQuestion.current ? retry : undefined} />}
                            </div>
                        </div>
                        {isStreaming && !atBottom ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setAtBottom(true);
                                    toBottom(true);
                                }}
                                className="hub-pop absolute bottom-3 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full bg-pop px-3 text-meta font-medium shadow-e3"
                            >
                                <ArrowDown className="size-3.5" aria-hidden />
                                Jump to latest
                            </button>
                        ) : null}
                    </div>

                    <div className="shrink-0 px-3 pb-3 pt-1">
                        {/* The phone's page has no header row, and with it went
                            the model (QA DSA-35): it sits over the box. */}
                        {phonePage ? (
                            <div data-ai-model="" className="mb-1 flex empty:hidden">
                                <AiModelPicker />
                            </div>
                        ) : null}
                        <div className={column}>{composer}</div>
                    </div>
                </>
            )}

            <ReleaseNotesDialog
                open={releaseNotesOpen}
                onOpenChange={setReleaseNotesOpen}
                onDraftSocial={(notes) => {
                    setReleaseNotesOpen(false);
                    setSocialTopic(notes);
                    setSocialOpen(true);
                }}
            />
            <SocialComposeDialog open={socialOpen} onOpenChange={setSocialOpen} initialTopic={socialTopic} />
            <AiScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
            <AiInstructionsDialog open={instructionsOpen} onOpenChange={setInstructionsOpen} />
            <MyAgentWorkDialog open={agentWorkOpen} onOpenChange={setAgentWorkOpen} />
        </div>
    );
};


// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, whose backend
// serves no AI routes, and on v2 whenever an admin has switched AI off. Wrapping the
// export covers every place this is rendered, desktop and mobile, rather than asking
// each of them to remember.
export default withAI(AiChatPanel);
