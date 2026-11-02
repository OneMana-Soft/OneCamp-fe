import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TaskField } from "@/lib/tasks/fields"
import { AnswerInput, taskFieldAnswer } from "./AnswerInput"

// One answer's box by its kind (CR-172 F3): a form's question and a field a
// task template asks for draw the same one, so a person, a multi-select and a
// checkbox answer as their field takes them, never as text.

afterEach(cleanup)

const field = (type: TaskField["type"]): TaskField => ({
  id: "f1",
  project_id: "p1",
  name: "Area",
  type,
  options: [
    { id: "o1", label: "Data loss", color: "red" },
    { id: "o2", label: "Billing", color: "sky" },
  ],
  on_card: false,
  position: 0,
  filter_id: "field_f1",
})
const people = [
  { user_uuid: "7c9e6679-7425-40de-944b-e07fc1f90ae7", user_name: "Maya" },
  { user_uuid: "16fd2706-8baf-433b-82eb-8c7fada847da", user_name: "Sam" },
]

describe("a person", () => {
  it("is picked among the people by name, and answers with their id", async () => {
    const onChange = vi.fn()
    render(<AnswerInput id="a" value="" onChange={onChange} {...taskFieldAnswer(field("person"), people)} />)
    await act(async () => void fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" }))
    await act(async () => void fireEvent.click(await screen.findByRole("option", { name: "Sam" })))
    expect(onChange).toHaveBeenCalledWith("16fd2706-8baf-433b-82eb-8c7fada847da")
  })
  it("shows the person an answer names", () => {
    render(<AnswerInput id="a" value="7c9e6679-7425-40de-944b-e07fc1f90ae7" onChange={() => {}} {...taskFieldAnswer(field("person"), people)} />)
    expect(screen.getByRole("combobox").textContent).toBe("Maya")
  })
})

describe("a multi-select", () => {
  it("answers with the list of options ticked, by their ids", () => {
    const onChange = vi.fn()
    const { rerender } = render(<AnswerInput id="a" value={[]} onChange={onChange} {...taskFieldAnswer(field("multi_select"), [])} />)
    fireEvent.click(screen.getByRole("button", { name: "Data loss" }))
    expect(onChange).toHaveBeenLastCalledWith(["o1"])
    rerender(<AnswerInput id="a" value={["o1"]} onChange={onChange} {...taskFieldAnswer(field("multi_select"), [])} />)
    expect(screen.getByRole("button", { name: "Data loss" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Billing" }))
    expect(onChange).toHaveBeenLastCalledWith(["o1", "o2"])
    fireEvent.click(screen.getByRole("button", { name: "Data loss" }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})

describe("a checkbox", () => {
  it("answers true when ticked and false when not", () => {
    const onChange = vi.fn()
    const { rerender } = render(<AnswerInput id="a" value={undefined} onChange={onChange} {...taskFieldAnswer(field("checkbox"), [])} />)
    const box = screen.getByRole("checkbox")
    expect((box as HTMLInputElement).checked).toBe(false)
    fireEvent.click(box)
    expect(onChange).toHaveBeenLastCalledWith(true)
    rerender(<AnswerInput id="a" value={true} onChange={onChange} {...taskFieldAnswer(field("checkbox"), [])} />)
    fireEvent.click(screen.getByRole("checkbox"))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
})

describe("every task field type", () => {
  it("has its own kind of box: choices by id, numbers and money typed as numbers", () => {
    expect(taskFieldAnswer(field("select"), []).choices).toEqual([{ value: "o1", label: "Data loss" }, { value: "o2", label: "Billing" }])
    expect(taskFieldAnswer(field("person"), people).choices?.map((c) => c.label)).toEqual(["Maya", "Sam"])
    const kinds = (["text", "url", "number", "money", "date", "select", "multi_select", "person", "checkbox"] as const).map((t) => taskFieldAnswer(field(t), []).kind)
    expect(kinds).toEqual(["short_text", "url", "number", "number", "date", "select", "multi_select", "person", "checkbox"])
  })
})
