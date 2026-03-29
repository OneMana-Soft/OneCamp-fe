"use client"

import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/helpers/cn'
import { SectionOne } from '@/components/minimal-tiptap/components/section/one'
import { SectionTwo } from '@/components/minimal-tiptap/components/section/two'
import { SectionThree } from '@/components/minimal-tiptap/components/section/three'
import { SectionFour } from '@/components/minimal-tiptap/components/section/four'
import { SectionFive } from '@/components/minimal-tiptap/components/section/five'
import { LinkBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu'
import { SelectionAiBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/selection-ai-bubble-menu'
import { useMinimalTiptapEditor } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { MeasuredContainer } from '@/components/minimal-tiptap/components/measured-container'
import { useDispatch } from 'react-redux'
import { openRightPanel } from '@/store/slice/desktopRightPanelSlice'
import { useMedia } from '@/context/MediaQueryContext'
import { Drawer } from 'vaul'
import { DocAiAssistantPanel } from '@/components/ai/DocAiAssistantPanel'

export interface MinimalTiptapProps extends Omit<UseMinimalTiptapEditorProps, 'onUpdate'> {
    value?: Content
    onChange?: (value: Content) => void
    className?: string
    editorContentClassName?: string
    docId?: string
}

const Toolbar = ({ editor, onAIClick, hasSelection }: { editor: Editor; onAIClick: () => void; hasSelection: boolean }) => (
    <div className="shrink-0 overflow-x-auto border-b border-border p-2">
        <div className="flex w-max items-center gap-px">
            <SectionOne editor={editor} activeLevels={[1, 2, 3]} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionTwo
                editor={editor}
                activeActions={['italic', 'bold', 'underline', 'code', 'strikethrough', 'clearFormatting']}
                mainActionCount={5}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionThree editor={editor} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFour
                editor={editor}
                activeActions={['bulletList', 'orderedList']}
                mainActionCount={2}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFive
                editor={editor}
                activeActions={['blockquote', 'codeBlock', 'horizontalRule']}
                mainActionCount={3}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <button
                onClick={(e) => {
                    e.preventDefault();
                    onAIClick();
                }}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all focus:outline-none",
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
    </div>
)

export const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    ({ value, onChange, className, editorContentClassName, docId, ...props }, ref) => {
        const editor = useMinimalTiptapEditor({
            value,
            onUpdate: onChange,
            ...props
        })

        const dispatch = useDispatch()
        const { isDesktop, isMobile } = useMedia()
        const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)
        const [selectedText, setSelectedText] = React.useState('')
        const [hasSelection, setHasSelection] = React.useState(false)
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
                // Store undo data before replacing
                const storedOriginal = originalText ?? editor.state.doc.textBetween(from, to, ' ')
                editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, text).run()
                undoDataRef.current = {
                    originalText: storedOriginal,
                    from,
                    replacedLength: text.length,
                }
            } else {
                // No selection: insert at cursor
                editor.chain().focus().insertContent(text).run()
                undoDataRef.current = null
            }
        }, [editor])

        const handleUndo = React.useCallback(() => {
            if (!editor) return

            const undoData = undoDataRef.current
            if (undoData) {
                // Direct restoration: swap the AI text back to original
                try {
                    const to = undoData.from + undoData.replacedLength
                    editor.chain()
                        .focus()
                        .deleteRange({ from: undoData.from, to })
                        .insertContentAt(undoData.from, undoData.originalText)
                        .run()
                } catch {
                    // Positions may be stale if doc was edited — fall back to TipTap undo
                    editor.commands.undo()
                }
                undoDataRef.current = null
            } else {
                // No stored undo data — use TipTap's built-in undo
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

        if (!editor) {
            return null
        }

        return (
            <MeasuredContainer
                as="div"
                name="editor"
                ref={ref}
                className={cn(
                    'flex h-auto min-h-72 w-full flex-col  shadow-sm ',
                    className
                )}
            >
                <Toolbar editor={editor} onAIClick={handleAIClick} hasSelection={hasSelection} />
                <EditorContent editor={editor} className={cn('minimal-tiptap-editor', editorContentClassName)} />
                <LinkBubbleMenu editor={editor} />
                <SelectionAiBubbleMenu editor={editor} onAIClick={handleAIClick} />

                {/* Mobile AI Drawer */}
                <Drawer.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                    <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000]" />
                        <Drawer.Content className="bg-background flex flex-col rounded-t-[20px] h-[85vh] mt-24 fixed bottom-0 left-0 right-0 z-[1001] outline-none border-t border-border">
                            <Drawer.Title className="sr-only">AI Assistant</Drawer.Title>
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
            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapThree'

export default MinimalTiptapDocInput