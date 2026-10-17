"use client"

import { Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { isComposingKey } from "@/lib/keys/ime"

/**
 * The caret a key acts on is the one on the screen.
 *
 * The browser moves the caret itself for Home, End and the arrows, and
 * ProseMirror reads where it went when the browser's "selectionchange" event
 * arrives. On a busy page the next key can arrive first: Chrome runs input
 * ahead of other work. Every handler of that key then read the caret from
 * before the last one, and the browser's own default acted on the real one,
 * so ⌫ after Home at a list item's start joined it to the item above
 * ("onetwo") instead of taking its bullet away (T16), and ↩ after End would
 * split the line where the caret had been.
 *
 * So before any key is handled, a caret the browser has moved and the editor
 * hasn't heard of is read in, by ProseMirror's own reading of that event. As a
 * DOM handler it runs before every keymap and the input rules' ↩. Reading it
 * again is harmless: when the event comes, there is nothing new. Not while
 * text is being composed, which ProseMirror leaves alone too.
 *
 * Nor in the 200 ms after the editor takes the focus. ProseMirror then reads
 * a caret at the doc's start as the browser resetting the selection, and puts
 * its own back: read early, Home on the doc's first line, then ⇧End, selected
 * nothing (docAi.spec's "two of three can be taken", clicking in and keying
 * at once). In that window the event's own reading is left as it was.
 */
export const CaretFromScreen = Extension.create({
  name: "caretFromScreen",
  // First among the plugins, so first among any other keydown DOM handlers too.
  priority: 10_000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("caretFromScreen"),
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (!view.composing && !isComposingKey(event) && !justFocused(view)) readCaretFromScreen(view)
              return false
            },
          },
        },
      }),
    ]
  },
})

/**
 * Has the editor take the selection the browser shows now, as its
 * "selectionchange" handler would (prosemirror-view's DOMObserver; not public
 * API, so quickWins.test.tsx's "T16 on a busy page" holds it to its word).
 */
function readCaretFromScreen(view: EditorView) {
  ;(view as unknown as { domObserver?: { onSelectionChange?: () => void } }).domObserver?.onSelectionChange?.()
}

/** Whether the editor took the focus in the last 200 ms, ProseMirror's window for a reset caret (its DOMObserver.flush). */
function justFocused(view: EditorView): boolean {
  const lastFocus = (view as unknown as { input?: { lastFocus?: number } }).input?.lastFocus ?? 0
  return lastFocus > Date.now() - 200
}
