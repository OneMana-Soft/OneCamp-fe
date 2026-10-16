"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { docKeymapOf } from '../../extensions/doc-keymap/storage'

const LinkBar = React.lazy(() => import('../link/link-bar'))

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
    const onCaret = () => editor.isActive('link') && meet()
    const onOver = (e: MouseEvent) => (e.target as Element | null)?.closest?.('a[href]') && meet()
    const dom = editor.view.dom
    editor.on('selectionUpdate', onCaret)
    dom.addEventListener('mouseover', onOver)
    const keys = docKeymapOf(editor)
    const edit = () => {
      if (hide || !editor.isEditable || !editor.view.hasFocus() || !editor.isActive('link')) return false
      openEdit.current = true
      meet()
      return true
    }
    if (keys) keys.editLink = edit
    return () => {
      editor.off('selectionUpdate', onCaret)
      dom.removeEventListener('mouseover', onOver)
      if (keys?.editLink === edit) keys.editLink = null
    }
  }, [editor, hide, met])

  return met ? (
    <React.Suspense fallback={null}>
      <LinkBar editor={editor} hide={hide} openEdit={openEdit} />
    </React.Suspense>
  ) : null
}
