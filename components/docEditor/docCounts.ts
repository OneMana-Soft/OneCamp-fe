"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"

export interface DocCounts {
  words: number
  chars: number
  /** Minutes to read at 200 words a minute; at least one, and none for an empty doc. */
  minutes: number
}

/** Words, characters and reading time of a doc's text. Pure. */
export function countDoc(text: string): DocCounts {
  const trimmed = text.trim()
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length
  return { words, chars: text.length, minutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)) }
}

/**
 * The footer's line: "1,240 words, 7 min read", in the reader's own number
 * format, and only "0 words" for an empty doc, which takes no time to read.
 */
export function readingLine({ words, minutes }: Pick<DocCounts, "words" | "minutes">): string {
  if (words === 0) return "0 words"
  return `${words.toLocaleString()} word${words === 1 ? "" : "s"}, ${minutes} min read`
}

/**
 * A doc's counts, worked out once the writer pauses rather than on every key.
 *
 * WHY. The footer's word count read the whole document's text on every
 * keystroke and set three pieces of state, which rendered the editor's whole
 * frame again; on a long doc that was a good part of what a key cost. The
 * count is something you glance at between sentences, so it can wait for one.
 */
export function useDocCounts(editor: Editor | null, delayMs = 400): DocCounts {
  const [counts, setCounts] = React.useState<DocCounts>({ words: 0, chars: 0, minutes: 0 })
  React.useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const compute = () => {
      timer = null
      if (editor.isDestroyed) return
      const next = countDoc(editor.getText())
      setCounts((prev) => (prev.words === next.words && prev.chars === next.chars ? prev : next))
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(compute, delayMs)
    }
    compute()
    editor.on("update", schedule)
    return () => {
      editor.off("update", schedule)
      if (timer) clearTimeout(timer)
    }
  }, [editor, delayMs])
  return counts
}
