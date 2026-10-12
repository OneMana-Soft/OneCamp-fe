"use client"

import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { cn } from '@/lib/utils/helpers/cn'
import { useClientConfig } from '@/hooks/useClientConfig'
import { exceedsUploadLimit, uploadLimitMessage } from '@/lib/utils/uploadLimit'
import { LinkBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu'
import { SelectionBar } from '@/components/docEditor/SelectionBar'
import { DocAccessoryBar } from '@/components/docEditor/DocAccessoryBar'
import { celebrate } from '@/lib/celebrate'
import { useMinimalTiptapEditor } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { TableEmbedPickerDialog } from '@/components/docEditor/TableEmbedPickerDialog'
import { createTable } from '@/services/tableService'
import { DOC_EXTRA_EXTENSIONS } from '@/components/docEditor/docExtensions'
import { DOC_SLASH_COMMANDS } from '@/components/minimal-tiptap/extensions/slash-command/slashCommand'
import { MeasuredContainer } from '@/components/minimal-tiptap/components/measured-container'
import { useMedia } from "@/context/MediaQueryContext"
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useUploadFile } from '@/hooks/useUploadFile'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { SafeHtml } from '@/components/safeHtml/SafeHtml'
import { snapshotHtml } from '@/components/docEditor/snapshotHtml'

/** The live editor while the saved copy stands in for it: mounted, out of the layout. */
const HIDDEN: React.CSSProperties = { display: 'none' }
import { useDocCounts } from '@/components/docEditor/docCounts'
import { useNewDocArrival } from '@/components/docEditor/newDocArrival'

interface MinimalTiptapProps extends Omit<UseMinimalTiptapEditorProps, 'onUpdate'> {
    value?: Content
    onChange?: (value: Content) => void
    className?: string
    editorContentClassName?: string
    docId?: string
    provider?: HocuspocusProvider
    providerSynced?: boolean
    title?: string
    onTitleChange?: (title: string) => void
    onTitleBlur?: () => void
    editableTitle?: boolean
    lastEditedRelative?: string
    focusMode?: boolean
    /** The page at 1,040 px instead of the 720 px reading measure (the More menu's "Full width"). */
    fullWidth?: boolean
    /** Who wrote it, for the meta line under the title. */
    authorName?: string
    /** The editor, once, for what the page shows from it (the word count in More). */
    onEditor?: (editor: Editor | null) => void
    /** Comment, from the selection bar. */
    onComment?: () => void
}

/**
 * The line under the title (content.md D06): who wrote it, when it was last
 * edited and how long it takes to read: "Sam Rivera · Edited 2h ago · 4 min
 * read". It replaces the footer's reading line. It follows the editor's counts
 * itself (useDocCounts waits for a pause), so the frame doesn't render for it.
 */
const DocMeta = React.memo(function DocMeta({ editor, authorName, lastEditedRelative, padded }: { editor: Editor; authorName?: string; lastEditedRelative?: string; padded: string }) {
    const { minutes } = useDocCounts(editor)
    const parts = [
        authorName ? <span key="a" className="hover:text-ink-2">{authorName}</span> : null,
        // Mid-sentence: "Edited yesterday", not "Edited Yesterday".
        lastEditedRelative ? <span key="e">Edited {lastEditedRelative.replace(/^(Just|Yesterday)/, (w) => w.toLowerCase())}</span> : null,
        minutes > 0 ? <span key="m">{minutes} min read</span> : null,
    ].filter(Boolean)
    if (!parts.length) return null
    return (
        <p data-doc-meta="" className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-ui-sm text-ink-3 tabular-nums", padded)}>
            {parts.map((p, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span aria-hidden="true">·</span>}
                    {p}
                </React.Fragment>
            ))}
        </p>
    )
})

/**
 * Checking the last open item in a to-do list is a "list done" moment: one
 * small spark burst from that checkbox. Single checks never fire it.
 */
function useChecklistDone(editor: Editor | null) {
    React.useEffect(() => {
        if (!editor) return
        const dom = editor.view.dom as HTMLElement
        const onChange = (e: Event) => {
            const input = e.target as HTMLInputElement
            if (input?.type !== 'checkbox' || !input.checked) return
            // After the editor has applied the check.
            window.setTimeout(() => {
                const list = input.closest('ul.task-list')
                if (!list) return
                const items = Array.from(list.children).filter((c) => c.matches('li.task-item'))
                if (items.length > 1 && items.every((li) => li.getAttribute('data-checked') === 'true')) {
                    celebrate(input, { count: 6 })
                }
            }, 0)
        }
        dom.addEventListener('change', onChange)
        return () => dom.removeEventListener('change', onChange)
    }, [editor])
}

const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    ({ value, onChange, className, editorContentClassName, docId, provider, providerSynced, title, onTitleChange, onTitleBlur, editableTitle = true, collaboration, lastEditedRelative, focusMode, fullWidth = false, authorName, onEditor, onComment, ...props }, ref) => {
        const { toast } = useToast()
        const uploadFile = useUploadFile()
        const clientConfig = useClientConfig()
        const titleRef = React.useRef<HTMLTextAreaElement>(null)

        // uploadFn puts a doc image in object storage and returns its URL. An image
        // is NEVER inlined into the document as a base64 data URI, no matter what
        // goes wrong.
        //
        // It used to fall back to exactly that on any failure, which quietly turned
        // every refusal into a much worse outcome: the backend rejects an oversized
        // upload with a 413, the fallback then embedded the whole image in the
        // document body, and those bytes were stored and sent on to OpenSearch as
        // analysed text — where parsing a single such document exhausted the search
        // node's heap and stopped the container. The error path inverted the control
        // that had just refused the file.
        //
        // So: check the size before spending a request, and on failure tell the
        // person and rethrow. A failed image the author can retry is a far better
        // outcome than a document that silently carries megabytes of binary.
        const uploadFn = React.useCallback(async (file: File) => {
            if (!docId) {
                toast({
                    title: 'Couldn’t add the image',
                    description: 'This document isn’t ready yet. Try again in a moment.',
                    variant: 'destructive'
                });
                throw new Error('docId required for image upload')
            }
            // Refuse an oversized image up front: same cap the server enforces, but
            // with instant feedback and no wasted request or progress bar.
            if (exceedsUploadLimit(file.size, clientConfig.upload_limit_bytes)) {
                toast({
                    title: 'Image too large',
                    description: uploadLimitMessage(file.size, clientConfig.upload_limit_mb, file.name),
                    variant: 'destructive'
                });
                throw new Error('image exceeds the workspace upload limit')
            }
            try {
                const res = await uploadFile.makeRequestToUploadToDoc([file], docId);
                if (!res || res.length === 0) {
                    throw new Error('Upload failed: no response data');
                }
                const data = res[0];
                const objUuid = data.object_uuid;
                const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || '';
                const src = `${baseUrl}${GetEndpointUrl.GetDocAttachment}/${docId}/${objUuid}`;
                return { id: objUuid, src }
            } catch (error) {
                console.error('Doc image upload failed', error);
                toast({
                    title: 'Couldn’t add the image',
                    description: 'The upload didn’t go through. Check your connection and try again.',
                    variant: 'destructive'
                });
                // Rethrow so the editor shows the image as failed. Returning a
                // data URI here is what broke search.
                throw error instanceof Error ? error : new Error('doc image upload failed')
            }
        }, [docId, toast, uploadFile, clientConfig.upload_limit_bytes, clientConfig.upload_limit_mb]);

        // Auto-resize title textarea
        React.useEffect(() => {
            if (titleRef.current) {
                titleRef.current.style.height = 'auto'
                titleRef.current.style.height = titleRef.current.scrollHeight + 'px'
            }
        }, [title])

        const extraExtensions = DOC_EXTRA_EXTENSIONS
        // This edition has no AI, so the doc palette leaves out its AI section.
        const slashCommands = React.useMemo(() => DOC_SLASH_COMMANDS.filter((c) => c.section !== "AI"), [])

        const editor = useMinimalTiptapEditor({
            value,
            onUpdate: onChange,
            uploadFn,
            provider,
            providerSynced,
            extraExtensions,
            slashCommands,
            showOnlyCurrentPlaceholder: true,
            collaboration,
            ...props,
            // The frame does not render again per keystroke: what it shows
            // from the editor (toolbar state, the caret's block, the counts)
            // each follows the editor on its own.
            shouldRerenderOnTransaction: false,
        })

        // A doc made a moment ago: the title ready to type over, and a
        // template's body once the live copy has synced (newDocArrival.ts).
        useNewDocArrival({ editor, synced: !!providerSynced || !collaboration, titleRef, canEditTitle: editableTitle && title !== undefined })

        const handleTitleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                onTitleBlur?.()
                editor?.commands.focus()
            }
        }, [editor, onTitleBlur])

        const { isMobile } = useMedia()
        const suppressOverlays = false
        const isFullWidth = fullWidth
        // The saved text stands in until a collaborative editor's first sync.
        const snapshot = !!provider && !providerSynced && typeof value === 'string' && value.trim() !== ''

        // The page reads the word count from the editor (More menu); hand it over once.
        React.useEffect(() => {
            onEditor?.(editor ?? null)
        }, [editor, onEditor])

        useChecklistDone(editor ?? null)

        // Table embed picker — opened by the "/table" slash command. Only doc
        // editors can insert (the slash menu only shows in an editable editor,
        // and we gate again here). Embedding stores only a { tableId } reference;
        // when another reader opens the doc, the embed fetches the table AS THAT
        // USER, so the table's own permissions are enforced server-side (a private
        // table simply shows an "unavailable" placeholder to others, never leaks).
        const [embedTableOpen, setEmbedTableOpen] = React.useState(false)
        const [creatingTable, setCreatingTable] = React.useState(false)
        React.useEffect(() => {
            const onEmbedTable = () => {
                if (!editor || !editor.isEditable) return
                setEmbedTableOpen(true)
            }
            window.addEventListener('doc-embed-table', onEmbedTable)
            return () => window.removeEventListener('doc-embed-table', onEmbedTable)
        }, [editor])

        const handleEmbedExistingTable = React.useCallback((tableId: string) => {
            if (!editor || !editor.isEditable || !tableId) return
            editor.chain().focus().setTableEmbed({ tableId }).run()
            setEmbedTableOpen(false)
        }, [editor])

        const handleCreateAndEmbedTable = React.useCallback(async () => {
            if (!editor || !editor.isEditable || creatingTable) return
            setCreatingTable(true)
            try {
                const t = await createTable({ name: "Untitled table", visibility: "workspace" })
                editor.chain().focus().setTableEmbed({ tableId: t.id }).run()
                setEmbedTableOpen(false)
            } catch {
                /* axios interceptor surfaces the error */
            } finally {
                setCreatingTable(false)
            }
        }, [editor, creatingTable])

        if (!editor) {
            return null
        }

        const canEdit = props.editable !== false

        return (
            <MeasuredContainer
                as="div"
                name="editor"
                ref={ref}
                className={cn(
                    'flex w-full flex-col',
                    suppressOverlays && "suppress-tippy",
                    className
                )}
            >
                {/* No toolbar row (content.md D08): formatting appears on a
                    selection (SelectionBar), blocks come from "/" and the
                    block handle. A phone gets a bar above its keyboard while
                    the editor has focus. */}
                {/* Content area — scrollable body */}
                <div 
                    // doc-scroll: the size container that wide blocks measure
                    // their breakout against (minimal-tiptap/styles/index.css).
                    className="doc-scroll w-full relative flex-1 min-h-0 overflow-y-auto overflow-x-clip cursor-text"
                >
                    <div 
                        className={cn("w-full min-h-full flex flex-col mx-auto", isFullWidth ? "doc-measure-full" : "doc-measure")}
                    >
                        {title !== undefined && (
                            <div className={cn("pt-6 pb-6 md:pt-14", focusMode && "md:pt-20")} data-doc-title-block="">
                                <textarea
                                    ref={titleRef}
                                    value={title}
                                    onChange={(e) => onTitleChange?.(e.target.value)}
                                    onBlur={onTitleBlur}
                                    onKeyDown={handleTitleKeyDown}
                                    disabled={!editableTitle}
                                    placeholder="Untitled"
                                    aria-label="Title"
                                    rows={1}
                                    data-doc-title=""
                                    className={cn(
                                        "doc-title block w-full resize-none overflow-hidden border-none bg-transparent focus:outline-none focus:ring-0 disabled:opacity-100",
                                        editableTitle ? "cursor-text" : "cursor-default",
                                        isFullWidth ? "px-5 md:px-12" : "px-5 md:px-8",
                                    )}
                                />
                                <DocMeta
                                    editor={editor}
                                    authorName={authorName}
                                    lastEditedRelative={lastEditedRelative}
                                    padded={isFullWidth ? "px-5 md:px-12" : "px-5 md:px-8"}
                                />
                            </div>
                        )}
                        {/* Until the live copy arrives (the first sync over the
                            socket, two round trips after the page shows), the
                            doc's saved text shows, read-only and drawn as the
                            editor draws it (snapshotHtml gives its blocks the
                            editor's classes, so each sits where the editor will
                            put it), so opening a doc doesn't wait on the socket.
                            The editor stays mounted, out of the layout, and takes
                            the copy's place once it has the text. Nothing goes
                            into the shared document: the server builds that from
                            the same HTML. */}
                        {snapshot && (
                            <div
                                aria-busy="true"
                                data-doc-snapshot=""
                                className={cn('minimal-tiptap-editor doc-editor flex-1', isFullWidth && 'full-width', editorContentClassName)}
                            >
                                <SafeHtml html={value as string} sanitizer={snapshotHtml} className="ProseMirror" />
                            </div>
                        )}
                        <EditorContent
                            editor={editor}
                            className={cn(
                                'minimal-tiptap-editor doc-editor flex-1 cursor-text',
                                isFullWidth && 'full-width',
                                editorContentClassName
                            )}
                            // Inline, not the hidden class: .doc-editor's own
                            // display: flex (minimal-tiptap/styles) is outside the
                            // utility layer and beat it, so an empty editor sat
                            // under the copy and jumped up when the copy went.
                            style={snapshot ? HIDDEN : undefined}
                        />
                    </div>
                </div>

                <LinkBubbleMenu editor={editor} hide={suppressOverlays} />
                {canEdit && !isMobile && (
                    <SelectionBar editor={editor} onComment={onComment} hide={suppressOverlays} />
                )}
                {canEdit && isMobile && !focusMode && <DocAccessoryBar editor={editor} />}

                <TableEmbedPickerDialog
                    open={embedTableOpen}
                    onOpenChange={setEmbedTableOpen}
                    onSelectExisting={handleEmbedExistingTable}
                    onCreateNew={handleCreateAndEmbedTable}
                    creating={creatingTable}
                />
            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapDocInput'

export default MinimalTiptapDocInput
