"use client"

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from './components/callout-view'
import { unwrap } from '../collapsible/collapsible'
import { calloutIcon } from '@/lib/codec/docFormat'

interface CalloutOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: { emoji?: string; color?: string; icon?: string | null }) => ReturnType
      toggleCallout: (attributes?: { emoji?: string; color?: string; icon?: string | null }) => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',

  group: 'block',

  content: 'block+',

  defining: true,

  // Turn into never lifts a line out of it (N7); Backspace at its start and
  // Enter on its last empty line leave it (collapsible.ts's keys).
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: element => element.getAttribute('data-emoji') || '💡',
        renderHTML: attributes => {
          if (!attributes.emoji) return {}
          return { 'data-emoji': attributes.emoji }
        },
      },
      // The Lucide glyph chosen for it (a name from CALLOUT_ICONS); none: its tone's own.
      icon: {
        default: null,
        // Only a Lucide name, as the codec keeps it (lib/codec/docFormat.ts).
        parseHTML: element => calloutIcon(element.getAttribute('data-icon')) || null,
        renderHTML: attributes => (attributes.icon ? { 'data-icon': attributes.icon } : {}),
      },
      color: {
        default: 'blue',
        parseHTML: element => element.getAttribute('data-color') || 'blue',
        renderHTML: attributes => {
          if (!attributes.color) return {}
          return { 'data-color': attributes.color }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'callout' }, this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  // A callout holds blocks, so it wraps them (setNode only turns a text block
  // into another text block, and refused: every one of these did nothing).
  addCommands() {
    return {
      setCallout:
        (attributes = {}) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes)
        },
      toggleCallout:
        (attributes = {}) =>
        ({ commands, editor }) => {
          return editor.isActive(this.name) ? commands.unsetCallout() : commands.wrapIn(this.name, attributes)
        },
      // Isolating, so lift refuses: the callout gives way to its blocks.
      unsetCallout:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name !== this.name) continue
            if (dispatch) unwrap(tr, { node: $from.node(d), pos: $from.before(d) })
            return true
          }
          return false
        },
    }
  },

  // No shortcut of its own. Its ⌘⌥C never worked (the command it ran was
  // refused, and the key fell through to the code block's ⌘⌥C), and Notion
  // has none for a callout.

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView, {
      className: 'block-node',
    })
  },
})

