import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

// B3b, the Cycle Scheduler: what the backlog says of a schedule, and what it
// sends. A day picked in the browser goes as midnight where the person is,
// as an RFC 3339 moment (the server's time.Time reads nothing else).

const post = vi.fn<(...a: unknown[]) => Promise<{ data: object }>>(async () => ({ data: {} }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))

const { scheduleLine, saveSchedule, stopSchedule, createCycle } = await import("@/lib/work/backlog")

pinTestClock()
afterEach(() => post.mockClear())

const midnight = (day: string) => new Date(`${day}T00:00:00`).toISOString()

describe("a cycle schedule", () => {
  it("says itself in one line", () => {
    expect(scheduleLine({ weeks: 2, cooldown_weeks: 0, upcoming: 2, roll_over: true, add_started: false, starts_at: "" })).toBe("Every 2 weeks · 2 ready ahead · unfinished tasks move on")
    expect(scheduleLine({ weeks: 1, cooldown_weeks: 1, upcoming: 1, roll_over: false, add_started: false, starts_at: "" })).toBe("Every week, then a week off · 1 ready ahead · unfinished tasks go back to the backlog")
  })

  it("saves the person's choice, the first day as midnight where they are", async () => {
    await saveSchedule("p1", { weeks: 3, cooldown_weeks: 1, upcoming: 4, roll_over: false, add_started: false, starts_at: "2026-10-26" })
    expect(post).toHaveBeenCalledWith(
      "/project/p1/cycles/schedule",
      { weeks: 3, cooldown_weeks: 1, upcoming: 4, roll_over: false, add_started: false, starts_at: midnight("2026-10-26") },
      expect.anything(),
    )
  })

  it("stops", async () => {
    await stopSchedule("p1")
    expect(post).toHaveBeenCalledWith("/project/p1/cycles/schedule/stop", {}, expect.anything())
  })

  it("makes a cycle from a picked day as a moment the server reads", async () => {
    await createCycle("p1", "2026-10-19")
    expect(post).toHaveBeenCalledWith("/project/p1/cycles", { name: "", starts_at: midnight("2026-10-19"), weeks: 2 }, expect.anything())
  })
})
