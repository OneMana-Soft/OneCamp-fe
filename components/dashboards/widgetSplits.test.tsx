import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// L32 (linear-32): a breakdown splits work every way the report slices it,
// and on one project's dashboard by that project's own fields too (a money
// field only for those who may manage the project's fields: its admins),
// counting tasks or their effort; a number may be the effort open or done.
// The widget draws a breakdown from its slices, the rows of a server before
// them kept as the fallback.

const fields = vi.fn()
vi.mock("@/hooks/useTaskViews", () => ({ useTaskViews: () => ({ views: [], isLoading: false }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: [{ project_uuid: "p1", project_name: "Spring fair" }], isLoading: false }) }))
vi.mock("@/hooks/useGoals", () => ({ useGoals: () => ({ goals: [], isLoading: false }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: (...a: unknown[]) => fields(...a) }))

import { DashboardWidget } from "@/components/dashboards/DashboardWidget"
import { WidgetDialog } from "@/components/dashboards/WidgetDialog"
import type { InsightSlice, Spread } from "@/lib/reports"

const vendor = { id: "f1", project_id: "p1", name: "Vendor", type: "text", options: [] }
const budget = { id: "f2", project_id: "p1", name: "Budget", type: "money", options: [] }

function choose(box: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: box }))
  fireEvent.click(screen.getByRole("option", { name: option }))
}
const options = (box: string) => {
  fireEvent.click(screen.getByRole("combobox", { name: box }))
  const all = screen.getAllByRole("option").map((o) => o.textContent)
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
  return all
}

afterEach(() => {
  cleanup()
  fields.mockReset()
})

describe("a breakdown's choices (L32)", () => {
  it("splits every way the report does, and on a project's dashboard by its fields, a money field for its admins alone", async () => {
    // The server marks a member's money field hidden (V-698), as it does here.
    fields.mockReturnValue({ fields: [vendor, { ...budget, hidden: true }], canEdit: false })
    const save = vi.fn().mockResolvedValue(undefined)
    render(<WidgetDialog project="p1" others={false} preset={{ kind: "breakdown", query: {} }} onSave={save} onClose={() => {}} />)
    expect(fields).toHaveBeenLastCalledWith("p1")
    expect(options("Split")).toEqual(["By project", "By person", "By priority", "By type", "By status", "By labels", "By cycle", "By estimate", "By Vendor"])
    expect(options("Measure")).toEqual(["Count", "Effort"])
    choose("Split", "By Vendor")
    choose("Measure", "Effort")
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    // Named after its field: the widget's data names only the field's values.
    expect(save.mock.calls[0][0]).toMatchObject({ kind: "breakdown", title: "By Vendor", query: { by: "field:f1", measure: "effort" } })
  })

  it("offers a money field to one who may manage the project's fields, and no fields across projects", () => {
    fields.mockReturnValue({ fields: [budget], canEdit: true })
    render(<WidgetDialog project="p1" others={false} preset={{ kind: "breakdown", query: {} }} onSave={vi.fn()} onClose={() => {}} />)
    expect(options("Split")).toContain("By Budget")
    cleanup()
    fields.mockReturnValue({ fields: [], canEdit: false })
    render(<WidgetDialog others={false} preset={{ kind: "breakdown", query: {} }} onSave={vi.fn()} onClose={() => {}} />)
    expect(fields).toHaveBeenLastCalledWith(undefined)
  })

  // V-698W: the server decides which of a project's fields its reader may
  // read; one it hides (a money field, to anyone not an admin of its project)
  // is never a split, whatever its type, and one it doesn't hide always is.
  it("never splits by a field the server hides from its reader, and always by one it doesn't (V-698W)", () => {
    fields.mockReturnValue({ fields: [{ ...vendor, hidden: true }, { ...budget, hidden: false }], canEdit: true })
    render(<WidgetDialog project="p1" others={false} preset={{ kind: "breakdown", query: {} }} onSave={vi.fn()} onClose={() => {}} />)
    const splits = options("Split")
    expect(splits).not.toContain("By Vendor")
    expect(splits).toContain("By Budget")
  })

  it("offers a number of the effort open or done", () => {
    fields.mockReturnValue({ fields: [], canEdit: false })
    render(<WidgetDialog others={false} onSave={vi.fn()} onClose={() => {}} />)
    expect(options("Number")).toEqual(expect.arrayContaining(["Effort open", "Effort done"]))
  })
})

const none: Spread = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
const slice = (key: string, name: string, more: Partial<InsightSlice>): InsightSlice => ({ by: "cycle", key, name, cycle: none, lead: none, age: none, ...more })
const effort = (open: number, done: number) => ({ open: { points: open, hours: 0 }, done: { points: done, hours: 0 } })

describe("a breakdown widget (L32)", () => {
  const widget = (measure: string) => ({ id: "w1", kind: "breakdown" as const, title: "", query: { by: "cycle" as const, measure: measure as "effort" }, x: 0, y: 0, w: 6, h: 4 })
  const slices = [slice("", "", { open: 1, overdue: 0, done: 0, effort: effort(2, 0) }), slice("c7", "Cycle 7", { open: 2, overdue: 1, done: 3, effort: effort(5, 8) })]

  it("draws its slices' effort, the busiest first, the work with no cycle named", () => {
    render(<DashboardWidget widget={widget("effort")} result={{ id: "w1", kind: "breakdown", data: { by: "cycle", measure: "effort", slices } }} loading={false} now={0} />)
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Cycle", "Effort open", "Effort done"])
    expect(within(table).getAllByRole("row").slice(1).map((r) => r.textContent)).toEqual(["Cycle 75 pt8 pt", "No cycle2 pt0 pt"])
  })

  it("counts its slices' tasks, and draws a server's rows before slices", () => {
    render(<DashboardWidget widget={widget("count")} result={{ id: "w1", kind: "breakdown", data: { by: "cycle", measure: "count", slices } }} loading={false} now={0} />)
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Cycle", "Open", "Overdue", "Done"])
    expect(screen.getAllByRole("row")[1].textContent).toBe("Cycle 7213")
    cleanup()
    const old = { ...widget(""), query: { by: "priority" as const } }
    render(<DashboardWidget widget={old} result={{ id: "w1", kind: "breakdown", data: { by: "priority", rows: [{ priority: "high", open: 2, overdue: 1 }] } }} loading={false} now={0} />)
    expect(screen.getAllByRole("row")[1].textContent).toBe("High21")
  })
})
