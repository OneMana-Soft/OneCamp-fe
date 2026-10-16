import { describe, expect, it, vi } from "vitest"

import { emitDocMeta, onDocMeta } from "./bus"

const renamed = (doc: string) => ({ kind: "doc.renamed", doc_uuid: doc, at: "2026-10-12T12:00:00Z", data: { title: "Launch plan" } })

describe("doc meta events", () => {
  it("reach the listeners of their own doc, until they stop listening", () => {
    const mine = vi.fn()
    const other = vi.fn()
    const stop = onDocMeta("d1", mine)
    onDocMeta("d2", other)
    emitDocMeta(renamed("d1"))
    expect(mine).toHaveBeenCalledWith(renamed("d1"))
    expect(other).not.toHaveBeenCalled()
    stop()
    emitDocMeta(renamed("d1"))
    expect(mine).toHaveBeenCalledTimes(1)
  })

  it("go on past a listener that throws, and ignore an event with no doc", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const after = vi.fn()
    onDocMeta("d3", () => {
      throw new Error("a bad listener")
    })
    onDocMeta("d3", after)
    emitDocMeta(renamed("d3"))
    expect(after).toHaveBeenCalledTimes(1)
    emitDocMeta({ kind: "doc.renamed", doc_uuid: "", at: "" })
    expect(after).toHaveBeenCalledTimes(1)
    errors.mockRestore()
  })
})
