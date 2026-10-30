import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

// AI off: the column menu asks the server's config otherwise.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  patchRow: vi.fn(),
  createRow: vi.fn(),
}))

import { AddColumn, ColumnHeader, loadColumnMenus } from "@/components/table/ColumnMenu"
import { DataTableBoard } from "@/components/table/DataTableBoard"
import { GuestTableViewer } from "@/components/guest/GuestTableViewer"
import { Cell } from "@/components/table/gridCells"
import type { CellContext } from "@/components/table/cellFaces"
import { cellPickers, kindCells } from "@/components/table/cellPickerPart"
import type { FieldType, TableField, TableRow } from "@/services/tableService"

// The column menus, the pickers and the B1 cells are chunks of their own: loaded first.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm(), kindCells.warm()]))
afterEach(cleanup)

const field = (id: string, type: FieldType, config: Record<string, unknown> = {}, name = id, position = 0): TableField => ({ id, table_id: "t", name, type, config: JSON.stringify(config), position })
const rowsOf = (cells: Record<string, unknown>[]): TableRow[] =>
  cells.map((c, i) => ({ id: `r${i}`, table_id: "t", values: JSON.stringify(c), position: i, created_at: "", updated_at: "" }))

describe("the new column menu", () => {
  it("offers the kinds in their groups, a status with no options so it starts with its three, and the old person kind no more", async () => {
    const onCreate = vi.fn(async () => {})
    render(<AddColumn tableId="t" fields={[field("n", "text", {}, "Name")]} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole("button", { name: /add a column|new column/i }))
    await waitFor(() => expect(screen.getByText("About each row")).toBeTruthy())
    expect(screen.getByText("Basic")).toBeTruthy()
    expect(screen.getByText("Advanced")).toBeTruthy()
    expect(screen.queryByText("A name, as text")).toBeNull()
    await act(async () => fireEvent.click(screen.getByText("Status")))
    expect(onCreate).toHaveBeenCalledWith({ name: "Status", type: "status", config: undefined })
  })
})

describe("a B1 field's own settings, in its column menu", () => {
  function menu(f: TableField) {
    const onSave = vi.fn()
    render(
      <table>
        <thead>
          <tr>
            <ColumnHeader field={f} fields={[f]} tableId="t" canManage index={0} openPage="main" onOpenPage={vi.fn()} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
          </tr>
        </thead>
      </table>,
    )
    return onSave
  }

  it("lets a duration show its seconds", async () => {
    const onSave = menu(field("d", "duration", {}, "Took"))
    fireEvent.click(await screen.findByRole("switch", { name: "Show seconds" }))
    expect(onSave).toHaveBeenLastCalledWith({ config: { format: "h:mm:ss" } })
  })

  it("lets a people field take one person", async () => {
    const onSave = menu(field("p", "people", {}, "Lead"))
    fireEvent.click(await screen.findByRole("switch", { name: "One person only" }))
    expect(onSave).toHaveBeenLastCalledWith({ config: { one: true } })
  })

  it("gives an id a prefix, and says what one may be rather than saving one it can't", async () => {
    const onSave = menu(field("id", "autonumber", {}, "ID"))
    const prefix = (await screen.findByRole("textbox", { name: "Prefix" })) as HTMLInputElement
    fireEvent.change(prefix, { target: { value: "DEAL #" } })
    fireEvent.blur(prefix)
    expect(onSave).not.toHaveBeenCalled()
    expect(prefix.getAttribute("aria-invalid")).toBe("true")
    fireEvent.change(prefix, { target: { value: "DEAL" } })
    fireEvent.keyDown(prefix, { key: "Enter" })
    expect(onSave).toHaveBeenLastCalledWith({ config: { prefix: "DEAL" } })
  })
})

describe("a board of a table with a status", () => {
  it("groups by the status first, its lanes headed by their lozenges in the status's order", () => {
    const fields = [
      field("item", "text", {}, "Item", 0),
      field("kind", "select", { options: [{ id: "k1", label: "Bug" }] }, "Kind", 1),
      field("stage", "status", { options: [{ id: "o1", label: "Not started", group: "todo" }, { id: "o2", label: "Building", group: "doing" }, { id: "o3", label: "Shipped", group: "done" }] }, "Stage", 2),
    ]
    render(<DataTableBoard tableId="t" fields={fields} rows={rowsOf([{ item: "Card", stage: "Building" }])} canManage onChange={() => {}} />)
    const lanes = Array.from(document.querySelectorAll<HTMLElement>("[data-lane]")).map((l) => l.querySelector("[data-option-chip]")?.getAttribute("data-status-group") ?? "none")
    expect(lanes).toEqual(["todo", "doing", "done", "none"])
  })
})

describe("a guest's shared table", () => {
  it("draws the B1 kinds read only, as the members' grid does", () => {
    const fields = [
      field("stage", "status", { options: [{ id: "o2", label: "Building", group: "doing" }] }, "Stage", 0),
      field("owners", "people", {}, "Owners", 1),
      field("stars", "rating", {}, "Stars", 2),
      field("took", "duration", {}, "Took", 3),
      field("phone", "phone", {}, "Phone", 4),
      field("id", "autonumber", { prefix: "DEAL" }, "ID", 5),
    ]
    render(
      <GuestTableViewer
        fields={fields}
        rows={rowsOf([{ stage: "Building", owners: [{ id: "u1", type: "user", label: "Maya Iyer" }], stars: 4, took: 5400, phone: "+91 98765 43210", id: 12 }])}
      />,
    )
    expect(document.querySelector('[data-status-group="doing"]')).toBeTruthy()
    expect(screen.getByText("Maya")).toBeTruthy()
    expect(screen.getByRole("img", { name: "Stars: 4 of 5" })).toBeTruthy()
    expect(screen.getByText("1h 30m")).toBeTruthy()
    expect((screen.getByText("+91 98765 43210").closest("a") as HTMLAnchorElement).getAttribute("href")).toBe("tel:+919876543210")
    expect(screen.getByText("DEAL-12")).toBeTruthy()
  })
})

describe("a phone's and a duration's cells", () => {
  const ctx: CellContext = { options: new Map(), rowHeight: "medium" }
  const cell = (f: TableField, value: unknown, onCommit = vi.fn(async () => true)) => {
    render(<Cell field={f} value={value} cellId="0:0" ctx={ctx} onCommit={onCommit} onLink={() => {}} />)
    return onCommit
  }

  it("calls a phone number from its own 28px button, never from a click on the cell", () => {
    cell(field("phone", "phone", {}, "Phone"), "+91 98765 43210")
    // Over the box at rest, as an email's and a link's ways out are: the box carries the number.
    const call = document.querySelector("[data-call-button]") as HTMLAnchorElement
    expect(call.getAttribute("aria-label")).toBe("Call +91 98765 43210")
    expect(call.getAttribute("href")).toBe("tel:+919876543210")
    expect(call.className).toContain("size-7")
    expect((screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement).type).toBe("tel")
  })

  it("shows a duration as 1h 30m, and takes 90 typed as ninety minutes", () => {
    const onCommit = cell(field("took", "duration", {}, "Took"), 5400)
    const box = screen.getByRole("textbox", { name: "Took" }) as HTMLInputElement
    expect(box.value).toBe("1h 30m")
    // Nothing drawn over the box reads its seconds as a number (the T3 shots showed 5,400).
    expect(screen.queryByText(/5,?400/)).toBeNull()
    fireEvent.change(box, { target: { value: "90" } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenLastCalledWith(5400)
    fireEvent.change(box, { target: { value: "2h" } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenLastCalledWith(7200)
  })
})
