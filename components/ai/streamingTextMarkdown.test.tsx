import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import StreamingText from "@/components/ai/StreamingText"

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

/** Reveal the whole string: the component types it out one character at a time. */
function show(text: string) {
    vi.useFakeTimers()
    const view = render(<StreamingText text={text} isStreaming={false} />)
    act(() => {
        vi.advanceTimersByTime(text.length * 20 + 50)
    })
    return view
}

describe("a model's own formatting", () => {
    // The live demo's home screen showed a literal "**Summary**", asterisks and
    // all, to every visitor. The model was emitting ordinary markdown and this
    // component was printing its characters.
    it("is rendered, not printed", () => {
        const { container } = show("**Summary** of your morning")
        expect(container.textContent).not.toContain("**")
        expect(container.querySelector("strong")?.textContent).toBe("Summary")
    })

    it("keeps a list a list", () => {
        const { container } = show("- first thing\n- second thing")
        expect(container.querySelectorAll("li")).toHaveLength(2)
        expect(container.textContent).not.toContain("- first")
    })

    it("does not invent formatting in plain prose", () => {
        const { container } = show("Nothing happened while you were away.")
        expect(container.textContent).toContain("Nothing happened while you were away.")
        expect(container.querySelector("strong")).toBeNull()
    })

    // Half a token is what this component hands the renderer on every frame of
    // its own animation, so it has to be harmless rather than an error.
    it("survives a token that has not finished arriving", () => {
        vi.useFakeTimers()
        const { container } = render(<StreamingText text="**Summ" isStreaming={true} />)
        act(() => {
            vi.advanceTimersByTime(200)
        })
        expect(container.textContent).toContain("Summ")
    })
})
