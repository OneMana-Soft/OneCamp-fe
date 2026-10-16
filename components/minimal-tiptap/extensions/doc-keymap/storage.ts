import type { Editor } from "@tiptap/core"

/**
 * The doc keymap's storage, and how a component finds it on an editor: on
 * their own, so what reads it (the link bubble, which the chat composer has
 * too) doesn't bring the doc's whole keymap with it.
 */

export interface DocKeymapStorage {
  /** Opens the selection bar's link field; SelectionBar sets it while mounted. */
  requestLink: (() => boolean) | null
  /** Opens a selected link's edit form; LinkBubbleMenu sets it while mounted. */
  editLink: (() => boolean) | null
  /** Puts the caret at the end of the doc's title; the doc page sets it while it shows an editable title. */
  focusTitle: (() => boolean) | null
  /** Escape was the last key: the next Tab leaves the editor. */
  tabLeaves: boolean
  /**
   * How far from the scroll area's edges the caret is kept, and how close it
   * may come before the view scrolls (ProseMirror's scrollMargin and
   * scrollThreshold). Changed in place: the phone's bar above the keyboard
   * raises the bottom while it shows (docEditor/phoneScrollMargin.ts).
   */
  scrollMargin: { top: number; right: number; bottom: number; left: number }
  scrollThreshold: { top: number; right: number; bottom: number; left: number }
}

/** ProseMirror's own scroll margin, which the doc keeps when no bar is up. */
export const DEFAULT_SCROLL_MARGIN = 5

/** The doc keymap's storage on an editor, when the editor has it. */
export function docKeymapOf(editor: Editor | null | undefined): DocKeymapStorage | undefined {
  return (editor?.storage as Record<string, DocKeymapStorage | undefined> | undefined)?.docKeymap
}
