import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { TableField, TableRow } from "@/services/tableService"
import { GuestTableViewer } from "./GuestTableViewer"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A shared table's rows come in the table's order: by their places (tables
// A2), which a move changes, not by the numbers rows were made with.
const field: TableField = { id: "f1", table_id: "t1", name: "Item", type: "text", position: 0, config: "{}" }
const row = (id: string, item: string, position: number, key?: string): TableRow => ({
  id,
  table_id: "t1",
  values: JSON.stringify({ f1: item }),
  position,
  position_key: key,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
})

describe("a shared table's rows", () => {
  afterEach(() => cleanup())
  const shown = () => screen.getAllByRole("row").slice(1).map((r) => r.textContent)

  it("come in the order of their places, a row moved first among them", () => {
    // Badges was moved before Booth: its number still says last.
    render(<GuestTableViewer fields={[field]} rows={[row("r1", "Booth", 1, "d0001"), row("r2", "Banner", 2, "d0002"), row("r3", "Badges", 3, "d0000V")]} />)
    expect(shown()).toEqual(["Badges", "Booth", "Banner"])
  })

  it("come by their numbers from a server from before places", () => {
    render(<GuestTableViewer fields={[field]} rows={[row("r2", "Banner", 2), row("r1", "Booth", 1)]} />)
    expect(shown()).toEqual(["Booth", "Banner"])
  })
})
