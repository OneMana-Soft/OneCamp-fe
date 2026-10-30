import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

import { Field } from "@/components/ui/field"

import { ImportDropZone } from "./importDropZone"

// Where files are dropped or chosen (components/common/importFiles): the
// docs' and calendars' imports, and a file's new version in Docs & Files,
// which chooses one file and shows it (code review of F1b: Docs & Files had
// a second drop zone of its own).

afterEach(cleanup)

const drag = (el: Element, type: "dragOver" | "drop", types: string[], files: File[] = []) => {
  const event = createEvent[type](el, { dataTransfer: { types, files, dropEffect: "" } })
  fireEvent(el, event)
  return event
}

describe("a drop zone", () => {
  it("takes only a drag that carries files: a row or text dragged over it is left alone", () => {
    const onFiles = vi.fn()
    render(<ImportDropZone accept={[".md"]} onFiles={onFiles} />)
    const zone = screen.getByText(/Drop files here/).parentElement!
    expect(drag(zone, "dragOver", ["text/plain"]).defaultPrevented).toBe(false)
    expect(drag(zone, "drop", ["text/plain"]).defaultPrevented).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
    const notes = new File(["# Notes"], "notes.md", { type: "text/markdown" })
    expect(drag(zone, "dragOver", ["Files"], [notes]).defaultPrevented).toBe(true)
    drag(zone, "drop", ["Files"], [notes])
    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it("shows the one file chosen, its name and size, and offers to choose another", () => {
    const pdf = new File([new Uint8Array(2048)], "brief (signed).pdf", { type: "application/pdf" })
    render(<ImportDropZone multiple={false} chosen={pdf} label="Choose the new version" onFiles={vi.fn()} />)
    expect(screen.getByText("brief (signed).pdf")).toBeTruthy()
    expect(screen.getByText("2 KB")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose another" })).toBeTruthy()
    expect(screen.queryByText(/Drop a file here/)).toBeNull()
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(false)
  })

  // A finger can't drop files: on a touch screen the zone offers its button
  // alone, and "Drop files here, or" is for a pointer that can (DESIGN-BUILD-9,
  // 23 Oct 2026, docs' and calendars' imports at 390).
  it("says to drop files only where a pointer can drop them", () => {
    render(<ImportDropZone accept={[".md"]} onFiles={vi.fn()} />)
    expect(screen.getByText("Drop files here, or").className.split(/\s+/)).toContain("pointer-coarse:hidden")
    expect(screen.getByRole("button", { name: "Choose files" })).toBeTruthy()
  })
})

// The CSV import's file field is a drop zone too (DESIGN-BUILD-12 SF1, 24 Oct):
// in a Field, the label, help and error reach its button, a form can send the
// focus there, and while a file goes up it takes neither a press nor a drop.
describe("import's drop zone in a field", () => {
  const csv = () => new File(["a,b"], "plan.csv", { type: "text/csv" })

  it("is the field's control: labelled by the field, described by its help and error, named by its words", () => {
    render(
      <Field label="CSV file" help="Its first row names the columns." error="Choose the CSV file to import.">
        <ImportDropZone accept={[".csv"]} multiple={false} onFiles={vi.fn()} label="Choose a CSV file" />
      </Field>,
    )
    const button = screen.getByRole("button", { name: "Choose a CSV file" })
    expect(screen.getByText("CSV file").closest("label")?.htmlFor).toBe(button.id)
    expect(button).toHaveAccessibleDescription("Its first row names the columns. Choose the CSV file to import.")
    expect(button).toHaveAttribute("aria-invalid", "true")
  })

  it("gives the form its button to focus", () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(<ImportDropZone ref={ref} accept={[".csv"]} onFiles={vi.fn()} label="Choose a CSV file" />)
    ref.current?.focus()
    expect(screen.getByRole("button", { name: "Choose a CSV file" })).toHaveFocus()
  })

  it("takes a dropped file, but neither a press nor a drop while disabled", () => {
    const onFiles = vi.fn()
    const { rerender } = render(<ImportDropZone accept={[".csv"]} onFiles={onFiles} label="Choose a CSV file" />)
    const zone = screen.getByText("Drop files here, or").parentElement!
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [csv()] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    rerender(<ImportDropZone accept={[".csv"]} onFiles={onFiles} label="Choose a CSV file" disabled />)
    expect(screen.getByRole("button", { name: "Choose a CSV file" })).toBeDisabled()
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [csv()] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
  })
})
