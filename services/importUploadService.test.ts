import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { post: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import { uploadImportFile } from "./importUploadService"

const ax = axiosInstance as unknown as { post: ReturnType<typeof vi.fn> }

beforeEach(() => ax.post.mockReset())

describe("uploadImportFile", () => {
  const file = new File(["Name,Assignee\nShip it,Ana Lima\n"], "Launch plan.csv", { type: "text/csv" })
  const presigned = { job_id: "job-9", provider: "csv", source_workspace_name: "Launch plan", raw_object_key: "k", upload_url: "https://minio/put", expires_in: 3600, method: "PUT", headers: { "Content-Type": "application/octet-stream" } }
  const xhrs: FakeXHR[] = []
  class FakeXHR {
    upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    statusText = ""
    aborted = false
    sent: unknown = null
    opened: string[] = []
    constructor() {
      xhrs.push(this)
    }
    open(method: string, url: string) {
      this.opened = [method, url]
    }
    setRequestHeader() {}
    send(body: unknown) {
      this.sent = body
    }
    abort() {
      this.aborted = true
      this.onabort?.()
    }
  }
  beforeEach(() => {
    xhrs.length = 0
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("presigns for the file's size, sends it straight to storage with its progress, then finalises", async () => {
    ax.post.mockResolvedValueOnce({ data: presigned }).mockResolvedValueOnce({ data: {} })
    const progress: number[] = []
    const upload = uploadImportFile("csv", file, "Launch plan", "backup_csv", (p) => progress.push(p))
    await vi.waitFor(() => expect(xhrs).toHaveLength(1))
    expect(ax.post).toHaveBeenNthCalledWith(
      1,
      "/admin/import/csv/presign",
      { source_workspace_name: "Launch plan", file_size: file.size, source: "backup_csv" },
      { suppressErrorToast: true, signal: undefined },
    )
    const xhr = xhrs[0]
    expect(xhr.opened).toEqual(["PUT", "https://minio/put"])
    expect(xhr.sent).toBe(file)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 })
    xhr.status = 200
    xhr.onload?.()
    await expect(upload).resolves.toEqual({ job_id: "job-9" })
    expect(progress).toEqual([50])
    expect(ax.post).toHaveBeenLastCalledWith("/admin/import/csv/finalize/job-9", undefined, { suppressErrorToast: true })
  })

  it("stops when asked, and never finalises", async () => {
    ax.post.mockResolvedValueOnce({ data: presigned })
    const controller = new AbortController()
    const upload = uploadImportFile("csv", file, "Launch plan", "backup_csv", undefined, controller.signal)
    await vi.waitFor(() => expect(xhrs).toHaveLength(1))
    controller.abort()
    await expect(upload).rejects.toMatchObject({ name: "AbortError" })
    expect(xhrs[0].aborted).toBe(true)
    expect(ax.post).toHaveBeenCalledTimes(1)
  })

  it("says storage refused the file, and never finalises", async () => {
    ax.post.mockResolvedValueOnce({ data: presigned })
    const upload = uploadImportFile("csv", file, "Launch plan", "backup_csv")
    await vi.waitFor(() => expect(xhrs).toHaveLength(1))
    xhrs[0].status = 403
    xhrs[0].statusText = "Forbidden"
    xhrs[0].onload?.()
    await expect(upload).rejects.toThrow("403")
    expect(ax.post).toHaveBeenCalledTimes(1)
  })
})
