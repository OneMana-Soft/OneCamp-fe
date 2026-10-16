import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AiComposer } from "./AiComposer"

afterEach(cleanup)

// IME sweep (14 Oct 2026): Safari confirms an input method's word (Japanese,
// Chinese) with an Enter whose keyCode is 229 and isComposing false. The
// composer read isComposing alone, so picking a word sent the question.
describe("the AI composer's Enter", () => {
  it("sends on Enter, while an input method's Enter only picks its word", () => {
    const onSend = vi.fn()
    render(<AiComposer value="にほん" onChange={() => {}} onSend={onSend} onStop={() => {}} streaming={false} />)
    const box = screen.getByLabelText("Message AI assistant")
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
