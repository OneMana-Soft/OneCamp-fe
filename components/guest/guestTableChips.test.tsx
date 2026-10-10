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

  it("wear their picked colour as a camp hue, tint behind ink", () => {
    render(<GuestTableViewer fields={[field]} rows={[row("r1", "Shortlisted"), row("r2", "Blocked"), row("r3", "Signed"), row("r4", "Unsorted")]} />)
    const chip = (label: string) => screen.getByText(label).className
    expect(chip("Shortlisted")).toMatch(/\bhue-sky\b.*\bbg-hue-tint\b.*\btext-hue-ink\b/)
    expect(chip("Blocked")).toMatch(/\bhue-berry\b/)
    expect(chip("Signed")).toMatch(/\bhue-moss\b/)
    // No colour picked: neutral.
    expect(chip("Unsorted")).toMatch(/\bbg-muted\b/)
    for (const label of ["Shortlisted", "Blocked", "Signed"]) {
      expect(chip(label)).not.toMatch(/destructive|danger|success|warning|-500\//)
    }
  })
})
