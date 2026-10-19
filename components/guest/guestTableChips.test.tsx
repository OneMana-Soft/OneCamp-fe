import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { TableField, TableRow } from "@/services/tableService"
import { GuestTableViewer } from "./GuestTableViewer"

// A shared table's option chips are categories, not statuses: each takes its
// picked colour as a camp hue, tint behind ink. Red, green and yellow were
// drawn in the danger, success and warning colours (a "Blocked" chip read as
// an error), and blue, purple and orange in raw Tailwind hues.
const field: TableField = {
  id: "f1",
  table_id: "t1",
  name: "Stage",
  type: "select",
  position: 0,
  config: JSON.stringify({ options: [
    { label: "Shortlisted", color: "blue" },
    { label: "Blocked", color: "red" },
    { label: "Signed", color: "green" },
    { label: "Unsorted" },
  ] }),
} as TableField
const row = (id: string, stage: string): TableRow => ({ id, table_id: "t1", values: JSON.stringify({ f1: stage }), position: Number(id.slice(1)), created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" })

describe("a shared table's option chips", () => {
  afterEach(() => cleanup())

  const chipOf = (label: string) => screen.getByText(label).closest("[data-option-chip]") as HTMLElement
  const dotOf = (label: string) => chipOf(label).querySelector("[data-chip-dot]")?.getAttribute("class") || ""

  // A table's first select is tinted until it says otherwise (optionChip
  // tintedFields), for a guest as for a member; switched off, it is neutral.
  it("are neutral chips with a dot in their camp hue in a column switched off, as a member sees them", () => {
    const off = { ...field, config: JSON.stringify({ ...JSON.parse(field.config), tinted: false }) } as TableField
    render(<GuestTableViewer fields={[off]} rows={[row("r1", "Shortlisted"), row("r2", "Blocked"), row("r3", "Signed"), row("r4", "Unsorted")]} />)
    expect(chipOf("Shortlisted").className).toMatch(/\bbg-hover\b/)
    expect(dotOf("Shortlisted")).toMatch(/\bhue-sky\b/)
    expect(dotOf("Blocked")).toMatch(/\bhue-berry\b/)
    expect(dotOf("Signed")).toMatch(/\bhue-moss\b/)
    // No colour picked: a neutral dot.
    expect(dotOf("Unsorted")).toMatch(/\bbg-ink-3\b/)
    for (const label of ["Shortlisted", "Blocked", "Signed"]) {
      expect(chipOf(label).outerHTML).not.toMatch(/destructive|danger|success|warning|-500\//)
    }
  })

  it("wear their camp hue as a tint in a table's first select, until it says otherwise", () => {
    render(<GuestTableViewer fields={[field]} rows={[row("r1", "Shortlisted"), row("r4", "Unsorted")]} />)
    expect(chipOf("Shortlisted").className).toMatch(/\bhue-sky\b.*\bbg-hue-tint\b.*\btext-hue-ink\b/)
    expect(chipOf("Unsorted").className).toMatch(/\bbg-hover\b/)
  })

  it("wear their camp hue as a tint behind ink when the column opts in", () => {
    const tinted = { ...field, config: JSON.stringify({ ...JSON.parse(field.config), tinted: true }) } as TableField
    render(<GuestTableViewer fields={[tinted]} rows={[row("r1", "Shortlisted"), row("r4", "Unsorted")]} />)
    expect(chipOf("Shortlisted").className).toMatch(/\bhue-sky\b.*\bbg-hue-tint\b.*\btext-hue-ink\b/)
    expect(chipOf("Unsorted").className).toMatch(/\bbg-hover\b/)
  })
})

// TAB-BUG-5: a guest never sees what a link points to unless it's shareable,
// and never its id; a share past its first page of rows says so (TAB-BUG-2).
describe("a shared table's links and rows", () => {
  afterEach(() => cleanup())
  const links = { id: "f2", table_id: "t1", name: "Links", type: "relation", position: 1, config: JSON.stringify({ relation_target: "any" }) } as TableField
  const linked = (refs: unknown[]): TableRow => ({ id: "r1", table_id: "t1", values: JSON.stringify({ f2: refs }), position: 0, created_at: "", updated_at: "" })

  it("names the people a row links to and counts what it can't show, never by id", () => {
    render(<GuestTableViewer fields={[links]} rows={[linked([{ id: "u1", type: "user", label: "Maya Shah" }, { id: "secret-doc", type: "doc", hidden: true }, { id: "no-name", type: "task" }])]} />)
    expect(screen.getByText("Maya Shah")).toBeTruthy()
    expect(screen.getByText("2 things you can't open")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/secret-doc|no-name/)
  })

  it("says when it shows only the table's first rows", () => {
    render(<GuestTableViewer fields={[field]} rows={[row("r1", "Signed")]} total={1200} />)
    expect(document.querySelector("[data-guest-rows-more]")?.textContent).toBe("Showing the first 1 of 1,200 rows.")
  })

  it("says nothing of the sort when it shows every row", () => {
    render(<GuestTableViewer fields={[field]} rows={[row("r1", "Signed")]} total={1} />)
    expect(document.querySelector("[data-guest-rows-more]")).toBeNull()
  })
})
