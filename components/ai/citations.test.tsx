import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"

import { numberCitations, orderSources } from "@/components/ai/citations"
import { CitationContext, SourceChips } from "@/components/ai/Citations"
import MarkdownMessage from "@/components/ai/MarkdownMessage"

/** hub.md S11 and AI8, one rule for the search answer and the AI panel. */
afterEach(cleanup)

describe("citation numbers", () => {
  it("numbers by first appearance, not by the model's order", () => {
    const n = numberCitations("The plan [3] moved after review [1], see the plan again [3].", 3)
    expect(n.order).toEqual([2, 0])
    expect(n.shown.get(3)).toBe(1)
    expect(n.shown.get(1)).toBe(2)
  })

  it("drops a marker naming no source, and never reads a link as a marker", () => {
    const n = numberCitations("Real [2], invented [9], a [link](https://x.test)", 2)
    expect([...n.shown.keys()]).toEqual([2])
  })

  it("orders the chips cited-first, then the rest unnumbered", () => {
    const n = numberCitations("b [2] then a [1]", 3)
    expect(orderSources(["a", "b", "c"], n)).toEqual([
      { source: "b", n: 1, index: 1 },
      { source: "a", n: 2, index: 0 },
      { source: "c", index: 2 },
    ])
  })
})

function Answer({ text, sources }: { text: string; sources: string[] }) {
  const numbers = numberCitations(text, sources.length)
  const [hovered, setHovered] = useState<number | null>(null)
  return (
    <CitationContext.Provider value={{ shown: numbers.shown, hovered, setHovered }}>
      <MarkdownMessage content={text} />
      <SourceChips items={orderSources(sources, numbers).map((s) => ({ key: s.source, n: s.n, title: s.source, onOpen: vi.fn() }))} />
    </CitationContext.Provider>
  )
}

describe("markers and chips", () => {
  it("resolves every rendered marker to a chip", () => {
    const { container } = render(<Answer text="Launch moved [2] because of legal [1]." sources={["Legal note", "Q4 launch plan"]} />)
    const markers = [...container.querySelectorAll("[data-cite]")].map((m) => m.getAttribute("data-cite"))
    expect(markers).toEqual(["1", "2"])
    for (const m of markers) expect(container.querySelector(`[data-source-chip="${m}"]`)).toBeTruthy()
    expect(container.querySelector('[data-source-chip="1"]')?.textContent).toContain("Q4 launch plan")
  })

  it("lights the chip when its marker is hovered", () => {
    const { container } = render(<Answer text="See [1]." sources={["Q4 launch plan"]} />)
    fireEvent.mouseEnter(container.querySelector("[data-cite]")!)
    expect(container.querySelector('[data-source-chip="1"]')?.hasAttribute("data-lit")).toBe(true)
    fireEvent.mouseLeave(container.querySelector("[data-cite]")!)
    expect(container.querySelector('[data-source-chip="1"]')?.hasAttribute("data-lit")).toBe(false)
  })

  it("prints the brackets as text where nothing numbers them", () => {
    const { container } = render(<MarkdownMessage content="Array index [1] stays." />)
    expect(container.textContent).toBe("Array index [1] stays.")
  })
})
