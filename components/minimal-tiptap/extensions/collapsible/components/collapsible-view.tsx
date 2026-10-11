"use client"

import * as React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { ChevronRight } from "@/lib/icons";

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
          className="mt-[3px] shrink-0 rounded-md p-0.5 text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand cursor-pointer select-none"
          contentEditable={false}
          type="button"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {/* One chevron that turns, never two that swap. */}
          <ChevronRight className={`size-4 transition-transform duration-200 ease-[var(--ease-out)] ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            disabled={!editor.isEditable}
            placeholder="Toggle title…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.chain().focus().createParagraphNear().run()
              }
            }}
            className="w-full bg-transparent font-[510] text-ink placeholder:text-ink-4 outline-none focus:ring-0 focus:outline-none disabled:opacity-100 p-0 border-none"
          />

          {/* Collapsible content */}
          {/* Opens by its grid row (content-collapse), not a max-height. */}
          <div className="content-collapse" data-collapsed={!isOpen}>
            <div>
              <NodeViewContent className="collapsible-content pt-1.5" />
            </div>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

