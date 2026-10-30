/**
 * Who made each note (miro-36): the notes' CSV names the person who wrote
 * each one, as Miro's sticky shows its author. Kept in the board's document
 * in a map of its own, NOTE_AUTHORS (a note's id: its maker's id and name),
 * written once, by the screen that first puts the note on the shared board:
 * whoever adds a note, by any path (N, Tab's next note, a pasted list, a
 * template, AI's notes, a board file opened into the board), and whoever
 * makes a copy (a duplicate, a paste: a copy is a new note, so it's its
 * maker's). A shape turned into a note is made a note then, by whoever turns
 * it. Notes from before have no maker, and the CSV leaves theirs empty.
 *
 * Never on the note's own element: an element changes with every edit and
 * undo, and a copy would carry its original's maker.
 */
import { changedElements, cloneElement, type BoardElement, type SharedElements } from "@/lib/board/binding"
import { isStickyNote, type BoardElementLike } from "@/lib/board/notes"

/** The board document's map of note makers. */
export const NOTE_AUTHORS = "noteAuthors"

/** A note's maker: their id (a member's uuid, a call guest's id; empty for a guest without one) and name. */
export interface NoteAuthor {
  id: string
  name: string
}

type Element = BoardElementLike & { id: string; isDeleted?: boolean; backgroundColor?: string }

/**
 * Stamps `who` as the maker of the scene's notes that the shared board doesn't
 * have as notes yet. Call it in the same transaction as storeScene, before it,
 * so a note reaches everyone with its maker. Returns how many it stamped.
 */
export function stampNewNotes(
  authors: { has(id: string): boolean; set(id: string, maker: NoteAuthor): unknown },
  scene: readonly Element[],
  shared: { get(id: string): unknown },
  who: NoteAuthor | null | undefined,
): number {
  const name = who?.name.trim()
  if (!who || !name) return 0
  let stamped = 0
  for (const el of scene) {
    if (el.isDeleted || authors.has(el.id) || !isStickyNote(el)) continue
    // A note the board already has (deleted, too: an undo brings it back) keeps the maker it had, or none.
    const before = shared.get(el.id) as Element | undefined
    if (before && isStickyNote({ ...before, isDeleted: false })) continue
    authors.set(el.id, { id: who.id, name })
    stamped++
  }
  return stamped
}

/**
 * A frame's sync of the scene to the shared board (miro-06): the elements that changed are written, as storeScene
 * writes them, and the notes among them new to the board are stamped with their maker first, in one walk of the
 * scene. Stamping over the whole scene asked every note's maker on every frame of a drag (8.9 ms a frame on a
 * 4,000-object board); only a changed note can be new to the board. Call it inside the document's transaction
 * (LOCAL_ORIGIN). Returns how many it wrote and stamped.
 */
export function storeWithMakers(
  authors: { has(id: string): boolean; set(id: string, maker: NoteAuthor): unknown },
  shared: Pick<SharedElements, "get" | "set">,
  scene: readonly BoardElement[],
  who: NoteAuthor | null | undefined,
): { wrote: number; stamped: number } {
  const changed = changedElements(shared, scene)
  if (changed.length === 0) return { wrote: 0, stamped: 0 }
  const stamped = stampNewNotes(authors, changed as never, shared, who)
  for (const el of changed) shared.set(el.id, cloneElement(el))
  return { wrote: changed.length, stamped }
}

/** A note's maker's name as the board keeps it; "" for a note from before makers were kept (or anything else found there). */
export function authorName(entry: unknown): string {
  const name = (entry as { name?: unknown } | null | undefined)?.name
  return typeof name === "string" ? name.trim().slice(0, 200) : ""
}
