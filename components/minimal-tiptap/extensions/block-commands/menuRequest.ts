import type { Editor } from "@tiptap/core"

/**
 * How the hand asks for the block menu: the handle's click, ⌘/ and a phone's
 * long-press ask; the doc's block menu (docEditor/BlockMenu.tsx, drawn in the
 * editor's overlay slot) answers, as a menu or, on a phone, as a sheet.
 */
export interface BlockMenuRequest {
  /** The blocks, as one range of whole blocks (ctx.state.range), or several. */
  blocks: number[]
  /** Where the menu stands, in viewport px (ctx.state.anchor). */
  anchor: { left: number; top: number; bottom: number }
  /** What asked: the keyboard puts focus in the menu's search. */
  via: "handle" | "keys" | "press"
}

const answers = new WeakMap<Editor, (request: BlockMenuRequest) => void>()

/** The block menu listens on an editor; the returned function stops it. */
export function answerBlockMenu(editor: Editor, answer: (request: BlockMenuRequest) => void): () => void {
  answers.set(editor, answer)
  return () => {
    if (answers.get(editor) === answer) answers.delete(editor)
  }
}

/** Asks for the block menu; false when no menu listens (it hasn't loaded). */
export function requestBlockMenu(editor: Editor, request: BlockMenuRequest): boolean {
  const answer = answers.get(editor)
  if (!answer) return false
  answer(request)
  return true
}
