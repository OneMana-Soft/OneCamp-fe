import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const fill = vi.fn()
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => true,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  fillTableAIColumn: (...a: unknown[]) => fill(...a),
}))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), useToast: () => ({ toast }) }))

import { ColumnMenuBody } from "@/components/table/columnMenu/ColumnMenuBody"
import { toastDuration } from "@/hooks/use-toast"
import type { AIFillResult, TableField } from "@/services/tableService"

const summary: TableField = { id: "summary", table_id: "t", name: "Summary", type: "text", config: JSON.stringify({ ai: { prompt: "Sum up the row" } }), position: 1 }
const fields: TableField[] = [{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }, summary]

/** Fills the column from its "Fill with AI" page, the server answering res,
 * and gives back the toast the menu showed. */
async function fillAnswered(res: AIFillResult) {
  fill.mockResolvedValue(res)
  const onFilled = vi.fn()
  render(
    <ColumnMenuBody field={summary} fields={fields} tableId="t" canManage index={1} page="ai" openPage="ai" onOpenPage={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onFilled={onFilled} />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Fill column" }))
  await waitFor(() => expect(onFilled).toHaveBeenCalledTimes(1))
  expect(fill).toHaveBeenCalledWith("t", "summary", undefined, false)
  expect(toast).toHaveBeenCalledTimes(1)
  return toast.mock.calls[0][0]
}

afterEach(() => {
  cleanup()
  fill.mockReset()
  toast.mockReset()
})

// Audit 31: a fill writes what the AI's rate allows in the request, and the
// server fills the rest in the background, so the menu can't say it's done.
describe("a column's fill with AI", () => {
  it("says the rest continue in the background when the AI's rate stopped it", async () => {
    const said = await fillAnswered({ filled: 30, skipped: 0, left: 150, total: 180, more: 0 })
    expect(said).toEqual({
      title: "Filling in the background",
      description: "Filled 30 of 180; the rest continue in the background. Its column shows how far, with Stop.",
    })
    // A statement, not progress: nothing follows the background fill, so it
    // closes on its own rather than showing a fill that never finishes.
    expect(Number.isFinite(toastDuration(said))).toBe(true)
  })

  it("counts the cells the model skipped beside those left", async () => {
    expect(await fillAnswered({ filled: 28, skipped: 2, left: 150, total: 180, more: 0 })).toEqual({
      title: "Filling in the background",
      description: "Filled 28 of 180, skipped 2; the rest continue in the background. Its column shows how far, with Stop.",
    })
  })

  it("says how many more cells are empty past what one fill takes", async () => {
    expect(await fillAnswered({ filled: 199, skipped: 1, left: 0, total: 200, more: 1240 })).toEqual({
      title: "AI fill complete",
      description: "Filled 199 rows, skipped 1. 1,240 more are empty: fill the column again for them.",
    })
  })

  it("says it's complete when nothing is left and nothing more is empty", async () => {
    expect(await fillAnswered({ filled: 1, skipped: 0, left: 0, total: 1, more: 0 })).toEqual({
      title: "AI fill complete",
      description: "Filled 1 row.",
    })
  })

  // TABLES-LEAD-26: a fill takes the whole column, and is one change its
  // person can undo; past 500 cells it asks first.
  it("offers Undo for a fill done in the request, which undoes its one change set", async () => {
    const said = await fillAnswered({ filled: 12, skipped: 0, left: 0, total: 12, more: 0, change_set: "cs1" })
    expect(said.title).toBe("AI fill complete")
    expect(said.description).toBe("Filled 12 rows.")
    // Its Undo says what it takes back.
    expect((said.action as unknown as { props: { altText: string } }).props.altText).toBe("Undo fill")
  })

  it("asks first past 500 cells, and fills only on the yes", async () => {
    fill.mockResolvedValueOnce({ filled: 0, skipped: 0, left: 0, total: 3200, more: 0, needs_confirm: true })
    const onFilled = vi.fn()
    const onOpenPage = vi.fn()
    render(
      <ColumnMenuBody field={summary} fields={fields} tableId="t" canManage index={1} page="ai" openPage="ai" onOpenPage={onOpenPage} onSave={vi.fn()} onDelete={vi.fn()} onFilled={onFilled} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Fill column" }))
    const ask = await screen.findByRole("group", { name: "Confirm the fill" })
    expect(ask.textContent).toContain("Fill 3,200 cells with your workspace's model? That's 3,200 AI calls")
    expect(onFilled).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Fill column" })).toBeNull()
    // While it asks, its yes is the only primary: Save prompt steps back.
    expect(screen.queryByRole("button", { name: "Save prompt" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("button", { name: "Save prompt" })).toBeTruthy()
    expect(screen.queryByRole("group", { name: "Confirm the fill" })).toBeNull()
    fill.mockResolvedValueOnce({ filled: 0, skipped: 0, left: 0, total: 3200, more: 0, needs_confirm: true })
    fireEvent.click(screen.getByRole("button", { name: "Fill column" }))
    await screen.findByRole("group", { name: "Confirm the fill" })

    fill.mockResolvedValueOnce({ filled: 40, skipped: 0, left: 3160, total: 3200, more: 0, change_set: "cs1", fill: { id: "f1", table_id: "t", field_id: "summary", total: 3200, asked: 40, filled: 40, state: "running" } })
    fireEvent.click(screen.getByRole("button", { name: "Fill 3,200 cells" }))
    await waitFor(() => expect(onFilled).toHaveBeenCalledTimes(1))
    expect(fill).toHaveBeenLastCalledWith("t", "summary", undefined, true)
    expect(toast).toHaveBeenCalledWith({
      title: "Filling in the background",
      description: "Filled 40 of 3,200; the rest continue in the background. Its column shows how far, with Stop.",
    })
    expect(screen.queryByRole("group", { name: "Confirm the fill" })).toBeNull()
    // The rest goes on in the background: the menu closes, so its toast covers nothing.
    expect(onOpenPage).toHaveBeenLastCalledWith(null)
  })

  it("offers Stop for a running fill in the column's menu, as on a phone its header's Stop can be off screen", () => {
    const stop = vi.fn()
    const onOpenPage = vi.fn()
    const running = { id: "f1", table_id: "t", field_id: "summary", total: 3200, asked: 1200, filled: 1190, state: "running" as const }
    render(<ColumnMenuBody field={summary} fields={fields} tableId="t" canManage index={1} page="main" openPage="main" onOpenPage={onOpenPage} onSave={vi.fn()} onDelete={vi.fn()} onFilled={vi.fn()} fill={running} onStopFill={stop} />)
    const row = screen.getByRole("button", { name: /^Stop filling Summary/ })
    expect(row.textContent).toContain("1,200 of 3,200 done")
    fireEvent.click(row)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(onOpenPage).toHaveBeenLastCalledWith(null)
    cleanup()
    // No fill, or one this person can't stop: no row.
    render(<ColumnMenuBody field={summary} fields={fields} tableId="t" canManage index={1} page="main" openPage="main" onOpenPage={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onFilled={vi.fn()} fill={running} />)
    expect(screen.queryByRole("button", { name: /^Stop filling/ })).toBeNull()
  })
})
