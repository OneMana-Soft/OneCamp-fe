import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

const preview = vi.fn()
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  previewFormula: (...args: unknown[]) => preview(...args),
}))

import { FormulaEditor } from "@/components/table/FormulaEditor"
import type { TableField } from "@/services/tableService"

const field = (id: string, name: string, type: TableField["type"] = "number"): TableField => ({
  id,
  table_id: "t",
  name,
  type,
  config: "{}",
  position: 0,
})
const fields = [field("p", "Price"), field("q", "Quantity"), field("total", "Total", "formula")]

// The editor as a column header holds it: the formula in state.
function Editing({ initial = "", fieldId }: { initial?: string; fieldId?: string }) {
  const [value, setValue] = React.useState(initial)
  return <FormulaEditor tableId="t" fields={fields} fieldId={fieldId} value={value} onChange={setValue} />
}

const box = () => screen.getByRole("textbox", { name: "Formula" }) as HTMLTextAreaElement

beforeEach(() => {
  vi.useFakeTimers()
  preview.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Checked once typing pauses: the server works it out on the first rows.
async function pause() {
  await act(async () => {
    vi.advanceTimersByTime(450)
  })
  await act(async () => {})
}

describe("writing a formula", () => {
  it("says how, before anything is written", () => {
    render(<Editing />)
    expect(screen.getByText(/Fields go in braces, like \{Price\}/)).toBeTruthy()
    expect(preview).not.toHaveBeenCalled()
  })

  it("says what it gives on the first rows, once typing pauses", async () => {
    preview.mockResolvedValue({ result: "number", values: [50, 12, null] })
    render(<Editing fieldId="total" />)
    fireEvent.change(box(), { target: { value: "{Price} * {Quantity}" } })
    expect(preview).not.toHaveBeenCalled()
    await pause()
    expect(preview).toHaveBeenCalledWith("t", "{Price} * {Quantity}", "total")
    expect(screen.getByText("Gives a number: 50, 12, blank")).toBeTruthy()
  })

  it("says what's wrong, from the server", async () => {
    preview.mockResolvedValue({ result: "text", error: `There's no field called "Cost" (at character 1)`, values: [] })
    render(<Editing />)
    fireEvent.change(box(), { target: { value: "{Cost} * 2" } })
    await pause()
    expect(screen.getByText(`There's no field called "Cost" (at character 1)`).className).toContain("text-destructive")
  })

  it("keeps only the answer to the latest draft", async () => {
    let first!: (v: unknown) => void
    preview
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockResolvedValueOnce({ result: "text", values: ["b"] })
    render(<Editing />)
    fireEvent.change(box(), { target: { value: "{Price}" } })
    await pause()
    fireEvent.change(box(), { target: { value: `"b"` } })
    await pause()
    await act(async () => first({ result: "number", values: [1] }))
    expect(screen.getByText("Gives text: b")).toBeTruthy()
  })

  it("puts a field in at the caret, and leaves the field being edited out", () => {
    render(<Editing initial="SUM(, 1)" fieldId="total" />)
    expect(screen.queryByRole("button", { name: "Total" })).toBeNull()
    box().setSelectionRange(4, 4)
    fireEvent.click(screen.getByRole("button", { name: "Price" }))
    expect(box().value).toBe("SUM({Price}, 1)")
  })

  it("lists the functions, and puts one in", () => {
    render(<Editing />)
    fireEvent.click(screen.getByRole("button", { name: "Show functions" }))
    fireEvent.click(screen.getByTitle("IF(test, then, otherwise)"))
    expect(box().value).toBe("IF(")
  })
})
