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
import { EditorContent, useEditorState } from "@tiptap/react"
import { useMinimalTiptapEditor } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"
import { suggestionMenuOpen } from "@/components/minimal-tiptap/extensions/suggestion-popup"
import { CHAT_COMMANDS } from "@/components/minimal-tiptap/extensions/slash-command/slashCommand"
import { COMPOSER_TOOL, MentionTool, SendSplit } from "@/components/textInput/composerTools"
import { DocCommentFileUpload } from "@/components/fileUpload/docCommentFileUpload"
import { Button } from "@/components/ui/button"
import { Paperclip } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import { useModKey } from "@/hooks/useModKey"
import type { AttachmentMediaReq } from "@/types/attachment"
import { useCommentDraft } from "./useCommentDraft"

export interface CommentBody {
    body: string
    attachments: AttachmentMediaReq[]
}

export interface CommentComposerProps {
    docId: string
    placeholder: string
    /** The editor's accessible name: "Comment on the selected text", "Reply to Maya". */
    label: string
    /** Sends; throws with what to tell the person. */
    onSend(body: CommentBody): Promise<unknown>
    /** Esc, or Cancel: for a new thread or a reply that may be dropped. */
    onCancel?(): void
    autoFocus?: boolean
    /** The send button's name. */
    sendLabel?: string
    className?: string
}

/** The editable element's name and kind, by value (the editor compares them so). */
const attributesFor = (label: string) => ({ "aria-label": label, "aria-multiline": "true", role: "textbox" })

export function CommentComposer({ docId, placeholder, label, onSend, onCancel, autoFocus, sendLabel = "Send", className }: CommentComposerProps) {
    const draft = useCommentDraft(docId)
    const [sending, setSending] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const fileInput = React.useRef<HTMLInputElement>(null)
    const mod = useModKey()

    const editor = useMinimalTiptapEditor({
        kind: "chat",
        output: "html",
        placeholder,
        // Return is a new line: ⌘↵ sends (below).
        onSubmit: () => false,
        onActionFiles: (files) => draft.add(files),
        // "/" formats, as in every composer: the module's one array (a new
        // one each render would make the editor anew each render).
        slashCommands: CHAT_COMMANDS,
        editorClassName: "focus:outline-none",
        editorAttributes: attributesFor(label),
        shouldRerenderOnTransaction: false,
    })

    const empty = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.isEmpty : true) }) ?? true
    const nothingToSend = empty && draft.attachments.length === 0
    const failedFile = draft.files.some((f) => f.error)

    React.useEffect(() => {
        if (autoFocus && editor && !editor.isDestroyed) editor.commands.focus("end")
    }, [autoFocus, editor])

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
        if (e.key !== "Escape" || e.defaultPrevented || !onCancel || suggestionMenuOpen(editor)) return
        e.preventDefault()
        e.stopPropagation()
        onCancel()
    }

    const sendName = draft.uploading ? "Wait for the upload to finish" : sendLabel
    return (
        <div
            data-comment-composer=""
            onKeyDownCapture={onKeyDownCapture}
            onKeyDown={onKeyDown}
            className={cn(
                "group/composer composer-card rounded-xl bg-raised px-2.5 py-1.5",
                className,
            )}
        >
            <DocCommentFileUpload docId={docId} draft={draft} />
            <div className="flex items-end gap-0.5">
                <div className="min-w-0 flex-1 py-0.5">
                    {editor ? (
                        <EditorContent
                            editor={editor}
                            className="minimal-tiptap-editor chat-composer-editor max-h-[40vh] overflow-y-auto outline-none"
                            data-gramm="false"
                        />
                    ) : (
                        <div aria-hidden="true" className="h-6 text-body text-ink-3">{placeholder}</div>
                    )}
                </div>
                {editor && <MentionTool editor={editor} />}
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
                <SendSplit nothingToSend={nothingToSend || draft.uploading} disabled={sending} label={sendName} onSend={() => void send()} />
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
