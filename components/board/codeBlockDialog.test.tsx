import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { CodeBlockDialog } from "./codeBlockDialog"

// A board's code block made and edited (miro-17): its title, its language and its code, in the app's one dialog (a
// sheet on a phone). What it hands back is cleaned by lib/board/codeBlocks when it is laid or changed.

afterEach(cleanup)

describe("a code block's dialog", () => {
  it("makes a new block from what is typed, its language guessed until one is chosen", () => {
    const save = vi.fn()
    render(<CodeBlockDialog block={null} onSave={save} onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Add a code block" })).toBeTruthy()
    const add = screen.getByRole("button", { name: "Add code block" }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "greet.ts" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Code" }), { target: { value: "const hi = 1" } })
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(save).toHaveBeenCalledWith({ code: "const hi = 1", language: null, title: "greet.ts" })
  })

  it("edits a block as it stands, and keeps its language", () => {
    const save = vi.fn()
    render(<CodeBlockDialog block={{ code: "print(1)", language: "python", title: "a.py" }} onSave={save} onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Edit code block" })).toBeTruthy()
    expect((screen.getByRole("textbox", { name: "Code" }) as HTMLTextAreaElement).value).toBe("print(1)")
    expect(screen.getByRole("combobox", { name: "Language" }).textContent).toContain("Python")
    fireEvent.change(screen.getByRole("textbox", { name: "Code" }), { target: { value: "print(2)" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(save).toHaveBeenCalledWith({ code: "print(2)", language: "python", title: "a.py" })
  })

  it("closes on Cancel without saving", () => {
    const save = vi.fn()
    const close = vi.fn()
    render(<CodeBlockDialog block={null} onSave={save} onClose={close} />)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(close).toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})
