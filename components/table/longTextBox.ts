import * as React from "react"

// A long text's box, shared by its two editors: a computer's popover
// (cellPickers' LongTextEditor) and a phone's sheet (kindCells' LongTextSheet),
// each in a chunk of its own.

/** A long text's box, in its popover and its sheet alike. */
export const LONG_TEXT_BOX = "block w-full resize-none rounded-lg bg-raised px-3 py-2 text-base leading-5 text-ink outline-none focus:focus-halo"

/** Opened, a long text's caret goes to its end, after what's written. */
export const caretAtEnd = (e: React.FocusEvent<HTMLTextAreaElement>) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)

/**
 * A long text's draft, in its popover and its sheet alike. It's edited when it
 * differs from the text the editor opened with, never from the cell's value
 * now: the cell follows each value saved, so an editor left untouched while a
 * newer one came in would write its opening text back over it.
 */
export function useLongTextDraft(value: string) {
  const [opened] = React.useState(value)
  const [text, setText] = React.useState(value)
  return { text, setText, edited: text !== opened }
}
