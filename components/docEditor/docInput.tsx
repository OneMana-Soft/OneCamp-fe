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
import { useMinimalTiptapEditor } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { MeasuredContainer } from '@/components/minimal-tiptap/components/measured-container'
import DocAiAssistant from '@/components/ai/DocAiAssistant'

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
                onClick={onAIClick}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                    "bg-gradient-to-r from-indigo-500/10 to-purple-500/10",
                    "border border-indigo-500/20 hover:border-indigo-500/40",
                    "text-indigo-400 hover:text-indigo-300",
                    "hover:from-indigo-500/20 hover:to-purple-500/20",
                    "hover:shadow-sm hover:shadow-indigo-500/10"
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

        const [showAI, setShowAI] = React.useState(false)
        const [selectedText, setSelectedText] = React.useState('')
        const [aiPosition, setAiPosition] = React.useState<{ top: number; left: number } | undefined>()
        const [hasSelection, setHasSelection] = React.useState(false)

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

        const handleAIClick = React.useCallback(() => {
            if (!editor) return

            const { from, to } = editor.state.selection
            const text = from !== to
                ? editor.state.doc.textBetween(from, to, ' ')
                : ''

            setSelectedText(text)

            // Position below the toolbar
            const editorEl = editor.view.dom.closest('.flex.h-auto')
            if (editorEl) {
                const rect = editorEl.getBoundingClientRect()
                setAiPosition({ top: rect.top + 50, left: rect.right - 340 })
            }

            setShowAI(true)
        }, [editor])

        const handleInsert = React.useCallback((text: string) => {
            if (!editor) return
            const { to } = editor.state.selection
            editor.chain().focus().insertContentAt(to, text).run()
        }, [editor])

        const handleReplace = React.useCallback((text: string) => {
            if (!editor) return
            const { from, to } = editor.state.selection
            if (from !== to) {
                editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, text).run()
            } else {
                // No selection: insert at cursor
                editor.chain().focus().insertContent(text).run()
            }
        }, [editor])

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

                {showAI && (
                    <DocAiAssistant
                        selectedText={selectedText}
                        docId={docId || ''}
                        onInsert={handleInsert}
                        onReplace={handleReplace}
                        position={aiPosition}
                        onClose={() => setShowAI(false)}
                    />
                )}
            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapThree'

export default MinimalTiptapDocInput