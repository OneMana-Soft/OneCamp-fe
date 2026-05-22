"use client"

import * as React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { ChevronRight, ChevronDown } from "@/lib/icons";

export const CollapsibleView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const { title, open } = node.attrs
  const [isOpen, setIsOpen] = React.useState(open)
  const [localTitle, setLocalTitle] = React.useState(title)

  React.useEffect(() => {
    setIsOpen(open)
  }, [open])

  React.useEffect(() => {
    setLocalTitle(title)
  }, [title])

  const handleToggle = () => {
    const newOpen = !isOpen
    setIsOpen(newOpen)
    updateAttributes({ open: newOpen })
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value || 'Toggle'
    setLocalTitle(newTitle)
    updateAttributes({ title: newTitle })
  }

  return (
    <NodeViewWrapper className="collapsible my-2" data-type="collapsible">
      <div className="flex items-start gap-1.5">
        {/* Toggle arrow */}
        <button
          onClick={handleToggle}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent transition-colors cursor-pointer select-none"
          contentEditable={false}
          type="button"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            disabled={!editor.isEditable}
            placeholder="Toggle title..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.chain().focus().createParagraphNear().run()
              }
            }}
            className="w-full bg-transparent font-medium text-foreground placeholder:text-muted-foreground outline-none focus:ring-0 focus:outline-none disabled:opacity-60 p-0 border-none"
          />

          {/* Collapsible content */}
          <div
            className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-[2000px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}
          >
            <NodeViewContent className="collapsible-content" />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default CollapsibleView
