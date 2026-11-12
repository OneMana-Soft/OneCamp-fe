import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AddColumnBody } from "@/components/table/columnMenu/AddColumnBody"
import { RecordPanel } from "@/components/table/RecordPanel"
import { ColourRules } from "@/components/table/rules/ColourRules"
import { Popover } from "@/components/ui/popoverOnDemand"
import { freshFilter } from "@/lib/tables/viewRules"
import type { TableField, TableRow } from "@/services/tableService"

// On a phone a dialog, or a popover as a sheet, stands on the keyboard and its body, the one scroller,
// gets shorter: the field typed in there is kept in sight above it (lib/ui/fieldInSight). Each surface's own box
// in the body takes the ref, from the surface's own chunk: OverlayBody, which ninety-odd chunks carry, and the
// Drawer, in the shell, do none of it (the phone pair, 11 Nov).

const sight = vi.hoisted(() => ({ on: [] as HTMLElement[], stop: vi.fn() }))
vi.mock("@/lib/ui/fieldInSight", async (actual) => ({
  ...(await actual<typeof import("@/lib/ui/fieldInSight")>()),
  fieldInSightRef: (el: HTMLElement | null) => (el ? (sight.on.push(el), sight.stop) : undefined),
}))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))
// A row's record, on its own: no store to confirm or toast through, AI off, and its comments and page (their own chunks) left out.
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => () => {} }))
vi.mock("@/hooks/useClientConfig", async (actual) => ({ ...(await actual<object>()), useAIAvailable: () => false }))
vi.mock("@/components/table/ledger/useUndoToast", () => ({ useUndoToast: () => () => {} }))
vi.mock("@/components/table/comments/RowComments", () => ({ default: () => null }))
vi.mock("@/components/table/rowPage/RowPage", () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  sight.on.length = 0
  sight.stop.mockReset()
})

/** The one box the ref went on: inside `body`, round `field`, once. */
function keptIn(field: HTMLElement, body: string) {
  expect(sight.on).toHaveLength(1)
  expect(sight.on[0].contains(field)).toBe(true)
  expect(sight.on[0].closest(body)).not.toBeNull()
}

const status: TableField = { id: "f", table_id: "t1", name: "Status", type: "text", config: "{}", position: 0 }

describe("a phone sheet's field is kept in sight over the keyboard", () => {
  it("in Colour rules, a rule's Value", () => {
    const view = render(
      <ColourRules fields={[status]} colors={{ rules: [{ hue: "berry", match: "all", filters: [freshFilter(status)] }] }} onChange={() => {}} onClose={() => {}} />,
    )
    keptIn(screen.getByRole("textbox", { name: "Value" }), "[data-overlay-body]")
    view.unmount()
    expect(sight.stop).toHaveBeenCalledTimes(1)
  })

  it("in Add column, the new column's name", async () => {
    const view = render(
      <Popover open onOpenChange={() => {}}>
        <AddColumnBody tableId="t1" fields={[status]} onCreate={async () => true} onClose={() => {}} />
      </Popover>,
    )
    // A rollup asks its name and settings first (a text column is made at once).
    fireEvent.click(await screen.findByRole("option", { name: "Rollup" }))
    keptIn(await screen.findByRole("textbox", { name: "Column name" }), "[data-overlay-body]")
    view.unmount()
    expect(sight.stop).toHaveBeenCalledTimes(1)
  })

  it("in a row's record, the field typed in", () => {
    const notes: TableField = { ...status, id: "notes", name: "Notes", position: 1 }
    const row: TableRow = { id: "r1", table_id: "t1", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ f: "Booth", notes: "" }) }
    const view = render(
      <RecordPanel tableId="t1" tableName="Launch budget" fields={[status, notes]} rows={[row]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: (_what, send) => send(), undo: vi.fn(), edits: new Map() }} onStep={() => {}} onClose={() => {}} onChange={() => {}} />,
    )
    keptIn(screen.getByRole("textbox", { name: "Notes" }), "[data-sheet-body]")
    view.unmount()
    expect(sight.stop).toHaveBeenCalledTimes(1)
  })
})
