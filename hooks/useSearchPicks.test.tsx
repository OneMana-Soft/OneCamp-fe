import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

// What a picker offers for what's typed (hooks/useSearchPicks,
// behind Admin › Apps' place picker and the entity-link picker): the workspace
// search 180 ms after the last key, only the latest question's answer, and a
// failed search said as one, never as "nothing matches", with a way to ask
// again and no toast on top of the picker's own words.

// newEachDraw hands out a new makeRequest on every draw, so a new search, as
// some callers' tests mock usePost (the app's is stable).
const { makeRequest, mocked } = vi.hoisted(() => ({ makeRequest: vi.fn(), mocked: { newEachDraw: false } }))
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({ makeRequest: mocked.newEachDraw ? (o: unknown) => makeRequest(o) : makeRequest, isSubmitting: false }),
}))

import { useSearchPicks } from "@/hooks/useSearchPicks"
import type { SearchResult } from "@/services/searchService"

const doc = (id: string, title: string): SearchResult => ({ type: "doc", doc: { doc_uuid: id, doc_title: title } })
const pickDoc = (r: SearchResult) => (r.type === "doc" && r.doc ? { id: String(r.doc.doc_uuid), title: String(r.doc.doc_title) } : null)
const asked = () => makeRequest.mock.calls.map(([o]) => (o as { payload: { global_search_text: string } }).payload.global_search_text)

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  mocked.newEachDraw = false
  vi.useRealTimers()
})

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(180)))

describe("a picker's search", () => {
  it("asks once the typing stops, and keeps only the latest question's answer", async () => {
    let answerFirst: (v: unknown) => void = () => {}
    makeRequest.mockImplementationOnce(() => new Promise((r) => (answerFirst = r))).mockResolvedValueOnce({ page: [doc("d2", "Vendor contracts")] })
    const { result, rerender } = renderHook(({ q }) => useSearchPicks(q, pickDoc), { initialProps: { q: "ve" } })
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)))
    rerender({ q: "ven" })
    await settle()
    rerender({ q: "vendor" })
    await settle()
    await act(async () => answerFirst({ page: [doc("d1", "Venice trip")] }))
    expect(asked()).toEqual(["ven", "vendor"])
    expect(result.current.items).toEqual([{ id: "d2", title: "Vendor contracts" }])
    expect(result.current.searching).toBe(false)
    expect(makeRequest).toHaveBeenLastCalledWith(expect.objectContaining({ quiet: true }))
  })

  it("says a failed search failed, and asks again on retry", async () => {
    makeRequest.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce({ page: [doc("d2", "Vendor contracts")] })
    const { result } = renderHook(() => useSearchPicks("vendor", pickDoc))
    await settle()
    expect(result.current).toMatchObject({ failed: true, searching: false, items: [] })
    act(() => result.current.retry())
    await settle()
    expect(result.current).toMatchObject({ failed: false, searching: false, items: [{ id: "d2", title: "Vendor contracts" }] })
    expect(asked()).toEqual(["vendor", "vendor"])
  })

  it("keeps what the picker offers, up to its limit", async () => {
    makeRequest.mockResolvedValueOnce({ page: [doc("d1", "A"), { type: "board", board: { board_uuid: "b1" } }, doc("d2", "B"), doc("d3", "C")] })
    const { result } = renderHook(() => useSearchPicks("a", pickDoc, { limit: 2 }))
    await settle()
    expect(result.current.items.map((i) => i.id)).toEqual(["d1", "d2"])
  })

  it("asks nothing while it is off or nothing is typed, and drops an answer that comes after", async () => {
    let answer: (v: unknown) => void = () => {}
    makeRequest.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    const { result, rerender } = renderHook(({ q, on }) => useSearchPicks(q, pickDoc, { enabled: on }), { initialProps: { q: "vendor", on: true } })
    await settle()
    rerender({ q: "vendor", on: false })
    await act(async () => answer({ page: [doc("d1", "Vendor contracts")] }))
    expect(result.current).toMatchObject({ items: [], searching: false, failed: false })
    rerender({ q: "   ", on: true })
    await settle()
    expect(asked()).toEqual(["vendor"])
  })
})

// On 24 Oct three task panel test files spun forever while the entity-link
// picker's search was drawn on the page (INTEGRATOR-6): their usePost mock
// made a new search on every draw, and the picker answered each with a draw.
describe("a picker whose search is new on every draw", () => {
  beforeEach(() => void (mocked.newEachDraw = true))

  it("settles with nothing typed", async () => {
    let draws = 0
    const { result } = renderHook(() => {
      if (++draws > 20) throw new Error("drawn 20 times without settling")
      return useSearchPicks("", pickDoc)
    })
    await settle()
    expect(draws).toBeLessThanOrEqual(2)
    expect(result.current).toMatchObject({ items: [], searching: false, failed: false })
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("asks once for what's typed, with an inline pick too", async () => {
    makeRequest.mockResolvedValue({ page: [doc("d2", "Vendor contracts")] })
    const { result, rerender } = renderHook(() => useSearchPicks("vendor", (r) => pickDoc(r)))
    await settle()
    rerender()
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)))
    expect(asked()).toEqual(["vendor"])
    expect(result.current).toMatchObject({ items: [{ id: "d2", title: "Vendor contracts" }], searching: false, failed: false })
  })
})
