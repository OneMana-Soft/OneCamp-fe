import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { DocIcon } from "./DocIcon"

afterEach(cleanup)

describe("a page's icon (D-2)", () => {
  it("is its emoji, at the size asked", () => {
    const { container } = render(<DocIcon icon="📘" size={20} />)
    const el = container.querySelector('[data-doc-icon="emoji"]') as HTMLElement
    expect(el.textContent).toBe("📘")
    expect(el.style.width).toBe("20px")
    expect(el.getAttribute("aria-hidden")).toBe("true")
  })

  it("is one of OneCamp's glyphs in its colour, loaded when first shown", async () => {
    const { container } = render(<DocIcon icon="glyph:rocket:sky" size={18} />)
    await waitFor(() => expect(container.querySelector('[data-doc-icon="glyph"]')).not.toBeNull())
    expect((container.querySelector('[data-doc-icon="glyph"]') as HTMLElement).style.color).toBe("var(--camp-sky-ink)")
  })

  it("is the page glyph when it has none, or one it doesn't know", () => {
    for (const icon of [undefined, "", "x:y"]) {
      const { container, unmount } = render(<DocIcon icon={icon} />)
      expect(container.querySelector('[data-doc-icon="page"]')).not.toBeNull()
      unmount()
    }
  })
})
