import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }))

import { downloadBlob, downloadFrom } from "./download"

const jsdomURL = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
const made: string[] = []
const revoked: string[] = []
let saved: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(URL, {
    createObjectURL: () => {
      made.push(`blob:${made.length}`)
      return made[made.length - 1]
    },
    revokeObjectURL: (u: string) => revoked.push(u),
  })
  saved = []
  // Firefox ignores a click on an anchor that isn't in the document.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(document.body.contains(this)).toBe(true)
    saved.push(this.download)
  })
})
afterEach(() => {
  vi.useRealTimers()
  Object.assign(URL, jsdomURL)
  vi.restoreAllMocks()
  get.mockReset()
  post.mockReset()
  made.length = 0
  revoked.length = 0
})

describe("saving a file", () => {
  it("keeps the file's address until the browser has read it, then lets it go", () => {
    downloadBlob("a,b\n", "text/csv", "tasks.csv")
    expect(saved).toEqual(["tasks.csv"])
    vi.advanceTimersByTime(1_000)
    expect(revoked).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(revoked).toEqual(made)
  })
})

describe("a file the server makes", () => {
  const answer = (disposition?: string) => ({ data: new Blob(["a,b\n"], { type: "text/csv" }), headers: disposition ? { "content-disposition": disposition } : {} })
  const named = async (disposition?: string) => {
    get.mockResolvedValueOnce(answer(disposition))
    await downloadFrom("/project/taskList/p?format=csv", "tasks.csv")
    return saved[saved.length - 1]
  }

  it("is read as a blob, its failure the caller's to say", async () => {
    await named()
    expect(get).toHaveBeenCalledWith("/project/taskList/p?format=csv", { responseType: "blob", suppressErrorToast: true })
  })

  it("takes the UTF-8 name the server gives, whole", async () => {
    expect(await named(`attachment; filename="Zo's launch tasks.csv"; filename*=UTF-8''Zo%C3%AB%27s%20launch%20tasks.csv`)).toBe("Zoë's launch tasks.csv")
  })

  it("takes the plain name when there is no UTF-8 one, or its escape is broken", async () => {
    expect(await named(`attachment; filename="Spring \\"fair\\" tasks.csv"`)).toBe(`Spring "fair" tasks.csv`)
    expect(await named(`attachment; filename="Spring fair.csv"; filename*=UTF-8''Spring%E0%A4fair.csv`)).toBe("Spring fair.csv")
  })

  it("falls back when the answer names nothing, or the browser hides the header", async () => {
    expect(await named("attachment")).toBe("tasks.csv")
    expect(await named()).toBe("tasks.csv")
  })

  it("is asked for with a POST of what to make, when the request says so, and named as any other", async () => {
    post.mockResolvedValueOnce(answer(`attachment; filename="Deals.xlsx"; filename*=UTF-8''Deals.xlsx`))
    await downloadFrom("/tables/t/export", "table.xlsx", { fields: ["f"], spec: {} })
    expect(post).toHaveBeenCalledWith("/tables/t/export", { fields: ["f"], spec: {} }, { responseType: "blob", suppressErrorToast: true })
    expect(get).not.toHaveBeenCalled()
    expect(saved).toEqual(["Deals.xlsx"])
  })

  it("says nothing of its own when the read fails", async () => {
    get.mockRejectedValueOnce(new Error("Network Error"))
    await expect(downloadFrom("/x", "x.csv")).rejects.toThrow("Network Error")
    expect(saved).toEqual([])
  })
})
