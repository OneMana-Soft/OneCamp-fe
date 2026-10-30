import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { behindFirst, daysLeftWords, doneWords, paceWords, type RunningCycle } from "@/lib/work/runningCycles"

// Cycles across projects (linear-12, part 3): every project's running cycle
// in one list, as GET /project/cycles/running answers it for the reader.

const hoisted = vi.hoisted(() => ({ answer: undefined as unknown, error: undefined as unknown, loading: false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: key === "/project/cycles/running" ? hoisted.answer : undefined, isLoading: hoisted.loading, isError: hoisted.error, mutate: vi.fn() }),
}))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

const { RunningCycles } = await import("@/components/work/RunningCycles")

pinTestClock(new Date("2026-10-28T10:00:00Z"))

const cycle = (over: Partial<RunningCycle>): RunningCycle => ({
  id: "c1",
  project_uuid: "p1",
  project_name: "Launch",
  number: 3,
  name: "",
  starts_at: "2026-10-21T00:00:00Z",
  ends_at: "2026-11-04T00:00:00Z",
  progress: { total: 8, started: 2, done: 4 },
  state: "current",
  elapsed: 0.5,
  days_left: 7,
  pace: "on_track",
  ...over,
})

afterEach(() => {
  cleanup()
  hoisted.answer = undefined
  hoisted.error = undefined
  hoisted.loading = false
})

describe("the running cycles' words", () => {
  it("says the pace, the days left and what's done", () => {
    expect(paceWords("behind")).toEqual({ label: "Behind", tone: "sun" })
    expect(paceWords("on_track")).toEqual({ label: "On track" })
    expect(paceWords("empty").label).toBe("No tasks yet")
    expect(daysLeftWords(0)).toBe("Ends today")
    expect(daysLeftWords(1)).toBe("1 day left")
    expect(daysLeftWords(5)).toBe("5 days left")
    expect(doneWords({ total: 9, done: 4 })).toBe("4 of 9 done")
    expect(doneWords({ total: 0, done: 0 })).toBe("No tasks")
  })

  it("puts the cycles behind first and keeps the server's order otherwise", () => {
    const a = cycle({ id: "a" }), b = cycle({ id: "b", pace: "behind" }), c = cycle({ id: "c" }), d = cycle({ id: "d", pace: "behind" })
    expect(behindFirst([a, b, c, d]).map((x) => x.id)).toEqual(["b", "d", "a", "c"])
  })
})

describe("RunningCycles", () => {
  it("lists each project's cycle with its progress, the ones behind first, each opening the project's Backlog", () => {
    hoisted.answer = { data: { cycles: [cycle({}), cycle({ id: "c2", project_uuid: "p2", project_name: "Billing", name: "Polish", pace: "behind", progress: { total: 10, started: 1, done: 1 } })] } }
    render(<RunningCycles />)
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Billing"), expect.stringContaining("Launch")])
    expect(within(rows[0]).getByText("Polish")).toBeTruthy()
    expect(within(rows[0]).getByText("Behind")).toBeTruthy()
    expect(within(rows[1]).getByText("Cycle 3")).toBeTruthy()
    expect(within(rows[1]).getByText("4 of 8 done")).toBeTruthy()
    expect(within(rows[1]).getByText("7 days left")).toBeTruthy()
    expect(rows[1].getAttribute("href")).toBe("/app/project/p1?tab=backlog")
    expect(screen.getByText(/2 cycles running/)).toBeTruthy()
    expect(screen.getByText("1 behind")).toBeTruthy()
    // The bar marks how much of the cycle's time has gone.
    expect(within(rows[1]).getByRole("progressbar").getAttribute("aria-label")).toBe("Launch, Cycle 3: 50% done, 50% of its time gone")
  })

  it("lists them as rows on a phone", () => {
    hoisted.answer = { data: { cycles: [cycle({})] } }
    render(<RunningCycles compact />)
    expect(screen.getByRole("list", { name: "Running cycles" })).toBeTruthy()
    expect(screen.getByText(/Cycle 3 · 7 days left · 4 of 8 done/)).toBeTruthy()
  })

  it("says so when no cycle is running", () => {
    hoisted.answer = { data: { cycles: [] } }
    render(<RunningCycles />)
    expect(screen.getByText("No cycles running")).toBeTruthy()
  })

  it("holds four rows' place while the list is read, at a cycle row's height on a desk and on a phone", () => {
    hoisted.loading = true
    const { unmount } = render(<RunningCycles />)
    // The summary line, the header row at a desk, then four rows.
    const desk = screen.getByRole("status", { name: "Loading cycles" })
    expect(desk.children).toHaveLength(6)
    expect(desk.children[0].className).toContain("py-3")
    expect(desk.children[1].className).toContain("h-8")
    expect(desk.children[2].className).toContain("h-[56px]")
    unmount()
    // A phone's rows are two lines over a full-width bar, under the summary line.
    render(<RunningCycles compact />)
    const phone = screen.getByRole("status", { name: "Loading cycles" })
    expect(phone.children).toHaveLength(5)
    expect(phone.children[0].className).toContain("py-3")
    expect(phone.children[1].className).toContain("min-h-[72px]")
    expect(phone.children[1].querySelector(".w-full")).toBeTruthy()
  })

  it("offers a retry when the list can't load", () => {
    hoisted.error = new Error("down")
    render(<RunningCycles />)
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy()
  })
})
