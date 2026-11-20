import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { KeywordsInput } from "./keywordsInput"

afterEach(cleanup)

const enter = (word: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: word } })
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
}

describe("KeywordsInput", () => {
  it("never sends a word under its floor, as the server would refuse it", () => {
    const onChange = vi.fn()
    render(<KeywordsInput value={[]} onChange={onChange} minLength={2} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: " a " } })
    expect(screen.getByRole("button", { name: "Add keyword" })).toBeDisabled()
    enter(" a ")
    expect(onChange).not.toHaveBeenCalled()
    // The floor counts characters as the server does, so one emoji is one.
    enter("😀")
    expect(onChange).not.toHaveBeenCalled()
    enter(" ab ")
    expect(onChange).toHaveBeenCalledWith(["ab"])
  })

  it("keeps a one-letter word where no floor is set (a workflow's trigger words)", () => {
    const onChange = vi.fn()
    render(<KeywordsInput value={[]} onChange={onChange} />)
    enter("a")
    expect(onChange).toHaveBeenCalledWith(["a"])
  })

  it("gives a chip's remove a phone-sized touch target, the only way to let a Not saved word go", () => {
    render(<KeywordsInput value={["launch"]} onChange={() => {}} unsaved={["launch"]} />)
    expect(screen.getByRole("button", { name: "Remove keyword launch" })).toHaveClass("extend-touch-target")
  })
})
