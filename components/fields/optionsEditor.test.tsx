import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { OptionsEditor, type ChoiceOption } from "@/components/fields/OptionsEditor"

// The one editor of a choice field's options, for a table's select columns
// and a project's task fields alike.

type Opt = ChoiceOption & { key?: string }
const saved: Opt[] = [
  { id: "o_todo", label: "Todo", color: "sky" },
  { id: "o_done", label: "Done" },
]
let made = 0

function Editor({ onChange, removal, start = saved }: { onChange: (next: Opt[], removed: string[]) => void; removal?: (o: Opt) => string | null; start?: Opt[] }) {
  const [options, setOptions] = React.useState(start)
  return (
    <OptionsEditor<Opt>
      options={options}
      reorder
      keyOf={(o) => o.id ?? o.key ?? o.label}
      make={(label) => ({ key: `draft-${++made}`, label })}
      removal={removal}
      onChange={(next, removed) => {
        setOptions(next)
        onChange(next, removed)
      }}
    />
  )
}
const names = () => screen.getAllByRole("textbox", { name: "Option name" }).map((i) => (i as HTMLInputElement).value)

afterEach(cleanup)

describe("a choice field's options", () => {
  it("adds one on Enter or Add, refusing a name already there in any case", () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} />)
    const box = screen.getByRole("textbox", { name: "New option" })
    fireEvent.change(box, { target: { value: "done" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: "Blocked" } })
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.change(box, { target: { value: "Waiting" } })
    fireEvent.click(screen.getByRole("button", { name: "Add option" }))
    expect(names()).toEqual(["Todo", "Done", "Blocked", "Waiting"])
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ label: "Waiting" })]), [])
  })

  it("renames on Enter or leaving the name, and Escape puts the name back", () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} />)
    const todo = screen.getAllByRole("textbox", { name: "Option name" })[0] as HTMLInputElement
    fireEvent.change(todo, { target: { value: "To do" } })
    fireEvent.keyDown(todo, { key: "Escape" })
    expect(todo.value).toBe("Todo")
    fireEvent.change(todo, { target: { value: "To do" } })
    fireEvent.keyDown(todo, { key: "Enter" })
    fireEvent.blur(todo)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith([{ id: "o_todo", label: "To do", color: "sky" }, { id: "o_done", label: "Done" }], [])
  })

  // Safari confirms an input method's word with an Enter whose keyCode is 229.
  it("leaves an input method's Enter to it, adding and renaming nothing", () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} />)
    const box = screen.getByRole("textbox", { name: "New option" })
    fireEvent.change(box, { target: { value: "完了" } })
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    const todo = screen.getAllByRole("textbox", { name: "Option name" })[0]
    todo.focus()
    fireEvent.change(todo, { target: { value: "未着手" } })
    fireEvent.keyDown(todo, { key: "Enter", keyCode: 229 })
    expect(document.activeElement).toBe(todo)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("asks before taking out what the caller says something holds, and names it by id", () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} removal={(o) => (o.id ? `“${o.label}” comes off every task that has it.` : null)} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove Todo" }))
    expect(screen.getByRole("alert").textContent).toContain("“Todo” comes off every task that has it.")
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Remove Todo" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove option" }))
    expect(onChange).toHaveBeenLastCalledWith([{ id: "o_done", label: "Done" }], ["o_todo"])
  })

  it("takes out at once what nothing holds, and an option never saved names no id", () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} removal={(o) => (o.id ? "Held" : null)} start={[{ key: "draft-a", label: "New" }, ...saved]} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove New" }))
    expect(onChange).toHaveBeenLastCalledWith(saved, [])
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("moves an option dragged by its grip to where it's dropped", () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} />)
    const rows = screen.getAllByRole("listitem")
    fireEvent.dragStart(rows[1].querySelector("[draggable]")!)
    fireEvent.drop(rows[0])
    expect(names()).toEqual(["Done", "Todo"])
    expect(onChange).toHaveBeenLastCalledWith([saved[1], saved[0]], [])
  })

  // TB-15: the grip is the pointer's; a keyboard moves the option from its name.
  it("moves an option a place with Alt+↑ or Alt+↓ on its name, keeping the focus there and saying where it went", () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      render(<Editor onChange={onChange} />)
      const said = () => {
        act(() => void vi.advanceTimersByTime(100))
        return document.querySelector("[data-announce]")?.textContent
      }
      const todo = screen.getAllByRole("textbox", { name: "Option name" })[0]
      expect(todo.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowUp Alt+ArrowDown")
      todo.focus()
      fireEvent.keyDown(todo, { key: "ArrowDown", altKey: true })
      expect(names()).toEqual(["Done", "Todo"])
      expect(onChange).toHaveBeenLastCalledWith([saved[1], saved[0]], [])
      expect(document.activeElement).toBe(todo)
      expect(said()).toBe("Moved Todo to position 2 of 2.")
      fireEvent.keyDown(todo, { key: "ArrowDown", altKey: true })
      expect(said()).toBe("Todo is last already.")
      fireEvent.keyDown(todo, { key: "ArrowUp" })
      expect(onChange).toHaveBeenCalledTimes(1)
      fireEvent.keyDown(todo, { key: "ArrowUp", altKey: true })
      expect(names()).toEqual(["Todo", "Done"])
      expect(document.activeElement).toBe(todo)
      expect(said()).toBe("Moved Todo to position 1 of 2.")
    } finally {
      document.querySelectorAll("[data-announce]").forEach((n) => n.remove())
      vi.useRealTimers()
    }
  })

  it("leaves the order alone where the caller doesn't let it change", () => {
    const onChange = vi.fn()
    render(<OptionsEditor<Opt> options={saved} make={(label) => ({ label })} onChange={onChange} />)
    const todo = screen.getAllByRole("textbox", { name: "Option name" })[0]
    expect(todo.getAttribute("aria-keyshortcuts")).toBeNull()
    fireEvent.keyDown(todo, { key: "ArrowDown", altKey: true })
    expect(onChange).not.toHaveBeenCalled()
    expect(document.querySelector("[draggable]")).toBeNull()
  })

  it("colours an option from the palette, its button saying which option it colours", async () => {
    const onChange = vi.fn()
    render(<Editor onChange={onChange} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Colour of Done: Grey" })))
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Moss" })))
    expect(onChange).toHaveBeenLastCalledWith([saved[0], { id: "o_done", label: "Done", color: "emerald" }], [])
  })
})
