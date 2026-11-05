/**
 * The record of a member's held notes a browser keeps (miro-25), and its reveal: the code the board's private-mode
 * host loads on demand, so none of it is on the board's first load (lib/board/privateNotes has the round's writer).
 *
 * The reveal reads the board's document, not the canvas (V-497): the canvas can take the synced document after the
 * reveal runs, and a reveal that read only the canvas found no held note there and wiped the words unshown. A
 * member's tabs in one browser share one record, each save merged into it, and a reveal clears only what it settled
 * (V-494).
 */
import { bumped, type BoardElement } from "@/lib/board/binding"
import { veiledBy, type PrivateNotes } from "@/lib/board/privateNotes"

/**
 * The reveal in the author's tab, once the board's document has synced (V-497): every held element goes out with its
 * words, bumped above each copy of it so every screen takes it. It reads the document, not the canvas: the canvas can
 * take the synced document after the reveal runs, and a held element missing from it would have no words to show.
 * - Its document copy is veiled as the author's (or the document never took it: the tab shut before its write
 *   reached the server): it comes from the canvas when the tab has the words on it, else from the real copy the tab
 *   kept, and is added to the scene when the canvas hasn't it yet.
 * - Its document copy is open (another tab or device of the author's revealed it) or deleted: nothing to show.
 * Every held id is settled either way, so the caller clears all of `notes`. `revealed` 0 means nothing to write. Pure.
 */
export function revealScene<T extends BoardElement>(
  scene: readonly T[],
  notes: PrivateNotes,
  shared: { get(id: string): unknown },
  me: string,
): { elements: T[]; revealed: number } {
  const elements = scene.slice()
  const at = new Map(scene.map((el, i) => [el.id, i]))
  let revealed = 0
  for (const id of Object.keys(notes.publicText)) {
    const doc = shared.get(id) as T | undefined
    if (doc && (doc.isDeleted || veiledBy(doc)?.id !== me)) continue
    const i = at.get(id)
    const onCanvas = i === undefined ? undefined : elements[i]
    const kept = notes.real[id] as T | undefined
    const base = onCanvas && !veiledBy(onCanvas) ? onCanvas : (kept ?? onCanvas ?? doc)
    if (!base || (!doc && base.isDeleted)) continue
    const top = Math.max(base.version ?? 0, onCanvas?.version ?? 0, doc?.version ?? 0)
    const out = bumped({ ...opened(base), version: top }, {} as Partial<T>)
    if (i === undefined) elements.push(out)
    else elements[i] = out
    revealed++
  }
  return { elements, revealed }
}

/** A held element with its veil off, for the reveal when no real copy was kept: unlocked, no author's mark. */
function opened<T extends BoardElement>(el: T): T {
  if (!veiledBy(el)) return el
  const customData = { ...(el as { customData?: Record<string, unknown> }).customData }
  delete customData.privateBy
  delete customData.privateName
  return { ...el, locked: false, customData }
}

/**
 * One browser's record of a member's held notes, kept by more than one tab (V-494), as one: every id `mine` or
 * `stored` holds, `mine`'s public words first, of each real copy the later version, in `mine`'s round (a record from a
 * round whose reveal hasn't run stays held into this one, as the writer keeps it). Pure.
 */
export function mergePrivateNotes(mine: PrivateNotes, stored: PrivateNotes | null): PrivateNotes {
  if (!stored) return mine
  const real = { ...stored.real }
  for (const [id, el] of Object.entries(mine.real)) if (!real[id] || (el.version ?? 0) >= (real[id].version ?? 0)) real[id] = el
  return { round: mine.round, publicText: { ...stored.publicText, ...mine.publicText }, real }
}

/** The record without the ids a reveal settled; null when none is left. Pure. */
export function withoutHeld(notes: PrivateNotes, ids: Iterable<string>): PrivateNotes | null {
  const publicText = { ...notes.publicText }
  const real = { ...notes.real }
  for (const id of ids) {
    delete publicText[id]
    delete real[id]
  }
  return Object.keys(publicText).length > 0 ? { round: notes.round, publicText, real } : null
}
