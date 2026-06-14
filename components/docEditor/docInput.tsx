"use client"

import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/helpers/cn'
import { statusColors } from "@/lib/colors"
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
import { Image as ImageIcon, Users, Loader2, Check } from "@/lib/icons";
import { Cloud, CloudOff } from "lucide-react";

import { PostFileUploadURL, GetEndpointUrl } from "@/services/endPoints"
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

const Toolbar = ({ editor, onAIClick, hasSelection }: { editor: Editor; onAIClick: () => void; hasSelection: boolean }) => (
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

            <Separator orientation="vertical" className="mx-2 h-7" />

            <button
                onClick={(e) => {
                    e.preventDefault();
                    onAIClick();
                }}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    "bg-primary/10 border border-primary/20 hover:border-primary/40",
                    "text-primary hover:text-primary/80",
                    "hover:bg-primary/20 hover:shadow-sm hover:shadow-primary/10"
                )}
                title={hasSelection ? "AI: Transform selected text" : "AI: Write with AI"}
            >
            <span className="text-sm">✨</span>
            <span>AI</span>
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
                    <span className="text-[10px] font-medium">Saving...</span>
                </span>
            )
        case 'saved':
            return (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check className="size-3" />
                    <span className="text-[10px] font-medium">
                        {lastSavedAt ? `Saved at ${formatTime(lastSavedAt)}` : 'Saved'}
                    </span>
                </span>
            )
        case 'error':
            return (
                <span className="flex items-center gap-1 text-destructive">
                    <CloudOff className="size-3" />
                    <span className="text-[10px] font-medium">Save failed</span>
                </span>
            )
        case 'offline':
            return (
                <span className="flex items-center gap-1 text-primary-foreground0">
                    <CloudOff className="size-3" />
                    <span className="text-[10px] font-medium">Offline</span>
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
        const titleRef = React.useRef<HTMLTextAreaElement>(null)

        const uploadFn = React.useCallback(async (file: File) => {
            if (!docId) {
                toast({
                    title: 'Error',
                    description: 'Document ID is required to upload images.',
                    variant: 'destructive'
                });
                throw new Error('docId required for image upload')
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
                const { fileToBase64 } = await import('@/components/minimal-tiptap/utils');
                const src = await fileToBase64(file);
                return { id: 'error', src };
            }
        }, [docId, toast, uploadFile]);

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

        const dispatch = useDispatch()
        const { isDesktop, isMobile } = useMedia()
        const docAiOpen = useSelector((state: any) => state.rightPanel.rightPanelState.data.docAiOpen)
        const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)
        const suppressOverlays = docAiOpen
        const [selectedText, setSelectedText] = React.useState('')
        const [hasSelection, setHasSelection] = React.useState(false)
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
                            <Toolbar editor={editor} onAIClick={handleAIClick} hasSelection={hasSelection} />
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
                    <div className="max-w-3xl mx-auto px-3 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground select-none">
                        <div className="flex items-center gap-3">
                            <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
                            <span>{charCount} character{charCount !== 1 ? 's' : ''}</span>
                            {readingTime > 0 && (
                                <span>{readingTime} min read</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {editor.isActive('heading') && (
                                <span className="capitalize">{editor.getAttributes('heading').level ? `Heading ${editor.getAttributes('heading').level}` : 'Heading'}</span>
                            )}
                            {editor.isActive('paragraph') && !editor.isActive('heading') && (
                                <span>Paragraph</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Last edited time */}
                            {lastEditedRelative && (
                                <span className="text-[10px] opacity-60">Edited {lastEditedRelative}</span>
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
                                                ? "bg-yellow-500 animate-pulse"
                                                : collabStatus === 'offline'
                                                ? "bg-amber-500"
                                                : "bg-red-500"
                                        )} />
                                        <span className="capitalize opacity-80 text-[10px] font-medium tracking-tight">
                                            {collabStatus === 'synced' ? 'connected' : collabStatus}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-60">
                                        <Users className="size-3" />
                                        <span className="text-[10px] font-medium">{collaboration?.activeUsers ?? 0}</span>
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={() => setIsFullWidth(!isFullWidth)}
                                className="hover:text-foreground transition-colors"
                                title={isFullWidth ? 'Narrow width' : 'Full width'}
                                type="button"
                            >
                                {isFullWidth ? '⊡' : '⊞'}
                            </button>
                        </div>
                    </div>
                </div>
                <LinkBubbleMenu editor={editor} hide={suppressOverlays} />
                <SelectionAiBubbleMenu editor={editor} onAIClick={handleAIClick} hide={suppressOverlays} />


            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapDocInput'

export default MinimalTiptapDocInput
