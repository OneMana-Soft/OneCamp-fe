import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SectionTabs } from "@/components/ui/sectionTabs"

afterEach(cleanup)

const TABS = ["Tasks", "Board", "Timeline", "Updates", "Attachments"].map((label) => ({ value: label.toLowerCase(), label }))

describe("a row of tabs wider than its room", () => {
  it("fades the edge with more tabs past it, so the row says it scrolls", () => {
    const sw = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(420)
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360)
    render(<SectionTabs tabs={TABS} value="tasks" onValueChange={() => {}} />)
    const list = screen.getByRole("tablist")
    expect(list.hasAttribute("data-more-end")).toBe(true)
    expect(list.className).toContain("mask-image")
    sw.mockRestore()
    cw.mockRestore()
  })

  it("scrolls the chosen tab into view", () => {
    const into = vi.fn()
    HTMLElement.prototype.scrollIntoView = into
    render(<SectionTabs tabs={TABS} value="attachments" onValueChange={() => {}} />)
    expect(into).toHaveBeenCalled()
  })
})

describe("the chosen tab", () => {
  it("is underlined in ink, not the accent (design v3 §3.12): a place, not an action", () => {
    render(<SectionTabs tabs={TABS} value="tasks" onValueChange={() => {}} />)
    const tab = screen.getByRole("tab", { name: "Tasks" })
    expect(tab.className).toContain("data-[state=active]:after:bg-ink")
    expect(tab.className).not.toContain("after:bg-primary")
  })
})
