import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  OWN_ERRORS: { suppressErrorToast: true },
}))

import axiosInstance from "@/lib/axiosInstance"
import { deleteStagedZip, planSlackImport, rollbackSlackImport, runSlackImport } from "./slackImportService"
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
