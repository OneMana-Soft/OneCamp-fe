import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const aggregate = vi.fn()
// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: (...a: unknown[]) => aggregate(...a),
}))

import { ColumnHeader, loadColumnMenus } from "@/components/table/ColumnMenu"
import type { TableField } from "@/services/tableService"

// The column menu's pages are a chunk of their own (ColumnMenu.tsx): loaded
// before the tests, as the grid warms it when a header is reached.
beforeAll(() => loadColumnMenus())

// One option saved with an id, two from before options had them.
const stage: TableField = {
  id: "stage",
  table_id: "t",
  name: "Stage",
  type: "select",
  config: JSON.stringify({ options: [{ id: "o_todo000001", label: "Todo", color: "sky" }, { label: "Doing" }, { label: "Done" }] }),
  position: 0,
}

function menu(onSave = vi.fn()) {
  render(
    <table>
      <thead>
        <tr>
          <ColumnHeader field={stage} fields={[stage]} tableId="t" canManage index={0} openPage="options" onOpenPage={vi.fn()} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
        </tr>
      </thead>
    </table>,
  )
  return onSave
}
const savedOptions = (onSave: ReturnType<typeof vi.fn>) => (onSave.mock.lastCall?.[0] as { config: { options: { id: string; label: string }[] } }).config.options
const optionInput = (label: string) => screen.getAllByRole("textbox", { name: "Option name" }).find((i) => (i as HTMLInputElement).value === label) as HTMLInputElement

afterEach(() => {
  cleanup()
  aggregate.mockReset()
})

// TAB-BUG-3: a select's options are known by their ids, so the server moves a
// renamed option's cells with it (and a drag that reorders options is never
// read as renames). The menu says how many rows a rename or a removal touches.
describe("a select column's options", () => {
  it("says how many rows a rename moves, and saves the option under its id", async () => {
    aggregate.mockResolvedValue({ buckets: [{ label: "Todo", value: 12, count: 12 }], truncated: false })
    const onSave = menu()
    await waitFor(() => expect(aggregate).toHaveBeenCalledWith("t", { group_by: "stage", aggregate: "count", limit: 200 }, { suppressErrorToast: true }))
    const todo = optionInput("Todo")
    await act(async () => {})
    fireEvent.change(todo, { target: { value: "To do" } })
    expect(screen.getByText("Renames it in 12 rows")).toBeTruthy()
    fireEvent.blur(todo)
    expect(savedOptions(onSave)).toEqual([
      { id: "o_todo000001", label: "To do", color: "sky" },
      { id: "label:Doing", label: "Doing" },
      { id: "label:Done", label: "Done" },
    ])
  })

  it("says \"at least\" when the count stopped short of every row", async () => {
    aggregate.mockResolvedValue({ buckets: [{ label: "Doing", value: 5000, count: 5000 }], truncated: true })
    menu()
    await act(async () => {})
    fireEvent.change(optionInput("Doing"), { target: { value: "In progress" } })
    expect(screen.getByText("Renames it in at least 5,000 rows")).toBeTruthy()
  })

  it("asks before removing an option rows hold, and removes one no row holds at once", async () => {
    aggregate.mockResolvedValue({ buckets: [{ label: "Todo", value: 12, count: 12 }], truncated: false })
    const onSave = menu()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: "Remove Todo" }))
    expect(screen.getByRole("alert").textContent).toContain("12 rows have “Todo”, and will be left empty.")
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Remove option" }))
    expect(savedOptions(onSave).map((o) => o.label)).toEqual(["Doing", "Done"])
    fireEvent.click(screen.getByRole("button", { name: "Remove Done" }))
    expect(savedOptions(onSave).map((o) => o.label)).toEqual(["Doing"])
  })

  it("asks before removing one when the count couldn't be had", async () => {
    aggregate.mockRejectedValue(new Error("offline"))
    const onSave = menu()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: "Remove Done" }))
    expect(screen.getByRole("alert").textContent).toContain("Rows with “Done” will be left empty.")
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("gives a new option an id of its own", async () => {
    aggregate.mockResolvedValue({ buckets: [], truncated: false })
    const onSave = menu()
    const add = screen.getByRole("textbox", { name: "New option" })
    fireEvent.change(add, { target: { value: "Blocked" } })
    fireEvent.keyDown(add, { key: "Enter" })
    const made = savedOptions(onSave).at(-1)!
    expect(made.label).toBe("Blocked")
    expect(made.id).toMatch(/^o_[a-z0-9]{10}$/)
  })
})

// Audit B1 and its should-fix row: a save names what it removes, and × removes
// without asking only when the counts cover every row and name none for it.
describe("removing a select column's option", () => {
  const removed = (onSave: ReturnType<typeof vi.fn>) => (onSave.mock.lastCall?.[0] as { config: { removed_options?: string[] } }).config.removed_options

  it("names the option removed, by its id, and nothing in any other save", async () => {
    aggregate.mockResolvedValue({ buckets: [{ label: "Todo", value: 12, count: 12 }], truncated: false, distinct_groups: 1 })
    const onSave = menu()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: "Remove Done" }))
    expect(removed(onSave)).toEqual(["label:Done"])
    fireEvent.change(optionInput("Doing"), { target: { value: "In progress" } })
    fireEvent.blur(optionInput("In progress"))
    expect(removed(onSave)).toBeUndefined()
  })

  it("asks when the counts read only part of the table, or of its options", async () => {
    for (const answer of [{ truncated: true, distinct_groups: 1 }, { truncated: false, distinct_groups: 250 }]) {
      aggregate.mockResolvedValue({ buckets: [{ label: "Todo", value: 12, count: 12 }], ...answer })
      const onSave = menu()
      await act(async () => {})
      fireEvent.click(screen.getByRole("button", { name: "Remove Done" }))
      expect(screen.getByRole("alert").textContent).toContain("At least 0 rows have “Done”")
      expect(onSave).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it("asks before removing an option added since the rows were counted", async () => {
    aggregate.mockResolvedValue({ buckets: [{ label: "Todo", value: 12, count: 12 }], truncated: false, distinct_groups: 1 })
    const onSave = vi.fn()
    const view = (field: TableField) => (
      <table>
        <thead>
          <tr>
            <ColumnHeader field={field} fields={[field]} tableId="t" canManage index={0} openPage="options" onOpenPage={vi.fn()} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
          </tr>
        </thead>
      </table>
    )
    const { rerender } = render(view(stage))
    await act(async () => {})
    // Someone else adds "Blocked", and may have used it already.
    const options = [...(JSON.parse(stage.config).options as object[]), { id: "o_blocked001", label: "Blocked" }]
    rerender(view({ ...stage, config: JSON.stringify({ options }) }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Blocked" }))
    expect(screen.getByRole("alert").textContent).toContain("Rows with “Blocked” will be left empty.")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("still counts an option's rows after it's renamed, so removing it asks", async () => {
    aggregate.mockResolvedValue({ buckets: [{ label: "Todo", value: 12, count: 12 }], truncated: false, distinct_groups: 1 })
    const onSave = menu()
    await act(async () => {})
    fireEvent.change(optionInput("Todo"), { target: { value: "To do" } })
    fireEvent.blur(optionInput("To do"))
    fireEvent.click(screen.getByRole("button", { name: "Remove To do" }))
    expect(screen.getByRole("alert").textContent).toContain("12 rows have")
    fireEvent.click(screen.getByRole("button", { name: "Remove option" }))
    expect(removed(onSave)).toEqual(["o_todo000001"])
  })
})
