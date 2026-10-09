import { describe, expect, it } from "vitest"
import { importProgressStale } from "./importLive"

describe("what an import's progress event makes stale", () => {
  it("keeps the Slack job list live on every tick", () => {
    const stale = importProgressStale("running")
    expect(stale("/admin/import/slack/jobs")).toBe(true)
    expect(stale("/admin/import/slack/jobs/abc")).toBe(true)
    expect(stale("/admin/import/providers")).toBe(false)
    expect(stale({ not: "a key" })).toBe(false)
  })

  // Every other provider's progress stood still: only Slack's list was
  // refreshed. A job's people aren't a progress tick's business.
  it("keeps every provider's job list live", () => {
    const stale = importProgressStale("running")
    expect(stale("/admin/import/jobs")).toBe(true)
    expect(stale("/admin/import/jobs?provider=jira")).toBe(true)
    expect(stale("/admin/import/jobs/abc/people")).toBe(false)
    expect(stale("/admin/import/jobs/abc/errors?limit=100")).toBe(false)
  })

  // The admin banner tells the admin who started an import how it ended; it
  // is asked again only when one has.
  it("refreshes how imports ended only when one ends", () => {
    expect(importProgressStale("running")("/admin/import/outcomes")).toBe(false)
    expect(importProgressStale(undefined)("/admin/import/outcomes")).toBe(false)
    for (const ended of ["completed", "failed", "cancelled", "rolled_back"]) {
      expect(importProgressStale(ended)("/admin/import/outcomes")).toBe(true)
    }
  })
})
