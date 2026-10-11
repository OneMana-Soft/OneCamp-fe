import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Cycle } from "@/lib/tasks/cycles"

const remove = vi.fn(async () => {})
const complete = vi.fn(async () => ({ done: 0, carried: 0 }))
let cycles: Cycle[] = []
const CYCLES: Cycle[] = [
  {
    id: "c3",
    project_uuid: "p",
    number: 3,
    name: "Launch week",
    starts_at: "2026-10-05T00:00:00+05:30",
    ends_at: "2026-10-19T00:00:00+05:30",
    state: "current",
    progress: { total: 5, started: 2, done: 1 },
  },
]
cycles = CYCLES
vi.mock("@/hooks/useProjectCycles", () => ({
  useProjectCycles: () => ({ cycles, canEdit: true, isLoading: false, create: vi.fn(), complete, rename: vi.fn(), remove, refresh: vi.fn() }),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/components/task/cycleBurndownDialog", () => ({ CycleBurndownDialog: () => null }))
const celebrateRing = vi.fn((_el: Element | null | undefined) => 10)
vi.mock("@/lib/celebrate", () => ({ celebrateRing: (el: Element | null | undefined) => celebrateRing(el) }))

const { CyclesButton, timeLeft } = await import("@/components/task/cyclesButton")

afterEach(() => {
  cleanup()
  remove.mockClear()
  toast.mockClear()
})

function openPopover() {
  render(<CyclesButton projectId="p" onShow={() => {}} />)
  fireEvent.click(screen.getByRole("button", { name: /Cycles/ }))
}

describe("deleting a cycle", () => {
  it("asks first, in red, saying the tasks stay and the burndown goes", () => {
    openPopover()
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch week" }))
    expect(remove).not.toHaveBeenCalled()
    const ask = screen.getByRole("group", { name: "Delete Launch week" })
    expect(ask.textContent).toContain("Delete Launch week?")
    expect(ask.textContent).toContain("Its 5 tasks stay in the project, in no cycle.")
    expect(ask.textContent).toContain("Its burndown is deleted with it, and this can't be undone.")
    const confirm = screen.getByRole("button", { name: "Delete cycle" })
    expect(confirm.className).toMatch(/destructive/)
  })

  it("deletes only when confirmed, and Cancel leaves it", async () => {
    openPopover()
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch week" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("group", { name: "Delete Launch week" })).toBeNull()
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Delete Launch week" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete cycle" })))
    expect(remove).toHaveBeenCalledWith("c3")
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Deleted Launch week" }))
  })
})

describe("a project with no cycles", () => {
  it("shows the calendar spot above what cycles are", () => {
    cycles = []
    render(<CyclesButton projectId="p" onShow={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Cycles/ }))
    const empty = document.querySelector("[data-cycles-empty]")!
    expect(empty.querySelector("svg.hue-lake")).toBeTruthy()
    expect(empty.textContent).toContain("Cycles are short, fixed stretches of work")
    cycles = CYCLES
  })
})

describe("the cycle chip and switcher (work.md W45)", () => {
  afterEach(() => {
    cycles = CYCLES
    celebrateRing.mockClear()
    complete.mockClear()
  })

  it("names the current cycle on the chip with a ring and the time left", () => {
    render(<CyclesButton projectId="p" onShow={() => {}} />)
    const chip = screen.getByRole("button", { name: /Cycles: Launch week/ })
    expect(chip.querySelector("[role=progressbar]")).not.toBeNull()
    expect(chip.textContent).toMatch(/Launch week\s*· (\d+ d left|Ends today|Ended)/)
  })

  it("puts the current cycle on a card at the top of the switcher", () => {
    openPopover()
    const card = document.querySelector("[data-current-cycle]")!
    expect(card.textContent).toContain("Launch week")
  })

  it("names where the unfinished tasks go before completing", () => {
    cycles = [...CYCLES, { ...CYCLES[0], id: "c4", number: 4, name: "", state: "upcoming", progress: { total: 0, started: 0, done: 0 } }]
    openPopover()
    fireEvent.click(screen.getAllByRole("button", { name: "Complete…" })[0])
    const ask = screen.getByRole("group", { name: "Complete Launch week" })
    expect(ask.textContent).toContain("4 unfinished tasks move to Cycle 4.")
  })

  it("celebrates once when a cycle completes with every task done", async () => {
    cycles = [{ ...CYCLES[0], progress: { total: 3, started: 0, done: 3 } }]
    openPopover()
    fireEvent.click(screen.getByRole("button", { name: "Complete…" }))
    expect(screen.getByRole("group", { name: "Complete Launch week" }).textContent).toContain("All 3 tasks are done.")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Complete" })))
    expect(celebrateRing).toHaveBeenCalledTimes(1)
  })

  it("says how the cycle stands in time", () => {
    const c = { starts_at: "2026-10-05T00:00:00Z", ends_at: "2026-10-14T00:00:00Z" }
    expect(timeLeft(c, Date.parse("2026-10-11T00:00:00Z"))).toBe("3 d left")
    expect(timeLeft(c, Date.parse("2026-10-01T00:00:00Z"))).toBe("Starts in 4 d")
    expect(timeLeft(c, Date.parse("2026-10-15T00:00:00Z"))).toBe("Ended")
  })
})
