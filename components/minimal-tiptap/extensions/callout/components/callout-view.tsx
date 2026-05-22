"use client"

import * as React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

const CALLOUT_COLORS: Record<string, { bg: string; border: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', border: 'border-yellow-200 dark:border-yellow-800' },
  red: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800' },
  gray: { bg: 'bg-gray-50 dark:bg-gray-900/50', border: 'border-gray-200 dark:border-gray-700' },
}

const CALLOUT_EMOJIS = ['💡', '⚠️', '🔴', '🟢', '🔵', '🟣', '⭐', '📌', '❓', '💬', '🔥', '✅']

export const CalloutView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const { emoji, color } = node.attrs
  const colors = CALLOUT_COLORS[color] || CALLOUT_COLORS.blue
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  const pickerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cycleColor = () => {
    const colorKeys = Object.keys(CALLOUT_COLORS)
    const currentIndex = colorKeys.indexOf(color)
    const nextColor = colorKeys[(currentIndex + 1) % colorKeys.length]
    updateAttributes({ color: nextColor })
  }

  return (
    <NodeViewWrapper
      className={`callout my-3 rounded-lg border p-4 ${colors.bg} ${colors.border}`}
      data-type="callout"
    >
      <div className="flex gap-3">
        {/* Emoji picker */}
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-lg leading-none hover:scale-110 transition-transform cursor-pointer select-none"
            contentEditable={false}
            type="button"
          >
            {emoji}
          </button>
          {showEmojiPicker && (
            <div
              className="absolute top-full left-0 z-50 mt-1 grid grid-cols-4 gap-1 rounded-lg border bg-popover p-2 shadow-lg"
              contentEditable={false}
            >
              {CALLOUT_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => {
                    updateAttributes({ emoji: e })
                    setShowEmojiPicker(false)
                  }}
                  className="rounded p-1 text-lg hover:bg-accent transition-colors"
                  type="button"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <NodeViewContent className="callout-content" />
        </div>

        {/* Color cycle button (visible on hover/focus) */}
        <button
          onClick={cycleColor}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 self-start rounded p-1 text-xs text-muted-foreground hover:bg-accent transition-opacity"
          contentEditable={false}
          title="Change color"
          type="button"
        >
          <div className={`w-3 h-3 rounded-full border`} style={{ backgroundColor: 'currentColor' }} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}

export default CalloutView
