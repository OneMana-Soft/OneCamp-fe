import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// B9-b4 (asana-08: widgets "over saved queries"): a widget's source may be one
// of the reader's saved views, picked by its list (My Tasks or a project's;
// on a project's dashboard, that project's alone). It keeps the view's id and
// none of its filters. On a dashboard others open, the editor says only its
// keeper will see the numbers (V-557: a saved view is its owner's alone).
// Add to dashboard (from Reports, from a saved view) is the same editor with
// the dashboards the reader keeps above it.

const views = vi.fn()
vi.mock("@/hooks/useTaskViews", () => ({ useTaskViews: (...a: unknown[]) => views(...a) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: [{ project_uuid: "p1", project_name: "Spring fair" }], isLoading: false }) }))
vi.mock("@/hooks/useGoals", () => ({ useGoals: () => ({ goals: [], isLoading: false }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [], canEdit: false }) }))
const lists = vi.fn()
const addWidgetTo = vi.fn()
vi.mock("@/hooks/useDashboards", () => ({ useDashboardLists: (...a: unknown[]) => lists(...a), addWidgetTo: (...a: unknown[]) => addWidgetTo(...a) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))

import { useState } from "react"
import { AddToDashboard } from "@/components/dashboards/AddToDashboard"
import { WidgetDialog } from "@/components/dashboards/WidgetDialog"
import { watchInputModality } from "@/lib/ui/inputModality"

const launch = { id: "v1", scope: "mine", name: "Launch work", state: { filters: [], sort: [] } }
const mine = { id: "d1", scope: "mine", name: "Weekly review", shared: false, created_by: "u", created_at: "", updated_at: "" }
const team = { ...mine, id: "d2", scope: "workspace", name: "Team pulse", shared: true }

function choose(box: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: box }))
  fireEvent.click(screen.getByRole("option", { name: option }))
}

const note = /only you will see this widget's numbers/i

beforeEach(() => {
  views.mockReset()
  views.mockReturnValue({ views: [launch], isLoading: false })
  lists.mockReset()
  addWidgetTo.mockReset()
  addWidgetTo.mockResolvedValue({ id: "w9" })
  toast.mockReset()
})
afterEach(cleanup)

describe("a widget over a saved view", () => {
  it("reads one of the reader's views, by its list, and keeps its id alone", async () => {
    const onSave = vi.fn(async () => undefined)
    render(<WidgetDialog others={false} onSave={onSave} onClose={() => {}} />)
    choose("Reads", "A saved view")
    expect(views).toHaveBeenLastCalledWith("mine", true)
    choose("List", "Spring fair")
    expect(views).toHaveBeenLastCalledWith("project:p1", true)
    choose("Saved view", "Launch work")
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({ kind: "metric", title: "", query: { view: "v1", weeks: 12, measure: "open" }, w: 3, h: 2 })
  })

  it("on a project's dashboard, offers that project's views alone", () => {
    render(<WidgetDialog project="p1" others onSave={vi.fn()} onClose={() => {}} />)
    choose("Reads", "A saved view")
    expect(screen.queryByRole("combobox", { name: "List" })).toBeNull()
    expect(views).toHaveBeenLastCalledWith("project:p1", true)
  })

  it("says only its keeper sees the numbers on a dashboard others open", () => {
    const { unmount } = render(<WidgetDialog others onSave={vi.fn()} onClose={() => {}} />)
    expect(screen.queryByText(note)).toBeNull()
    choose("Reads", "A saved view")
    expect(screen.getByText(note)).toBeTruthy()
    unmount()
    render(<WidgetDialog others={false} onSave={vi.fn()} onClose={() => {}} />)
    choose("Reads", "A saved view")
    expect(screen.queryByText(note)).toBeNull()
  })

  it("asks for a view while none is picked, and says when the list has none or is loading", () => {
    views.mockReturnValue({ views: [], isLoading: false })
    const { rerender } = render(<WidgetDialog others={false} onSave={vi.fn()} onClose={() => {}} />)
    choose("Reads", "A saved view")
    expect(screen.getByText(/No saved views in this list yet/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Add widget" }) as HTMLButtonElement).disabled).toBe(true)
    views.mockReturnValue({ views: [], isLoading: true })
    rerender(<WidgetDialog others={false} onSave={vi.fn()} onClose={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Saved view" }).textContent).toContain("Loading views…")
  })

  it("keeps the view a widget reads when it's edited, named when the reader may read it", async () => {
    const onSave = vi.fn(async () => undefined)
    const editing = { id: "w1", kind: "flow" as const, title: "Launch flow", query: { view: "v9", weeks: 4 }, x: 0, y: 0, w: 6, h: 4 }
    const { unmount } = render(<WidgetDialog editing={editing} viewName="Launch work" others={false} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByText("Launch work")).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Saved view" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({ kind: "flow", title: "Launch flow", query: { view: "v9", weeks: 4 }, w: 6, h: 4 })
    unmount()
    // Another keeper's view: not named, and kept unless one of the reader's own is chosen.
    render(<WidgetDialog editing={editing} others onSave={onSave} onClose={() => {}} />)
    expect(screen.getByText("A saved view only its owner can see")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Choose another view" }))
    expect(screen.getByRole("combobox", { name: "Saved view" })).toBeTruthy()
  })
})

describe("Add to dashboard", () => {
  const kept = (over: Record<string, unknown> = {}) => ({
    lists: { mine: [mine], workspace: [team], project: [], canMake: true },
    isLoading: false,
    isError: false,
    refresh: vi.fn(),
    create: vi.fn(async () => ({ ...mine, id: "d3", name: "My dashboard" })),
    ...over,
  })

  it("adds a saved view's widget to a dashboard the reader keeps, in its next place", async () => {
    lists.mockReturnValue(kept())
    render(<AddToDashboard preset={{ kind: "throughput", query: { view: "v1" } }} viewName="Launch work" onClose={() => {}} />)
    expect(screen.getByText("Launch work")).toBeTruthy()
    expect(screen.queryByText(note)).toBeNull()
    choose("Dashboard", "Team pulse")
    expect(screen.getByText(note)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(addWidgetTo).toHaveBeenCalled())
    expect(addWidgetTo).toHaveBeenCalledWith("d2", { kind: "throughput", title: "", query: { view: "v1", weeks: 12 }, w: 6, h: 4 })
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect((toast.mock.calls[0][0] as { title: string }).title).toBe("Added to Team pulse")
  })

  it("adds a report's question as it stands: its projects, filters and weeks", async () => {
    lists.mockReturnValue(kept())
    const filters = [{ id: "task_priority", value: ["high"] }]
    render(<AddToDashboard preset={{ kind: "flow", query: { projects: ["p1"], filters, weeks: 4 } }} project="p1" onClose={() => {}} />)
    expect(lists).toHaveBeenCalledWith("p1")
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(addWidgetTo).toHaveBeenCalled())
    expect(addWidgetTo).toHaveBeenCalledWith("d1", { kind: "flow", title: "", query: { projects: ["p1"], filters, weeks: 4 }, w: 6, h: 4 })
  })

  it("makes the reader a dashboard of their own when they keep none", async () => {
    const answer = kept({ lists: { mine: [], workspace: [team], project: [], canMake: false } })
    lists.mockReturnValue(answer)
    render(<AddToDashboard preset={{ query: { weeks: 12 } }} onClose={() => {}} />)
    expect(screen.getByText(/You keep no dashboard yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(addWidgetTo).toHaveBeenCalled())
    expect(answer.create).toHaveBeenCalledWith({ name: "My dashboard", scope: "mine", shared: false })
    expect(addWidgetTo.mock.calls[0][0]).toBe("d3")
  })

  // CR-B14 M3: a project's dashboard reads its own project, but picking one
  // keeps the editor drawn: no flash, what was chosen and typed stays, and a
  // key's close still gives the focus back to the way in.
  const fair = { ...mine, id: "d4", scope: "project", project_id: "p1", name: "Fair board", shared: true }
  const withFair = () => lists.mockImplementation((p?: string) => (p ? kept({ lists: { mine: [], workspace: [], project: [fair], canMake: true } }) : kept()))

  it("keeps the editor and what was typed when a project's dashboard is picked, and a key's close gives the focus back", async () => {
    withFair()
    watchInputModality()
    function Reports() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Add to dashboard
          </button>
          {open && <AddToDashboard preset={{ kind: "flow", query: { projects: ["p1"], weeks: 4 } }} project="p1" onClose={() => setOpen(false)} />}
        </>
      )
    }
    render(<Reports />)
    const wayIn = screen.getByRole("button", { name: "Add to dashboard" })
    wayIn.focus()
    fireEvent.click(wayIn)
    const dialog = screen.getByRole("dialog")
    choose("Shows", "Control chart")
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fair cycle" } })
    choose("Dashboard", "Fair board")
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(screen.getByRole("combobox", { name: "Shows" }).textContent).toBe("Control chart")
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Fair cycle")
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Dashboard" }), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(wayIn))
  })

  it("asks again for a view picked here when the dashboard's project changes, and adds to that project's dashboard", async () => {
    withFair()
    render(<AddToDashboard preset={{ kind: "flow", query: { weeks: 4 } }} project="p1" onClose={() => {}} />)
    choose("Reads", "A saved view")
    choose("Saved view", "Launch work")
    choose("Dashboard", "Fair board")
    expect(views).toHaveBeenLastCalledWith("project:p1", true)
    expect(screen.getByRole("combobox", { name: "Reads" }).textContent).toBe("A saved view")
    expect((screen.getByRole("button", { name: "Add widget" }) as HTMLButtonElement).disabled).toBe(true)
    choose("Saved view", "Launch work")
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(addWidgetTo).toHaveBeenCalled())
    expect(addWidgetTo).toHaveBeenCalledWith("d4", { kind: "flow", title: "", query: { view: "v1", weeks: 4 }, w: 6, h: 4 })
  })

  // The permission model (CR-B14 W6): a project's dashboards are offered only to one who keeps them there.
  it("offers a project's dashboards to one who keeps them, and only to them", () => {
    lists.mockImplementation((p?: string) => (p ? kept({ lists: { mine: [], workspace: [], project: [fair], canMake: false } }) : kept()))
    render(<AddToDashboard preset={{ query: { weeks: 4 } }} project="p1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("combobox", { name: "Dashboard" }))
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Weekly review", "Team pulse"])
    cleanup()
    withFair()
    render(<AddToDashboard preset={{ query: { weeks: 4 } }} project="p1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("combobox", { name: "Dashboard" }))
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Weekly review", "Team pulse", "Fair board"])
  })

  it("says when the dashboards can't be read, and while they load", () => {
    const answer = kept({ lists: undefined, isError: true })
    lists.mockReturnValue(answer)
    const { rerender } = render(<AddToDashboard preset={{ query: {} }} onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(answer.refresh).toHaveBeenCalled()
    lists.mockReturnValue(kept({ lists: undefined, isLoading: true }))
    rerender(<AddToDashboard preset={{ query: {} }} onClose={() => {}} />)
    expect(screen.getByText("Loading your dashboards…")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Add widget" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
