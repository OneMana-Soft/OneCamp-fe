import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { FormulaEditor, type FormulaInput } from "@/components/formula/FormulaEditor"
import type { FormulaWriter } from "@/lib/tables/formulaValue"

// The one formula editor (J-F WEB), for a table's fields and a project's task
// fields alike: it's handed what a formula may read (inputs) and how to check
// a draft (preview), and knows nothing of either.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const inputs: FormulaInput[] = [
  { id: "spend", name: "Spend", label: "Money" },
  { id: "due", name: "Due", label: "Date" },
]
const NO_SAMPLES = "Sample values appear here once tasks have them."
const write: FormulaWriter = { number: (n) => `#${n}`, date: (_d, s) => s }

function Editing({ preview, fieldId }: { preview: (f: string, id?: string) => Promise<{ result: "number"; error?: string; values: unknown[] }>; fieldId?: string }) {
  const [value, setValue] = React.useState("")
  return <FormulaEditor inputs={inputs} preview={preview} write={write} noSamples={NO_SAMPLES} fieldId={fieldId} value={value} onChange={setValue} />
}

async function typed(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Formula" }), { target: { value: text } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

const said = () => document.querySelector("[data-formula-preview]")!.textContent

describe("FormulaEditor, generic", () => {
  it("offers each input as a chip that puts it in", () => {
    render(<Editing preview={() => Promise.resolve({ result: "number", values: [] })} />)
    fireEvent.click(screen.getByRole("button", { name: "Due" }))
    expect((screen.getByRole("textbox", { name: "Formula" }) as HTMLTextAreaElement).value).toBe("{Due}")
  })

  it("checks a draft with the preview it's handed, the field being edited named", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const preview = vi.fn(() => Promise.resolve({ result: "number" as const, values: [4, 6] }))
    render(<Editing preview={preview} fieldId="double" />)
    await typed("{Spend} * 2")
    expect(preview).toHaveBeenCalledWith("{Spend} * 2", "double")
    expect(said()).toBe("Gives a number: #4, #6")
  })

  it("with no sample values, says so in words (V-763)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Editing preview={() => Promise.resolve({ result: "number", values: [] })} />)
    await typed("{Spend} * 2")
    expect(said()).toMatch(/^Gives a number\. Sample values appear here once tasks have them/)
  })

  it("says what's wrong in the server's words", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Editing preview={() => Promise.resolve({ result: "number", error: "These formulas take too much working out", values: [] })} />)
    await typed("{Spend} * 2")
    expect(said()).toBe("These formulas take too much working out")
  })

  it("can't check it (offline): says so, and keeps the text", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Editing preview={() => Promise.reject(new Error("Network Error"))} />)
    await typed("{Spend} * 2")
    expect(said()).toMatch(/couldn.t be checked/i)
    expect((screen.getByRole("textbox", { name: "Formula" }) as HTMLTextAreaElement).value).toBe("{Spend} * 2")
  })
})
