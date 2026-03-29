"use client"

import * as React from 'react'
import { BubbleMenu, Editor } from '@tiptap/react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils/helpers/cn'
import { Button } from '@/components/ui/button'

interface SelectionAiBubbleMenuProps {
  editor: Editor
  onAIClick: () => void
  hide?: boolean
}

export const SelectionAiBubbleMenu: React.FC<SelectionAiBubbleMenuProps> = ({ editor, onAIClick, hide }) => {
  const shouldShow = React.useCallback(
    ({ editor, from, to }: { editor: Editor; from: number; to: number }) => {
      // Logic-level suppression
      if (hide) {
        return false
      }

      // Only show if there's a multi-character selection
      // and it's not a link (let LinkBubbleMenu handle that)
      if (from === to || (to - from < 2)) {
        return false
      }
      
      const isLink = editor.isActive('link')
      if (isLink || !editor.isEditable) {
        return false
      }

      return true
    },
    [hide]
  )

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShow}
      tippyOptions={{
        duration: 100,
        placement: 'top',
        // Offset to stay slightly above the selection
        offset: [0, 10],
        zIndex: 50,
      }}
    >
      <div className="flex items-center gap-1 overflow-hidden rounded-lg border bg-background p-1 shadow-md animate-in fade-in zoom-in duration-200">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
             e.preventDefault()
             onAIClick()
          }}
          className={cn(
            "h-8 gap-1.5 px-3 text-xs font-medium transition-colors",
            "hover:bg-indigo-500/10 hover:text-indigo-400"
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Ask AI</span>
        </Button>
      </div>
    </BubbleMenu>
  )
}
