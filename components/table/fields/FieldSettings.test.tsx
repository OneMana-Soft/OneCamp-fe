import { afterEach, describe, expect, it, vi, beforeAll } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: vi.fn().mockResolvedValue({ buckets: [], truncated: false }),
}))

import { ColumnHeader, type ColumnPage } from "@/components/table/ColumnMenu"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TableField } from "@/services/tableService"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

// The column menus, the cell pickers are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm()]))

// A date's default opens its picker on the month of its day.
pinTestClock()

// A field's settings (tables A1, PROGRAM.md §6): what it's for, what a new
// row's cell starts as, whether rows from the API, AI or a form must fill it,
// and which field names the rows. Each saves as it changes, sending only
// what changed.

function menu(field: TableField, page: ColumnPage) {
  const onSave = vi.fn().mockResolvedValue(true)
  const onOpenPage = vi.fn()
  render(
    <table>
      <thead>
        <tr>
          <ColumnHeader field={field} fields={[field]} tableId="t" canManage index={0} openPage={page} onOpenPage={onOpenPage} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
        </tr>
      </thead>
    </table>,
  )
  return { onSave, onOpenPage }
}

const field = (type: TableField["type"], more: Partial<TableField> = {}, config: Record<string, unknown> = {}): TableField => ({
  id: "f",
  table_id: "t",
  name: "Amount",
  type,
  config: JSON.stringify(config),
  position: 1,
  ...more,
})

afterEach(cleanup)

describe("a field's description", () => {
  it("saves when the field is left, and alone", () => {
    const { onSave } = menu(field("text"), "settings")
    const box = screen.getByRole("textbox", { name: "Description" })
    fireEvent.change(box, { target: { value: "What the client owes us" } })
    fireEvent.blur(box)
    expect(onSave).toHaveBeenCalledWith({ description: "What the client owes us" })
  })

  it("goes back to what was saved on Escape, but not on an input method's Escape", () => {
    const { onSave } = menu(field("text", { description: "Before" }), "settings")
    const box = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "変換中" } })
    fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    expect(box.value).toBe("変換中")
    fireEvent.keyDown(box, { key: "Escape" })
    expect(box.value).toBe("Before")
    fireEvent.blur(box)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("is the column header's tooltip, before a formula's text", () => {
    menu(field("text", { description: "What the client owes us" }), "main")
    expect(screen.getByRole("button", { name: /Amount, Text column/ }).getAttribute("title")).toBe("What the client owes us")
    cleanup()
    menu(field("formula", { description: "Net of tax" }, { formula: "{Gross} * 0.82", result: "number" }), "main")
    expect(screen.getByRole("button", { name: /Amount, Formula column/ }).getAttribute("title")).toBe("Net of tax\n\n{Gross} * 0.82")
  })
})

describe("a field's default for new rows", () => {
  it("reads a typed number as the reader writes it, and saves the number", () => {
    const { onSave } = menu(field("number"), "settings")
    const box = screen.getByRole("textbox", { name: "Default for new rows" })
    fireEvent.change(box, { target: { value: "1,200.5" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onSave).toHaveBeenCalledWith({ default_value: 1200.5 })
  })

  it("says why typing isn't a number, and saves nothing", () => {
    const { onSave } = menu(field("number"), "settings")
    const box = screen.getByRole("textbox", { name: "Default for new rows" })
    fireEvent.change(box, { target: { value: "12 kg" } })
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.blur(box)
    expect(screen.getByRole("alert").textContent).toBe('"Amount" takes a number: "12 kg" isn\'t one')
    expect(box.getAttribute("aria-invalid")).toBe("true")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("leaves an input method's Enter to it", () => {
    const { onSave } = menu(field("text"), "settings")
    const box = screen.getByRole("textbox", { name: "Default for new rows" })
    fireEvent.change(box, { target: { value: "未定" } })
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    expect(onSave).not.toHaveBeenCalled()
  })

  it("is taken away when it's cleared", () => {
    const { onSave } = menu(field("text", { default_value: "New" }), "settings")
    const box = screen.getByRole("textbox", { name: "Default for new rows" })
    fireEvent.change(box, { target: { value: "" } })
    fireEvent.blur(box)
    expect(onSave).toHaveBeenCalledWith({ default_value: null })
  })

  it("is one of a select's options", () => {
    const { onSave } = menu(field("select", {}, { options: [{ id: "o_todo000001", label: "To do" }, { id: "o_done000001", label: "Done" }] }), "settings")
    fireEvent.change(screen.getByRole("combobox", { name: "Default for new rows" }), { target: { value: "Done" } })
    expect(onSave).toHaveBeenCalledWith({ default_value: "Done" })
  })

  // The app's date field (INTERACTION_SPEC D14), never the browser's date box.
  it("is a day picked in the app's date field, and taken away by Clear", { timeout: 20000 }, async () => {
    const { onSave } = menu(field("date", { default_value: "2026-10-15" }), "settings")
    expect(document.querySelector('input[type="date"]')).toBeNull()
    const trigger = screen.getByRole("button", { name: /^Default for new rows/ })
    expect(trigger.textContent).toContain("Thu 15 Oct 2026")
    fireEvent.click(trigger)
    const grid = await screen.findByRole("grid", {}, { timeout: 8000 })
    const day = Array.from(grid.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "20")
    expect(day).toBeTruthy()
    fireEvent.click(day!)
    expect(onSave).toHaveBeenCalledWith({ default_value: "2026-10-20" })
    fireEvent.click(screen.getByRole("button", { name: /^Default for new rows/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }, { timeout: 8000 }))
    expect(onSave).toHaveBeenLastCalledWith({ default_value: null })
  })

  it("ticks a new row's box", () => {
    const { onSave } = menu(field("checkbox"), "settings")
    fireEvent.click(screen.getByRole("switch", { name: "New rows start ticked" }))
    expect(onSave).toHaveBeenCalledWith({ default_value: true })
  })
})

describe("a required field", () => {
  it("is asked for by a switch, saved alone", () => {
    const { onSave } = menu(field("email"), "settings")
    fireEvent.click(screen.getByRole("switch", { name: "Required" }))
    expect(onSave).toHaveBeenCalledWith({ required: true })
  })

  it("is never a field whose cells are worked out, nor do they start with a default", () => {
    menu(field("formula", {}, { formula: "1", result: "number" }), "settings")
    expect(screen.queryByRole("switch", { name: "Required" })).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Default for new rows" })).toBeNull()
    expect(screen.getByRole("textbox", { name: "Description" })).toBeTruthy()
  })
})

describe("the column menu's main page", () => {
  it("opens the field's settings, saying when it's required", () => {
    const { onOpenPage } = menu(field("text", { required: true }), "main")
    const row = screen.getByRole("button", { name: /^Field settings/ })
    expect(row.textContent).toContain("Required")
    fireEvent.click(row)
    expect(onOpenPage).toHaveBeenCalledWith("settings")
  })

  it("makes a field the primary one", () => {
    const { onSave } = menu(field("number"), "main")
    fireEvent.click(screen.getByRole("button", { name: "Set as primary field" }))
    expect(onSave).toHaveBeenCalledWith({ primary: true })
  })

  it("never offers it for the primary field, a link or a rollup, which can't name the rows", () => {
    menu(field("text", { primary: true }), "main")
    expect(screen.queryByRole("button", { name: "Set as primary field" })).toBeNull()
    cleanup()
    menu(field("relation", {}, { relation_target: "table", table_id: "t2" }), "main")
    expect(screen.queryByRole("button", { name: "Set as primary field" })).toBeNull()
    cleanup()
    menu(field("rollup", {}, { relation: "r", field: "x", aggregate: "sum" }), "main")
    expect(screen.queryByRole("button", { name: "Set as primary field" })).toBeNull()
  })

  it("keeps the primary field from being deleted", () => {
    menu(field("text", { primary: true }), "main")
    expect((screen.getByRole("button", { name: /^Delete field/ }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    menu(field("text"), "main")
    expect((screen.getByRole("button", { name: /^Delete field/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
