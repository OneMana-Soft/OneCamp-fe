import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import StreamingText, { StreamingAnswer, splitStable, tailChunks } from "@/components/ai/StreamingText"

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe("a model's own formatting", () => {
    // The live demo's home screen showed a literal "**Summary**", asterisks and
    // all, to every visitor. The model was emitting ordinary markdown and this
    // component was printing its characters.
    it("is rendered, not printed", () => {
        const { container } = render(<StreamingText text="**Summary** of your morning" isStreaming={false} />)
        expect(container.textContent).not.toContain("**")
        expect(container.querySelector("strong")?.textContent).toBe("Summary")
    })

    it("keeps a list a list", () => {
        const { container } = render(<StreamingText text={"- first thing\n- second thing"} isStreaming={false} />)
        expect(container.querySelectorAll("li")).toHaveLength(2)
    })

    it("does not invent formatting in plain prose", () => {
        const { container } = render(<StreamingText text="Nothing happened while you were away." isStreaming={false} />)
        expect(container.textContent).toContain("Nothing happened while you were away.")
        expect(container.querySelector("strong")).toBeNull()
    })

    // Half a token is what a stream hands the renderer: harmless plain text
    // until its paragraph closes, never a broken bold.
    it("shows a token that has not finished arriving as plain text", () => {
        const { container } = render(<StreamingAnswer text="**Summ" isStreaming />)
        expect(container.textContent).toContain("**Summ")
        expect(container.querySelector("strong")).toBeNull()
    })
})

/**
 * hub.md AI6: tokens render as they arrive. The typewriter it replaced revealed
 * 15 ms a character on a timer, so the screen lagged the model and re-parsed
 * Markdown once per character.
 */
describe("streaming, as it arrives", () => {
    it("has no per-character timer: the text on screen is the text received, on every render", () => {
        const timers = vi.spyOn(globalThis, "setInterval")
        const { container, rerender } = render(<StreamingAnswer text="Launch is on" isStreaming />)
        expect(container.textContent).toBe("Launch is on")
        rerender(<StreamingAnswer text="Launch is on track for Thursday" isStreaming />)
        expect(container.textContent).toBe("Launch is on track for Thursday")
        expect(timers).not.toHaveBeenCalled()
        expect(readFileSync(join(__dirname, "StreamingText.tsx"), "utf8")).not.toMatch(/setInterval|speed/)
    })

    it("softens in each chunk that arrives, keeping the earlier ones' elements", () => {
        const { container, rerender } = render(<StreamingAnswer text="One " isStreaming />)
        const first = container.querySelector(".hub-stream-chunk")
        rerender(<StreamingAnswer text="One two " isStreaming />)
        const chunks = container.querySelectorAll(".hub-stream-chunk")
        expect(chunks).toHaveLength(2)
        expect(chunks[0]).toBe(first)
        expect(chunks[1].textContent).toBe("two ")
    })

    it("renders the settled paragraphs as Markdown and the open one as text", () => {
        const { container } = render(<StreamingAnswer text={"**Done** so far.\n\nStill **writ"} isStreaming />)
        expect(container.querySelector("strong")?.textContent).toBe("Done")
        expect(container.textContent).toContain("Still **writ")
    })

    it("ends with a breathing spark caret while streaming, and none when done", () => {
        const { container, rerender } = render(<StreamingAnswer text="Hi" isStreaming />)
        const caret = container.querySelector("[data-spark-caret]")
        expect(caret?.getAttribute("class")).toContain("hub-breathe")
        expect(caret?.getAttribute("class")).toContain("fill-agent")
        rerender(<StreamingAnswer text="Hi" isStreaming={false} />)
        expect(container.querySelector("[data-spark-caret]")).toBeNull()
    })

    it("never splits inside a code fence", () => {
        expect(splitStable("Intro\n\n```\na\n\nb")).toEqual({ stable: "Intro", tail: "```\na\n\nb" })
        expect(splitStable("one line")).toEqual({ stable: "", tail: "one line" })
    })

    it("caps the fading chunks, merging the oldest into one run", () => {
        const marks = Array.from({ length: 60 }, (_, i) => i + 1)
        const chunks = tailChunks(marks, 0, 61)
        expect(chunks.length).toBe(24)
        expect(chunks[0][0]).toBe(0)
        expect(chunks.at(-1)![1]).toBe(61)
    })
})
