"use client"

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { getMarkRange, type Editor } from '@tiptap/core'
import { isSafeHref } from '@/lib/utils/safeHref'
import { docKeymapOf } from '../../extensions/doc-keymap/storage'
import { LinkEditBlock } from './link-edit-block'
import { LinkPopoverBlock } from './link-popover-block'

type Target = { from: number; to: number; href: string }

/** How long a pointer rests on a link before its bar shows (small-details L6), and the grace to reach the bar. */
const HOVER_MS = 300
const LEAVE_MS = 250

/** The link around a position, if there is one. */
function linkAt(editor: Editor, pos: number): Target | null {
  const type = editor.state.schema.marks.link
  if (!type) return null
  const $pos = editor.state.doc.resolve(Math.min(Math.max(pos, 0), editor.state.doc.content.size))
  const range = getMarkRange($pos, type)
  if (!range) return null
  const href = editor.state.doc.nodeAt(range.from)?.marks.find((m) => m.type === type)?.attrs.href
  return typeof href === 'string' && href ? { from: range.from, to: range.to, href } : null
}

/** The paste menu (smart-paste) is open over a link just pasted: it speaks for that link, so the bar waits. */
const pasteMenuOpen = (editor: Editor) =>
  !!editor.state.plugins.find((p) => String((p as unknown as { key: string }).key).startsWith('smartPaste$'))?.getState(editor.state)

/** Under the link's line, or over it near the bottom of what's visible; nowhere when it can't be measured. */
function placeOf(editor: Editor, t: Target): React.CSSProperties | null {
  let a: { left: number; top: number }, b: { bottom: number }
  try {
    a = editor.view.coordsAtPos(t.from)
    b = editor.view.coordsAtPos(t.to)
  } catch {
    return null
  }
  const left = Math.max(8, Math.min(a.left, window.innerWidth - 340))
  return b.bottom + 180 > window.innerHeight ? { position: 'fixed', left, bottom: window.innerHeight - a.top + 6 } : { position: 'fixed', left, top: b.bottom + 6 }
}

/**
 * The link bar, loaded the first time a link is met (link-bubble-menu.tsx):
 * - with the caret in a link, in text being edited (N48), and on ⌘K;
 * - after a pointer rests 300 ms on any link, for readers too (L6), who get
 *   Open and Copy only.
 * It opens the link (the app's own in the app), edits it in a form with Save
 * and Cancel, copies it, or removes it. Escape closes it and gives the text
 * the focus back. A selection is the selection bar's, so the bar waits.
 */
export default function LinkBar({ editor, hide, openEdit }: { editor: Editor; hide?: boolean; openEdit: { current: boolean } }) {
  const router = useRouter()
  const [caret, setCaret] = React.useState<Target | null>(null)
  const [hover, setHover] = React.useState<Target | null>(null)
  const [editing, setEditing] = React.useState<Target | null>(null)
  const [dismissed, setDismissed] = React.useState<string | null>(null)
  const [pasting, setPasting] = React.useState(false)
  const [, setTick] = React.useState(0)
  const timers = React.useRef<{ over?: number; leave?: number }>({})
  const inBar = React.useRef(false)

  const caretLink = React.useCallback((): Target | null => {
    const { selection } = editor.state
    return editor.isEditable && selection.empty ? linkAt(editor, selection.from) : null
  }, [editor])

  // The caret's link, as the selection moves or the text changes, and
  // whether the paste menu is open (it opens and closes with no change).
  React.useEffect(() => {
    const update = () => {
      const t = caretLink()
      // Out of a link, an Escape is forgotten: the next visit shows the bar again.
      if (!t) setDismissed(null)
      setCaret((prev) => (prev && t && prev.from === t.from && prev.to === t.to && prev.href === t.href ? prev : t))
      setPasting(pasteMenuOpen(editor))
    }
    update()
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor, caretLink])

  // A pointer resting on a link (never a chip or a card: those are blocks of their own).
  React.useEffect(() => {
    const dom = editor.view.dom
    const linkEl = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href]')
      return a && dom.contains(a) && !a.closest('[data-node-view-wrapper]') ? a : null
    }
    const over = (e: MouseEvent) => {
      const a = linkEl(e)
      if (!a) return
      window.clearTimeout(timers.current.leave)
      window.clearTimeout(timers.current.over)
      timers.current.over = window.setTimeout(() => {
        try {
          setHover(linkAt(editor, editor.view.posAtDOM(a, 0)))
        } catch {
          // Gone from the page meanwhile.
        }
      }, HOVER_MS)
    }
    const out = (e: MouseEvent) => {
      if (!linkEl(e)) return
      window.clearTimeout(timers.current.over)
      timers.current.leave = window.setTimeout(() => !inBar.current && setHover(null), LEAVE_MS)
    }
    dom.addEventListener('mouseover', over)
    dom.addEventListener('mouseout', out)
    const t = timers.current
    return () => {
      dom.removeEventListener('mouseover', over)
      dom.removeEventListener('mouseout', out)
      window.clearTimeout(t.over)
      window.clearTimeout(t.leave)
    }
  }, [editor])

  // ⌘K on a link: its form (the doc keymap asks). The shell asked before the bar loaded: now.
  React.useEffect(() => {
    const keys = docKeymapOf(editor)
    const edit = () => {
      // The keymap's storage is every doc editor's (it loads lazily): only the focused one answers.
      if (hide || !editor.isEditable || !editor.view.hasFocus() || !editor.isActive('link')) return false
      const t = linkAt(editor, editor.state.selection.from)
      if (!t) return false
      setEditing(t)
      return true
    }
    if (openEdit.current) {
      openEdit.current = false
      edit()
    }
    if (!keys) return
    keys.editLink = edit
    return () => {
      if (keys.editLink === edit) keys.editLink = null
    }
  }, [editor, hide, openEdit])

  // Where the bar stands follows the page as it scrolls.
  React.useEffect(() => {
    if (!caret && !hover && !editing) return
    let frame = 0
    const move = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTick((n) => n + 1))
    }
    window.addEventListener('scroll', move, true)
    window.addEventListener('resize', move)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', move, true)
      window.removeEventListener('resize', move)
    }
  }, [caret, hover, editing])

  const close = React.useCallback(() => {
    const t = editing ?? hover ?? caret
    setEditing(null)
    setHover(null)
    if (t) setDismissed(`${t.from}:${t.to}`)
    if (editor.isEditable) editor.commands.focus()
  }, [editor, editing, hover, caret])

  const shown = editing ?? hover ?? (caret && dismissed !== `${caret.from}:${caret.to}` ? caret : null)
  if (hide || !shown || editor.isDestroyed || (pasting && !editing)) return null
  const size = editor.state.doc.content.size
  if (shown.to > size) return null

  const open = () => {
    if (!isSafeHref(shown.href)) return
    const internal = shown.href.startsWith('/') || (() => {
      try {
        return new URL(shown.href).origin === window.location.origin
      } catch {
        return false
      }
    })()
    if (internal) router.push(new URL(shown.href, window.location.origin).pathname + new URL(shown.href, window.location.origin).search)
    else window.open(shown.href, '_blank', 'noopener,noreferrer')
  }

  const save = (url: string, text?: string) => {
    if (!isSafeHref(url)) return
    editor
      .chain()
      .focus()
      .setTextSelection({ from: shown.from, to: shown.to })
      .insertContent({ type: 'text', text: text || url, marks: [{ type: 'link', attrs: { href: url } }] })
      .run()
    setEditing(null)
  }

  const remove = () => {
    editor.chain().focus().setTextSelection({ from: shown.from, to: shown.to }).unsetLink().setTextSelection(shown.to).run()
    setHover(null)
  }

  const place = placeOf(editor, shown)
  if (!place) return null
  return createPortal(
    <div
      data-link-bar=""
      style={{ ...place, zIndex: 50 }}
      onMouseEnter={() => {
        inBar.current = true
        window.clearTimeout(timers.current.leave)
      }}
      onMouseLeave={() => {
        inBar.current = false
        if (!editing) timers.current.leave = window.setTimeout(() => setHover(null), LEAVE_MS)
      }}
    >
      {editing ? (
        <LinkEditBlock
          defaultUrl={shown.href}
          defaultText={editor.state.doc.textBetween(shown.from, shown.to, ' ')}
          onSave={save}
          onCancel={close}
          className="content-float w-80 rounded-xl bg-pop p-3 text-ink shadow-e3"
        />
      ) : (
        <LinkPopoverBlock
          url={shown.href}
          onOpen={open}
          onEscape={close}
          onEdit={editor.isEditable ? () => setEditing(shown) : undefined}
          onClear={editor.isEditable ? remove : undefined}
        />
      )}
    </div>,
    document.body,
  )
}
