// Presenter notes (miro-28 2a): who may present a board (its edit right) reads its frames' notes, and writes them with
// the version they read; the server refuses a stale write with the note as it now is (409 stale_note), so the person
// is told "Someone else changed these notes" and keeps their text. Share-link guests, call guests and followers never
// ask for them.

import { describe, expect, it } from "vitest"
import { NOTE_MAX, frameNotesUrl, noteSaved, notesByFrame, staleNote, type FrameNote } from "./frameNotes"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const note = (frame_id: string, body: string, version = 1): FrameNote => ({ frame_id, body, version, updated_by: "u1", updated_at: "2026-11-09T10:00:00Z" })
/** An axios error as the API answers it: a status and its envelope. */
const answered = (status: number, data: unknown) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } })

describe("presenter notes on the web", () => {
  it("asks for a board's notes only for whoever may present it", () => {
    expect(frameNotesUrl("b1", true)).toBe("/board/getFrameNotes/b1")
    // A follower, a share-link guest or a call's guest: no request at all.
    expect(frameNotesUrl("b1", false)).toBe("")
    expect(frameNotesUrl("", true)).toBe("")
  })

  it("finds each frame's note, and an empty answer is no notes", () => {
    const by = notesByFrame([note("f1", "Open with the numbers"), note("f2", "Demo", 3)])
    expect(by.get("f1")?.body).toBe("Open with the numbers")
    expect(by.get("f2")?.version).toBe(3)
    expect(by.get("f3")).toBeUndefined()
    expect(notesByFrame(undefined).size).toBe(0)
  })

  it("puts a saved note in place, and an emptied one (its soft delete) out of the list", () => {
    const list = [note("f1", "Old"), note("f2", "Demo")]
    expect(noteSaved(list, "f1", note("f1", "New", 2))).toEqual([note("f1", "New", 2), note("f2", "Demo")])
    expect(noteSaved(list, "f3", note("f3", "Third"))).toEqual([...list, note("f3", "Third")])
    expect(noteSaved(list, "f1", null)).toEqual([note("f2", "Demo")])
    expect(noteSaved(undefined, "f1", note("f1", "New"))).toEqual([note("f1", "New")])
  })

  it("reads and saves over an answer that isn't a list (a proxy's or a stub's {}) as no notes, never a throw (V-854)", () => {
    const odd = {} as unknown as FrameNote[]
    expect(notesByFrame(odd).size).toBe(0)
    expect(noteSaved(odd, "f1", note("f1", "New"))).toEqual([note("f1", "New")])
    expect(noteSaved(odd, "f1", null)).toEqual([])
  })

  it("reads a stale write's answer as the note as it now is, and nothing else as stale", () => {
    const now = note("f1", "Someone else's words", 4)
    expect(staleNote(answered(409, { code: "stale_note", msg: "These notes changed", data: now }))).toEqual({ current: now })
    // The note was emptied (soft-deleted) meanwhile.
    expect(staleNote(answered(409, { code: "stale_note", data: null }))).toEqual({ current: null })
    expect(staleNote(answered(409, { code: "conflict", data: now }))).toBeNull()
    expect(staleNote(answered(403, { msg: "Only editors" }))).toBeNull()
    expect(staleNote(new Error("Network Error"))).toBeNull()
  })

  it("caps a note at the server's 10,000 characters", () => {
    expect(NOTE_MAX).toBe(10_000)
  })
})
