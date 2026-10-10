import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  OWN_ERRORS: { suppressErrorToast: true },
}))

import axiosInstance from "@/lib/axiosInstance"
import { deleteStagedZip, planSlackImport, rollbackSlackImport, runSlackImport, uploadSlackExport, uploadSlackExportPresigned } from "./slackImportService"
import { PostEndpointUrl } from "@/services/endPoints"

const ax = axiosInstance as unknown as { post: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
const post = ax.post

beforeEach(() => {
  post.mockReset()
  ax.delete.mockReset()
})

describe("starting a Slack import", () => {
  // The screens that start one say what went wrong themselves. A refusal such
  // as "the last run is still stopping" (409 run_alive) is in `error`, which
  // the global toast does not read, so it showed "Already changed" beside them.
  it("leaves the screen to say what went wrong", async () => {
    post.mockResolvedValueOnce({ data: {} })
    await runSlackImport("job-1", { skip_subtypes: true })
    expect(post).toHaveBeenCalledWith(`${PostEndpointUrl.SlackImportRun}/job-1`, { options: { skip_subtypes: true } }, { suppressErrorToast: true })
  })

  it("sends no options when none are given", async () => {
    post.mockResolvedValueOnce({ data: {} })
    await runSlackImport("job-2")
    expect(post).toHaveBeenCalledWith(`${PostEndpointUrl.SlackImportRun}/job-2`, {}, { suppressErrorToast: true })
  })
})

// The same for planning (again, after a failure), rolling back and deleting
// the staged file: each is refused with 409 run_alive while the last run is
// still stopping, and its screen says so once.
describe("the other Slack import requests", () => {
  it("plans, leaving the plan dialog to say what went wrong", async () => {
    post.mockResolvedValueOnce({ data: { job_id: "job-1" } })
    await planSlackImport("job-1", { skip_subtypes: true })
    expect(post).toHaveBeenCalledWith(`${PostEndpointUrl.SlackImportPlan}/job-1`, { options: { skip_subtypes: true } }, { suppressErrorToast: true })
  })

  it("rolls back, leaving the card to say what went wrong", async () => {
    post.mockResolvedValueOnce({ data: {} })
    await rollbackSlackImport("job-1")
    expect(post).toHaveBeenCalledWith(`${PostEndpointUrl.SlackImportRollback}/job-1`, undefined, { suppressErrorToast: true })
  })

  it("deletes the staged file, leaving the card to say what went wrong", async () => {
    ax.delete.mockResolvedValueOnce({ data: {} })
    await deleteStagedZip("job-1")
    expect(ax.delete).toHaveBeenCalledWith("/admin/import/slack/jobs/job-1/staged-zip", { suppressErrorToast: true })
  })
})

// A multi-GB upload could not be stopped: the dialog refused to close while
// it ran and had no Stop. The upload now takes a signal, and the dialog says
// a failed upload itself, so the global toast stays quiet.
describe("uploading a Slack export", () => {
  const file = new File(["PK"], "acme.zip", { type: "application/zip" })

  it("hands the signal to the request and says its own failures", async () => {
    post.mockResolvedValueOnce({ data: { job_id: "job-1", slack_workspace_name: "acme", raw_object_key: "k" } })
    const controller = new AbortController()
    await uploadSlackExport(file, "acme", "export_zip", undefined, controller.signal)
    const config = post.mock.calls[0][2]
    expect(config.signal).toBe(controller.signal)
    expect(config.suppressErrorToast).toBe(true)
  })

  it("still uploads when no signal is given", async () => {
    post.mockResolvedValueOnce({ data: { job_id: "job-2", slack_workspace_name: "acme", raw_object_key: "k" } })
    await expect(uploadSlackExport(file, "acme")).resolves.toMatchObject({ job_id: "job-2" })
  })

  it("stops a direct-to-storage upload when asked, and never finishes it", async () => {
    const xhrs: FakeXHR[] = []
    class FakeXHR {
      upload = { onprogress: null as unknown }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      status = 0
      statusText = ""
      aborted = false
      constructor() {
        xhrs.push(this)
      }
      open() {}
      setRequestHeader() {}
      send() {}
      abort() {
        this.aborted = true
        this.onabort?.()
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    post.mockResolvedValueOnce({ data: { job_id: "job-3", slack_workspace_name: "acme", raw_object_key: "k", upload_url: "https://minio/put", expires_in: 900, method: "PUT", headers: {} } })
    const controller = new AbortController()
    const upload = uploadSlackExportPresigned(file, "acme", "export_zip", undefined, controller.signal)
    await vi.waitFor(() => expect(xhrs).toHaveLength(1))
    controller.abort()
    await expect(upload).rejects.toMatchObject({ name: "AbortError" })
    expect(xhrs[0].aborted).toBe(true)
    // Only the presign was sent: the upload was never finalised.
    expect(post).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
