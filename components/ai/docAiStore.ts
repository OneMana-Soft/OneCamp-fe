/**
 * Whether a doc editor's AI bar is open, and what it was opened on (docs
 * programme B9; AI edition only). One small store per editor: the keys
 * (docAiPlugin.ts), the registered actions (docAiRegister.ts: Ask AI, "/"
 * Write and Summarise, the block menu, the empty doc's row) open it, and the
 * editor's overlay (DocAiOverlay.tsx) draws it. In split view each editor has
 * its own.
 */

import type { Editor } from "@tiptap/core"
import type { DocAIActionId, DocAIModel } from "@/lib/ai/docAIActions"

/** Where the bar was asked for. */
export type BarSource = "space" | "keys" | "action" | "slash" | "starter"

export interface BarRequest {
  docId: string
  /** The selection (or the blocks the block menu was on) when it was opened; from === to at a caret. */
  from: number
  to: number
  /** Where the asking was, in viewport px: the block menu's place. Else the selection's. */
  anchor?: { left: number; top: number; bottom: number }
  /**
   * The blocks the block menu was on, by id, in document order. They are read
   * alone: blocks chosen apart never bring in what lies between them.
   */
  blocks?: string[]
  /** "ask": straight to a question about the doc (⇧⌘J). */
  mode: "actions" | "ask"
  /** An action to run at once ("/" Write, the empty doc's row, Try again). */
  action?: DocAIActionId
  prompt?: string
  tone?: string
  language?: string
  /** The answer being refined ("make it warmer"). */
  previous?: string
  /** The project for a draft from its open tasks. */
  projectId?: string
  /**
   * Whether the person may put an answer into the doc (lib/docs/abilities
   * askWrite, from where it was asked). Absent: as the editor allows.
   */
  canChange?: boolean
  source: BarSource
}

export interface BarState {
  open: boolean
  request: BarRequest | null
  /** Moves on every open, so asking again restarts the bar. */
  seq: number
}

const CLOSED: BarState = { open: false, request: null, seq: 0 }
const states = new WeakMap<Editor, BarState>()
const listeners = new WeakMap<Editor, Set<() => void>>()
const rests = new WeakMap<Editor, number>()

function set(editor: Editor, next: BarState) {
  states.set(editor, next)
  for (const l of [...(listeners.get(editor) ?? [])]) l()
}

/** The bar's state for an editor, the same object until it changes. */
export function aiBarOf(editor: Editor): BarState {
  return states.get(editor) ?? CLOSED
}

export function subscribeAiBar(editor: Editor, listener: () => void): () => void {
  let set = listeners.get(editor)
  if (!set) listeners.set(editor, (set = new Set()))
  set.add(listener)
  return () => {
    set!.delete(listener)
  }
}

export function openAiBar(editor: Editor, request: BarRequest) {
  rests.delete(editor)
  set(editor, { open: true, request, seq: aiBarOf(editor).seq + 1 })
}

/**
 * Closes the bar. restAt is the empty line it was opened on by a space: the
 * next space there types a space, as a second space does in Notion.
 */
export function closeAiBar(editor: Editor, restAt?: number) {
  if (restAt !== undefined) rests.set(editor, restAt)
  if (!aiBarOf(editor).open) return
  set(editor, { ...aiBarOf(editor), open: false })
}

/** Whether a space at pos should type a space: the bar was just closed there. */
export function spaceRestsAt(editor: Editor, pos: number): boolean {
  return rests.get(editor) === pos
}

export function clearSpaceRest(editor: Editor) {
  rests.delete(editor)
}

// The selection the AI panel was opened on (the bus's aiRun), kept as a pin
// (docAiPlugin.ts) while the panel works on it, so its Replace lands on that
// text wherever edits moved it (N43).
const panelPins = new WeakMap<Editor, string>()

export function panelPinOf(editor: Editor): string | undefined {
  return panelPins.get(editor)
}

export function setPanelPin(editor: Editor, pinId: string) {
  panelPins.set(editor, pinId)
}

// What the bar hands the panel when ⌘⏎ continues there: the action, the words
// typed, and the answer so far, which the panel goes on from instead of asking
// again. Taken once.
export interface PanelHandoff {
  action?: DocAIActionId
  prompt?: string
  text?: string
  model?: DocAIModel | null
}

const handoffs = new WeakMap<Editor, PanelHandoff>()

export function handToPanel(editor: Editor, handoff: PanelHandoff) {
  handoffs.set(editor, handoff)
}

export function takePanelHandoff(editor: Editor): PanelHandoff | undefined {
  const h = handoffs.get(editor)
  handoffs.delete(editor)
  return h
}
