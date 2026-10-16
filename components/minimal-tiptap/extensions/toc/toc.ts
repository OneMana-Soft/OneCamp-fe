"use client"

import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { docHeadings, goToHeading, onDocHeadings, type DocHeading } from './headings'

/**
 * A table of contents (B2, editor.md P1-11; Notion's /toc): the doc's
 * headings as links, kept current as the doc changes (headings.ts, a moment
 * after the typing stops). The doc stores only that it is here: what it lists
 * is worked out where it is shown (I5: attributes hold sources, never
 * payloads).
 */
function tocView(editor: Editor) {
  const dom = document.createElement('nav')
  dom.className = 'doc-toc block-node'
  dom.setAttribute('data-type', 'toc')
  dom.setAttribute('aria-label', 'Table of contents')
  dom.contentEditable = 'false'
  const draw = () => {
    const headings = docHeadings(editor)
    dom.replaceChildren(
      ...(headings.length
        ? headings.map((h: DocHeading) => {
            const a = document.createElement('a')
            a.className = 'doc-toc-item'
            a.setAttribute('data-level', String(h.level))
            a.href = h.id ? `#${h.id}` : '#'
            a.textContent = h.text || 'Untitled heading'
            a.addEventListener('click', (e) => {
              e.preventDefault()
              goToHeading(editor, h)
            })
            return a
          })
        : [Object.assign(document.createElement('p'), { className: 'doc-toc-empty', textContent: 'The headings you add show here.' })]),
    )
  }
  draw()
  const stop = onDocHeadings(editor, draw)
  return {
    dom,
    // Its links are its own: clicks and keys on them are not the editor's.
    stopEvent: (e: Event) => (e.target as HTMLElement | null)?.closest?.('a') != null,
    ignoreMutation: () => true,
    destroy: stop,
  }
}

export const Toc = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }, { tag: 'nav[data-type="toc"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'toc' }, HTMLAttributes)]
  },

  addNodeView() {
    return ({ editor }) => tocView(editor)
  },
})
