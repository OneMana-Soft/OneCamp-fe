"use client"

import { mergeAttributes } from '@tiptap/react'
import TiptapLink from '@tiptap/extension-link'
import type { EditorView } from '@tiptap/pm/view'
import { getMarkRange } from '@tiptap/react'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { isSafeHref } from '@/lib/utils/safeHref'

export const Link = TiptapLink.extend({
  /*
   * Determines whether typing next to a link automatically becomes part of the link.
   * In this case, we dont want any characters to be included as part of the link.
   */
  inclusive: false,

  /*
   * Match all <a> elements that have an href attribute, except for:
   * - <a> elements with a data-type attribute set to button
   * - <a> elements whose href isn't a safe link (isSafeHref): their text is
   *   kept, as plain text. A check on the selector alone missed a scheme
   *   hidden behind a tab or a character reference ("java&#x09;script:").
   */
  parseHTML() {
    return [
      {
        tag: 'a[href]:not([data-type="button"])',
        getAttrs: dom => (isSafeHref((dom as HTMLElement).getAttribute('href')) ? null : false),
      },
    ]
  },

  /*
   * Checked again here, because a link can reach the document without being
   * parsed from HTML: from a collaborator's edit or from stored JSON. Read-only
   * messages and docs are shown by this editor, and a click follows the href,
   * so an unsafe one is left out: the link goes nowhere. (Saved again, it has
   * no href, so it's plain text the next time it's read.)
   */
  renderHTML({ HTMLAttributes }) {
    const href = isSafeHref(HTMLAttributes.href) ? HTMLAttributes.href : null
    return ['a', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, href }), 0]
  },

  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
      HTMLAttributes: {
        class: 'link'
      },
      // setLink, toggleLink, links made as you type and links in pasted text
      // all ask this, so they allow only what parsing and rendering allow.
      isAllowedUri: (url: string) => isSafeHref(url),
    }
  },

  addProseMirrorPlugins() {
    const { editor } = this

    return [
      ...(this.parent?.() || []),
      new Plugin({
        props: {
          handleKeyDown: (_: EditorView, event: KeyboardEvent) => {
            const { selection } = editor.state

            /*
             * Handles the 'Escape' key press when there's a selection within the link.
             * This will move the cursor to the end of the link.
             */
            if (event.key === 'Escape' && selection.empty !== true) {
              editor.commands.focus(selection.to, { scrollIntoView: false })
            }

            return false
          },
          handleClick(view, pos) {
            /*
             * Marks the entire link when the user clicks on it.
             */

            const { schema, doc, tr } = view.state
            const range = getMarkRange(doc.resolve(pos), schema.marks.link)

            if (!range) {
              return
            }

            const { from, to } = range
            const start = Math.min(from, to)
            const end = Math.max(from, to)

            if (pos < start || pos > end) {
              return
            }

            const $start = doc.resolve(start)
            const $end = doc.resolve(end)
            const transaction = tr.setSelection(new TextSelection($start, $end))

            view.dispatch(transaction)
          }
        }
      })
    ]
  }
})

