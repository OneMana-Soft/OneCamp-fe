/**
 * Private mode (miro-25): while a round runs, a note its author makes or edits never leaves the author's tab until
 * the reveal. Miro hides new and edited sticky notes in private mode; here the words don't reach the server at all,
 * so no other screen, no export of the shared board and no AI reading it can have them.
 *
 * The round is in the board's Yjs map "facilitation" under PRIVATE_KEY (lib/board/privateMode, the gate): any
 * editor starts it and any editor ends it, on every plan. Each tab keeps a PrivateNotes record of its own author's
 * held notes: every element it holds, with the words everyone sees until the reveal ("" for a note made in private)
 * and the real element, so a reload keeps the author's words (it lives in this browser only).
 *
 * The one choke point is the frame's sync (storeWithMakers' `outbound`): privateWriter's copy of a held element
 * carries the last public words, is locked (no one else can move, open or delete it) and names its author
 * (veiledBy), at the real element's version, so the binding sees nothing new to write until the author changes it.
 * Every other path that reads the scene to send it anywhere (the thumbnail, AI's clustering, a saved template)
 * sends privateScene's view.
 *
 * Coming back, a shared copy of a held element keeps the author's words (unveil, the binding's `inbound`). At the
 * reveal the author's tab bumps every held element (lib/board/privateRecord's revealScene) and the ordinary sync
 * writes them, words and all.
 */
import type { BoardElement } from "@/lib/board/binding"
import { isStickyNote, type BoardElementLike } from "@/lib/board/notes"

export { PRIVATE_KEY, privateNotesKey } from "@/lib/board/privateMode"

/** A private round: who started it and when. */
export interface PrivateRound {
  id: string
  byId: string
  byName: string
  startedAt: number
}

/** The round in the facilitation map, or null for none (anything else found there is none). */
export function privateRoundOf(raw: unknown): PrivateRound | null {
  const r = raw as Partial<PrivateRound> | null | undefined
  if (!r || typeof r !== "object") return null
  if (typeof r.id !== "string" || !r.id || typeof r.byId !== "string" || typeof r.byName !== "string" || typeof r.startedAt !== "number") return null
  return { id: r.id, byId: r.byId, byName: r.byName, startedAt: r.startedAt }
}

/** A tab's record of its author's held notes for one round. */
export interface PrivateNotes {
  round: string
  /** Each held element's id: the words everyone sees until the reveal (a card's is ""). */
  publicText: Record<string, string>
  /** Each held element as the author has it: what a reopened tab shows and reveals. */
  real: Record<string, BoardElement>
}

export const emptyPrivateNotes = (round: string): PrivateNotes => ({ round, publicText: {}, real: {} })

/** The author a shared copy is held for, or null for a note everyone can read. */
export function veiledBy(el: unknown): { id: string; name: string } | null {
  const c = (el as { customData?: unknown } | null | undefined)?.customData as { privateBy?: unknown; privateName?: unknown } | undefined
  if (typeof c?.privateBy !== "string" || !c.privateBy) return null
  return { id: c.privateBy, name: typeof c.privateName === "string" ? c.privateName : "" }
}

/** How many notes a scene holds back for their authors: a held note's words are held too, but are not a second note. */
export function heldNoteCount(elements: readonly unknown[]): number {
  return elements.filter((el) => {
    const e = el as { type?: unknown; isDeleted?: unknown }
    return !e.isDeleted && e.type !== "text" && !!veiledBy(el)
  }).length
}

type El = BoardElement & BoardElementLike & { text?: string; originalText?: string; locked?: boolean; backgroundColor?: string }

const wordsOf = (el: El | undefined): string => (el ? (el.originalText ?? el.text ?? "") : "")

/**
 * The frame's outbound copy of each element (storeWithMakers' `outbound`), for `me` while `notes.round` runs.
 * Call it on each changed element before it is written: it reads the shared copy as it was. A note goes private
 * when it is new to the shared board or its words change; a note only moved stays public, and words on shapes or
 * free text are never held. Mutates `notes` (it holds what it claims, and keeps each held element's real copy).
 */
export function privateWriter(
  notes: PrivateNotes,
  me: { id: string; name: string },
  shared: { get(id: string): unknown },
  find: (id: string) => unknown,
): (el: BoardElement) => BoardElement {
  const hold = (id: string, words: string) => {
    if (!(id in notes.publicText)) notes.publicText[id] = words
  }
  const claim = (el: El) => {
    if (el.id in notes.publicText) return
    if (el.type === "text") {
      const container = el.containerId ? (find(el.containerId) as El | undefined) : undefined
      if (!container || !isStickyNote({ ...container, isDeleted: false })) return
      const before = shared.get(el.id) as El | undefined
      const containerHeld = container.id in notes.publicText || !shared.get(container.id)
      if (!containerHeld && before && wordsOf(before) === wordsOf(el)) return
      hold(el.id, wordsOf(before))
      hold(container.id, "")
    } else if (isStickyNote({ ...el, isDeleted: false }) && !shared.get(el.id)) {
      hold(el.id, "")
      for (const b of el.boundElements ?? []) if (b.type === "text") hold(b.id, "")
    }
  }
  return (raw) => {
    claim(raw as El)
    if (!(raw.id in notes.publicText)) return raw
    notes.real[raw.id] = { ...raw }
    return veil(raw, notes, me)
  }
}

/** A held element as everyone else may see it: its last public words, locked, named as its author's. */
function veil<T extends BoardElement>(raw: T, notes: PrivateNotes, me: { id: string; name: string }): T {
  const el = raw as unknown as El
  const veiled: El = { ...el, locked: true, customData: { ...(el.customData ?? {}), privateBy: me.id, privateName: me.name } }
  if (el.type === "text") {
    const words = notes.publicText[el.id] ?? ""
    veiled.text = words
    veiled.originalText = words
  }
  return veiled as unknown as T
}

/**
 * The scene as everyone else may see it, for every path that sends it anywhere but the shared board (the
 * thumbnail, AI's clustering, a saved template): each held element veiled, the rest as they are. Pure.
 */
export function privateScene<T extends BoardElement>(scene: readonly T[], notes: PrivateNotes | null, me: { id: string; name: string }): T[] {
  if (!notes || Object.keys(notes.publicText).length === 0) return scene as T[]
  return scene.map((el) => (el.id in notes.publicText ? veil(el, notes, me) : el))
}

/**
 * A shared copy coming back to the author's tab (the binding's `inbound`): a held element keeps `mine`'s words,
 * lock and data, at the shared copy's version, so the binding sees it as taken and the author's next change goes
 * out above it. Anything not held, or with nothing of the author's to keep, comes as it is.
 */
export function unveil<T extends BoardElement>(notes: PrivateNotes, remote: T, mine: BoardElement | undefined): T {
  if (!mine || !(remote.id in notes.publicText)) return remote
  return { ...(mine as T), version: remote.version, versionNonce: remote.versionNonce }
}

/**
 * The author's words back on a canvas that took the shared copies before this tab's record was read (its code comes
 * on demand): each held element as `unveil` gives it. Pure; `restored` 0 means the scene is untouched.
 */
export function restoreScene<T extends BoardElement>(scene: readonly T[], notes: PrivateNotes): { elements: T[]; restored: number } {
  let restored = 0
  const elements = scene.map((el) => {
    const mine = notes.real[el.id]
    if (!mine || !veiledBy(el)) return el
    restored++
    return unveil(notes, el, mine)
  })
  return { elements, restored }
}

/** What a tab kept, read back from storage; null when there is none or it isn't a record. */
export function parsePrivateNotes(raw: string | null): PrivateNotes | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  const n = v as Partial<PrivateNotes> | null
  if (!n || typeof n.round !== "string" || !n.publicText || typeof n.publicText !== "object" || !n.real || typeof n.real !== "object") return null
  if (Object.values(n.publicText).some((w) => typeof w !== "string")) return null
  return { round: n.round, publicText: n.publicText, real: n.real }
}

