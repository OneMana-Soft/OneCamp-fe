import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { DocIcon } from "./DocIcon"
import { hueFor } from "@/lib/campHue"

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

  // INTERACTION_SPEC D13: docs carry a hue, so a page glyph is never grey
  // where the doc is known; the colour its owner gave it wins.
  it("is the page glyph in the doc's hue when it knows the doc, ink-3 when it doesn't", () => {
    const { container, unmount } = render(<DocIcon id="d0c00000-0000-4000-8000-000000000005" />)
    const page = container.querySelector('[data-doc-icon="page"]') as SVGElement
    const hue = hueFor("d0c00000-0000-4000-8000-000000000005")
    expect(page.getAttribute("data-hue")).toBe(hue)
    expect(page.getAttribute("class")).toContain(`hue-${hue}`)
    expect(page.getAttribute("class")).toContain("text-hue-ink")
    unmount()
    const bare = render(<DocIcon />).container.querySelector('[data-doc-icon="page"]') as SVGElement
    expect(bare.getAttribute("class")).toContain("text-ink-3")
    expect(bare.hasAttribute("data-hue")).toBe(false)
  })

  it("draws a glyph with no colour of its own in the doc's hue, and one with a colour in that", async () => {
    const { container, unmount } = render(<DocIcon icon="glyph:rocket" id="d1" />)
    await waitFor(() => expect(container.querySelector('[data-doc-icon="glyph"]')).not.toBeNull())
    expect((container.querySelector('[data-doc-icon="glyph"]') as HTMLElement).style.color).toBe(`var(--camp-${hueFor("d1")}-ink)`)
    unmount()
    const picked = render(<DocIcon icon="glyph:rocket:moss" id="d1" />).container
    await waitFor(() => expect(picked.querySelector('[data-doc-icon="glyph"]')).not.toBeNull())
    expect((picked.querySelector('[data-doc-icon="glyph"]') as HTMLElement).style.color).toBe("var(--camp-moss-ink)")
  })
})
