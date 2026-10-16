/**
 * Where someone is in the doc, read from their awareness state through the
 * editor's own Yjs binding (B8). A caret or a view is a Yjs relative position,
 * so it lands on the same words in every tab whatever was typed above it.
 */

import * as Y from "yjs"
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "y-prosemirror"
import type { Editor } from "@tiptap/core"
import type { AwarenessState } from "./people"

/** The awareness of the doc an editor is bound to: the one its carets are drawn from. */
export interface AwarenessLike {
  clientID: number
  getStates(): Map<number, AwarenessState>
  getLocalState(): Record<string, unknown> | null
  setLocalStateField(field: string, value: unknown): void
  on(event: "change", cb: () => void): void
  off(event: "change", cb: () => void): void
}

export function awarenessOf(editor: Editor): AwarenessLike | null {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "collaborationCursor")
  return (ext?.options as { provider?: { awareness?: AwarenessLike } } | undefined)?.provider?.awareness ?? null
}

interface YState {
  doc: Y.Doc
  type: Y.XmlFragment
  binding: { mapping: Map<Y.AbstractType<unknown>, unknown> } | null
}

function yState(editor: Editor): YState | null {
  const s = ySyncPluginKey.getState(editor.state) as YState | undefined
  return s?.binding ? s : null
}

/** A relative position (as awareness carries it) in this editor, or null when it is gone. */
export function posOf(editor: Editor, json: unknown): number | null {
  const ys = yState(editor)
  if (!ys || !json) return null
  try {
    const pos = relativePositionToAbsolutePosition(ys.doc, ys.type, Y.createRelativePositionFromJSON(json), ys.binding!.mapping as never)
    return typeof pos === "number" && pos >= 0 && pos <= editor.state.doc.content.size ? pos : null
  } catch {
    return null
  }
}

function relativeOf(editor: Editor, pos: number): unknown {
  const ys = yState(editor)
  if (!ys) return null
  return Y.relativePositionToJSON(absolutePositionToRelativePosition(pos, ys.type, ys.binding!.mapping as never))
}

/** The scroller a doc's editor sits in (docInput's .doc-scroll). */
export function scrollerOf(editor: Editor): HTMLElement | null {
  return editor.isDestroyed ? null : (editor.view.dom.closest(".doc-scroll") as HTMLElement | null)
}

/** The top-level block a position is in, as an element, or null. */
function blockAt(editor: Editor, pos: number): HTMLElement | null {
  const $p = editor.state.doc.resolve(pos)
  if ($p.depth < 1) return editor.view.nodeDOM(pos) as HTMLElement | null
  return editor.view.nodeDOM($p.before(1)) as HTMLElement | null
}

/** Where this tab is looking: the block at the top of its screen, and how far down the screen that block starts. */
export interface View {
  at: unknown
  dy: number
}

export function viewOf(editor: Editor, scroller: HTMLElement): View | null {
  if (editor.isDestroyed) return null
  const r = scroller.getBoundingClientRect()
  const content = editor.view.dom.getBoundingClientRect()
  const hit = editor.view.posAtCoords({ left: content.left + Math.min(48, content.width / 2), top: Math.max(r.top, content.top) + 6 })
  const pos = hit?.pos ?? 0
  const $p = editor.state.doc.resolve(pos)
  const start = $p.depth >= 1 ? $p.before(1) : 0
  const el = editor.view.nodeDOM(start) as HTMLElement | null
  if (!el) return null
  const at = relativeOf(editor, Math.min(start + 1, editor.state.doc.content.size))
  return at ? { at, dy: Math.round(el.getBoundingClientRect().top - r.top) } : null
}

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Shows what someone else is looking at: their top block where it sits on their screen. */
export function showView(editor: Editor, scroller: HTMLElement, view: View): boolean {
  const pos = posOf(editor, view.at)
  const el = pos === null ? null : blockAt(editor, pos)
  if (!el) return false
  scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (Number(view.dy) || 0)
  return true
}

/** Brings a position into view, near the middle; nothing moves if it is in view already, with room. */
export function showPos(editor: Editor, scroller: HTMLElement, pos: number, smooth: boolean): void {
  const at = editor.view.coordsAtPos(pos)
  const r = scroller.getBoundingClientRect()
  if (at.top >= r.top + 48 && at.bottom <= r.bottom - 48) return
  scroller.scrollTo({ top: scroller.scrollTop + at.top - r.top - r.height / 2, behavior: smooth && !reducedMotion() ? "smooth" : "auto" })
}

/** Plays someone's name flag again, on the caret nearest a position (their caret is at it). */
export function flagCaret(editor: Editor, userId: string | undefined, pos: number): void {
  const at = editor.view.coordsAtPos(pos)
  let best: HTMLElement | null = null
  let gap = Infinity
  for (const caret of Array.from(editor.view.dom.querySelectorAll<HTMLElement>(".collaboration-cursor__caret"))) {
    if (userId && caret.dataset.userId !== userId) continue
    const r = caret.getBoundingClientRect()
    const d = Math.abs(r.top - at.top) + Math.abs(r.left - at.left)
    if (d < gap) {
      gap = d
      best = caret
    }
  }
  const label = best?.querySelector<HTMLElement>(".collaboration-cursor__label")
  if (!label) return
  label.style.animation = "none"
  void label.offsetWidth
  label.style.animation = ""
}
