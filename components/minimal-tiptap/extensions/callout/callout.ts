"use client"

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from './components/callout-view'

export interface CalloutOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: { emoji?: string; color?: string }) => ReturnType
      toggleCallout: (attributes?: { emoji?: string; color?: string }) => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',

  group: 'block',

  content: 'block+',

  defining: true,

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

  addCommands() {
    return {
      setCallout:
        (attributes = {}) =>
        ({ commands }) => {
          return commands.setNode(this.name, attributes)
        },
      toggleCallout:
        (attributes = {}) =>
        ({ commands }) => {
          return commands.toggleNode(this.name, 'paragraph', attributes)
        },
      unsetCallout:
        () =>
        ({ commands }) => {
          return commands.lift(this.name)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCallout(),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView, {
      className: 'block-node',
    })
  },
})

export default Callout
