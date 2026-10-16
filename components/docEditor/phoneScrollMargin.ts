"use client"

import type { Editor } from "@tiptap/react"

import { DEFAULT_SCROLL_MARGIN, docKeymapOf } from "@/components/minimal-tiptap/extensions/doc-keymap/storage"

/** Room kept between the caret and the top of the phone's bar. */
export const CARET_CLEARANCE = 12

/**
 * The caret kept above the phone's bar (small-details M8). The bar floats over
 * the bottom of the page, above the keyboard, and ProseMirror kept its 5 px
 * margin, so a caret on the last line could sit under it. While the bar shows,
 * the bottom margin (and the threshold that starts a scroll) is the keyboard,
 * the bar and some room; when it goes, ProseMirror's own. The doc keymap's
 * plugin reads the same objects, changed in place: no plugin is re-registered.
 * Pure but for the editor's storage.
 */
export function setPhoneScrollMargin(editor: Editor, barTop: number | null) {
  const keys = docKeymapOf(editor)
  if (!keys) return
  const bottom = barTop === null ? DEFAULT_SCROLL_MARGIN : barTop + CARET_CLEARANCE
  keys.scrollMargin.bottom = bottom
  keys.scrollThreshold.bottom = barTop === null ? 0 : bottom
}
