"use client"

import * as React from "react"
import { EditorContent, useEditorState, type Editor } from "@tiptap/react"
import { cn } from "@/lib/utils/helpers/cn"
import { useComposerTarget } from "@/components/conversation/ComposerHost"
import { keyOf } from "@/lib/conversation/types"
import { ShieldCheck, Upload } from "@/lib/icons"
import { useBotKindMap } from "@/hooks/useBotKinds"
import { isAIBot } from "@/lib/botCopy"
import { useToast } from "@/hooks/use-toast"
import { SectionTwo } from "@/components/minimal-tiptap/components/section/two"
import { SectionFour } from "@/components/minimal-tiptap/components/section/four"
import { SectionFive } from "@/components/minimal-tiptap/components/section/five"
import { EmojiReactionPicker } from "@/components/minimal-tiptap/components/emoji-reaction/reaction-picker"
import {
    ClipRecorderHost,
    ComposerPlusMenu,
    COMPOSER_TOOL,
    DictationStrip,
    FormatToggle,
    MentionTool,
    RecordTool,
    ScheduledChip,
    SendHint,
    SendSplit,
    countComposerSend,
    useComposerDictation,
    type ComposerAgent,
} from "@/components/textInput/composerTools"

/** Past this many characters a message can't be sent (C38). */
export const MESSAGE_LIMIT = 40_000

const FORMAT_KEY = "onecamp-composer-format-open"

function readFormatOpen(): boolean {
    try {
        return window.localStorage.getItem(FORMAT_KEY) === "1"
    } catch {
        return false
    }
}

/** The first agent the draft mentions, by name: the composer is then "asking" it (C45). */
function askedAgent(editor: Editor | null, kinds: Record<string, string> | undefined): string | null {
    if (!editor || !kinds) return null
    let found: string | null = null
    editor.state.doc.descendants((node) => {
        if (found) return false
        if (node.type.name === "mention") {
            const id = String(node.attrs.id || "").split("@")[0]
            if (isAIBot(kinds[id])) found = String(node.attrs.label || "the agent")
        }
        return true
    })
    return found
}

/** "40,212 / 40,000": subscribed to the length only while over the limit. */
function LimitCounter({ editor }: { editor: Editor }) {
    const length = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.getText().length : 0) }) ?? 0
    return <span className="mr-2 text-meta tabular-nums text-danger-ink">{length.toLocaleString()} / {MESSAGE_LIMIT.toLocaleString()}</span>
}

export interface ChatComposerShellProps {
    editor: Editor
    /** "Reply…": the thread panel's smaller composer (C36). */
    compact?: boolean
    className?: string
    editorContentClassName?: string
    nothingToSend: boolean
    buttonLabel: string
    onSend: () => void
    onSchedule?: (at: Date) => Promise<unknown> | unknown
    /** Takes back the message just scheduled (the chip's Undo). */
    onUndoSchedule?: (at: Date) => void
    onUpload?: () => void
    onFiles?: (files: File[]) => void
    agents?: ComposerAgent[]
    onDraftWithAI?: () => void
    /** The AI draft popover (components/ai), anchored over the composer. */
    aiSlot?: React.ReactNode
    /** Attachments being added, above the tool row. */
    children?: React.ReactNode
    linkMenu?: React.ReactNode
}

/**
 * The conversation's composer (design v3 chat, C38 to C46): a floating card on
 * the raised surface at e2, r12, at most 800px wide under the 760px reading
 * measure. Focus is the accent's ring and halo; a file dragged over turns it
 * into a drop target. Under the words, one 32px row: "+", Aa, emoji, @ and
 * Record on the left (five tools, where there were two microphones and a
 * sparkle), the "⏎ send" hint, and the split Send whose chevron is Send later.
 * Asking an agent draws a 2px agent edge along its top and says who will
 * answer. The card's height follows the text without animating.
 */
export const ChatComposerShell = React.forwardRef<HTMLDivElement, ChatComposerShellProps>(function ChatComposerShell(
    { editor, compact = false, className, editorContentClassName, nothingToSend, buttonLabel, onSend, onSchedule, onUndoSchedule, onUpload, onFiles, agents, onDraftWithAI, aiSlot, children, linkMenu },
    ref,
) {
    const { toast } = useToast()
    const [formatOpen, setFormatOpen] = React.useState(false)
    React.useEffect(() => setFormatOpen(readFormatOpen()), [])
    const toggleFormat = React.useCallback(() => {
        setFormatOpen((o) => {
            try {
                window.localStorage.setItem(FORMAT_KEY, o ? "0" : "1")
            } catch {
                // remembered for this visit only
            }
            return !o
        })
    }, [])
    const [clipOpen, setClipOpen] = React.useState(false)
    const [dragging, setDragging] = React.useState(false)
    const [scheduled, setScheduled] = React.useState<Date | null>(null)
    const dictation = useComposerDictation(editor, (m) => toast({ title: m, variant: "destructive" }))

    const kinds = useBotKindMap()
    const asking = useEditorState({ editor, selector: ({ editor: e }) => askedAgent(e, kinds) }) ?? null
    // A boolean, not the length: the card re-renders only when it crosses
    // the limit, never on every keystroke (the fluidity budget).
    const overLimit = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.getText().length > MESSAGE_LIMIT : false) }) ?? false
    const openClip = React.useCallback(() => setClipOpen(true), [])

    const send = React.useCallback(() => {
        if (overLimit) return
        if (!nothingToSend) countComposerSend()
        onSend()
    }, [onSend, nothingToSend, overLimit])

    const schedule = React.useCallback(
        async (at: Date) => {
            if (!onSchedule) return
            const ok = await onSchedule(at)
            if (ok !== false) setScheduled(at)
        },
        [onSchedule],
    )

    // ⌘J opens Draft with AI; Escape and Enter steer a dictation.
    const onKeyDownCapture = (e: React.KeyboardEvent) => {
        if (onDraftWithAI && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
            e.preventDefault()
            onDraftWithAI()
            return
        }
        if (dictation.recording) {
            if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                dictation.cancel()
            } else if (e.key === "Enter") {
                e.preventDefault()
                e.stopPropagation()
                dictation.stop()
            }
        }
    }

    const showStrip = dictation.recording || dictation.transcribing

    // The tool row, rebuilt only when what it shows changes: the editor's
    // host re-renders as the draft is saved (every 300 ms of typing), and the
    // row's two dozen components came along each time.
    const toolRow = React.useMemo(() => (
                <div className={cn("flex h-8 items-center gap-0.5", compact ? "mt-1.5" : "mt-2")}>
                    {showStrip ? (
                        <DictationStrip dictation={dictation} />
                    ) : (
                        <>
                            <ComposerPlusMenu
                                editor={editor}
                                onUpload={onUpload}
                                onRecordClip={onFiles ? openClip : undefined}
                                onDictate={dictation.available ? dictation.toggle : undefined}
                                dictateLabel={dictation.label}
                                agents={agents}
                                onDraftWithAI={onDraftWithAI}
                            />
                            <FormatToggle open={formatOpen} onToggle={toggleFormat} />
                            <EmojiReactionPicker editor={editor} size="sm" className={COMPOSER_TOOL} />
                            {/* A thread's compact box has them too: @ and Record were in the
                                list's composer and not a thread's (QA F-41). */}
                            <MentionTool editor={editor} />
                            <RecordTool onRecordClip={onFiles ? openClip : undefined} dictation={dictation} />
                            <div className="min-w-0 flex-1" />
                            {overLimit ? (
                                <LimitCounter editor={editor} />
                            ) : asking ? (
                                <span data-asking-hint="" className="mr-2 flex min-w-0 animate-fade-in items-center gap-1.5 truncate text-meta text-agent-ink">
                                    <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{asking} will answer here · acts for you</span>
                                </span>
                            ) : (
                                !compact && <SendHint />
                            )}
                        </>
                    )}
                    <SendSplit nothingToSend={nothingToSend} disabled={overLimit} label={buttonLabel} onSend={send} onSchedule={onSchedule ? schedule : undefined} />
                </div>
    ), [compact, showStrip, dictation, editor, onUpload, onFiles, openClip, agents, onDraftWithAI, formatOpen, toggleFormat, overLimit, asking, nothingToSend, buttonLabel, send, onSchedule, schedule])

    // Which conversation or thread this box writes to (its ComposerHost): what
    // reaches a composer reaches the one on the surface it was typed in.
    const target = useComposerTarget()
    return (
        <div className={cn("w-full", className)}>
            {scheduled && <ScheduledChip at={scheduled} onUndo={onUndoSchedule ? () => onUndoSchedule(scheduled) : undefined} onDone={() => setScheduled(null)} />}
            <div
                ref={ref}
                data-composer=""
                data-composer-target={target ? keyOf(target) : undefined}
                data-asking-agent={asking ? "" : undefined}
                // While a dictation goes, Esc stops it, and a dialog round the box stays (lib/keys/escapeOwn).
                data-escape-own={dictation.recording ? "" : undefined}
                onKeyDownCapture={onKeyDownCapture}
                onDragEnter={(e) => {
                    if (onFiles && e.dataTransfer?.types?.includes("Files")) setDragging(true)
                }}
                onDragOver={(e) => {
                    if (onFiles && e.dataTransfer?.types?.includes("Files")) e.preventDefault()
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
                }}
                onDrop={(e) => {
                    setDragging(false)
                    if (!onFiles) return
                    const files = Array.from(e.dataTransfer?.files || [])
                    if (files.length) {
                        e.preventDefault()
                        onFiles(files)
                    }
                }}
                className={cn(
                    "composer-card @container/composer relative flex w-full max-w-[800px] flex-col rounded-xl bg-raised",
                    compact ? "px-3 pb-1.5 pt-2.5" : "pb-2 pl-3.5 pr-2.5 pt-3",
                )}
            >
                {/* Asking an agent: a 2px agent edge drawn out from the centre. */}
                {asking && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-agent animate-edge-draw" />}
                {dragging && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex animate-fade-in items-center justify-center gap-2 rounded-xl bg-brand-muted/40 text-ui font-medium text-brand-text outline-dashed outline-[1.5px] -outline-offset-1 outline-brand/60">
                        <Upload className="size-5" /> Drop to attach
                    </div>
                )}
                {formatOpen && (
                    // The formatting row reveals inside the card's new room
                    // (clip-path, not height): the card grows without motion.
                    <div data-format-row="" className="-mx-1 mb-2 flex h-8 animate-[format-reveal_160ms_var(--ease-out)_both] items-center gap-px overflow-x-auto border-b border-line pb-1 [&_button]:size-[26px] [&_button]:rounded-[7px]">
                        <SectionTwo editor={editor} activeActions={["bold", "italic", "strikethrough", "code"]} mainActionCount={4} size="sm" />
                        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
                        <SectionFour editor={editor} activeActions={["bulletList", "orderedList"]} mainActionCount={2} size="sm" />
                        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
                        <SectionFive editor={editor} activeActions={["blockquote", "codeBlock"]} mainActionCount={2} size="sm" />
                    </div>
                )}
                <EditorContent
                    editor={editor}
                    className={cn("minimal-tiptap-editor chat-composer-editor max-h-[50vh] min-h-6 overflow-y-auto outline-none", editorContentClassName)}
                    data-gramm="false"
                />
                {children}
                {toolRow}
                {aiSlot}
                {/* Tiptap moves the link bubble's element out of the card, so it
                    sits in a wrapper of its own: React inserting the AI anchor
                    (which mounts late) before a moved node threw insertBefore
                    and took the page down. */}
                <div className="contents">{linkMenu}</div>
            </div>
            {onFiles && <ClipRecorderHost open={clipOpen} onOpenChange={setClipOpen} onRecorded={(f) => onFiles([f])} />}
        </div>
    )
})
