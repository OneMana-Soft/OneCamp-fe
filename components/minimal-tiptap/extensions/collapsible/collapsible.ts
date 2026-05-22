"use client"

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CollapsibleView } from './components/collapsible-view'

export interface CollapsibleOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      setCollapsible: (attributes?: { title?: string; open?: boolean }) => ReturnType
      toggleCollapsible: () => ReturnType
      unsetCollapsible: () => ReturnType
    }
  }
}

export const Collapsible = Node.create<CollapsibleOptions>({
  name: 'collapsible',

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
      title: {
        default: 'Toggle',
        parseHTML: element => element.getAttribute('data-title') || 'Toggle',
        renderHTML: attributes => {
          if (!attributes.title) return {}
          return { 'data-title': attributes.title }
        },
      },
      open: {
        default: true,
        parseHTML: element => element.getAttribute('data-open') !== 'false',
        renderHTML: attributes => {
          return { 'data-open': String(attributes.open) }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="collapsible"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'collapsible' }, this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setCollapsible:
        (attributes = {}) =>
        ({ commands }: { commands: any }) => {
          return commands.setNode(this.name, attributes)
        },
      toggleCollapsible:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.toggleNode(this.name, 'paragraph')
        },
      unsetCollapsible:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.lift(this.name)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-t': () => this.editor.commands.toggleCollapsible(),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleView, {
      className: 'block-node',
    })
  },
})

export default Collapsible
