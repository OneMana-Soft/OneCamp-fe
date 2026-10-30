import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/**
 * L-1: a phone's sort sheet offers Manual, the project's one order (the
 * board's too), as the desktop's Display menu does: picking it stores no sort,
 * which the list reads as Manual. A list with no sort shows Manual picked.
 */

type Sort = { id: string; desc: boolean }
let stored: { sort: Sort[]; filters: { id: string; value: string[] }[] } | undefined
const dispatched: { type: string; payload: { sort: Sort[] } }[] = []
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) => pick({ taskFilter: { projectsSortingAndFilter: { p: stored } } }),
  useDispatch: () => (a: (typeof dispatched)[number]) => dispatched.push(a),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/hooks/useProjectCycles", () => ({ useProjectCycles: () => ({ cycles: [] }) }))
vi.mock("@/components/task/savedTaskViews", () => ({ SavedTaskViewsPanel: () => null }))

const { ProjectTaskFilterDrawer } = await import("@/components/drawers/projectTaskFilterDrawer")

afterEach(() => {
  cleanup()
  dispatched.length = 0
  stored = undefined
})

const open = () => render(<ProjectTaskFilterDrawer drawerOpenState setOpenState={vi.fn()} projectId="p" />)
const radio = (name: string) => screen.getByRole("radio", { name })

describe("a phone's sort sheet", () => {
  it("offers Manual first, picked when the list has no sort", async () => {
    open()
    const manual = await waitFor(() => radio("Manual"))
    expect(manual.getAttribute("aria-checked")).toBe("true")
    expect(screen.getAllByRole("radio")[0]).toBe(manual)
  })

  it("stores no sort when Manual is applied, so the list reads the project's order", async () => {
    stored = { sort: [{ id: "task_due_date", desc: false }], filters: [] }
    open()
    await waitFor(() => expect(radio("Due date, earliest first").getAttribute("aria-checked")).toBe("true"))
    fireEvent.click(radio("Manual"))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(dispatched.at(-1)?.payload.sort).toEqual([]))
  })

  it("names each order in sentence case, by its date and what comes first", async () => {
    open()
    await waitFor(() => radio("Manual"))
    const names = ["Manual", "Start date, earliest first", "Start date, latest first", "Due date, earliest first", "Due date, latest first", "Created, oldest first", "Created, newest first"]
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(names.length)
    names.forEach((name, i) => expect(radio(name)).toBe(radios[i]))
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument()
  })

  it("keeps another sort as it was chosen", async () => {
    open()
    await waitFor(() => radio("Manual"))
    fireEvent.click(radio("Due date, latest first"))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(dispatched.at(-1)?.payload.sort).toEqual([{ id: "task_due_date", desc: true }]))
  })
})
