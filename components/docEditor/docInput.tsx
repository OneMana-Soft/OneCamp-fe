"use client"

import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { Level } from '@tiptap/extension-heading'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/helpers/cn'
import { useClientConfig } from '@/hooks/useClientConfig'
import { exceedsUploadLimit, uploadLimitMessage } from '@/lib/utils/uploadLimit'
import { SectionOne } from '@/components/minimal-tiptap/components/section/one'
import { SectionTwo } from '@/components/minimal-tiptap/components/section/two'
import { SectionThree } from '@/components/minimal-tiptap/components/section/three'
import { SectionFour } from '@/components/minimal-tiptap/components/section/four'
import { SectionFive } from '@/components/minimal-tiptap/components/section/five'
import { LinkBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu'
import { SelectionAiBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/selection-ai-bubble-menu'
import { useMinimalTiptapEditor } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { Callout } from '@/components/minimal-tiptap/extensions/callout/callout'
import { Collapsible } from '@/components/minimal-tiptap/extensions/collapsible/collapsible'
import { TableEmbed } from '@/components/minimal-tiptap/extensions/table-embed/table-embed'
import { TableEmbedPickerDialog } from '@/components/docEditor/TableEmbedPickerDialog'
import { createTable } from '@/services/tableService'
import { BlockHandle } from '@/components/minimal-tiptap/extensions/block-handle'
import { ClickToCreateBlock } from '@/components/minimal-tiptap/extensions/click-to-create-block'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { DOC_SLASH_COMMANDS } from '@/components/minimal-tiptap/extensions/slash-command/slashCommand'
import { MeasuredContainer } from '@/components/minimal-tiptap/components/measured-container'
import { useDispatch, useSelector } from "react-redux"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { useMedia } from "@/context/MediaQueryContext"
import { Drawer } from 'vaul'
import { Image as ImageIcon, Loader2, Check, Sparkles, Maximize2, Minimize2 } from "@/lib/icons";
import { CloudOff } from "lucide-react";
import { DocAiAssistantPanel } from '@/components/ai/DocAiAssistantPanel'
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useUploadFile } from '@/hooks/useUploadFile'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { SafeHtml } from '@/components/safeHtml/SafeHtml'
import { snapshotHtml } from '@/components/docEditor/snapshotHtml'

/** The live editor while the saved copy stands in for it: mounted, out of the layout. */
const HIDDEN: React.CSSProperties = { display: 'none' }
import type { SaveStatus } from '@/hooks/useDocAutoSave'
import { shortTime } from '@/lib/utils/date/shortDate'
import { useDocCounts } from '@/components/docEditor/docCounts'

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
    saveStatus?: SaveStatus
    lastSavedAt?: Date | null
    lastEditedAt?: string
    lastEditedRelative?: string
    focusMode?: boolean
}

// Hoisted, so the memoised sections below are not handed a new array (and so
// rendered again) every time the toolbar renders.
const DOC_HEADING_LEVELS: Level[] = [1, 2, 3]
const SECTION_2_ACTIONS: ("italic" | "bold" | "underline" | "strikethrough" | "code" | "clearFormatting")[] = ['italic', 'bold', 'underline', 'code', 'strikethrough', 'clearFormatting'];
const SECTION_4_ACTIONS: ("orderedList" | "bulletList")[] = ['bulletList', 'orderedList'];
const SECTION_5_ACTIONS: ("codeBlock" | "blockquote" | "horizontalRule")[] = ['blockquote', 'codeBlock', 'horizontalRule'];

const TOOLBAR_TEXT_BUTTON = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground",
    "transition-colors hover:bg-accent hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
)

// Memoised: it renders when a selection starts or ends. Each section inside
// follows the editor itself (useEditorState), so a keystroke re-renders only
// a section whose buttons actually changed.
const Toolbar = React.memo(function Toolbar({ editor, onAIClick, hasSelection }: { editor: Editor; onAIClick: () => void; hasSelection: boolean }) {
    return (
    <div className="flex w-max items-center gap-px">
            <SectionOne editor={editor} activeLevels={DOC_HEADING_LEVELS} variant="default" />

            <Separator orientation="vertical" className="mx-1.5 h-5" />

            <SectionTwo
                editor={editor}
                activeActions={SECTION_2_ACTIONS}
                mainActionCount={5}
                variant="default"
            />

            <Separator orientation="vertical" className="mx-1.5 h-5" />

            <SectionThree editor={editor} variant="default" />

            <Separator orientation="vertical" className="mx-1.5 h-5" />

            <SectionFour
                editor={editor}
                activeActions={SECTION_4_ACTIONS}
                mainActionCount={2}
                variant="default"
            />

            <Separator orientation="vertical" className="mx-1.5 h-5" />

            <SectionFive
                editor={editor}
                activeActions={SECTION_5_ACTIONS}
                mainActionCount={3}
                variant="default"
            />

            <Separator orientation="vertical" className="mx-1.5 h-5" />

            <button
                onClick={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleImage().run();
                }}
                className={TOOLBAR_TEXT_BUTTON}
                aria-label="Insert image"
                title="Insert image"
                type="button"
            >
                <ImageIcon className="size-4" aria-hidden="true" />
                <span>Image</span>
            </button>

            <Separator orientation="vertical" className="mx-1.5 h-5" />

            {/* The AI action is a toolbar control like the rest: one accent per
                view belongs to the page's primary action, and a tinted pill with
                an emoji was the loudest thing on a page meant for reading. */}
            <button
                onClick={(e) => {
                    e.preventDefault();
                    onAIClick();
                }}
                className={TOOLBAR_TEXT_BUTTON}
                title={hasSelection ? "Rewrite the selected text with AI" : "Write with AI"}
                type="button"
            >
                <Sparkles className="size-4" aria-hidden="true" />
                <span>{hasSelection ? "Rewrite" : "Write with AI"}</span>
            </button>
        </div>
    )
})

const SaveStatusIndicator = ({ status, lastSavedAt }: { status?: SaveStatus; lastSavedAt?: Date | null }) => {
    if (!status || status === 'idle') return null

    const formatTime = (d: Date) => shortTime(d)

    switch (status) {
        case 'saving':
            return (
                <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    <span className="text-2xs font-medium">Saving…</span>
                </span>
            )
        case 'saved':
            return (
                <span className="flex items-center gap-1 text-muted-foreground">
                    <Check className="size-3 text-success-ink" aria-hidden="true" />
                    <span className="text-2xs font-medium">
                        {lastSavedAt ? `Saved at ${formatTime(lastSavedAt)}` : 'Saved'}
                    </span>
                </span>
            )
        case 'error':
            return (
                <span className="flex items-center gap-1 text-danger-ink">
                    <CloudOff className="size-3" />
                    <span className="text-2xs font-medium">Save failed</span>
                </span>
            )
        case 'offline':
            return (
                <span className="flex items-center gap-1 text-warning-ink">
                    <CloudOff className="size-3" />
                    <span className="text-2xs font-medium">Offline</span>
                </span>
            )
        default:
            return null
    }
}

type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'synced' | 'offline'

/**
 * Whether a collaborative doc has changes the server has not confirmed for
 * more than a moment. Changes are normally confirmed in a few milliseconds, so
 * this stays false (and renders nothing new) while someone types; "Saving…"
 * only shows when the server is genuinely slow to take them.
 */
function useSlowSave(provider: HocuspocusProvider | undefined, afterMs = 1500): boolean {
    const [slow, setSlow] = React.useState(false)
    React.useEffect(() => {
        if (!provider) return
        let timer: ReturnType<typeof setTimeout> | null = null
        const onUnsynced = ({ number }: { number: number }) => {
            if (number > 0) {
                if (!timer) timer = setTimeout(() => setSlow(true), afterMs)
                return
            }
            if (timer) clearTimeout(timer)
            timer = null
            setSlow(false)
        }
        provider.on('unsyncedChanges', onUnsynced)
        return () => {
            provider.off('unsyncedChanges', onUnsynced)
            if (timer) clearTimeout(timer)
        }
    }, [provider, afterMs])
    return slow
}

/**
 * The doc's footer: its length, whether it is saved, and the width toggle. A component of its own that follows the editor itself,
 * so the rest of the editor's frame does not render again per keystroke.
 */
const DocFooter = React.memo(function DocFooter({
    editor,
    isFullWidth,
    onToggleWidth,
    lastEditedRelative,
    saveStatus,
    lastSavedAt,
    provider,
    collabStatus,
}: {
    editor: Editor
    isFullWidth: boolean
    onToggleWidth: () => void
    lastEditedRelative?: string
    saveStatus?: SaveStatus
    lastSavedAt?: Date | null
    /** Only for a collaborative doc. */
    provider?: HocuspocusProvider
    collabStatus: CollabStatus
}) {
    const { words, minutes } = useDocCounts(editor)
    const slowSave = useSlowSave(provider)
    // A collaborative doc saves as it is written, so the footer says so
    // quietly, and only speaks up when that stops being true. Who else is
    // here shows once, as faces in the top bar.
    const live = provider
        ? collabStatus === 'offline'
            ? <span className="font-medium text-warning-ink">Offline</span>
            : collabStatus === 'disconnected'
            ? <span className="font-medium text-warning-ink">Reconnecting…</span>
            : collabStatus === 'synced' || collabStatus === 'connected'
            ? <span>{slowSave ? 'Saving…' : 'Saved'}</span>
            : null
        : null
    // One line, never wrapped: the length of the doc on the left, whether it
    // is saved on the right. It had six items in the reading column's width
    // (words, characters, minutes, the caret's block, when it was edited, the
    // connection), so each wrapped onto two lines; the characters and the
    // block (which the toolbar already shows) went.
    return (
        <div className="shrink-0 z-10 bg-background border-t border-border w-full">
            <div className={cn("mx-auto flex items-center justify-between gap-3 whitespace-nowrap px-4 py-1.5 text-2xs tabular-nums text-muted-foreground select-none md:px-8", isFullWidth ? "max-w-none" : "doc-measure")}>
                <span className="hidden sm:inline">
                    {words} word{words !== 1 ? 's' : ''}, {minutes} min read
                </span>
                <div className="flex items-center gap-3 ml-auto sm:ml-0">
                    {lastEditedRelative && (
                        <span className="hidden md:inline">Edited {lastEditedRelative}</span>
                    )}
                    <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                    {live}
                    <button
                        onClick={onToggleWidth}
                        className="hidden sm:inline-flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-highlight hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={isFullWidth ? 'Reading width' : 'Full width'}
                        title={isFullWidth ? 'Reading width' : 'Full width'}
                        type="button"
                    >
                        {isFullWidth ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Maximize2 className="size-3.5" aria-hidden="true" />}
                    </button>
                </div>
            </div>
        </div>
    )
})

const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    ({ value, onChange, className, editorContentClassName, docId, provider, providerSynced, title, onTitleChange, onTitleBlur, editableTitle = true, collaboration, saveStatus, lastSavedAt, lastEditedAt, lastEditedRelative, focusMode, ...props }, ref) => {
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

        const extraExtensions = React.useMemo(() => [
            Callout, 
            Collapsible, 
            TableEmbed,
            BlockHandle,
            ClickToCreateBlock,
            TaskList.configure({
                HTMLAttributes: {
                    class: 'task-list',
                },
            }),
            TaskItem.configure({
                HTMLAttributes: {
                    class: 'task-item',
                },
                nested: true,
            }),
        ], [])
        const slashCommands = React.useMemo(() => DOC_SLASH_COMMANDS, [])

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

        const handleTitleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                onTitleBlur?.()
                editor?.commands.focus()
            }
        }, [editor, onTitleBlur])

        const dispatch = useDispatch()
        const { isDesktop, isMobile } = useMedia()
        const docAiOpen = useSelector((state: any) => state.rightPanel.rightPanelState.data.docAiOpen)
        const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)
        const suppressOverlays = isDrawerOpen || docAiOpen
        const [selectedText, setSelectedText] = React.useState('')
        const [hasSelection, setHasSelection] = React.useState(false)
        const [isFullWidth, setIsFullWidth] = React.useState(false)
        const toggleFullWidth = React.useCallback(() => setIsFullWidth((w) => !w), [])
        // The saved text stands in until a collaborative editor's first sync.
        const snapshot = !!provider && !providerSynced && typeof value === 'string' && value.trim() !== ''
        const undoDataRef = React.useRef<{ originalText: string; from: number; replacedLength: number } | null>(null)

        // Track selection state
        React.useEffect(() => {
            if (!editor) return

            const handleSelectionUpdate = () => {
                const { from, to } = editor.state.selection
                setHasSelection(from !== to)
            }

            editor.on('selectionUpdate', handleSelectionUpdate)
            return () => { editor.off('selectionUpdate', handleSelectionUpdate) }
        }, [editor])

        const handleInsert = React.useCallback((text: string) => {
            if (!editor) return
            const { to } = editor.state.selection
            editor.chain().focus().insertContentAt(to, text).run()
        }, [editor])

        const handleReplace = React.useCallback((text: string, originalText?: string) => {
            if (!editor) return
            const { from, to } = editor.state.selection
            if (from !== to) {
                const storedOriginal = originalText ?? editor.state.doc.textBetween(from, to, ' ')
                editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, text).run()
                undoDataRef.current = {
                    originalText: storedOriginal,
                    from,
                    replacedLength: text.length,
                }
            } else {
                editor.chain().focus().insertContent(text).run()
                undoDataRef.current = null
            }
        }, [editor])

        const handleUndo = React.useCallback(() => {
            if (!editor) return

            const undoData = undoDataRef.current
            if (undoData) {
                try {
                    const to = undoData.from + undoData.replacedLength
                    editor.chain()
                        .focus()
                        .deleteRange({ from: undoData.from, to })
                        .insertContentAt(undoData.from, undoData.originalText)
                        .run()
                } catch {
                    editor.commands.undo()
                }
                undoDataRef.current = null
            } else {
                editor.commands.undo()
            }
        }, [editor])

        const handleAIClick = React.useCallback(() => {
            if (!editor) return

            const { from, to } = editor.state.selection
            const text = from !== to
                ? editor.state.doc.textBetween(from, to, ' ')
                : ''

            const contextSize = 500
            const contextBefore = editor.state.doc.textBetween(Math.max(0, from - contextSize), from, ' ')
            const contextAfter = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + contextSize), ' ')
            const surroundingContext = `[BEFORE]: ${contextBefore}\n[SELECTED]: ${text}\n[AFTER]: ${contextAfter}`

            setSelectedText(text)

            if (isDesktop) {
                dispatch(openRightPanel({
                    docAiOpen: true,
                    docAiData: {
                        selectedText: text,
                        docId: docId || '',
                        surroundingContext
                    }
                }))
            } else {
                setIsDrawerOpen(true)
            }
        }, [editor, isDesktop, dispatch, docId])

        // Listen for AI actions from sidebar/drawer
        React.useEffect(() => {
            const onInsert = (e: any) => handleInsert(e.detail.text)
            const onReplace = (e: any) => handleReplace(e.detail.text, e.detail.originalText)
            const onUndo = () => handleUndo()

            window.addEventListener('doc-ai-insert', onInsert)
            window.addEventListener('doc-ai-replace', onReplace)
            window.addEventListener('doc-ai-undo', onUndo)

            return () => {
                window.removeEventListener('doc-ai-insert', onInsert)
                window.removeEventListener('doc-ai-replace', onReplace)
                window.removeEventListener('doc-ai-undo', onUndo)
            }
        }, [handleInsert, handleReplace, handleUndo])

        // Listen for AI slash commands — open panel with specific action
        React.useEffect(() => {
            const onSlashAI = (e: any) => {
                if (!editor) return
                const action = e.detail?.action as string
                if (!action) return

                const { from, to } = editor.state.selection
                const hasSelection = from !== to
                const text = hasSelection
                    ? editor.state.doc.textBetween(from, to, ' ')
                    : editor.state.doc.textBetween(
                        Math.max(0, from - 200),
                        Math.min(editor.state.doc.content.size, to + 200),
                        ' '
                      )

                const contextSize = 500
                const contextBefore = editor.state.doc.textBetween(Math.max(0, from - contextSize), from, ' ')
                const contextAfter = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + contextSize), ' ')
                const surroundingContext = `[BEFORE]: ${contextBefore}\n[SELECTED]: ${text}\n[AFTER]: ${contextAfter}`

                setSelectedText(text)

                if (isDesktop) {
                    dispatch(openRightPanel({
                        docAiOpen: true,
                        docAiData: {
                            selectedText: text,
                            docId: docId || '',
                            surroundingContext,
                            initialAction: action,
                        }
                    }))
                } else {
                    setIsDrawerOpen(true)
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('doc-ai-initial-action', { detail: { action } }))
                    }, 100)
                }
            }

            window.addEventListener('doc-ai-slash', onSlashAI)
            return () => {
                window.removeEventListener('doc-ai-slash', onSlashAI)
            }
        }, [editor, isDesktop, dispatch, docId])

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

        const [collabStatus, setCollabStatus] = React.useState<'connecting' | 'connected' | 'disconnected' | 'synced' | 'offline'>('connecting')

        React.useEffect(() => {
            if (!provider) return
            const updateStatus = ({ status }: { status: any }) => {
                if (status === 'connected' || status === 'synced') setCollabStatus(status)
                else if (status === 'disconnected') setCollabStatus('disconnected')
                else if (status === 'offline') setCollabStatus('offline')
                else setCollabStatus('connecting')
            }
            provider.on('status', updateStatus)
            return () => { provider.off('status', updateStatus) }
        }, [provider])

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
                {/* Toolbar: for someone who can edit, and not in focus mode. A
                    reader was shown every formatting control, none of which
                    could do anything. */}
                {!focusMode && canEdit && (
                    <div className="shrink-0 z-10 bg-background border-b border-border w-full overflow-x-auto">
                        <div className="px-4 md:px-8 py-2">
                            <Toolbar editor={editor} onAIClick={handleAIClick} hasSelection={hasSelection} />
                        </div>
                    </div>
                )}

                {/* Content area — scrollable body */}
                <div 
                    // doc-scroll: the size container that wide blocks measure
                    // their breakout against (minimal-tiptap/styles/index.css).
                    className="doc-scroll w-full relative flex-1 min-h-0 overflow-y-auto overflow-x-clip cursor-text"
                >
                    <div 
                        className={cn("w-full min-h-full flex flex-col", !isFullWidth && "doc-measure mx-auto")}
                    >
                        {title !== undefined && (
                            <>
                                <textarea
                                    ref={titleRef}
                                    value={title}
                                    onChange={(e) => onTitleChange?.(e.target.value)}
                                    onBlur={onTitleBlur}
                                    onKeyDown={handleTitleKeyDown}
                                    disabled={!editableTitle}
                                    placeholder="Untitled"
                                    rows={1}
                                    className={cn(
                                        "w-full resize-none overflow-hidden bg-transparent font-display font-semibold text-foreground placeholder:text-faint-foreground focus:outline-none focus:ring-0 border-none leading-tight tracking-[-0.02em] text-balance cursor-text",
                                        "pt-10 pb-2",
                                        isFullWidth ? "px-4 md:px-12" : "px-4 md:px-8",
                                        "text-[1.75rem] md:text-[2rem]"
                                    )}
                                />
                            </>
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

                <DocFooter
                    editor={editor}
                    isFullWidth={isFullWidth}
                    onToggleWidth={toggleFullWidth}
                    lastEditedRelative={lastEditedRelative}
                    saveStatus={saveStatus}
                    lastSavedAt={lastSavedAt}
                    provider={collaboration?.enabled ? provider : undefined}
                    collabStatus={collabStatus}
                />
                <LinkBubbleMenu editor={editor} hide={suppressOverlays} />
                <SelectionAiBubbleMenu editor={editor} onAIClick={handleAIClick} hide={suppressOverlays} />

                {/* Mobile AI Drawer */}
                <Drawer.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                    <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[var(--z-modal-backdrop)]" />
                        <Drawer.Content className="bg-background flex flex-col rounded-t-2xl h-[85vh] mt-24 fixed bottom-0 left-0 right-0 z-[var(--z-modal)] outline-none border-t border-border">
                            <Drawer.Title className="sr-only">OneCamp AI</Drawer.Title>
                            <Drawer.Description className="sr-only">AI powered document assistant for writing and transforming text.</Drawer.Description>
                            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted my-4" />
                            <div className="flex-1 overflow-y-auto">
                                <DocAiAssistantPanel 
                                    selectedText={selectedText} 
                                    docId={docId || ''} 
                                    onClose={() => setIsDrawerOpen(false)}
                                />
                            </div>
                        </Drawer.Content>
                    </Drawer.Portal>
                </Drawer.Root>

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
