import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BoardCodeBlock } from "./boardCodeBlock"

// A board's code block (miro-17): the docs' highlighter, its lines numbered, and a copy button, for members and
// guests alike. It draws only what codeBlockOf made safe: its code is text, never markup.

const copy = vi.fn<(text: string, message?: string) => Promise<boolean>>(async () => true)
vi.mock("@/hooks/useCopyToClipboard", () => ({ copyToClipboard: (t: string, m?: string) => copy(t, m) }))

afterEach(() => {
  cleanup()
  copy.mockClear()
})

const code = "/* greet */\nconst hi = (name) => `hi ${name}`\n\nreturn 42"

describe("a board's code block", () => {
  it("numbers every line and colours it with the docs' token classes", () => {
    const { container } = render(<BoardCodeBlock block={{ code, language: "javascript", title: "greet.js" }} />)
    const lines = [...container.querySelectorAll("[data-code-line]")]
    expect(lines.map((l) => l.querySelector("[data-code-n]")?.textContent)).toEqual(["1", "2", "3", "4"])
    expect(lines.map((l) => l.querySelector("[data-code-text]")?.textContent)).toEqual(code.split("\n"))
    expect(container.querySelector(".code-tokens .hljs-keyword")?.textContent).toBe("const")
    expect(container.querySelector(".hljs-comment")?.textContent).toBe("/* greet */")
    expect(screen.getByRole("group", { name: "Code: greet.js" })).toBeTruthy()
    expect(screen.getByText("JavaScript")).toBeTruthy()
  })

  it("copies its code, and says so on the button", async () => {
    render(<BoardCodeBlock block={{ code, language: "javascript", title: "" }} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy code" }))
    })
    expect(copy).toHaveBeenCalledWith(code, undefined)
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy()
  })

  it("draws code as text: markup in it is never markup", () => {
    const { container } = render(<BoardCodeBlock block={{ code: '<img src=x onerror="alert(1)">', language: "plaintext", title: "<b>t</b>" }} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("b")).toBeNull()
    expect(container.querySelector("[data-code-text]")?.textContent).toBe('<img src=x onerror="alert(1)">')
    expect(screen.getByText("Plain text")).toBeTruthy()
  })

  it("numbers its lines from 1, whatever the line endings", () => {
    const { container } = render(<BoardCodeBlock block={{ code: "a\r\nb\rc\nd", language: "plaintext", title: "" }} />)
    const lines = [...container.querySelectorAll("[data-code-line]")]
    expect(lines.map((l) => l.querySelector("[data-code-n]")?.textContent)).toEqual(["1", "2", "3", "4"])
    expect(lines.map((l) => l.querySelector("[data-code-text]")?.textContent)).toEqual(["a", "b", "c", "d"])
  })

  it("shows a block left on Auto that no grammar recognises as its text, never as empty lines (V-564)", () => {
    const { container } = render(<BoardCodeBlock block={{ code: "Meeting notes\nbuy milk", language: null, title: "" }} />)
    const lines = [...container.querySelectorAll("[data-code-line]")]
    expect(lines.map((l) => l.querySelector("[data-code-text]")?.textContent)).toEqual(["Meeting notes", "buy milk"])
  })

  it("offers Edit only on a board the viewer may edit", () => {
    const edit = vi.fn()
    const { rerender } = render(<BoardCodeBlock block={{ code: "x", language: null, title: "" }} />)
    expect(screen.queryByRole("button", { name: "Edit code" })).toBeNull()
    rerender(<BoardCodeBlock block={{ code: "x", language: null, title: "" }} onEdit={edit} />)
    fireEvent.click(screen.getByRole("button", { name: "Edit code" }))
    expect(edit).toHaveBeenCalledTimes(1)
  })

  it("names an untitled block and an unnamed language for what they are", () => {
    render(<BoardCodeBlock block={{ code: "", language: null, title: "" }} />)
    expect(screen.getByRole("group", { name: "Code block" })).toBeTruthy()
    expect(screen.getByText("Auto")).toBeTruthy()
    expect(document.querySelectorAll("[data-code-line]")).toHaveLength(1)
  })
})
