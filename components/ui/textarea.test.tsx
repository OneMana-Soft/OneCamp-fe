import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Textarea } from "./textarea"

/**
 * jsdom lays nothing out, so the browser's part is played here: a line is
 * 20px and the box has 16px of padding and a 1px border; collapsed (height
 * auto) it is as tall as its rows; laid out, what scrolls around it clamps to
 * its new content, as a browser's scroller does.
 */
const LINE = 20
const PAD = 16
const BORDER = 2
let placeholderHeight = 0
let clampAround: (() => void) | null = null
const lines = (el: HTMLTextAreaElement) => (el.value ? el.value.split("\n").length * LINE + PAD : placeholderHeight)
const inner = (el: HTMLTextAreaElement) => (el.style.height && el.style.height !== "auto" ? parseFloat(el.style.height) - BORDER : el.rows * LINE + PAD)

beforeEach(() => {
  placeholderHeight = 0
  clampAround = null
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this instanceof HTMLTextAreaElement ? inner(this) : 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this instanceof HTMLTextAreaElement ? inner(this) + BORDER : 0
  })
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    if (!(this instanceof HTMLTextAreaElement)) return 0
    clampAround?.()
    return Math.max(inner(this), lines(this))
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Note({ start, rows = 2, placeholder }: { start: string; rows?: number; placeholder?: string }) {
  const [text, setText] = React.useState(start)
  return <Textarea aria-label="Note" rows={rows} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
}

const box = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Note" })
const text = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n")

describe("the shared Textarea", () => {
  it("grows with its text and shrinks back to its rows", () => {
    render(<Note start="one line" />)
    fireEvent.change(box(), { target: { value: text(6) } })
    expect(box().style.height).toBe(`${6 * LINE + PAD + BORDER}px`)
    fireEvent.change(box(), { target: { value: text(1) } })
    expect(box().style.height).toBe(`${2 * LINE + PAD + BORDER}px`)
  })

  it("is as tall as its text when it opens with some", () => {
    render(<Note start={text(4)} />)
    expect(box().style.height).toBe(`${4 * LINE + PAD + BORDER}px`)
  })

  // An empty box measures its placeholder; a panel sliding in from nothing
  // wrapped it a word a line, and the AI composer stood 280px tall, empty.
  it("is its least height while empty, however tall its placeholder measures", () => {
    placeholderHeight = 200
    render(<Note start="" placeholder="What should change, and why it matters to the people who read this" />)
    expect(["", "auto"]).toContain(box().style.height)
  })

  it("grows as it's typed in when its value isn't React's", () => {
    render(<Textarea aria-label="Note" rows={2} defaultValue="" />)
    box().value = text(5)
    fireEvent.input(box())
    expect(box().style.height).toBe(`${5 * LINE + PAD + BORDER}px`)
  })

  // Measuring collapses the box for a moment: the sheet or page it is in
  // would clamp to the shorter content, and the text jump under the caret.
  it("leaves what scrolls around it where it was", () => {
    const OTHER = 400
    const VIEW = 300
    let stored = 0
    const { container } = render(
      <div data-testid="scroller">
        <Note start={text(10)} />
      </div>,
    )
    const scroller = container.querySelector<HTMLElement>("[data-testid=scroller]")!
    const most = () => Math.max(0, box().offsetHeight + OTHER - VIEW)
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => stored,
      set: (v: number) => {
        stored = Math.min(v, most())
      },
    })
    clampAround = () => {
      stored = Math.min(stored, most())
    }
    scroller.scrollTop = 10_000
    const bottom = scroller.scrollTop
    fireEvent.change(box(), { target: { value: `${text(10)} and a few more words` } })
    expect(scroller.scrollTop).toBe(bottom)
  })
})
