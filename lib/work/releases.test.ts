import { describe, expect, it } from "vitest"
import { NO_RELEASE, TASK_RELEASE, releaseFilterOptions, releaseFilterWords, stageLine, stageWords } from "./releases"
import { boardFilters } from "@/lib/board/boardQuery"
import { SERVER_FILTERS } from "@/hooks/useProjectTaskColumn"

describe("a release stage in a person's words (P10-1b web, design F1)", () => {
  it("reads each known build status per kind", () => {
    const build = (status: string) => stageWords({ kind: "build", status })
    expect(["success", "completed", "failure", "timed_out", "in_progress", "queued", "pending", "cancelled", "canceled"].map(build)).toEqual([
      "passed", "passed", "failed", "failed", "running", "queued", "queued", "cancelled", "cancelled",
    ])
  })

  it("reads each known deploy status per kind", () => {
    const deploy = (status: string) => stageWords({ kind: "deploy", status })
    expect(["success", "active", "failure", "error", "in_progress", "queued", "pending"].map(deploy)).toEqual([
      "live", "live", "failed", "failed", "deploying", "queued", "queued",
    ])
  })

  it("falls back to the provider's own word, underscores as spaces, for a status it doesn't know", () => {
    expect(stageWords({ kind: "deploy", status: "inactive" })).toBe("inactive")
    expect(stageWords({ kind: "build", status: "action_required" })).toBe("action required")
    expect(stageWords({ kind: "build", status: "SUCCESS" })).toBe("passed")
  })

  it("writes the line in sentence case and keeps the name's own capitals", () => {
    expect(stageLine({ kind: "build", status: "success", name: "CI" })).toBe("CI passed")
    expect(stageLine({ kind: "deploy", status: "in_progress", name: "staging" })).toBe("Staging deploying")
    expect(stageLine({ kind: "deploy", status: "failure", name: "production" })).toBe("Production failed")
  })
})

// jira-04 Head B: the Release filter (ids, and "none" for tasks in no
// release), which the list, the boards and saved views send as the server
// reads it, beside the cycle's.
describe("the Release filter", () => {
  const rows = [
    { id: "r2", name: "v2.5" },
    { id: "r1", name: "v2.4" },
  ]

  it("offers No release first, then the project's releases", () => {
    expect(releaseFilterOptions(rows)).toEqual([
      { id: "none", label: "No release" },
      { id: "r2", label: "v2.5" },
      { id: "r1", label: "v2.4" },
    ])
  })

  it("names what's chosen, a release no longer listed as a release", () => {
    expect(releaseFilterWords(["none", "r1", "gone"], rows)).toBe("No release, v2.4, a release")
  })

  it("is a filter the server applies, carried by a column the list never draws", () => {
    expect(TASK_RELEASE).toBe("task_release")
    expect(NO_RELEASE).toBe("none")
    expect(SERVER_FILTERS).toContain("task_release")
    expect(boardFilters([{ id: TASK_RELEASE, value: [NO_RELEASE, "r1"] }], "")).toEqual([{ id: "task_release", value: ["none", "r1"] }])
  })
})
