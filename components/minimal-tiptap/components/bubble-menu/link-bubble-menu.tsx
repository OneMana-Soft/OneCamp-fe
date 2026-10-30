"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { docKeymapOf } from '../../extensions/doc-keymap/storage'
import { lazyPiece } from '@/lib/lazy/lazyPiece'
import type LinkBarView from '../link/link-bar'

/** Calls meet when the person meets a link: the caret in one, or a pointer over one. Returns how to stop. */
function whenLinkMet(editor: Editor, meet: () => void) {
  const onCaret = () => editor.isActive('link') && meet()
  const onOver = (e: MouseEvent) => (e.target as Element | null)?.closest?.('a[href]') && meet()
  const dom = editor.view.dom
  editor.on('selectionUpdate', onCaret)
  dom.addEventListener('mouseover', onOver)
  return () => {
    editor.off('selectionUpdate', onCaret)
    dom.removeEventListener('mouseover', onOver)
  }
}

// The bar's code can't come (no network): the link itself still works, and the next link met asks again.
function BarUnavailable({ editor, retry }: React.ComponentProps<typeof LinkBarView> & { retry: () => void }) {
  React.useEffect(() => whenLinkMet(editor, retry), [editor, retry])
  return null
}
const LinkBar = lazyPiece(() => import('../link/link-bar'), { failed: BarUnavailable })

/**
 * The link bar's place in an editor. The bar (link-bar.tsx) loads the first
 * time a link is met: the caret in one, a pointer over one, or ⌘K on one.
 */
export const LinkBubbleMenu: React.FC<{ editor: Editor; hide?: boolean }> = ({ editor, hide }) => {
  const [met, setMet] = React.useState(false)
  const openEdit = React.useRef(false)

  React.useEffect(() => {
    if (met) return
    const meet = () => setMet(true)
    const stop = whenLinkMet(editor, meet)
    const keys = docKeymapOf(editor)
    const edit = () => {
      if (hide || !editor.isEditable || !editor.view.hasFocus() || !editor.isActive('link')) return false
      openEdit.current = true
      meet()
      return true
    }
    if (keys) keys.editLink = edit
    return () => {
      stop()
      if (keys?.editLink === edit) keys.editLink = null
    }
  }, [editor, hide, met])

  return met ? (
    <React.Suspense fallback={null}>
      <LinkBar editor={editor} hide={hide} openEdit={openEdit} />
    </React.Suspense>
  ) : null
}
