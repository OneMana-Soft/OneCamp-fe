"use client"

import { Extension } from '@tiptap/react'

const RESET = ['bold', 'italic', 'strike', 'underline', 'code']

/**
 * Enter leaves bold, italic, strike, underline and code behind: the next line
 * starts plain.
 *
 * In a list it still makes a new item. It used to split the paragraph inside
 * the item instead (splitBlock), so the next line was an unbulleted paragraph
 * under the same bullet; now the list's own split runs, without the marks.
 */
export const ResetMarksOnEnter = Extension.create({
  name: 'resetMarksOnEnter',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!RESET.some(mark => editor.isActive(mark))) return false

        for (const item of ['taskItem', 'listItem']) {
          if (!editor.schema.nodes[item] || !editor.isActive(item)) continue
          if (!editor.commands.splitListItem(item)) return false
          editor.view.dispatch(editor.state.tr.setStoredMarks([]))
          return true
        }

        return editor.commands.splitBlock({ keepMarks: false })
      }
    }
  }
})
