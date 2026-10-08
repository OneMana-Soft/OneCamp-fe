import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { BurndownView } from "@/lib/tasks/cycles"

const view: BurndownView = {
  cycle: { id: "c4", project_uuid: "p", number: 4, name: "", starts_at: "2026-10-05T00:00:00+05:30", ends_at: "2026-10-19T00:00:00+05:30", state: "current" },
  burndown: {
    days: Array.from({ length: 14 }, (_, i) => `2026-10-${String(5 + i).padStart(2, "0")}`),
    scope: [5, 5, 6, 6],
    remaining: [5, 4, 5, 6],
    ideal: Array.from({ length: 14 }, (_, i) => Math.round((50 * (13 - i)) / 13) / 10),
    scope_hours: [10, 10, 12, 12],
    remaining_hours: [10, 8, 10, 6],
    ideal_hours: Array.from({ length: 14 }, (_, i) => Math.round((100 * (13 - i)) / 13) / 10),
    tasks: 6,
    done: 0,
    open: 6,
    estimated: 5,
    hours: 12,
  },
  velocity: { cycles: [{ id: "c3", number: 3, name: "", done: 4, done_hours: 9, unfinished: 1 }], typical: 4, typical_hours: 9 },
}

let answer: { data?: { data: BurndownView }; isError?: unknown } = { data: { data: view } }
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { ...answer, isLoading: false, mutate: vi.fn() }
  },
}))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata", localDay: () => "2026-10-08" }))

const { CycleBurndown } = await import("@/components/task/cycleBurndownDialog")

afterEach(() => {
  cleanup()
  asked.length = 0
  answer = { data: { data: view } }
})

describe("CycleBurndown", () => {
  it("shows the cycle against the ideal pace, and what recent cycles finished", () => {
    render(<CycleBurndown projectId="p" cycleId="c4" />)
    expect(asked[0]).toBe("/project/p/cycles/c4/burndown?tz=Asia%2FKolkata")
    expect(screen.getByText(/^Behind pace: 6 tasks left/)).toBeTruthy()
    expect(screen.getByText("The last cycle finished 4 tasks; this one holds 6 tasks.")).toBeTruthy()
    expect(screen.getByText("Ideal pace")).toBeTruthy()
    // The stat and the legend share the name.
    expect(screen.getAllByText("Still to do")).toHaveLength(2)
  })

  it("counts in hours when tasks have estimates", () => {
    render(<CycleBurndown projectId="p" cycleId="c4" />)
    fireEvent.click(screen.getByRole("button", { name: "hours" }))
    expect(screen.getByRole("button", { name: "hours" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText(/^On pace: 6 h left/)).toBeTruthy()
    expect(screen.getByText("The last cycle finished 9 h; this one holds 12 h.")).toBeTruthy()
  })

  it("offers no hours when nothing is estimated", () => {
    answer = { data: { data: { ...view, burndown: { ...view.burndown, estimated: 0, scope_hours: undefined, remaining_hours: undefined, ideal_hours: undefined } } } }
    render(<CycleBurndown projectId="p" cycleId="c4" />)
    expect(screen.queryByRole("group", { name: "Count in" })).toBeNull()
  })

  it("says what to do with an empty cycle, and before any cycle is completed", () => {
    answer = { data: { data: { ...view, burndown: { ...view.burndown, tasks: 0, open: 0, scope: [0], remaining: [0] }, velocity: { cycles: [] } } } }
    render(<CycleBurndown projectId="p" cycleId="c4" />)
    expect(screen.getByText(/No tasks in this cycle yet/)).toBeTruthy()
    expect(screen.getByText(/Once a cycle is completed/)).toBeTruthy()
  })

  it("offers a retry when it can't load", () => {
    answer = { data: undefined, isError: new Error("down") }
    render(<CycleBurndown projectId="p" cycleId="c4" />)
    expect(screen.getByText(/Couldn't load the burndown/)).toBeTruthy()
  })
})
