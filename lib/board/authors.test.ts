import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { authorName, stampNewNotes, storeWithMakers, type NoteAuthor } from "./authors"

// Who made each note (miro-36): stamped once, by the screen that first puts
// the note on the shared board, in the board document's own map.

const note = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "rectangle", customData: { kind: "note", colour: "yellow" }, ...extra })
const shape = (id: string) => ({ id, type: "rectangle", backgroundColor: "transparent" })
const SAM: NoteAuthor = { id: "u-sam", name: "Sam Rivera" }
const ANN: NoteAuthor = { id: "u-ann", name: "Ann Lee" }

function board(shared: Record<string, unknown>[] = [], makers: Record<string, NoteAuthor> = {}) {
  const doc = new Y.Doc()
  const elements = doc.getMap<Record<string, unknown>>("elements")
  const authors = doc.getMap<unknown>("noteAuthors")
  for (const el of shared) elements.set(String(el.id), el)
  for (const [id, m] of Object.entries(makers)) authors.set(id, m)
  return { elements, authors }
}

describe("a note's maker", () => {
  it("is whoever puts a new note on the shared board, a copy's maker too", () => {
    const b = board([note("old")], { old: SAM })
    // A new note, and a copy of the old one (its words and colour, a new id): both the copier's.
    expect(stampNewNotes(b.authors, [note("old"), note("new"), note("copy")], b.elements, ANN)).toBe(2)
    expect(b.authors.get("new")).toEqual(ANN)
    expect(b.authors.get("copy")).toEqual(ANN)
    expect(b.authors.get("old")).toEqual(SAM)
  })

  it("is no one for a note from before makers were kept, whoever edits it", () => {
    const b = board([note("before")])
    expect(stampNewNotes(b.authors, [note("before", { version: 9 })], b.elements, ANN)).toBe(0)
    expect(b.authors.has("before")).toBe(false)
    // Deleted, then brought back by an undo: still no one's.
    const gone = board([note("before", { isDeleted: true })])
    expect(stampNewNotes(gone.authors, [note("before")], gone.elements, ANN)).toBe(0)
  })

  it("stays the first maker: a note brought back by an undo, or one another screen stamped first", () => {
    const b = board([], { back: SAM })
    expect(stampNewNotes(b.authors, [note("back")], b.elements, ANN)).toBe(0)
    expect(b.authors.get("back")).toEqual(SAM)
  })

  it("is whoever turns a shape into a note", () => {
    const b = board([shape("s1")])
    expect(stampNewNotes(b.authors, [note("s1")], b.elements, SAM)).toBe(1)
    expect(b.authors.get("s1")).toEqual(SAM)
  })

  it("is kept for notes only, never a deleted one, and never without a name", () => {
    const b = board()
    expect(stampNewNotes(b.authors, [shape("s"), note("gone", { isDeleted: true })], b.elements, SAM)).toBe(0)
    expect(stampNewNotes(b.authors, [note("n")], b.elements, null)).toBe(0)
    expect(stampNewNotes(b.authors, [note("n")], b.elements, { id: "u", name: "  " })).toBe(0)
    expect(b.authors.size).toBe(0)
    // A guest drawing in a call has a name and may have no id.
    expect(stampNewNotes(b.authors, [note("n")], b.elements, { id: "", name: " Guest " })).toBe(1)
    expect(b.authors.get("n")).toEqual({ id: "", name: "Guest" })
  })

  it("is read as a name, and anything else found in the map reads as no one", () => {
    expect(authorName(SAM)).toBe("Sam Rivera")
    expect(authorName(undefined)).toBe("")
    expect(authorName("Sam")).toBe("")
    expect(authorName({ name: 42 })).toBe("")
    expect(authorName({ name: "x".repeat(300) })).toHaveLength(200)
  })
})

describe("a frame's sync to the shared board (miro-06)", () => {
  it("stamps and writes only the notes that changed, never walking every note's maker on a frame", () => {
    // A big board, every note on the shared board already, most of them from before makers were kept (no maker).
    const notes = Array.from({ length: 3000 }, (_, i) => note(`n${i}`, { version: 2, versionNonce: i }))
    const b = board(notes)
    let asked = 0
    const authors = { has: (id: string) => (asked++, b.authors.has(id)), set: (id: string, m: NoteAuthor) => b.authors.set(id, m) }
    // A drag's frame: one note moved (a new version), and one note new to the board.
    const frame = notes.map((n, i) => (i === 7 ? { ...n, version: 3, versionNonce: 99, x: 40 } : n))
    frame.push(note("fresh", { version: 1, versionNonce: 5 }))
    expect(storeWithMakers(authors, b.elements as never, frame, ANN)).toEqual({ wrote: 2, stamped: 1 })
    expect(asked, "only the changed notes' makers are asked after").toBeLessThanOrEqual(2)
    expect(b.authors.get("fresh")).toEqual(ANN)
    expect(b.authors.has("n7")).toBe(false)
    expect(b.elements.get("n7")).toMatchObject({ version: 3, x: 40 })
    // The document's copy is its own, not the scene's object.
    expect(b.elements.get("fresh")).not.toBe(frame[frame.length - 1])
    // Nothing changed: nothing written, nothing asked.
    asked = 0
    expect(storeWithMakers(authors, b.elements as never, [...b.elements.values()] as never, ANN)).toEqual({ wrote: 0, stamped: 0 })
    expect(asked).toBe(0)
  })
})
