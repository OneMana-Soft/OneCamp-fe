import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

// lib/tasks/workFeed is the ONE chunk hooks/useWorkChanges loads (WCL-2). A
// lazy chunk imports no shared code (LEAD-RULES 30 Oct 00:13: reaching the
// shared core from a new chunk group re-cuts the shared chunks for every
// route), and the Offline Store reaches it through lib/offline/wipe, so the
// app hands the feed its client, its patchers and the store its place is
// kept in (CR-124, row 2106).

const { startWorkFeed } = await import("@/lib/tasks/workFeed")

const patchers = () => ({ updateTasks: vi.fn(), moveTask: vi.fn(), setTaskField: vi.fn(), deleteTask: vi.fn(), rereadProject: vi.fn() })

describe("the work feed as the app starts it", () => {
  it("reads on from the place kept in the store the app hands it, and keeps the new place there", async () => {
    const kept: { place: string | undefined } = { place: "41" }
    const place = {
      loadCursor: vi.fn(async () => kept.place),
      saveCursor: vi.fn(async (cursor: string) => {
        kept.place = cursor
      }),
    }
    const get = vi.fn(async () => ({ data: { data: { entries: [], cursor: "42" } } }))
    const { feed } = startWorkFeed({ get, patchers, rereadAll: vi.fn(), place })

    await feed.catchUp()

    expect(place.loadCursor).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith("/work/changes", expect.objectContaining({ params: { cursor: "41", limit: 500 } }))
    expect(kept.place).toBe("42")
  })

  it("imports only the feed's own pure code, so its chunk reaches nothing every route shares", () => {
    const imports = (file: string) =>
      [...readFileSync(join(process.cwd(), file), "utf8").matchAll(/^import\s[^"']*["']([^"']+)["']/gm)].map((m) => m[1])
    expect(imports("lib/tasks/workFeed.ts")).toEqual(["@/lib/tasks/workChanges"])
    expect(imports("lib/tasks/workChanges.ts")).toEqual([])
  })
})
