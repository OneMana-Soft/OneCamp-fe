import { afterEach, beforeAll, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

// A phone (useSheetMode) on a slow line: the cell pickers' chunk (cellPickers)
// is still on its way when the long text is tapped, and never lands here.
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))
vi.mock("@/components/table/cellPickers", () => new Promise(() => {}))

import { Cell } from "@/components/table/gridCells"
import { kindCells } from "@/components/table/cellPickerPart"
import type { TableField } from "@/services/tableService"

beforeAll(() => kindCells.warm())
afterEach(cleanup)

const notes: TableField = { id: "f", table_id: "t", name: "Notes", type: "long_text", config: "{}", position: 0 }

it("on a phone, a long text's sheet answers the tap at once and saves, without the pickers' chunk", async () => {
  const onCommit = vi.fn(async () => true)
  render(<Cell field={notes} value="Call back" cellId="0:0" ctx={{ options: new Map(), rowHeight: "medium" }} onCommit={onCommit} onLink={() => {}} />)
  fireEvent.click(screen.getByRole("button", { name: "Notes: Call back" }))
  // At once: the sheet, or its frame while the sheet's own chunk loads.
  expect(screen.getByRole("dialog", { name: "Notes" })).toBeTruthy()
  fireEvent.change(await screen.findByRole("textbox", { name: "Notes" }, { timeout: 5000 }), { target: { value: "Call back today" } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(onCommit).toHaveBeenLastCalledWith("Call back today")
})
