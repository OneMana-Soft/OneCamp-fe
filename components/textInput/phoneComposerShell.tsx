"use client"

import * as React from "react"
import { EditorContent, useEditorState, type Editor } from "@tiptap/react"
import { cn } from "@/lib/utils/helpers/cn"
import { ArrowUp, Maximize2, Minimize2, Paperclip, Sparkles, Type, Video, AtSign } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { EmojiReactionPicker } from "@/components/minimal-tiptap/components/emoji-reaction/reaction-picker"
import { SectionTwo } from "@/components/minimal-tiptap/components/section/two"
import { SectionFour } from "@/components/minimal-tiptap/components/section/four"
import { prefersReducedMotion } from "@/lib/celebrate"
import {
    ClipRecorderHost,
    ComposerPlusMenu,
    RecordTool,
    useComposerDictation,
    type ComposerAgent,
} from "@/components/textInput/composerTools"

/** Past this many lines the expand glyph offers the whole screen (C48). */
export const EXPAND_AFTER_LINES = 3

export interface PhoneComposerShellProps {
    editor: Editor
    nothingToSend: boolean
    buttonLabel: string
    onSend: () => void
    onUpload?: () => void
    onFiles?: (files: File[]) => void
    agents?: ComposerAgent[]
    onDraftWithAI?: () => void
    aiSlot?: React.ReactNode
    /** The sheet is the whole screen (the drawer's expand). */
    expanded?: boolean
    onExpandedChange?: (expanded: boolean) => void
    children?: React.ReactNode
    linkMenu?: React.ReactNode
}

const STRIP_BUTTON =
    "flex size-9 items-center justify-center rounded-[10px] text-ink-3 transition-colors active:bg-press aria-pressed:bg-press aria-pressed:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5"

/**
 * The phone's composer (design v3 chat, C48): a floating card on the raised
 * surface at e2, r16, 12px from the edges and above the safe area. At rest it
 * is one row: "+" in a 36px circle, the words at 16/24 growing to six lines,
 * the smile at the field's edge, and Send. Empty, Send is Record (WhatsApp's
 * and iMessage's pattern, so the row never shows two microphones); with words
 * it morphs into the accent circle with its arrow. Focused, a 40px strip of
 * tools reveals inside the card above the row. Past three lines an expand
 * glyph offers the whole screen. Clips and dictation are in "+" too.
 */
export const PhoneComposerShell = React.forwardRef<HTMLDivElement, PhoneComposerShellProps>(function PhoneComposerShell(
    { editor, nothingToSend, buttonLabel, onSend, onUpload, onFiles, agents, onDraftWithAI, aiSlot, expanded = false, onExpandedChange, children, linkMenu },
    ref,
) {
    const { toast } = useToast()
    const dictation = useComposerDictation(editor, (m) => toast({ title: m, variant: "destructive" }))
    const [clipOpen, setClipOpen] = React.useState(false)
    const [focused, setFocused] = React.useState(false)
    const [formatOpen, setFormatOpen] = React.useState(false)
    const arrow = React.useRef<SVGSVGElement>(null)
    const lines = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.state.doc.childCount : 1) }) ?? 1
    const ready = !nothingToSend

    const send = () => {
        if (arrow.current && !prefersReducedMotion() && typeof arrow.current.animate === "function") {
            arrow.current.animate([{ translate: "0 0" }, { translate: "0 -3px", offset: 0.4 }, { translate: "0 0" }], { duration: 160, easing: "cubic-bezier(0.3, 1.35, 0.5, 1)" })
        }
        onSend()
    }

    const insertAt = () => {
        const { from } = editor.state.selection
        const before = from > 1 ? editor.state.doc.textBetween(from - 1, from) : ""
        editor.chain().focus().insertContent(before && !/\s/.test(before) ? " @" : "@").run()
    }

    return (
        <div className="px-3 pb-3 pt-1">
            <div
                ref={ref}
                data-phone-composer=""
                data-focused={focused || undefined}
                onFocusCapture={() => setFocused(true)}
                onBlurCapture={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
                }}
                className="relative flex flex-col rounded-2xl bg-raised shadow-e2"
            >
                {(lines > EXPAND_AFTER_LINES || expanded) && onExpandedChange && (
                    <button
                        type="button"
                        aria-label={expanded ? "Shrink the message box" : "Expand the message box"}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onExpandedChange(!expanded)}
                        className="absolute right-1.5 top-1.5 z-10 flex size-8 items-center justify-center rounded-lg text-ink-3 active:bg-press [&_svg]:size-4"
                    >
                        {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                    </button>
                )}
                {focused && (
                    // The tools, revealed by clip-path inside the card when the
                    // field takes focus; the card grows without motion.
                    <div data-phone-tools="" className="flex h-10 animate-[format-reveal_160ms_var(--ease-out)_both] items-center gap-1 border-b border-line px-1.5" onMouseDown={(e) => e.preventDefault()}>
                        <button type="button" aria-label={formatOpen ? "Hide formatting" : "Show formatting"} aria-pressed={formatOpen} onClick={() => setFormatOpen((o) => !o)} className={STRIP_BUTTON}>
                            <Type aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Mention someone" onClick={insertAt} className={STRIP_BUTTON}>
                            <AtSign aria-hidden="true" />
                        </button>
                        <EmojiReactionPicker editor={editor} size="sm" className={STRIP_BUTTON} />
                        {onUpload && (
                            <button type="button" aria-label="Attach a file" onClick={onUpload} className={STRIP_BUTTON}>
                                <Paperclip aria-hidden="true" />
                            </button>
                        )}
                        {onFiles && (
                            <button type="button" aria-label="Record a clip" onClick={() => setClipOpen(true)} className={STRIP_BUTTON}>
                                <Video aria-hidden="true" />
                            </button>
                        )}
                        {onDraftWithAI && (
                            <button type="button" aria-label="Draft with AI" onClick={onDraftWithAI} className={cn(STRIP_BUTTON, "text-agent")}>
                                <Sparkles aria-hidden="true" />
                            </button>
                        )}
                    </div>
                )}
                {focused && formatOpen && (
                    <div className="flex h-9 animate-[format-reveal_160ms_var(--ease-out)_both] items-center gap-px overflow-x-auto border-b border-line px-1.5 [&_button]:size-9" onMouseDown={(e) => e.preventDefault()}>
                        <SectionTwo editor={editor} activeActions={["bold", "italic", "strikethrough", "code"]} mainActionCount={4} size="sm" />
                        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
                        <SectionFour editor={editor} activeActions={["bulletList", "orderedList"]} mainActionCount={2} size="sm" />
                    </div>
                )}
                {children}
                <div className="flex items-end gap-1.5 p-1.5">
                    <ComposerPlusMenu
                        editor={editor}
                        onUpload={onUpload}
                        onRecordClip={onFiles ? () => setClipOpen(true) : undefined}
                        onDictate={dictation.available ? dictation.toggle : undefined}
                        dictateLabel={dictation.label}
                        agents={agents}
                        onDraftWithAI={onDraftWithAI}
                        triggerClassName="size-9 shrink-0 rounded-[18px] bg-press text-ink-2 [&_svg]:size-5"
                    />
                    <div className="relative min-w-0 flex-1">
                        <EditorContent
                            editor={editor}
                            className={cn(
                                "minimal-tiptap-editor phone-composer-editor overflow-y-auto py-1.5 pr-9 outline-none",
                                expanded ? "max-h-[70dvh]" : "max-h-[156px]",
                            )}
                            data-gramm="false"
                        />
                        {/* The smile at the field's right edge. */}
                        <span className="absolute bottom-0.5 right-0">
                            <EmojiReactionPicker editor={editor} size="sm" className="size-8 rounded-lg text-ink-3 [&_svg]:size-5" />
                        </span>
                    </div>
                    {/* Send and Record share one 36px place and morph between them. */}
                    <span className="relative size-9 shrink-0">
                        <span className={cn("absolute inset-0 transition-[opacity,scale] duration-[160ms] ease-out", ready ? "pointer-events-none scale-[0.8] opacity-0" : "scale-100 opacity-100")} aria-hidden={ready || undefined}>
                            <RecordTool
                                onRecordClip={onFiles ? () => setClipOpen(true) : undefined}
                                dictation={dictation}
                                triggerClassName="size-9 rounded-[18px] bg-press text-ink-2 [&_svg]:size-5"
                            />
                        </span>
                        <button
                            type="button"
                            aria-label={buttonLabel}
                            tabIndex={ready ? 0 : -1}
                            aria-hidden={!ready || undefined}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={send}
                            className={cn(
                                "absolute inset-0 flex items-center justify-center rounded-[18px] bg-brand text-brand-foreground shadow-primary",
                                "transition-[opacity,scale] duration-[160ms] ease-out active:scale-90 active:duration-[90ms]",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                ready ? "scale-100 opacity-100" : "pointer-events-none scale-[0.8] opacity-0",
                            )}
                        >
                            <ArrowUp ref={arrow} className="size-5" aria-hidden="true" />
                        </button>
                    </span>
                </div>
                {aiSlot}
                {/* Its own wrapper: Tiptap moves the bubble's element away
                    (see chatComposerShell). */}
                <div className="contents">{linkMenu}</div>
            </div>
            {onFiles && <ClipRecorderHost open={clipOpen} onOpenChange={setClipOpen} onRecorded={(f) => onFiles([f])} />}
        </div>
    )
})

