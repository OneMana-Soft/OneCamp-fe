import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  OWN_ERRORS: { suppressErrorToast: true },
}))

import axiosInstance from "@/lib/axiosInstance"
import { runSlackImport } from "./slackImportService"
import { PostEndpointUrl } from "@/services/endPoints"

const post = (axiosInstance as unknown as { post: ReturnType<typeof vi.fn> }).post

beforeEach(() => post.mockReset())

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
