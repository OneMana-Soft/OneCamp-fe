"use client"

/**
 * The comment composer (docs programme B7; collaboration.md, design gaps):
 * one line that grows, ⌘↵ sends, Return starts a new line, Esc lets go of it,
 * and only two tools, @ and attach. The chat composer's full row of tools is
 * a conversation's; a comment is a note in a doc's margin.
 *
 * It is the shared editor (useMinimalTiptapEditor, the 'chat' kind, so @
 * finds people as everywhere else) and the shared tools (MentionTool,
 * SendSplit). Its files are its own (useCommentDraft): Send waits while one is
 * uploading, and one that finishes late never joins the next comment (N41).
 *
 * An error is an error (N46): what didn't happen and why, under the words,
 * which stay, so nothing typed is lost.
 */
import * as React from "react"
import { EditorContent, useEditorState, type Editor } from "@tiptap/react"
import { useMinimalTiptapEditor } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"
import { suggestionMenuOpen } from "@/components/minimal-tiptap/extensions/suggestion-popup"
import { CHAT_COMMANDS } from "@/components/minimal-tiptap/extensions/slash-command/slashCommand"
import { COMPOSER_TOOL, MentionTool, SendSplit, startMention } from "@/components/textInput/composerTools"
import { DocCommentFileUpload } from "@/components/fileUpload/docCommentFileUpload"
import { Button } from "@/components/ui/button"
import { Paperclip } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import { useModKey } from "@/hooks/useModKey"
import { useLatch } from "@/hooks/useLatch"
import type { AttachmentMediaReq } from "@/types/attachment"
import { escapeTaken } from "@/lib/keys/escapeOwn"
import { useCommentDraft } from "./useCommentDraft"

interface CommentBody {
    body: string
    attachments: AttachmentMediaReq[]
}

interface CommentComposerProps {
    docId: string
    placeholder: string
    /** The editor's accessible name: "Comment on the selected text", "Reply to Maya". */
    label: string
    /** Sends; throws with what to tell the person. */
    onSend(body: CommentBody): Promise<unknown>
    /** Esc, or Cancel: for a new thread or a reply that may be dropped. */
    onCancel?(): void
    autoFocus?: boolean
    /**
     * A box most readers never type in (a record's, made for every row opened or stepped to): its editor is made
     * the first time the box is asked for, by a focus or a tap on it or by autoFocus. Until then the box is its
     * resting card, an editable line that keeps the focus (and a phone's keyboard) while the editor comes in and
     * hands over what was typed, so opening, stepping and closing pay for no editor (V-1042).
     */
    waitForUse?: boolean
    /** The send button's name. */
    sendLabel?: string
    /**
     * Whether files can be attached (a doc's comments). Off where the comments
     * keep no files (a table's rows, for now): no paperclip, and a file
     * dropped or pasted in is refused in words.
     */
    uploads?: boolean
    className?: string
}

/** What a composer that takes no files says of one dropped or pasted in. */
export const NO_FILES_HERE = "Files can't be attached to a comment here yet."

/** The editable element's name and kind, by value (the editor compares them so). */
const attributesFor = (label: string) => ({ "aria-label": label, "aria-multiline": "true", role: "textbox" }) as const

export function CommentComposer({ docId, placeholder, label, onSend, onCancel, autoFocus, waitForUse, sendLabel = "Send", uploads = true, className }: CommentComposerProps) {
    const draft = useCommentDraft(docId)
    const [sending, setSending] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const fileInput = React.useRef<HTMLInputElement>(null)
    const mod = useModKey()

    const [pressed, setPressed] = React.useState(false)
    const inUse = useLatch(!waitForUse || !!autoFocus || pressed)
    const [editor, setEditor] = React.useState<Editor | null>(null)
    // The resting line, once asked for: its node outlives it, for the editor to take what was typed on it (below).
    const asked = React.useRef<HTMLElement | null>(null)
    const ask = (e: React.SyntheticEvent<HTMLElement>) => {
        asked.current = e.currentTarget
        setPressed(true)
    }
    // @ at rest (V-1225): the box looks as every composer does, @ beside send. A press of it focuses the resting line,
    // in the press, so a phone's keyboard comes up as for a tap on the line; the line asks for the editor, and the
    // mention starts in it as it comes in (below).
    const restingLine = React.useRef<HTMLDivElement>(null)
    const mentionOnArrival = React.useRef(false)
    const mentionAtRest = React.useCallback(() => {
        mentionOnArrival.current = true
        restingLine.current?.focus()
    }, [])
    const options: Parameters<typeof useMinimalTiptapEditor>[0] = {
        kind: "chat",
        output: "html",
        placeholder,
        // Return is a new line: ⌘↵ sends (below).
        onSubmit: () => false,
        onActionFiles: (files) => (uploads ? draft.add(files) : setError(NO_FILES_HERE)),
        // "/" formats, as in every composer: the module's one array (a new
        // one each render would make the editor anew each render).
        slashCommands: CHAT_COMMANDS,
        editorClassName: "focus:outline-none",
        editorAttributes: attributesFor(label),
        shouldRerenderOnTransaction: false,
    }

    const empty = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.isEmpty : true) }) ?? true
    const nothingToSend = empty && draft.attachments.length === 0
    const failedFile = draft.files.some((f) => f.error)

    React.useEffect(() => {
        if (autoFocus && editor && !editor.isDestroyed) editor.commands.focus("end")
    }, [autoFocus, editor])
    // In the commit the resting line goes: the editor takes any key typed on the line in the moment before it came
    // in, and the focus at once (tiptap's focus waits a frame off a phone, a frame a key typed would be lost in), so
    // a phone's keyboard stays up from one editable to the next.
    React.useLayoutEffect(() => {
        const line = asked.current
        if (!line || !editor || editor.isDestroyed) return
        asked.current = null
        // As text, as typed: a "<" is a character, never the start of a tag. The line keeps no wrap, so a space typed
        // on it can be a no-break one (U+00A0): a plain space, as the editor would have made (V-1225).
        const typed = line.textContent?.replace(/ /g, " ")
        if (typed) editor.commands.insertContent({ type: "text", text: typed })
        editor.commands.focus("end")
        if (mentionOnArrival.current) {
            mentionOnArrival.current = false
            startMention(editor)
        }
        editor.view.focus()
    }, [editor])

    const send = React.useCallback(async () => {
        if (!editor || editor.isDestroyed || sending) return
        if (draft.uploading) {
            setError("A file is still uploading. Send when it's attached.")
            return
        }
        if (failedFile) {
            setError("A file couldn't be uploaded. Remove it, then send.")
            return
        }
        const body = removeEmptyPTags(editor.getHTML())
        if (!editor.getText().trim() && draft.attachments.length === 0) return
        setSending(true)
        setError(null)
        try {
            await onSend({ body: body === "<p></p>" ? "" : body, attachments: draft.attachments })
            editor.commands.clearContent(false)
            draft.clear()
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : "Couldn't send it. Try again in a moment.")
        } finally {
            setSending(false)
        }
    }, [editor, sending, draft, failedFile, onSend])

    // ⌘↵ before the editor sees it: its own Mod-Enter is a line break.
    const onKeyDownCapture = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault()
            e.stopPropagation()
            void send()
        }
    }
    // Esc after the editor and its menus: a menu that took it keeps it.
    const onKeyDown = (e: React.KeyboardEvent) => {
        // A menu that took it keeps it (escapeTaken); one a sheet over the page handed on is the box's.
        if (e.key !== "Escape" || escapeTaken(e.nativeEvent) || !onCancel || suggestionMenuOpen(editor)) return
        e.preventDefault()
        e.stopPropagation()
        onCancel()
    }

    const sendName = draft.uploading ? "Wait for the upload to finish" : sendLabel
    return (
        <div
            data-comment-composer=""
            onKeyDownCapture={onKeyDownCapture}
            data-escape-own={!!onCancel ? "" : undefined}
            onKeyDown={onKeyDown}
            className={cn(
                "group/composer composer-card rounded-xl bg-raised px-2.5 py-1.5",
                className,
            )}
        >
            {uploads && <DocCommentFileUpload docId={docId} draft={draft} />}
            <div className="flex items-end gap-0.5">
                <div className="min-w-0 flex-1 py-0.5">
                    {inUse ? <MakeEditor options={options} onEditor={setEditor} /> : null}
                    {editor ? (
                        <EditorContent
                            editor={editor}
                            className="minimal-tiptap-editor chat-composer-editor max-h-[40vh] overflow-y-auto outline-none"
                            data-gramm="false"
                        />
                    ) : (
                        waitForUse ? (
                            // At rest, the box is an editable line by its name: a focus or a tap asks for the editor.
                            // Under a finger it writes 16px, as the editor does, so iOS doesn't zoom in on the tap.
                            <div
                                {...attributesFor(label)}
                                ref={restingLine}
                                contentEditable
                                suppressContentEditableWarning
                                data-placeholder={placeholder}
                                onFocus={ask}
                                onPointerDown={ask}
                                className="h-6 overflow-hidden whitespace-nowrap text-body text-ink empty:before:text-ink-3 empty:before:content-[attr(data-placeholder)] pointer-coarse:text-base"
                            />
                        ) : (
                            <div aria-hidden="true" className="h-6 text-body text-ink-3">{placeholder}</div>
                        )
                    )}
                </div>
                {editor ? <MentionTool editor={editor} /> : waitForUse ? <MentionTool editor={null} onRest={mentionAtRest} /> : null}
                {uploads && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Attach files"
                        className={COMPOSER_TOOL}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => fileInput.current?.click()}
                    >
                        <Paperclip aria-hidden="true" />
                    </Button>
                )}
                <SendSplit nothingToSend={nothingToSend || draft.uploading} disabled={sending} label={sendName} onSend={() => void send()} />
                {uploads && (
                    <input
                        ref={fileInput}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => {
                            if (e.target.files?.length) draft.add(e.target.files)
                            e.target.value = ""
                        }}
                    />
                )}
            </div>
            {error ? (
                <p role="alert" className="pt-1 text-meta text-danger-ink">
                    {error}
                </p>
            ) : (
                <p className="hidden pt-0.5 text-meta text-ink-3 group-focus-within/composer:block">
                    <kbd className="kbd">{mod}</kbd>
                    <kbd className="kbd ml-0.5">⏎</kbd> to send
                    {onCancel && (
                        <>
                            {" · "}
                            <kbd className="kbd">esc</kbd> to cancel
                        </>
                    )}
                </p>
            )}
        </div>
    )
}

/** The composer's editor, made while it is mounted and handed up (CommentComposer's waitForUse makes it on use). */
function MakeEditor({ options, onEditor }: { options: Parameters<typeof useMinimalTiptapEditor>[0]; onEditor: (e: Editor | null) => void }) {
    const editor = useMinimalTiptapEditor(options)
    React.useEffect(() => {
        onEditor(editor)
        return () => onEditor(null)
    }, [editor, onEditor])
    return null
}

/**
 * The bar docked at the foot of a phone's comment pages (a doc's comments, a
 * thread, a new comment): above the home indicator. Those pages have no tab
 * bar, so their foot is this bar: its top is published as --mobile-drawer-h,
 * the floor the toasts and the offline pill stand on (app/phone.css C9), and
 * they sit above it rather than on it (V-1105).
 *
 * The routes draw these pages only on a phone (useMedia's isMobile,
 * app/app/doc/[doc-id]/comment), so the bar publishes whenever it is drawn.
 * It is a lighter publisher than components/livekit/rootPlace, which bars
 * that move (a call's, the task sheet's box) keep: this one stands still. A
 * ResizeObserver catches it growing with the text, a resize the screen
 * turning. No keyboard tracking (lib/ui/visualViewport): while the keyboard is
 * up the toasts take the top slot (app/phone.css C9), so the floor is unread.
 * Its own copy keeps rootPlace and visualViewport off the comment pages
 * (their chunks regrouped every /app route).
 */
export function CommentFoot({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = React.useRef<HTMLDivElement>(null)
    React.useLayoutEffect(() => {
        const bar = ref.current
        if (!bar) return
        const root = document.documentElement
        const publish = () => root.style.setProperty("--mobile-drawer-h", `${Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top))}px`)
        publish()
        const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null
        watch?.observe(bar)
        window.addEventListener("resize", publish)
        return () => {
            watch?.disconnect()
            window.removeEventListener("resize", publish)
            root.style.removeProperty("--mobile-drawer-h")
        }
    }, [])
    return (
        <div ref={ref} data-phone-foot="" className={cn("shrink-0 border-t border-line bg-sheet px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2", className)}>
            {children}
        </div>
    )
}
