import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: vi.fn() } }))

import { downloadFile as saveExport } from "@/lib/export/download"
import { downloadFile as fetchAndSave } from "./downloadFile"
import { downloadTextFile } from "./downloadTextFile"

const jsdomURL = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
const blobs: Blob[] = []
const revoked: string[] = []
let saved: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(URL, {
    createObjectURL: (b: Blob) => {
      blobs.push(b)
      return `blob:${blobs.length - 1}`
    },
    revokeObjectURL: (u: string) => revoked.push(u),
  })
  saved = []
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(document.body.contains(this)).toBe(true)
    saved.push(this.download)
  })
})
afterEach(() => {
  vi.useRealTimers()
  Object.assign(URL, jsdomURL)
  vi.restoreAllMocks()
  blobs.length = 0
  revoked.length = 0
})

// Every way the app saves a file keeps the file's address until the browser
// has read it (downloadBlob's minute): a big file's address let go after a
// second could leave it cut short (PROJ follow-up 4, 24 Oct).
const keptThenLetGo = () => {
  vi.advanceTimersByTime(1_500)
  expect(revoked).toEqual([])
  vi.advanceTimersByTime(60_000)
  expect(revoked).toEqual(["blob:0"])
}

describe("saving a file the browser made or fetched", () => {
  it("saves text under its name and type", () => {
    expect(downloadTextFile("codes.txt", "a b c")).toBe(true)
    expect(saved).toEqual(["codes.txt"])
    expect(blobs[0].type).toBe("text/plain")
    keptThenLetGo()
  })

  it("saves an export's own blob with its own type", () => {
    saveExport("Plan.md", new Blob(["# Plan"], { type: "text/markdown" }))
    expect(saved).toEqual(["Plan.md"])
    expect(blobs[0].type).toBe("text/markdown")
    keptThenLetGo()
  })

  it("saves a fetched file as bytes to keep, and says when the fetch failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("x", { status: 200 })).mockResolvedValueOnce(new Response("", { status: 404 })))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(fetchAndSave("/f/1", "report.pdf")).resolves.toBe(true)
    expect(saved).toEqual(["report.pdf"])
    expect(blobs[0].type).toBe("application/octet-stream")
    keptThenLetGo()
    await expect(fetchAndSave("/f/2", "gone.pdf")).resolves.toBe(false)
    expect(saved).toEqual(["report.pdf"])
    vi.unstubAllGlobals()
  })
})
