import { describe, expect, it } from "vitest"
import { keepsOwnChange, loadLastView, mayChangeView, openingView, sameViewState, saveLastView, viewStateOf, type ViewState } from "@/lib/tables/savedViews"
import { DEFAULT_DISPLAY } from "@/lib/tables/display"
import type { TableField, TableView } from "@/services/tableService"

const fields: TableField[] = [
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: "{}", position: 0 },
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 1 },
]
const view = (over: Partial<TableView>): TableView => ({ id: "v1", table_id: "t", name: "Pipeline", type: "grid", config: "{}", position: 0, ...over })
const state = (over: Partial<ViewState> = {}): ViewState => ({
  layout: "grid",
  rules: { sort: [], filters: [], match: "all" },
  display: { rowHeight: "medium", hidden: [], summary: {}, widths: {}, boardGroup: null, colors: null },
  ...over,
})

describe("a saved view", () => {
  it("shows its layout, its rules and how it draws, made good against the table's fields now", () => {
    const config = {
      rules: {
        sort: [
          { field: "notes", dir: "desc" },
          { field: "gone", dir: "asc" },
        ],
        // Anyone who manages the table writes a shared view: a filter whose value isn't words is left out.
        filters: [
          { field: "notes", op: "contains", value: "call" },
          { field: "notes", op: "contains", value: { not: "words" } },
        ],
        match: "any",
      },
      // A summary names one of the grid's functions, or is left out.
      display: { rowHeight: "tall", hidden: ["stage"], list: true, summary: { notes: "count", stage: "drop table" }, widths: { notes: 300 } },
    }
    expect(viewStateOf(view({ type: "board", config: JSON.stringify(config) }), fields)).toEqual(
      state({
        layout: "board",
        rules: { sort: [{ field: "notes", dir: "desc" }], filters: [{ field: "notes", op: "contains", value: "call" }], match: "any" },
        display: { rowHeight: "tall", hidden: ["stage"], summary: { notes: "count" }, widths: { notes: 300 }, boardGroup: null, colors: null },
      }),
    )
  })

  it("that holds nothing it can read shows the table as it draws by default", () => {
    expect(viewStateOf(view({ config: "not a config" }), fields)).toEqual(state())
    expect(viewStateOf(view({ config: JSON.stringify({ rules: [1], display: "tall" }) }), fields)).toEqual(state())
  })

  it("compares by what it holds, not by the order its keys were written in", () => {
    const wide = (widths: Record<string, number>) => state({ display: { ...state().display, widths } })
    expect(sameViewState(wide({ stage: 120, notes: 300 }), wide({ notes: 300, stage: 120 }))).toBe(true)
    expect(sameViewState(wide({ notes: 300 }), wide({ notes: 320 }))).toBe(false)
    expect(sameViewState(state(), state({ layout: "chart" }))).toBe(false)
  })

  it("is the reader's to change when it's their own, or shared and they manage the table, until it's locked", () => {
    expect(mayChangeView(view({ owner_id: "me" }), false)).toBe(true)
    expect(mayChangeView(view({}), true)).toBe(true)
    expect(mayChangeView(view({}), false)).toBe(false)
    expect(mayChangeView(view({ locked: true }), true)).toBe(false)
  })

  it("opens as a link names it, else as the reader last left it, else first", () => {
    const views = [view({ id: "a" }), view({ id: "b" }), view({ id: "c" })]
    expect(openingView(views, "c", "b")?.id).toBe("c")
    expect(openingView(views, "gone", "b")?.id).toBe("b")
    expect(openingView(views, null, "gone")?.id).toBe("a")
    expect(openingView([], "c", "b")).toBeNull()
  })
})

// V-53: a view saved on one device opened on another as that device had last
// left it, and one that had kept nothing showed the table as nothing.
describe("a saved view on a device", () => {
  const byNotes = { sort: [{ field: "notes", dir: "desc" as const }], filters: [], match: "all" as const }
  const sorted = view({ id: "v1", config: JSON.stringify({ rules: byNotes }) })
  const kept = (over: Partial<{ layout: ViewState["layout"] | null; rules: ViewState["rules"]; display: typeof DEFAULT_DISPLAY }> = {}) => ({
    layout: null,
    rules: state().rules,
    display: DEFAULT_DISPLAY,
    ...over,
  })

  it("is kept with the state it opened in, and read back; a key kept before names the view alone", () => {
    window.localStorage.clear()
    expect(loadLastView("t")).toBeNull()
    saveLastView("t", "v1", state({ rules: byNotes }))
    expect(loadLastView("t")).toEqual({ id: "v1", opened: { rules: byNotes, display: state().display } })
    window.localStorage.setItem("onecamp:tableSavedView:t", "v2")
    expect(loadLastView("t")).toEqual({ id: "v2", opened: null })
    window.localStorage.setItem("onecamp:tableSavedView:t", "{not json")
    expect(loadLastView("t")).toBeNull()
    window.localStorage.clear()
  })

  it("opens as it's saved where the device keeps nothing of the reader's own, or keeps the view as it opened there", () => {
    expect(keepsOwnChange(sorted, null, kept(), fields)).toBe(false)
    // Opened here sorted by nothing; saved sorted by Notes elsewhere since.
    expect(keepsOwnChange(sorted, { id: "v1", opened: { rules: state().rules, display: state().display } }, kept(), fields)).toBe(false)
    // Kept under a key from before, or for another view since deleted, with nothing of the reader's own.
    expect(keepsOwnChange(sorted, { id: "v1", opened: null }, kept(), fields)).toBe(false)
    expect(keepsOwnChange(sorted, { id: "gone", opened: { rules: byNotes, display: state().display } }, kept(), fields)).toBe(false)
    // A field deleted since leaves the rules it named out of both alike.
    const lost = { sort: [{ field: "lost", dir: "asc" as const }], filters: [], match: "all" as const }
    expect(keepsOwnChange(sorted, { id: "v1", opened: { rules: lost, display: state().display } }, kept(), fields)).toBe(false)
  })

  it("shows a change of the reader's own as they left it: other rules or another look than the view's as it opened, or another layout in the address", () => {
    const opened = { id: "v1", opened: { rules: byNotes, display: state().display } }
    expect(keepsOwnChange(sorted, opened, kept({ rules: byNotes }), fields)).toBe(false)
    expect(keepsOwnChange(sorted, opened, kept(), fields)).toBe(true)
    expect(keepsOwnChange(sorted, opened, kept({ rules: byNotes, display: { ...DEFAULT_DISPLAY, rowHeight: "tall" } }), fields)).toBe(true)
    // A phone's list mode and the groups a reader collapsed are the device's own, never a change to the view.
    expect(keepsOwnChange(sorted, opened, kept({ rules: byNotes, display: { ...DEFAULT_DISPLAY, list: false, shut: { stage: [["Done"]] } } }), fields)).toBe(false)
    expect(keepsOwnChange(sorted, opened, kept({ rules: byNotes, layout: "board" }), fields)).toBe(true)
    expect(keepsOwnChange(sorted, opened, kept({ rules: byNotes, layout: "grid" }), fields)).toBe(false)
    // With nothing kept of the view as it opened (a key from before, or another view's): any rules or look the device keeps.
    expect(keepsOwnChange(sorted, { id: "v1", opened: null }, kept({ rules: byNotes }), fields)).toBe(true)
    expect(keepsOwnChange(sorted, null, kept({ display: { ...DEFAULT_DISPLAY, hidden: ["notes"] } }), fields)).toBe(true)
    expect(keepsOwnChange(sorted, { id: "gone", opened: null }, kept({ rules: byNotes }), fields)).toBe(true)
  })
})
