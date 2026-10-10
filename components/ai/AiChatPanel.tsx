"use client";

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useAskAIStream } from "@/services/aiService";
import MarkdownMessage from "@/components/ai/MarkdownMessage";
import ActionConfirmation from "@/components/ai/ActionConfirmation";
import AiModelPicker from "@/components/ai/AiModelPicker";
import AiUsageIndicator from "@/components/ai/AiUsageIndicator";
import ReleaseNotesDialog from "@/components/ai/ReleaseNotesDialog";
import AiInstructionsDialog from "@/components/ai/AiInstructionsDialog";
import MyAgentWorkDialog from "@/components/ai/MyAgentWorkDialog";
import { AgentTeammatesMenuItem } from "@/components/ai/AgentTeammatesMenuItem";
import { ChatHistoryMenu, type ResumedConversation } from "@/components/ai/ChatHistoryMenu";
import SocialComposeDialog from "@/components/ai/SocialComposeDialog";
import AiScheduleDialog from "@/components/ai/AiScheduleDialog";
import { ProposedAction, getChatSessionState } from "@/services/aiService";
import { ANSWER_POLL_MS, STILL_WRITING, nextRecoveryStep } from "@/services/answerRecovery";
import { forgetConversation, readLastConversation, rememberConversation } from "@/lib/ai/lastConversation";
import { sendTarget } from "@/lib/ai/sendTarget";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { X, Send, Sparkles, Scissors, Loader2, MessageSquarePlus, Lightbulb, FileText, ArrowUpRight, Megaphone, CalendarClock, MoreHorizontal, SlidersHorizontal, Mic } from "@/lib/icons";
import { useVoiceDictation, dictationLabel } from "@/hooks/useVoiceDictation";
import { useToast } from "@/hooks/use-toast";
import { StopCircle } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMedia } from "@/context/MediaQueryContext";
import { useRouter } from "next/navigation";
import { getOtherUserId } from "@/lib/utils/getOtherUserId";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { withAI } from "@/components/common/withFeature"
import { Tile } from "@/components/ui/graphics/Tile"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"

/**
 * OneCamp AI's mark: a dusk tile, the AI pages' hue (lib/destinationHue). It was
 * the accent at 10%, and orange is for the one action a view asks for.
 */
function AiMark({ className }: { className?: string }) {
    return (
        <Tile hue="dusk" size="sm" className={className}>
            <Sparkles strokeWidth={1.75} />
        </Tile>
    );
}

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
        "Summarize recent activity in this channel",
        "What decisions were made in this channel?",
        "Are there open questions here I should answer?",
    ],
    doc: [
        "Summarize this doc",
        "What are the action items in this doc?",
        "Suggest improvements to this doc",
    ],
    task: [
        "Summarize this task and its discussion",
        "What's blocking this task?",
        "Draft a status update for this task",
    ],
    board: [
        "Summarize what's on this board",
        "What are the next steps from this board?",
    ],
    table: [
        "Summarize what's in this table",
        "What patterns stand out in this data?",
    ],
    chat: [
        "Summarize this conversation",
        "What did I miss in this conversation?",
        "Draft a reply",
    ],
    project: [
        "Summarize this project's status",
        "What tasks are overdue in this project?",
        "What decisions were made in this project?",
    ],
};

const DEFAULT_SUGGESTIONS = [
    "What are the recent updates in my channels?",
    "Summarize my pending tasks",
    "What did the team discuss today?",
];

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

// SourceList renders the grounding citations under an assistant answer in a
// calm, collapsible "Sources" strip — the trust signal that the answer is
// drawn from real workspace content, each one clickable.
const SourceList: React.FC<{ sources: SourceDisplay[]; currentUserId?: string; onOpen: (href: string) => void }> = ({ sources, currentUserId, onOpen }) => {
    // De-dupe by content uuid; cap to keep the strip compact.
    const unique = useMemo(() => {
        const seen = new Set<string>();
        const out: SourceDisplay[] = [];
        for (const s of sources) {
            const key = `${s.content_type}:${s.content_uuid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(s);
        }
        return out.slice(0, 6);
    }, [sources]);

    if (unique.length === 0) return null;

    return (
        <div className="mt-2.5 pt-2.5 border-t border-border/70 min-w-0">
            {/* A label in sentence case at full muted ink; it was an
                uppercase eyebrow at 70%, and its icons were the accent. */}
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Sources
            </p>
            <div className="flex flex-col gap-1 min-w-0">
                {unique.map((src, i) => {
                    const preview = src.snippet ? cleanSnippet(src.snippet) : "";
                    return (
                        <button
                            key={`${src.content_uuid}-${i}`}
                            type="button"
                            onClick={() => onOpen(sourceHref(src, currentUserId))}
                            title={preview || undefined}
                            className="group/src flex items-center gap-2 text-left rounded-md px-1.5 py-1 -mx-1.5 hover:bg-background/60 transition-colors min-w-0"
                        >
                            <span className="inline-flex items-center justify-center h-4 w-4 shrink-0 text-muted-foreground">
                                <FileText size={12} />
                            </span>
                            <span className="text-2xs font-medium text-foreground/80 shrink-0">
                                {SOURCE_LABEL[src.content_type] || src.content_type}
                            </span>
                            {src.channel_name && (
                                <span className="text-2xs text-muted-foreground shrink-0 truncate max-w-[120px]">
                                    #{src.channel_name}
                                </span>
                            )}
                            {preview && (
                                <span className="text-2xs text-muted-foreground truncate min-w-0">
                                    {preview}
                                </span>
                            )}
                            <ArrowUpRight
                                size={11}
                                className="ml-auto shrink-0 text-transparent group-hover/src:text-muted-foreground transition-colors"
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// --- Component ---

/**
 * `panel`: the right panel beside a page. `page`: /app/ai, where the panel is the
 * whole page: there is nothing to close on a computer, the conversation and the
 * box keep a reading width instead of running 1,100px wide, and on a phone the
 * top bar already names it, so the panel's header carries only its tools.
 */
const AiChatPanel: React.FC<{ variant?: "panel" | "page" }> = ({ variant = "panel" }) => {
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
    const { askStream, cancelStream, isStreaming, streamText, streamActions, error } = useAskAIStream();

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
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
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
    const { available: micAvailable, recording: micRecording, transcribing: micTranscribing, toggle: toggleDictation } = dictation;
    const micBusy = micTranscribing || dictation.setup.progress !== null;
    const micLabel = dictationLabel(dictation);
    const router = useRouter();

    // Current user id — needed to resolve DM source links to the OTHER
    // participant (a DM grouping id contains both user uuids).
    const { data: selfProfile } = useFetchOnlyOnce<{ data?: { user_uuid?: string } }>(GetEndpointUrl.SelfProfile);
    const currentUserId = selfProfile?.data?.user_uuid;

    // Surface hint set by the quick-invoke shortcut (Ctrl/Cmd+J). Picks the
    // context-aware starter prompts; empty/unknown falls back to the generic
    // workspace prompts.
    const aiContextType = useSelector(
        (s: RootState) => s.rightPanel.rightPanelState.data.aiContextType,
    );
    const suggestions = useMemo(
        () => (aiContextType && CONTEXT_SUGGESTIONS[aiContextType]) || DEFAULT_SUGGESTIONS,
        [aiContextType],
    );

    // Sanitize streaming text in real-time so <tool_call> blocks never render
    const sanitizedStreamText = useMemo(() => sanitizeAIText(streamText), [streamText]);

    // Auto-scroll to bottom. We scroll the container directly (rather than
    // scrollIntoView, which can nudge the whole page) so growth during
    // streaming keeps the latest text in view without layout jumps.
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (el) {
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
    }, [messages, sanitizedStreamText]);

    // Focus input on mount
    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 200);
    }, []);

    /** Send what is in the box, or a specific question. See lib/ai/sendTarget. */
    const handleSend = useCallback(async (text?: string) => {
        const { text: q, clearDraft } = sendTarget(text, input);
        if (!q || isStreaming) return;
        // A new question outranks an answer still being recovered: the loop
        // must not paste an older record over this exchange when it lands.
        recoverySuperseded.current = true;
        setAwaitingAnswer(false);

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: q,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);

        if (clearDraft) {
            setInput("");
            // Reset textarea height to match the min-h-[36px] of the input.
            if (inputRef.current) {
                inputRef.current.style.height = "36px";
            }
        }

        // askStream returns the final text + actions synchronously as its
        // resolved value — no more race condition with React state updates.
        const result = await askStream(q, sessionId || undefined);

        // Adopt the conversation the server minted, so the NEXT question
        // continues this one and the exchange is filed under something the
        // history list can find. Done before the text check on purpose: an
        // answer that arrived empty is still a conversation that happened.
        if (result?.sessionId && result.sessionId !== sessionId) {
            setSessionId(result.sessionId);
        }

        if (result && result.text) {
            let finalText = sanitizeAIText(result.text);
            const finalActions = result.actions;
            
            // If the AI only sent tool calls (which sanitize stripped away),
            // provide a descriptive fallback so the bubble isn't blank.
            if (!finalText && finalActions && finalActions.length > 0) {
                finalText = finalActions.length === 1 
                    ? `I'll ${finalActions[0].description.toLowerCase()}...`
                    : "I have a few actions prepared for you…";
            }

            const assistantMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: "assistant",
                content: finalText,
                actions: finalActions && finalActions.length > 0 ? finalActions : undefined,
                sources: result.sources && result.sources.length > 0 ? result.sources : undefined,
                notice: result.notice || undefined,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
        }
    }, [input, isStreaming, askStream, sessionId]);

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

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    // Auto-resize the composer between its min and max height on every value
    // change - typing, deleting, or a programmatic set (e.g. clicking a
    // suggestion). Resetting to the min first then measuring scrollHeight lets
    // it BOTH grow and shrink. Runs in a layout effect (not just onChange) so
    // it also fires for programmatic changes and AFTER the new value is in the
    // DOM. The composer disables the height transition so this measurement is
    // synchronous - an animated height makes scrollHeight read a stale value
    // and the box never shrinks.
    useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "36px";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }, [input]);

    const isPage = variant === "page";
    // The page's reading column: a conversation 1,100px wide is hard to read,
    // and its box ran the full width under a 320px column of suggestions.
    const column = isPage && !isMobile ? "mx-auto w-full max-w-3xl" : "";
    // Your words in your own colour, as everywhere you appear; the answer on
    // the neutral card. They were the accent, which marks the one action.
    const youHue = HUE_CLASS[hueFor(currentUserId)];

    return (
        <div className={cn("flex flex-col h-full bg-background", !isPage && "border-l border-border")}>
            {/* One 48px row: the mark and the name, then the tools on the
                title's centre line. The model and today's usage moved to the
                box's footer: here they wrapped the name onto two lines and
                pushed the last tool out of a 380px panel and a phone. */}
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-3">
                {isPage && isMobile ? (
                    // The phone's top bar names the page; the tools sit right.
                    <span className="flex-1" />
                ) : (
                    <>
                        <AiMark />
                        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">OneCamp AI</h2>
                    </>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={handleNewChat}
                        title="New conversation"
                        aria-label="New conversation"
                    >
                        <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                    {/* Past conversations. Sits beside the tools menu rather than
                        inside it, because reopening yesterday's thread is a
                        top-level thing somebody does, not a tool. */}
                    <ChatHistoryMenu onResume={handleResume} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                title="More tools"
                                aria-label="More AI tools"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            {/* Carries a count when teammates are actually working,
                                so live work is discoverable without adding a badge
                                or chip to the top bar. */}
                            <AgentTeammatesMenuItem onSelect={() => setAgentWorkOpen(true)} />
                            <DropdownMenuItem onClick={() => setInstructionsOpen(true)}>
                                <SlidersHorizontal className="h-4 w-4" />
                                Custom instructions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push("/app/ai/memory")}>
                                <Lightbulb className="h-4 w-4" />
                                Workspace memory
                            </DropdownMenuItem>
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
                    {/* Closing means something in the side panel, and on a phone
                        (back). On the computer's page it closed nothing: the
                        panel state it cleared was not what drew the page. */}
                    {!(isPage && !isMobile) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleClose}
                            title="Close"
                            aria-label="Close panel"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollContainerRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar"
            >
                <div className={cn("flex flex-col gap-4 min-w-0", column)}>
                {messages.length === 0 && !isStreaming && (
                    <div className="flex flex-col items-center justify-center flex-1 text-center p-6 gap-3">
                        <Tile hue="dusk" size="lg"><Sparkles strokeWidth={1.75} /></Tile>
                        {/* Not the name again: the header right above says it. */}
                        <h3 className="text-base font-medium text-foreground m-0">Ask about your workspace</h3>
                        <p className="text-sm text-muted-foreground max-w-[280px] leading-normal m-0">
                            It answers from the channels, docs and tasks you can open.
                        </p>
                        {/* Full muted ink: at 60% it was under 3:1 at 11px. A
                            keyboard tip, so not on a touch screen. */}
                        <p className="text-2xs text-muted-foreground m-0 inline-flex items-center gap-1 [@media(pointer:coarse)]:hidden">
                            Tip: press
                            <kbd className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-2xs">
                                Ctrl J
                            </kbd>
                            anywhere to open this
                        </p>
                        <div className="flex flex-col gap-2 mt-2 w-full max-w-[320px]">
                            {suggestions.map((suggestion) => (
                                <Button
                                    key={suggestion}
                                    variant="outline"
                                    className="h-auto px-3.5 py-2.5 bg-card text-foreground text-sm font-normal text-left transition-colors duration-150 leading-snug hover:bg-highlight whitespace-normal justify-start"
                                    /* Ask it. Filling the box and stopping there
                                       made every suggestion a two-step
                                       instruction nobody asked for. */
                                    onClick={() => {
                                        void handleSend(suggestion);
                                        inputRef.current?.focus();
                                    }}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={cn("flex gap-2 min-w-0 animate-msg-fade-in", msg.role === "user" && "justify-end")}
                    >
                        {msg.role === "assistant" && (
                            <AiMark className="mt-0.5" />
                        )}
                        <div className={cn(
                            "min-w-0 px-3.5 py-2.5 rounded-xl text-sm leading-relaxed relative",
                            msg.role === "user"
                                ? cn("max-w-[85%] rounded-br-sm bg-hue-tint text-hue-ink", youHue)
                                : "max-w-[92%] bg-muted text-foreground border border-border rounded-bl-sm"
                        )}>
                            {msg.role === "assistant" ? (
                                <MarkdownMessage content={msg.content} />
                            ) : (
                                <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                    {msg.content}
                                </div>
                            )}
                            {/* A footnote, not a warning. The answer succeeded; it just
                                used less of the thread than the person may assume, and
                                the quiet failure mode here is saying nothing at all —
                                someone who cannot see that context was dropped concludes
                                the assistant is unreliable rather than that the window
                                was full. Muted and inline so it informs without
                                competing with the answer. */}
                            {msg.notice && (
                                <div
                                    className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
                                    role="note"
                                >
                                    <Scissors size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                                    <span>{msg.notice}</span>
                                </div>
                            )}
                            {msg.sources && msg.sources.length > 0 && (
                                <SourceList
                                    sources={msg.sources}
                                    currentUserId={currentUserId}
                                    onOpen={(href) => router.push(href)}
                                />
                            )}
                            {msg.actions && msg.actions.length > 0 && (
                                <ActionConfirmation
                                    actions={msg.actions}
                                    onClose={() => {
                                        setMessages((prev) =>
                                            prev.map((m) =>
                                                m.id === msg.id 
                                                    ? { 
                                                        ...m, 
                                                        actions: undefined,
                                                        // If we were showing fallback text and they dismissed, 
                                                        // mark it as dismissed for better UX.
                                                        content: m.content.startsWith("I'll ") || m.content.startsWith("I have ") 
                                                            ? "Action dismissed" 
                                                            : m.content 
                                                      } 
                                                    : m
                                            )
                                        );
                                    }}
                                    onActionComplete={(toolName, success, message) => {
                                        setMessages((prev) =>
                                            prev.map((m) =>
                                                m.id === msg.id 
                                                    ? { ...m, content: success ? `${message}` : `${message}` } 
                                                    : m
                                            )
                                        );
                                    }}
                                />
                            )}
                        </div>
                    </div>
                ))}

                {/* An answer being written on the server for a question asked before this screen was opened */}
                {awaitingAnswer && !isStreaming && (
                    <div className="flex gap-2 min-w-0 animate-msg-fade-in" role="status" aria-live="polite">
                        <AiMark className="mt-0.5" />
                        <div className="min-w-0 max-w-[92%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed bg-muted text-muted-foreground border border-border rounded-bl-sm">
                            <div className="flex items-center gap-2 py-1">
                                <Loader2 size={14} className="animate-spin" />
                                <span>{STILL_WRITING}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Streaming in progress */}
                {isStreaming && (
                    <div className="flex gap-2 min-w-0 animate-msg-fade-in">
                        <AiMark className="mt-0.5" />
                        <div className="min-w-0 max-w-[92%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed bg-muted text-foreground border border-border rounded-bl-sm">
                            {sanitizedStreamText.length === 0 ? (
                                <div className="flex items-center gap-2 py-1 text-muted-foreground text-sm">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Thinking…</span>
                                </div>
                            ) : (
                                <div className="min-w-0">
                                    <MarkdownMessage content={sanitizedStreamText} />
                                    <span className="inline-block animate-blink text-muted-foreground text-xs ml-[1px] align-text-bottom">
                                        ▊
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-danger-ink text-xs">
                        {error}
                    </div>
                )}
                </div>
            </div>

            {/* Input composer */}
            <div className="px-3 py-3 border-t border-border/60 bg-background shrink-0">
              <div className={cn("@container", column)}>
                <div
                    className={cn(
                        "flex items-end gap-1.5 rounded-xl border bg-card",
                        "pl-3 pr-1 py-1",
                        "transition-shadow duration-150",
                        "border-border/60 focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_12%,transparent)]",
                        isStreaming && "opacity-90",
                    )}
                >
                    <Textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleTextareaInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask your workspace anything…"
                        className={cn(
                            "flex-1 min-w-0 border-0 bg-transparent shadow-none",
                            "text-sm leading-relaxed text-foreground",
                            "placeholder:text-muted-foreground/70",
                            "resize-none outline-none ring-0 focus-visible:ring-0",
                            // transition-none: the height is set imperatively for
                            // auto-resize; an animated height makes scrollHeight
                            // read a stale value so the box never shrinks.
                            "transition-none min-h-[36px] max-h-[120px] py-2 px-0",
                        )}
                        // Keep the input visible & editable while streaming so the user
                        // can compose a follow-up while the assistant finishes its
                        // current reply. handleSend already guards against double-submit.
                        rows={1}
                        aria-label="Message AI assistant"
                    />
                    {micAvailable && !isStreaming && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "h-8 w-8 rounded-lg shrink-0 self-end mb-0.5",
                                micRecording
                                    ? "text-danger-ink hover:text-danger-ink hover:bg-destructive/10"
                                    : "text-muted-foreground hover:text-primary",
                            )}
                            onClick={toggleDictation}
                            disabled={micBusy}
                            title={micLabel}
                            aria-label={micLabel}
                        >
                            {micBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Mic className={cn("h-4 w-4", micRecording && "animate-pulse")} />
                            )}
                        </Button>
                    )}
                    {isStreaming ? (
                        <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "h-8 w-8 rounded-lg shrink-0 self-end mb-0.5",
                                "text-danger-ink hover:text-danger-ink hover:bg-destructive/10",
                            )}
                            onClick={cancelStream}
                            title="Stop generating"
                            aria-label="Stop generating"
                        >
                            <StopCircle className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            className={cn(
                                "h-8 w-8 rounded-lg shrink-0 self-end mb-0.5",
                                "bg-primary text-primary-foreground hover:bg-primary/90",
                                "transition-colors duration-150",
                                "disabled:opacity-30 disabled:cursor-not-allowed",
                            )}
                            onClick={() => void handleSend()}
                            disabled={!input.trim()}
                            title="Send (Enter)"
                            aria-label="Send message"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                {/* Under the box: the model the answer runs on and today's usage,
                    which crowded the header off its row, held in a row of their
                    own so neither moves the box when it loads. The keyboard hint
                    is for someone who hasn't typed yet, where there is room for
                    it (the page, not the 380px panel), and never on a touch
                    screen, which has no Shift+Enter. */}
                <div className="mt-1.5 flex min-h-7 items-center gap-2 px-1">
                    <AiModelPicker />
                    {!input.trim() && (
                        <p className="hidden min-w-0 truncate text-2xs leading-tight text-muted-foreground @lg:block [@media(pointer:coarse)]:hidden">
                            Enter to send, Shift+Enter for a new line.
                        </p>
                    )}
                    <span className="ml-auto shrink-0">
                        <AiUsageIndicator refreshSignal={messages.length} />
                    </span>
                </div>
              </div>
            </div>

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
