"use client"

import { mergeAttributes } from '@tiptap/react'
import TiptapLink from '@tiptap/extension-link'
import type { EditorView } from '@tiptap/pm/view'
import type { MarkType, Node as PMNode } from '@tiptap/pm/model'
import { getMarkRange } from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'
import { isSafeHref } from '@/lib/utils/safeHref'
import { contentClasses } from '@/lib/contentClasses'

/** The doc's link look (typography.css a.link): the link mark's class, and that of a link drawn in a link's place. */
export const LINK_CLASS = 'link'

/** Whether a link leaves the app: an http(s) address on another origin. Pure for a given origin. */
export function externalHref(href: string | null | undefined, origin = typeof window !== 'undefined' ? window.location.origin : ''): boolean {
  if (!href || !/^https?:\/\//i.test(href)) return false
  try {
    return new URL(href).origin !== origin
  } catch {
    return false
  }
}

/** A click that opens a link in a new tab: with ⌘ on a Mac, Ctrl elsewhere. Pure. */
function opensWithModifier(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return event.metaKey || event.ctrlKey
}

/** The safe href of the link at a position in the doc, if there is one. Pure. */
export function linkHrefAt(doc: PMNode, pos: number, type: MarkType): string | null {
  const marks = [...(doc.nodeAt(pos)?.marks ?? []), ...doc.resolve(pos).marks()]
  const href = marks.find((m) => m.type === type)?.attrs.href as string | undefined
  return href && isSafeHref(href) ? href : null
}

export const Link = TiptapLink.extend({
  /*
   * Determines whether typing next to a link automatically becomes part of the link.
   * In this case, we dont want any characters to be included as part of the link.
   */
  inclusive: false,

  /*
   * A link's class is read from stored HTML, and the app has a utility class
   * for nearly anything: class="fixed inset-0 z-50" made a link a full-page
   * overlay. It keeps only the classes the editor writes (lib/contentClasses),
   * here and again in renderHTML.
   */
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: this.options.HTMLAttributes.class,
        parseHTML: (element: HTMLElement) => contentClasses(element.getAttribute('class')) || null,
      },
    }
  },

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
   * no href, so it's plain text the next time it's read.) So are classes the
   * editor doesn't write.
   */
  renderHTML({ HTMLAttributes }) {
    const href = isSafeHref(HTMLAttributes.href) ? HTMLAttributes.href : null
    const className = contentClasses(HTMLAttributes.class) || null
    // A link to another site opens in a new tab, without telling it who sent
    // the reader: a reader clicking one in a doc used to lose the app's tab.
    // The app's own links stay in the tab (and route in the app).
    const away = externalHref(href)
    return ['a', mergeAttributes(this.options.HTMLAttributes, {
      ...HTMLAttributes,
      href,
      class: className,
      ...(away ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    }), 0]
  },

  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
      HTMLAttributes: {
        class: LINK_CLASS
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
          handleClick(view, pos, event) {
            // ⌘- or Ctrl-click opens it in a new tab, as Notion's does
            // (small-details L8). A plain click in text being edited puts
            // the caret in it, where the link bar shows (N48): it used to
            // select the whole link, so the bar waited for the selection
            // bar, and the next key typed over the link's words. A reader's
            // link is an ordinary link already.
            if (!opensWithModifier(event) || !view.editable) return false
            const { schema, doc } = view.state
            const range = getMarkRange(doc.resolve(pos), schema.marks.link)
            if (!range || pos < range.from || pos > range.to) return false
            const href = linkHrefAt(doc, pos, schema.marks.link)
            if (href) window.open(href, '_blank', 'noopener,noreferrer')
            return true
          },
          handleDOMEvents: {
            // The browser's own follow of that click, in the text being
            // edited: the click above has opened it once already.
            click: (view, event) => {
              if (view.editable && opensWithModifier(event) && (event.target as Element | null)?.closest?.('a[href]')) event.preventDefault()
              return false
            },
          },
        }
      })
    ]
  }
})

