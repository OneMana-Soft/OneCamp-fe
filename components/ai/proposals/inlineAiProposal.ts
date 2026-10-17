"use client"

/**
 * Inline AI as an edit proposal (docs programme A9 for B9's AI bar; AI edition
 * only: components/ai never reaches the AI-free build).
 *
 * A rewrite of a selection (improve, shorten, tone, translate, fix) or a
 * continuation at the caret is shown as a proposal: deletions struck through,
 * the new words as ghost text, nothing in the doc until Accept, so another tab
 * sees nothing of a half-written answer. As the answer streams in, the same
 * proposal is diffed again against the text it started from. Accept is one
 * transaction with one undo; Discard leaves the doc as it was; Try again is a
 * new answer for the same text.
 *
 * The model's output arrives as HTML (B9 turns its Markdown into HTML with the
 * codec) or plain text.
 */

import type { Editor } from "@tiptap/core"
import { DOMParser as PMDOMParser, Fragment, Slice } from "@tiptap/pm/model"
import { proposeReplacement, type Tracked } from "@/lib/proposals/review"
import { discardProposal, proposalsOf, showProposal } from "@/components/minimal-tiptap/extensions/proposals"

interface AiOutput {
  html?: string
  text?: string
}

/** Where a rewrite's selection sits inside its target, so a stream can be diffed again. */
const selections = new Map<string, { fromStart: number; fromEnd: number }>()

function sliceOf(editor: Editor, out: AiOutput): Slice {
  const schema = editor.schema
  if (out.html !== undefined) {
    const holder = document.createElement("div")
    holder.innerHTML = out.html
    return PMDOMParser.fromSchema(schema).parseSlice(holder)
  }
  const text = out.text ?? ""
  const paras = text.split(/\n{2,}/)
  // One line goes into the text where the selection was; more become paragraphs.
  if (paras.length <= 1) return new Slice(text ? Fragment.from(schema.text(text)) : Fragment.empty, 0, 0)
  return new Slice(
    Fragment.fromArray(paras.map((p) => schema.nodes.paragraph.create(null, p.trim() ? schema.text(p.trim()) : null))),
    0,
    0,
  )
}

function show(editor: Editor, id: string | null, tracked: Tracked) {
  const withId = id ? { ...tracked, proposal: { ...tracked.proposal, id } } : tracked
  showProposal(editor, withId)
  return withId.proposal.id
}

/**
 * proposeAiRewrite shows the model's answer for from..to as a proposal and
 * returns its id, or null when the answer changes nothing.
 */
export function proposeAiRewrite(editor: Editor, from: number, to: number, out: AiOutput): string | null {
  const tracked = proposeReplacement(editor.state, from, to, sliceOf(editor, out))
  if (!tracked?.range) return null
  const id = show(editor, null, tracked)
  selections.set(id, { fromStart: from - tracked.range.from, fromEnd: tracked.range.to - to })
  return id
}

/**
 * updateAiRewrite diffs the answer again as it grows: the same proposal, the
 * same text it started from, wherever edits elsewhere moved that text.
 */
export function updateAiRewrite(editor: Editor, id: string, out: AiOutput): boolean {
  const sel = selections.get(id)
  const current = proposalsOf(editor.state).active[id]
  if (!sel || !current?.range) return false
  const from = current.range.from + sel.fromStart
  const to = current.range.to - sel.fromEnd
  if (from > to) return false
  const tracked = proposeReplacement(editor.state, from, to, sliceOf(editor, out))
  if (!tracked) return false
  show(editor, id, tracked)
  return true
}

/** endAiRewrite stops reviewing an answer (discarded, or accepted and done). */
export function endAiRewrite(editor: Editor, id: string) {
  selections.delete(id)
  if (proposalsOf(editor.state).active[id]) discardProposal(editor, id)
}
