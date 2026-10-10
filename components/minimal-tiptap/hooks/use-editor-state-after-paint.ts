"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"

// After the frame being drawn: a frame callback runs before the paint, and a
// task queued from it runs after. Without a frame (a test, a hidden tab) the
// task alone.
function afterNextPaint(run: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  if (typeof requestAnimationFrame !== "function") {
    timer = setTimeout(run, 0)
    return () => clearTimeout(timer)
  }
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(run, 0)
  })
  return () => {
    cancelAnimationFrame(frame)
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Editor state for controls around the text (which formatting buttons are lit
 * or available), read after the keystroke's frame has painted, once for any
 * number of transactions in between.
 *
 * useEditorState reads its selector inside every transaction, so the typing
 * waits for it. A toolbar's selector asks each button whether its command
 * could run (`editor.can()`, a dry run of the command), five sections of them
 * per key in a doc, and that showed up as the slowest thing on the page while
 * typing. The text is drawn at once; the buttons catch up a frame later, which
 * nobody can see. `select` must return a primitive (compared with Object.is).
 */
export function useEditorStateAfterPaint<T extends string | number | boolean | null>(
  editor: Editor | null,
  select: (editor: Editor) => T,
): T | null {
  const selectRef = React.useRef(select)
  React.useLayoutEffect(() => {
    selectRef.current = select
  })
  const [value, setValue] = React.useState<T | null>(() => (editor && !editor.isDestroyed ? select(editor) : null))

  React.useEffect(() => {
    if (!editor) return
    let cancel: (() => void) | null = null
    const read = () => {
      cancel = null
      if (editor.isDestroyed) return
      const next = selectRef.current(editor)
      setValue((prev) => (Object.is(prev, next) ? prev : next))
    }
    const schedule = () => {
      if (!cancel) cancel = afterNextPaint(read)
    }
    // What changed between the first render and subscribing.
    read()
    editor.on("transaction", schedule)
    return () => {
      editor.off("transaction", schedule)
      cancel?.()
    }
  }, [editor])

  return value
}
