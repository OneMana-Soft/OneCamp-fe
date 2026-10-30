import { beforeEach, describe, expect, it, vi } from "vitest"

// Uploading into Docs & Files (docs F1b): files over the workspace's limit
// are refused before a byte goes, each saying its size and the limit; the
// rest go one after another under one toast that counts them and turns into
// what happened, with the failures said by name.

const uploaded: Array<{ name: string; place: unknown }> = []
let refuse: Record<string, Error> = {}
vi.mock("@/services/docFilesService", () => ({
  uploadDocFile: vi.fn(async (file: File, place: unknown, opts?: { onProgress?: (p: number) => void }) => {
    opts?.onProgress?.(50)
    if (refuse[file.name]) throw refuse[file.name]
    uploaded.push({ name: file.name, place })
    return { kind: "doc", uuid: `n-${file.name}`, has_children: false, node_kind: "file" }
  }),
}))
const toasts: Array<Record<string, unknown>> = []
const updates: Array<Record<string, unknown>> = []
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: Record<string, unknown>) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: vi.fn(), update: (u: Record<string, unknown>) => updates.push(u) }
  },
}))
const refreshDocGraph = vi.fn()
vi.mock("@/services/docGraphService", () => ({ refreshDocGraph: () => refreshDocGraph() }))
vi.mock("@/lib/swrMutate", () => ({ cachedData: () => ({ upload_limit_mb: 1, upload_limit_bytes: 1024 * 1024 }) }))

import { uploadFiles } from "./uploads"

const file = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name)

beforeEach(() => {
  uploaded.length = 0
  toasts.length = 0
  updates.length = 0
  refuse = {}
  refreshDocGraph.mockClear()
})

describe("uploading files", () => {
  it("refuses a file over the limit before sending it, and sends the rest into the place", async () => {
    await uploadFiles([file("deck.pptx", 2 * 1024 * 1024), file("brief.pdf", 10)], { parent: "folder-1" }, "Contracts")
    expect(uploaded).toEqual([{ name: "brief.pdf", place: { parent: "folder-1" } }])
    const refused = toasts.find((t) => t.variant === "destructive")
    expect(refused?.description).toBe("deck.pptx is 2 MB, over the 1 MB upload limit for this workspace.")
  })

  it("counts them under one toast, which turns into what happened", async () => {
    const done = await uploadFiles([file("a.png", 10), file("b.png", 10)], { space: "project:p-1" }, "Website relaunch")
    expect(done).toHaveLength(2)
    expect(toasts[0]).toMatchObject({ tone: "loading", title: "Uploading 2 files", description: "to Website relaunch" })
    expect(updates.at(-1)).toMatchObject({ tone: "success", title: "Uploaded 2 files", description: "to Website relaunch" })
  })

  it("says which ones failed, and why", async () => {
    refuse["b.png"] = Object.assign(new Error("x"), { response: { status: 415, data: { msg: "That kind of file can't be stored." } } })
    await uploadFiles([file("a.png", 10), file("b.png", 10)], { parent: "f" }, "Designs")
    expect(updates.at(-1)).toMatchObject({ variant: "destructive", title: "b.png didn't upload", description: "That kind of file can't be stored." })
  })

  it("names one file by its name", async () => {
    await uploadFiles([file("brief.pdf", 10)], { parent: "f" }, "Contracts")
    expect(toasts[0]).toMatchObject({ title: "Uploading brief.pdf" })
    expect(updates.at(-1)).toMatchObject({ title: "Uploaded brief.pdf" })
  })

  // Every list and level of the tree is read again after a change; once a
  // file, a batch of 20 asked for every one of them 20 times.
  it("reads the tree again once for the whole batch, failures and all", async () => {
    refuse["b.png"] = new Error("x")
    await uploadFiles([file("a.png", 10), file("b.png", 10), file("c.png", 10)], { parent: "f" }, "Designs")
    expect(refreshDocGraph).toHaveBeenCalledTimes(1)
  })

  it("reads nothing again when every file was refused before it went", async () => {
    await uploadFiles([file("deck.pptx", 2 * 1024 * 1024)], { parent: "f" }, "Designs")
    expect(refreshDocGraph).not.toHaveBeenCalled()
  })
})
