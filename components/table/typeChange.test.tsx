import * as React from "react"
import { afterEach, describe, expect, it, vi, beforeAll } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const preview = vi.fn()
// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  previewConversion: (...a: unknown[]) => preview(...a),
  aggregateTable: vi.fn().mockResolvedValue({ buckets: [], truncated: false }),
}))

import { ColumnHeader, type ColumnPage } from "@/components/table/ColumnMenu"
import type { TableField } from "@/services/tableService"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

// The column menus, the cell pickers are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm()]))

const notes: TableField = { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 0 }
const tags: TableField = { id: "tags", table_id: "t", name: "Tags", type: "multi_select", config: JSON.stringify({ options: [{ id: "o_a", label: "A" }] }), position: 1 }

function menu(field: TableField) {
  const onSave = vi.fn()
  render(
    <table>
      <thead>
        <tr>
          <ColumnHeader field={field} fields={[field]} tableId="t" canManage index={0} openPage="type" onOpenPage={vi.fn()} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
        </tr>
      </thead>
    </table>,
  )
  return onSave
}
const pick = async (type: RegExp) => act(async () => fireEvent.click(screen.getByRole("option", { name: type })))

afterEach(() => {
  cleanup()
  preview.mockReset()
})

// TAB-BUG-9: changing a column's type warned of values to clear counting only
// the rows the page held, and only for numbers, dates and ticks. The server
// now converts every row as it saves, and counts first what it would clear.
describe("changing a column's type", () => {
  it("says how many values the server would clear over every row, and asks", async () => {
    preview.mockResolvedValue({ kept: 40, converted: 2, cleared: 1234 })
    const onSave = menu(notes)
    await pick(/^Number/)
    expect(preview).toHaveBeenCalledWith("t", "notes", "number")
    expect(screen.getByRole("alert").textContent).toContain("1,234 values don't fit a number column and will be cleared.")
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Change anyway" }))
    expect(onSave).toHaveBeenCalledWith({ type: "number", config: {} })
  })

  it("changes at once when nothing would be cleared", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 12, cleared: 0 })
    const onSave = menu(notes)
    await pick(/^Checkbox/)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(onSave).toHaveBeenCalledWith({ type: "checkbox", config: {} })
  })

  it("says a list keeps its first option when it becomes a select", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 5, cleared: 3 })
    menu(tags)
    await pick(/^Select/)
    expect(screen.getByRole("alert").textContent).toContain("3 values will be cleared: each cell keeps its first option.")
  })

  it("still asks, and says so, when the count can't be had", async () => {
    preview.mockRejectedValue(new Error("offline"))
    const onSave = menu(notes)
    await pick(/^Date/)
    expect(screen.getByRole("alert").textContent).toContain("Values that don't fit a date column will be cleared. They couldn't be counted just now.")
    expect(onSave).not.toHaveBeenCalled()
  })
})

// The server refuses changing a link's type (the W0 audit, 1991e7d7's row):
// the menu offered it, saved at once, and the save answered 400.
describe("a link column's type", () => {
  it.each([
    [{ relation_target: "doc" }, "A link to docs, tasks, boards, projects or people keeps its type."],
    [{ relation_target: "table", table_id: "v" }, "A link to another table keeps its type."],
  ])("is said to stay, not offered (%o)", (config, said) => {
    const link: TableField = { id: "l", table_id: "t", name: "Links", type: "relation", config: JSON.stringify(config), position: 0 }
    menu(link)
    expect(screen.getByRole("note").textContent).toContain(said)
    expect(screen.queryByRole("option", { name: /^Number/ })).toBeNull()
  })
})

// With AI off, or on the edition without it, "Fill with AI…" could only fail.
describe("a column's menu and AI", () => {
  it("offers Fill with AI only where AI is on", () => {
    const view = () =>
      render(
        <table>
          <thead>
            <tr>
              <ColumnHeader field={notes} fields={[notes]} tableId="t" canManage index={0} openPage="main" onOpenPage={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onFilled={vi.fn()} />
            </tr>
          </thead>
        </table>,
      )
    view()
    expect(screen.getByRole("button", { name: "Fill with AI…" })).toBeTruthy()
    cleanup()
    ai.on = false
    try {
      view()
      expect(screen.queryByRole("button", { name: "Fill with AI…" })).toBeNull()
    } finally {
      ai.on = true
    }
  })
})

// Audit B1: a field save from an out-of-date copy cleared cells. After a type
// change the Options page opened on the old field (no options), and adding one
// saved a list without the options the cells had become, with the old type.
describe("a column just made a select", () => {
  const status: TableField = { id: "status", table_id: "t", name: "Status", type: "text", config: "{}", position: 0 }
  const converted: TableField = { ...status, type: "select", config: JSON.stringify({ options: [{ id: "label:Open", label: "Open" }, { id: "label:Won", label: "Won" }, { id: "label:Lost", label: "Lost" }] }) }

  let setField: (f: TableField) => void = () => {}
  function Harness({ onSave }: { onSave: (i: unknown) => Promise<boolean> }) {
    const [field, set] = React.useState(status)
    const [page, setPage] = React.useState<ColumnPage | null>("type")
    setField = set
    return (
      <table>
        <thead>
          <tr>
            <ColumnHeader field={field} fields={[field]} tableId="t" canManage index={0} openPage={page} onOpenPage={setPage} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
          </tr>
        </thead>
      </table>
    )
  }

  it("opens its options once the table has it as one, and adding one keeps the options its cells became, sending no type", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 3, cleared: 0 })
    const onSave = vi.fn().mockResolvedValue(true)
    render(<Harness onSave={onSave} />)
    await pick(/^Select/)
    expect(onSave).toHaveBeenCalledWith({ type: "select", config: { options: [] } })
    // Not yet: the table still has the field as text.
    expect(screen.queryByRole("textbox", { name: "New option" })).toBeNull()
    expect(screen.getByRole("status").textContent).toContain("Changing the type…")
    await act(async () => setField(converted))
    const add = screen.getByRole("textbox", { name: "New option" })
    expect(screen.getAllByRole("textbox", { name: "Option name" }).map((i) => (i as HTMLInputElement).value)).toEqual(["Open", "Won", "Lost"])
    fireEvent.change(add, { target: { value: "Blocked" } })
    fireEvent.keyDown(add, { key: "Enter" })
    const last = onSave.mock.lastCall?.[0] as { type?: string; config: { options: { id: string; label: string }[]; removed_options?: string[] } }
    expect(last).not.toHaveProperty("type")
    expect(last).not.toHaveProperty("name")
    expect(last.config.options.map((o) => o.label)).toEqual(["Open", "Won", "Lost", "Blocked"])
    expect(last.config.options.slice(0, 3).map((o) => o.id)).toEqual(["label:Open", "label:Won", "label:Lost"])
    expect(last.config).not.toHaveProperty("removed_options")
  })

  it("reads its options again when the field changes", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 0, cleared: 0 })
    render(<Harness onSave={vi.fn().mockResolvedValue(true)} />)
    await pick(/^Select/)
    await act(async () => setField(converted))
    await act(async () => setField({ ...converted, config: JSON.stringify({ options: [{ id: "label:Open", label: "Open" }, { id: "o_new", label: "Paused" }] }) }))
    expect(screen.getAllByRole("textbox", { name: "Option name" }).map((i) => (i as HTMLInputElement).value)).toEqual(["Open", "Paused"])
  })

  it("shows an option renamed elsewhere by its new name", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 3, cleared: 0 })
    render(<Harness onSave={vi.fn().mockResolvedValue(true)} />)
    await pick(/^Select/)
    await act(async () => setField(converted))
    const renamed = { options: [{ id: "label:Open", label: "Open" }, { id: "label:Won", label: "Closed won" }, { id: "label:Lost", label: "Lost" }] }
    await act(async () => setField({ ...converted, config: JSON.stringify(renamed) }))
    expect(screen.getAllByRole("textbox", { name: "Option name" }).map((i) => (i as HTMLInputElement).value)).toEqual(["Open", "Closed won", "Lost"])
  })

  it("doesn't open its options when the person went back meanwhile", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 3, cleared: 0 })
    render(<Harness onSave={vi.fn().mockResolvedValue(true)} />)
    await pick(/^Select/)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    await act(async () => setField(converted))
    expect(screen.queryByRole("textbox", { name: "New option" })).toBeNull()
    expect(screen.getByRole("textbox", { name: "Column name" })).toBeTruthy()
  })

  it("renames the column by its name alone, so a copy read before a type change can't turn it back", async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(<Harness onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    const name = screen.getByRole("textbox", { name: "Column name" })
    fireEvent.change(name, { target: { value: "Deal stage" } })
    fireEvent.blur(name)
    expect(onSave).toHaveBeenCalledWith({ name: "Deal stage" })
  })

  it("stays on the type page when the change fails", async () => {
    preview.mockResolvedValue({ kept: 0, converted: 0, cleared: 0 })
    render(<Harness onSave={vi.fn().mockResolvedValue(false)} />)
    await pick(/^Select/)
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("option", { name: /^Select/ })).toBeTruthy()
  })
})
