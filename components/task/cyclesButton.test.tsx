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

const { CyclesButton } = await import("@/components/task/cyclesButton")

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
