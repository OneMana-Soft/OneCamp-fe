import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { bindAppMutate } from "@/lib/swrMutate"
import { emitDocMeta } from "@/lib/docMeta/bus"
import { applyDocMeta, docInfoKey, retitle, useDocMetaEvents } from "./useDocMetaEvents"

const DOC = "3c9e1f7a-5b2d-4e6f-8a1c-9d0b2e4f6a8c"

type Entry = { data?: unknown; isValidating?: boolean }

// An app cache as SWR keeps it, and its bound mutate.
function cacheWith(entries: Record<string, unknown>) {
  const cache = new Map<string, Entry>(Object.entries(entries).map(([k, data]) => [k, { data }]))
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mutate = vi.fn(async (key: unknown, updater?: (d: unknown) => unknown, opts?: { revalidate?: boolean }) => {
    if (typeof key === "string" && typeof updater === "function") {
      const e = cache.get(key)
      if (e) cache.set(key, { ...e, data: updater(e.data) })
    }
  })
  bindAppMutate(mutate as never, cache as never)
  return { cache, mutate }
}

afterEach(() => {
  cleanup()
  bindAppMutate(null)
})

describe("retitle", () => {
  it("renames the doc wherever a cached answer holds it, and nothing else", () => {
    const list = { data: { docs: [{ doc_uuid: DOC, doc_title: "Old" }, { doc_uuid: "other", doc_title: "Other" }] } }
    const out = retitle(list, DOC, "Launch plan")
    expect(out.data.docs[0].doc_title).toBe("Launch plan")
    expect(out.data.docs[1]).toBe(list.data.docs[1])
    expect(list.data.docs[0].doc_title).toBe("Old")
  })

  it("hands back the same answer when there's nothing to rename", () => {
    const same = { data: { doc_uuid: DOC, doc_title: "Launch plan" }, others: [1, 2] }
    expect(retitle(same, DOC, "Launch plan")).toBe(same)
    expect(retitle(same, "missing", "x")).toBe(same)
  })
})

describe("a doc's meta events", () => {
  it("a second tab shows a rename at once, without asking the server", () => {
    const { cache, mutate } = cacheWith({
      [docInfoKey(DOC)]: { msg: "ok", data: { doc_uuid: DOC, doc_title: "Launch notes" } },
      "/doc/children?parent=root": { data: [{ doc_uuid: DOC, doc_title: "Launch notes" }] },
      "/channel/list": { data: [{ doc_uuid: DOC, doc_title: "Launch notes" }] },
    })
    function Tab() {
      useDocMetaEvents(DOC)
      return null
    }
    render(<Tab />)
    const sent = Date.now()
    emitDocMeta({ kind: "doc.renamed", doc_uuid: DOC, at: new Date().toISOString(), data: { title: "Launch plan" } })
    expect(Date.now() - sent).toBeLessThan(1000)
    expect((cache.get(docInfoKey(DOC))?.data as { data: { doc_title: string } }).data.doc_title).toBe("Launch plan")
    expect((cache.get("/doc/children?parent=root")?.data as { data: { doc_title: string }[] }).data[0].doc_title).toBe("Launch plan")
    // Only the doc's own caches: a key that is neither a doc's nor names it is left.
    expect((cache.get("/channel/list")?.data as { data: { doc_title: string }[] }).data[0].doc_title).toBe("Launch notes")
    // Corrected in place, never asked for again.
    for (const call of mutate.mock.calls) expect(call[2]).toEqual({ revalidate: false })
  })

  it("has the doc read again for a delete, an access change or a lock, and its lists for a move", () => {
    const { mutate } = cacheWith({})
    applyDocMeta({ kind: "doc.access_changed", doc_uuid: DOC, at: "", data: { private: "true" } })
    expect(mutate).toHaveBeenCalledWith(docInfoKey(DOC))
    mutate.mockClear()
    applyDocMeta({ kind: "doc.moved", doc_uuid: DOC, at: "", data: { parent: "p" } })
    expect(mutate).toHaveBeenCalledWith(docInfoKey(DOC))
    const filter = mutate.mock.calls.map((c) => c[0]).find((k) => typeof k === "function") as (key: unknown) => boolean
    expect(filter("/doc/children?parent=p")).toBe(true)
    expect(filter(docInfoKey(DOC))).toBe(false)
    expect(filter("/channel/list")).toBe(false)
  })

  it("leaves a thread's events to the threads client", () => {
    const { mutate } = cacheWith({})
    applyDocMeta({ kind: "thread.replied", doc_uuid: DOC, at: "", data: { thread_id: "t1", comment_id: "c1" } })
    expect(mutate).not.toHaveBeenCalled()
  })

  it("stops when the doc closes, and tells a host what happened", () => {
    cacheWith({})
    const heard = vi.fn()
    function Tab() {
      useDocMetaEvents(DOC, heard)
      return null
    }
    const { unmount } = render(<Tab />)
    emitDocMeta({ kind: "doc.locked", doc_uuid: DOC, at: "", data: { level: "hard" } })
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ kind: "doc.locked" }))
    unmount()
    emitDocMeta({ kind: "doc.locked", doc_uuid: DOC, at: "" })
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
