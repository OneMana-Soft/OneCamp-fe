import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { HubTabs } from "@/components/activity/hubFrame"

/**
 * The hub's tabs at one weight (INTERACTION_SPEC D8): the chosen tab's label
 * was font-medium and its neighbours' regular, so choosing a tab widened it
 * and every tab after it moved. Each tab is now a tab of the interaction
 * layer, its label reserving the chosen weight (data-label), its hover a
 * tinted pill and its focus the layer's ring.
 */
afterEach(cleanup)

const TABS = [
  { value: "all", label: "All" },
  { value: "mentions", label: "Mentions", count: 3, badge: true },
  { value: "later", label: "Later" },
]

describe("the hub's tabs (D8)", () => {
  it("are tabs of the layer whose labels reserve the chosen weight", () => {
    render(<HubTabs tabs={TABS} value="all" onChange={() => {}} label="Inbox" />)
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("data-interactive")).toBe("tab")
      const label = tab.querySelector("[data-label]")!
      expect(label.getAttribute("data-label")).toBe(label.textContent)
      expect(tab.className).not.toMatch(/\bfont-(medium|semibold|bold)\b/)
    }
  })

  it("keeps its classes the same whichever tab is chosen, so nothing moves", () => {
    const onChange = vi.fn()
    const { rerender } = render(<HubTabs tabs={TABS} value="all" onChange={onChange} label="Inbox" />)
    const before = screen.getByRole("tab", { name: /Later/ }).className
    fireEvent.click(screen.getByRole("tab", { name: /Later/ }))
    expect(onChange).toHaveBeenCalledWith("later")
    rerender(<HubTabs tabs={TABS} value="later" onChange={onChange} label="Inbox" />)
    const after = screen.getByRole("tab", { name: /Later/ }).className
    // Only the label's ink changes (text-ink-2 to text-foreground), never its size or weight.
    const strip = (c: string) => c.replace(/\b(text-ink-2|text-foreground|hover:text-foreground)\b/g, "").replace(/\s+/g, " ").trim()
    expect(strip(after)).toBe(strip(before))
    expect(screen.getByRole("tab", { name: /Later/ }).getAttribute("aria-selected")).toBe("true")
  })
})
