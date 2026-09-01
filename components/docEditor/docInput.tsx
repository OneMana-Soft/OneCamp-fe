"use client"

import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/helpers/cn'
import { statusColors } from "@/lib/colors"
import { useClientConfig } from '@/hooks/useClientConfig'
import { exceedsUploadLimit, uploadLimitMessage } from '@/lib/utils/uploadLimit'
import { SectionOne } from '@/components/minimal-tiptap/components/section/one'
import { SectionTwo } from '@/components/minimal-tiptap/components/section/two'
import { SectionThree } from '@/components/minimal-tiptap/components/section/three'
import { SectionFour } from '@/components/minimal-tiptap/components/section/four'
import { SectionFive } from '@/components/minimal-tiptap/components/section/five'
import { LinkBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu'
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
import { Image as ImageIcon, Users, Loader2, Check } from "@/lib/icons";
import { Cloud, CloudOff } from "lucide-react";
import { GetEndpointUrl } from "@/services/endPoints"
import axiosInstance from "@/lib/axiosInstance"
import { UploadFileInterfaceRes } from "@/types/file"
import { useToast } from "@/hooks/use-toast"
import { useUploadFile } from '@/hooks/useUploadFile'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type { SaveStatus } from '@/hooks/useDocAutoSave'

export interface MinimalTiptapProps extends Omit<UseMinimalTiptapEditorProps, 'onUpdate'> {
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

const SECTION_2_ACTIONS: ("italic" | "bold" | "underline" | "strikethrough" | "code" | "clearFormatting")[] = ['italic', 'bold', 'underline', 'code', 'strikethrough', 'clearFormatting'];
const SECTION_4_ACTIONS: ("orderedList" | "bulletList")[] = ['bulletList', 'orderedList'];
const SECTION_5_ACTIONS: ("codeBlock" | "blockquote" | "horizontalRule")[] = ['blockquote', 'codeBlock', 'horizontalRule'];

const Toolbar = ({ editor }: { editor: Editor }) => (
    <div className="flex w-max items-center gap-px">
            <SectionOne editor={editor} activeLevels={[1, 2, 3]} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionTwo
                editor={editor}
                activeActions={SECTION_2_ACTIONS}
                mainActionCount={5}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionThree editor={editor} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFour
                editor={editor}
                activeActions={SECTION_4_ACTIONS}
                mainActionCount={2}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFive
                editor={editor}
                activeActions={SECTION_5_ACTIONS}
                mainActionCount={3}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <button
                onClick={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleImage().run();
                }}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    "bg-background border border-border hover:border-primary/40 hover:bg-accent",
                    "text-muted-foreground hover:text-foreground"
                )}
                title="Insert image"
                type="button"
            >
                <ImageIcon className="size-4" />
                <span>Image</span>
            </button>
        </div>
)

const SaveStatusIndicator = ({ status, lastSavedAt }: { status?: SaveStatus; lastSavedAt?: Date | null }) => {
    if (!status || status === 'idle') return null

    const formatTime = (d: Date) =>
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    switch (status) {
        case 'saving':
            return (
                <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    <span className="text-3xs font-medium">Saving...</span>
                </span>
            )
        case 'saved':
            return (
                <span className="flex items-center gap-1 text-success">
                    <Check className="size-3" />
                    <span className="text-3xs font-medium">
                        {lastSavedAt ? `Saved at ${formatTime(lastSavedAt)}` : 'Saved'}
                    </span>
                </span>
            )
        case 'error':
            return (
                <span className="flex items-center gap-1 text-destructive">
                    <CloudOff className="size-3" />
                    <span className="text-3xs font-medium">Save failed</span>
                </span>
            )
        case 'offline':
            return (
                <span className="flex items-center gap-1 text-primary-foreground0">
                    <CloudOff className="size-3" />
                    <span className="text-3xs font-medium">Offline</span>
                </span>
            )
        default:
            return null
    }
}

export const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
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
            ...props
        })

        const handleTitleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                onTitleBlur?.()
                editor?.commands.focus()
            }
        }, [editor, onTitleBlur])

        const suppressOverlays = false
        const [wordCount, setWordCount] = React.useState(0)
        const [charCount, setCharCount] = React.useState(0)
        const [readingTime, setReadingTime] = React.useState(0)
        const [isFullWidth, setIsFullWidth] = React.useState(false)
        const undoDataRef = React.useRef<{ originalText: string; from: number; replacedLength: number } | null>(null)

        // Word count + reading time tracking
        React.useEffect(() => {
            if (!editor) return
            const updateCounts = () => {
                const text = editor.getText() || ''
                const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
                setCharCount(text.length)
                setWordCount(words)
                // Average reading speed: 200 words per minute
                setReadingTime(Math.max(1, Math.ceil(words / 200)))
            }
            editor.on('update', updateCounts)
            editor.on('create', updateCounts)
            return () => {
                editor.off('update', updateCounts)
                editor.off('create', updateCounts)
            }
        }, [editor])

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

        return (
            <MeasuredContainer
                as="div"
                name="editor"
                ref={ref}
                className={cn(
                    'flex w-full flex-col shadow-sm',
                    suppressOverlays && "suppress-tippy",
                    className
                )}
            >
                {/* Toolbar — fixed at top, hidden in focus mode */}
                {!focusMode && (
                    <div className="shrink-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border w-full overflow-x-auto">
                        <div className="px-4 md:px-8 py-2">
                            <Toolbar editor={editor} />
                        </div>
                    </div>
                )}

                {/* Content area — scrollable body */}
                <div 
                    className="w-full relative flex-1 min-h-0 overflow-y-auto overflow-x-clip cursor-text"
                >
                    <div 
                        className={cn("w-full min-h-full flex flex-col", !isFullWidth && "max-w-3xl mx-auto")}
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
                                        "w-full resize-none overflow-hidden bg-transparent font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 border-none leading-tight tracking-tight cursor-text",
                                        "pt-6 pb-4",
                                        isFullWidth ? "px-4 md:px-12" : "px-4 md:px-8",
                                        "text-[1.75rem] md:text-[2.5rem]"
                                    )}
                                />
                                {/* Subtle divider after title */}
                                <div className={cn("w-full", isFullWidth ? "px-4 md:px-12" : "px-4 md:px-8")}>
                                    <div className="w-full h-px bg-border/30" />
                                </div>
                            </>
                        )}
                        <EditorContent
                            editor={editor}
                            className={cn(
                                'minimal-tiptap-editor doc-editor flex-1 cursor-text',
                                isFullWidth && 'full-width',
                                editorContentClassName
                            )}
                        />
                    </div>
                </div>

                {/* Footer — fixed at bottom */}
                <div className="shrink-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border w-full">
                    <div className="max-w-3xl mx-auto px-3 py-1.5 flex items-center justify-between text-2xs text-muted-foreground select-none">
                        <div className="hidden sm:flex items-center gap-3">
                            <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
                            <span>{charCount} character{charCount !== 1 ? 's' : ''}</span>
                            {readingTime > 0 && (
                                <span>{readingTime} min read</span>
                            )}
                        </div>
                        <div className="hidden sm:flex items-center gap-3">
                            {editor.isActive('heading') && (
                                <span className="capitalize">{editor.getAttributes('heading').level ? `Heading ${editor.getAttributes('heading').level}` : 'Heading'}</span>
                            )}
                            {editor.isActive('paragraph') && !editor.isActive('heading') && (
                                <span>Paragraph</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 ml-auto sm:ml-0">
                            {/* Last edited time */}
                            {lastEditedRelative && (
                                <span className="hidden sm:inline text-3xs opacity-60">Edited {lastEditedRelative}</span>
                            )}

                            {/* Notion-like save status */}
                            <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />

                            {collaboration?.enabled && (
                                <div className="flex items-center gap-3 mr-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className={cn(
                                            "size-1.5 rounded-full",
                                            collabStatus === 'connected' || collabStatus === 'synced'
                                                ? `${statusColors.success.solid} shadow-[0_0_8px_rgba(16,185,129,0.4)]`
                                                : collabStatus === 'connecting'
                                                ? "bg-warning animate-pulse"
                                                : collabStatus === 'offline'
                                                ? "bg-warning"
                                                : "bg-red-500"
                                        )} />
                                        <span className="capitalize opacity-80 text-3xs font-medium tracking-tight">
                                            {collabStatus === 'synced' ? 'connected' : collabStatus}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-60">
                                        <Users className="size-3" />
                                        <span className="text-3xs font-medium">{collaboration?.activeUsers ?? 0}</span>
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={() => setIsFullWidth(!isFullWidth)}
                                className="hidden sm:block hover:text-foreground transition-colors"
                                title={isFullWidth ? 'Narrow width' : 'Full width'}
                                type="button"
                            >
                                {isFullWidth ? '⊡' : '⊞'}
                            </button>
                        </div>
                    </div>
                </div>
                <LinkBubbleMenu editor={editor} hide={suppressOverlays} />

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
