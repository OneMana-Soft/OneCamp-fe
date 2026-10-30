import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { InlineEdit } from "@/components/task/inlineEdit"

afterEach(cleanup)

function edit(onCommit = vi.fn()) {
  render(<InlineEdit id="f-notes" value="" placeholder="Add notes" onCommit={onCommit} />)
  fireEvent.click(screen.getByRole("button", { name: "Add notes" }))
  const box = screen.getByRole("textbox")
  fireEvent.change(box, { target: { value: "かいぎ" } })
  return { box, onCommit }
}

/**
 * Typing Japanese, Chinese or Korean, Enter picks the word being made and
 * Escape drops it (lib/keys/ime.ts): neither ends the edit. A project's text
 * field saved half a word and closed its box on the Enter that picks one.
 */
describe("a value typed in the task panel, through an input method", () => {
  it("keeps its box open on the Enter that picks a word, either way a browser says it", () => {
    const { box, onCommit } = edit()
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    // Safari: the Enter that confirms a candidate has keyCode 229, not isComposing.
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole("textbox")).toBe(box)

    fireEvent.change(box, { target: { value: "会議" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onCommit).toHaveBeenCalledWith("会議")
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("takes the Enter that saves, so it doesn't press the value it hands the focus back to", () => {
    const { box, onCommit } = edit()
    // fireEvent answers false when the handler took the key (preventDefault):
    // no keypress follows, and Chrome clicks a focused button on Enter's.
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(false)
    expect(onCommit).toHaveBeenCalledWith("かいぎ")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add notes" }))
  })

  it("keeps what was typed on the Escape that drops a word", () => {
    const { box, onCommit } = edit()
    fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    expect(screen.getByRole("textbox")).toBe(box)

    fireEvent.keyDown(box, { key: "Escape" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
