import { describe, expect, it } from "vitest"
import { act, cleanup, render, renderHook } from "@testing-library/react"
import * as Y from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { docSaveState, holdsMine, parsePersisted, useSaveProgress, useSlowSave, type SaveProgress } from "@/components/docEditor/docSaveState"
import { saveDotCopy } from "@/components/docEditor/SaveDot"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Saved means stored (I8): the dot follows the server's "persisted" message,
// which carries the stored copy's Yjs state vector, so a tab knows when what
// it wrote is in the database.

const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8))
// As the server sends it: the time in ms.
const persisted = (doc: Y.Doc, at: number | string = Date.parse("2026-10-12T09:41:07.000Z")) =>
  JSON.stringify({ type: "persisted", at, sv: b64(Y.encodeStateVector(doc)), lineage: "L" })

// What the hooks use of a provider: its doc, its events and its unsent count.
function fakeProvider() {
  const doc = new Y.Doc()
  const handlers = new Map<string, Set<(e: never) => void>>()
  const provider = {
    document: doc,
    unsyncedChanges: 0,
    on(event: string, fn: (e: never) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
    },
    off(event: string, fn: (e: never) => void) {
      handlers.get(event)?.delete(fn)
    },
    emit(event: string, payload: unknown) {
      for (const fn of handlers.get(event) ?? []) (fn as (e: unknown) => void)(payload)
    },
  }
  const type = (text: string) => doc.getText("t").insert(0, text)
  return { provider, doc, type }
}

describe("the persisted message", () => {
  it("reads the server's message, and nothing else", () => {
    const doc = new Y.Doc()
    doc.getText("t").insert(0, "hi")
    const p = parsePersisted(persisted(doc))
    expect(p?.at).toBe(Date.parse("2026-10-12T09:41:07.000Z"))
    expect(p?.stored.get(doc.clientID)).toBe(2)
    expect(p?.lineage).toBe("L")
    // An earlier server build sent the time as text.
    expect(parsePersisted(persisted(doc, "2026-10-12T09:41:07.000Z"))?.at).toBe(Date.parse("2026-10-12T09:41:07.000Z"))
    for (const other of ['{"type":"epoch-changed"}', "not json", '{"type":"persisted","at":"x","sv":"AA=="}', '{"type":"persisted","at":0,"sv":"AA=="}']) {
      expect(parsePersisted(other)).toBeNull()
    }
  })

  it("holds this tab's edits only when the stored clock reaches them", () => {
    const doc = new Y.Doc()
    doc.getText("t").insert(0, "one")
    const stored = parsePersisted(persisted(doc))!.stored
    expect(holdsMine(stored, doc)).toBe(true)
    doc.getText("t").insert(0, "two")
    expect(holdsMine(stored, doc)).toBe(false)
    // Someone else's work being stored says nothing about ours.
    const other = new Y.Doc()
    other.getText("t").insert(0, "theirs")
    expect(holdsMine(parsePersisted(persisted(other))!.stored, doc)).toBe(false)
  })
})

describe("useSaveProgress", () => {
  it("is pending from an edit until the server says it is stored", () => {
    const { provider, doc, type } = fakeProvider()
    const { result } = renderHook(() => useSaveProgress(provider as unknown as HocuspocusProvider))
    act(() => provider.emit("stateless", { payload: persisted(doc) }))
    expect(result.current.pending).toBe(false)

    act(() => type("a"))
    act(() => type("b"))
    // Sent and acknowledged is not stored.
    act(() => provider.emit("unsyncedChanges", { number: 0 }))
    expect(result.current.pending).toBe(true)
    expect(result.current.waiting).toBe(2)

    act(() => provider.emit("stateless", { payload: persisted(doc, Date.parse("2026-10-12T09:42:00.000Z")) }))
    expect(result.current.pending).toBe(false)
    expect(result.current.waiting).toBe(0)
    expect(result.current.persistedAt?.toISOString()).toBe("2026-10-12T09:42:00.000Z")
  })

  // QA DSA-36 (14 Oct 2026): opening a seeded doc said "Saved · 11:12", the
  // last store (a deploy's open), which read as an edit just made.
  it("gives no stored time until this tab has edited, then the time of its store", () => {
    const { provider, doc, type } = fakeProvider()
    const { result } = renderHook(() => useSaveProgress(provider as unknown as HocuspocusProvider))
    act(() => provider.emit("stateless", { payload: persisted(doc, Date.parse("2026-10-12T11:12:00.000Z")) }))
    expect(result.current.pending).toBe(false)
    expect(result.current.persistedAt).toBeNull()
    expect(saveDotCopy("saved", result.current.persistedAt)).toBe("Saved")
    act(() => type("a"))
    act(() => provider.emit("stateless", { payload: persisted(doc, Date.parse("2026-10-12T14:05:00.000Z")) }))
    expect(result.current.persistedAt?.toISOString()).toBe("2026-10-12T14:05:00.000Z")
  })

  it("ignores what arrives from the server", () => {
    const { provider, doc } = fakeProvider()
    const { result } = renderHook(() => useSaveProgress(provider as unknown as HocuspocusProvider))
    act(() => provider.emit("stateless", { payload: persisted(doc) }))
    const remote = new Y.Doc()
    remote.getText("t").insert(0, "from someone else")
    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), provider))
    expect(result.current.pending).toBe(false)
  })

  it("with a server that never says, an edit is saved once the server has it", () => {
    const { provider, type } = fakeProvider()
    const { result } = renderHook(() => useSaveProgress(provider as unknown as HocuspocusProvider))
    act(() => provider.emit("unsyncedChanges", { number: 1 }))
    act(() => type("a"))
    expect(result.current.pending).toBe(true)
    act(() => provider.emit("unsyncedChanges", { number: 0 }))
    expect(result.current.pending).toBe(false)
  })

  // Review, 15 Oct 2026: every update, send and acknowledgement set a new
  // reading, the same or not, and the doc's page rendered again for each: two
  // to four times a key, about 340 components a key in a 12-block doc.
  it("hands back the same reading, and renders nothing, when an event changes nothing it says", () => {
    const { provider, doc, type } = fakeProvider()
    // What the reading's reader draws: it renders only when the reading changes.
    let drawn = 0
    const Drawn = ({ progress }: { progress: SaveProgress }) => {
      drawn++
      return <span>{progress.waiting}</span>
    }
    let reading: SaveProgress | null = null
    const Reader = () => {
      reading = useSaveProgress(provider as unknown as HocuspocusProvider)
      return <Drawn progress={reading} />
    }
    render(<Reader />)
    act(() => provider.emit("stateless", { payload: persisted(doc) }))
    act(() => type("a"))
    const typed = reading
    const before = drawn
    // The key's change is sent, then acknowledged: still not stored, still one change.
    act(() => provider.emit("unsyncedChanges", { number: 1 }))
    act(() => provider.emit("unsyncedChanges", { number: 0 }))
    expect(reading).toBe(typed)
    expect(drawn).toBe(before)
    cleanup()
    const { result } = renderHook(() => useSaveProgress(provider as unknown as HocuspocusProvider))
    act(() => type("b"))
    // The same store said twice keeps its time, as the same Date.
    act(() => provider.emit("stateless", { payload: persisted(doc, Date.parse("2026-10-12T09:42:00.000Z")) }))
    const stored = result.current
    expect(stored.persistedAt?.toISOString()).toBe("2026-10-12T09:42:00.000Z")
    act(() => provider.emit("stateless", { payload: persisted(doc, Date.parse("2026-10-12T09:42:00.000Z")) }))
    expect(result.current).toBe(stored)
    expect(result.current.persistedAt).toBe(stored.persistedAt)
  })
})

describe("useSlowSave", () => {
  it("the dot breathes only once a save has waited", async () => {
    const { provider, doc, type } = fakeProvider()
    const { result } = renderHook(() => useSlowSave(useSaveProgress(provider as unknown as HocuspocusProvider).pending, 20))
    act(() => provider.emit("stateless", { payload: persisted(doc) }))
    act(() => type("a"))
    expect(result.current).toBe(false)
    await act(() => new Promise((r) => setTimeout(r, 40)))
    expect(result.current).toBe(true)
    act(() => provider.emit("stateless", { payload: persisted(doc) }))
    expect(result.current).toBe(false)
  })
})

describe("the save dot's words", () => {
  // Offline, no count: what waits is a count of keystrokes, which tells a reader nothing (V-21, design review).
  it("says when the doc was stored, and that changes made offline are kept", () => {
    const at = new Date("2026-10-12T09:41:07")
    expect(saveDotCopy("saved", at, true)).toMatch(/^Saved · /)
    expect(saveDotCopy("saved", null, true)).toBe("Saved to the live doc")
    expect(saveDotCopy("saved", null, true, "board")).toBe("Saved to the live board")
    expect(saveDotCopy("offline", null, true)).toBe("Offline. Changes are kept and will sync")
    expect(saveDotCopy("offline", null, true, "board")).toBe("Offline. Changes are kept and will sync")
  })

  // The device online and only the live connection down: the dot says what the
  // connection pill says, "Reconnecting", not "Offline" (V-21).
  it("says reconnecting while only the live connection is down", () => {
    expect(saveDotCopy("reconnecting", null, true)).toBe("Reconnecting. Changes are kept and will sync")
    const live = { live: true, synced: false, everSynced: true }
    expect(docSaveState({ ...live, collabStatus: "disconnected" })).toBe("reconnecting")
    expect(docSaveState({ ...live, collabStatus: "offline" })).toBe("offline")
    expect(docSaveState({ live: true, collabStatus: "disconnected", synced: false, everSynced: false })).toBe("connecting")
  })
})
