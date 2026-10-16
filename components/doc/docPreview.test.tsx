import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { DocPreview } from "./docPreview"

// QA DSA-30 (14 Oct 2026): a card's preview read "Thread skeep them" and
// "Docsfor anything thatshould": the text was laid out at twice the size and
// drawn at half by a transform, and the spaces landed between the wrong
// letters. It is laid out at the size it is drawn (CSS zoom).

afterEach(cleanup)

describe("a doc card's preview", () => {
  it("lays its words out at the size it draws them, never scaled by a transform", () => {
    const { container } = render(<DocPreview title="How we work" content="Threads keep them readable. Docs for anything that should still be true." />)
    const text = container.querySelector<HTMLElement>("[data-doc-preview-text]")!
    expect(text.textContent).toContain("Threads keep them readable.")
    expect(text.className).toContain("[zoom:0.5]")
    expect(text.className).not.toMatch(/\bscale-50\b|w-\[200%\]/)
  })
})
