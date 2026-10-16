import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import * as Y from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { holdsMine, parsePersisted, useSaveProgress, useSlowSave } from "@/components/docEditor/docSaveState"
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

  it("the dot breathes only once a save has waited", async () => {
    const { provider, doc, type } = fakeProvider()
    const { result } = renderHook(() => useSlowSave(provider as unknown as HocuspocusProvider, 20))
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
  it("says when the doc was stored, and how many changes wait offline", () => {
    const at = new Date("2026-10-12T09:41:07")
    expect(saveDotCopy("saved", at, true)).toMatch(/^Saved · /)
    expect(saveDotCopy("saved", null, true)).toBe("Saved to the live doc")
    expect(saveDotCopy("offline", null, true, 3)).toBe("Offline. 3 changes waiting to sync")
    expect(saveDotCopy("offline", null, true, 1)).toBe("Offline. 1 change waiting to sync")
    expect(saveDotCopy("offline", null, true, 0)).toBe("Offline. Changes are kept and will sync")
  })
})
