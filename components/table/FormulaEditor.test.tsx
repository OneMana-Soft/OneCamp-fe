import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

const preview = vi.fn()
vi.mock("@/services/tableCalls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableCalls")>()),
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
    expect(screen.getByText(`There's no field called "Cost" (at character 1)`).closest("p")?.className).toContain("text-danger-ink")
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

  it("colours what is typed: fields as pills, functions, text and numbers in the camp inks", () => {
    render(<Editing initial={'IF({Paid}, "Paid", 2)'} />)
    const editor = document.querySelector("[data-formula-editor]") as HTMLElement
    expect(editor.querySelector("[data-field-pill]")?.textContent).toBe("{Paid}")
    expect(editor.querySelector(".text-camp-sky-ink")?.textContent).toBe("IF")
    expect(editor.querySelector(".text-camp-moss-ink")?.textContent).toBe('"Paid"')
    expect(editor.querySelector(".text-camp-sun-ink")?.textContent).toBe("2")
  })
})

describe("help as a formula is written (B2)", () => {
  // Types text with the caret at its end, as typing leaves it.
  const type = (text: string) => {
    const el = box()
    fireEvent.change(el, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } })
    el.setSelectionRange(text.length, text.length)
    fireEvent.select(el)
  }

  it("offers the fields inside braces, and Enter puts the chosen one in", () => {
    render(<Editing />)
    type("{Pr")
    expect(screen.getByRole("listbox", { name: "Suggestions" })).toBeTruthy()
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["PriceNumber"])
    // Led by the kind's glyph, as the header and the chips show it.
    expect(screen.getAllByRole("option")[0].firstElementChild?.tagName.toLowerCase()).toBe("svg")
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(box().value).toBe("{Price}")
  })

  it("leaves an input method its Enter and Escape: the word being made is its, and the list stays", () => {
    render(<Editing />)
    type("{Pr")
    // Typing Japanese, Enter picks the word being made and Escape drops it
    // (isComposing, or Safari's keyCode 229): neither is the list's.
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true })
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 })
    fireEvent.keyDown(box(), { key: "Escape", isComposing: true })
    expect(box().value).toBe("{Pr")
    expect(screen.getByRole("listbox", { name: "Suggestions" })).toBeTruthy()
  })

  it("puts the names that start as typed before those that only hold it", () => {
    render(<Editing />)
    // "Quantity" holds "ti"; "Total" starts with "t" and so comes first for "t".
    type("{t")
    expect(screen.getAllByRole("option").map((o) => o.querySelector("span")?.textContent)).toEqual(["Total", "Quantity"])
  })

  it("offers the functions as a name is typed; Tab opens the bracket, Esc shuts the list", () => {
    render(<Editing />)
    type("ROU")
    expect(screen.getAllByRole("option").map((o) => o.querySelector("span")?.textContent)).toEqual(["ROUND", "ROUNDUP", "ROUNDDOWN"])
    fireEvent.keyDown(box(), { key: "ArrowDown" })
    fireEvent.keyDown(box(), { key: "Tab" })
    expect(box().value).toBe("ROUNDUP(")
    type("ROUNDUP(ab")
    expect(screen.getByRole("listbox")).toBeTruthy()
    fireEvent.keyDown(box(), { key: "Escape" })
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("says which function the caret is in, its value in bold, and rings the bracket pair at the caret", () => {
    render(<Editing />)
    type('IF({Price} > 10, "big", ')
    const hint = document.querySelector("[data-formula-hint]")!
    expect(hint.textContent).toContain("IF(test, then, otherwise)")
    expect(hint.querySelector(".font-semibold")?.textContent).toBe("otherwise")
    type("ROUND(1, 2)")
    expect(document.querySelectorAll("[data-bracket-pair]")).toHaveLength(2)
  })

  it("draws a comment quietly, and offers nothing inside it", () => {
    render(<Editing />)
    type("{Price} /* tax incl")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(document.querySelector(".italic")?.textContent).toBe("/* tax incl")
  })
})
