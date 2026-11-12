import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: vi.fn(), post: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import { cellsByIds, rowsByIds } from "./tableService"

// Rows read by id (tables A7), and their named cells alone (tables L1, GET
// rows?ids=&fields=). A URL past 16 KB is refused on its way, and the server
// reads 500 ids a list: a read asks as many as fit, and a read of cells that
// can't be sent, or is refused, reads those rows whole, once (V-647 item 4).

const get = axiosInstance.get as unknown as ReturnType<typeof vi.fn>
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
const urlOf = (call: unknown[]) => new URL(String(call[0]), "http://api.test")
const idsOf = (call: unknown[]) => urlOf(call).searchParams.get("ids")!.split(",")
const refused = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data: { msg: "rows: name 1 to 500 field ids, separated by commas" } } })

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(async (...call: unknown[]) => ({ data: { data: idsOf(call).map((id) => ({ id })) } }))
})

describe("rows read by id", () => {
  it("asks for as many ids at once as a URL carries, and 500 at most", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => uuid(i))
    expect((await rowsByIds("t", ids)).map((r) => r.id)).toEqual(ids)
    // 1,000 ids of 36 characters: about 400 a URL, not 500 (18.5 KB).
    expect(get).toHaveBeenCalledTimes(3)
    for (const call of get.mock.calls) expect(String(call[0]).length).toBeLessThan(16_000)
    get.mockClear()
    const short = Array.from({ length: 1000 }, (_, i) => `r${i}`)
    await rowsByIds("t", short)
    expect(get.mock.calls.map((c) => idsOf(c).length)).toEqual([500, 500])
  })
})

describe("cells read by id", () => {
  it("names the fields asked, in one read beside the rows", async () => {
    const out = await cellsByIds("t", ["r1", "r2"], ["item", "note"])
    expect(out).toEqual({ rows: [{ id: "r1" }, { id: "r2" }], cells: true })
    expect(get).toHaveBeenCalledTimes(1)
    expect(urlOf(get.mock.calls[0]).searchParams.get("fields")).toBe("item,note")
  })

  it("reads whole rows when the fields named are more than a URL carries beside the ids", async () => {
    const fields = Array.from({ length: 430 }, (_, i) => uuid(i))
    const out = await cellsByIds("t", [uuid(9000)], fields)
    expect(out.cells).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
    expect(urlOf(get.mock.calls[0]).searchParams.has("fields")).toBe(false)
  })

  it.each([400, 414])("reads the rows whole once when a read of their cells is refused (%i)", async (status) => {
    get.mockRejectedValueOnce(refused(status))
    const out = await cellsByIds("t", ["r1", "r2"], ["item"])
    expect(out).toEqual({ rows: [{ id: "r1" }, { id: "r2" }], cells: false })
    expect(get.mock.calls.map((c) => urlOf(c).searchParams.has("fields"))).toEqual([true, false])
  })

  it("never asks a third time: the whole read's failure is the read's", async () => {
    get.mockRejectedValueOnce(refused(414)).mockRejectedValueOnce(new Error("Network Error"))
    await expect(cellsByIds("t", ["r1"], ["item"])).rejects.toThrow("Network Error")
    expect(get).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["offline", new Error("Network Error")],
    ["a stranger", refused(403)],
    ["a server error", refused(500)],
  ])("reads nothing again when a read of cells fails otherwise (%s)", async (_why, err) => {
    get.mockRejectedValueOnce(err)
    await expect(cellsByIds("t", ["r1"], ["item"])).rejects.toBe(err)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
