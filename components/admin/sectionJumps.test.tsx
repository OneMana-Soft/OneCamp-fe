import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { SectionJumpMenu, jumpTo } from "@/components/admin/SectionJumps"

const originalMatchMedia = window.matchMedia

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function section() {
  render(
    <section id="ai-models-drill">
      <h2>Governance drill</h2>
    </section>,
  )
  const el = document.getElementById("ai-models-drill") as HTMLElement
  el.scrollIntoView = vi.fn()
  return el
}

describe("a jump to a section", () => {
  // It always scrolled smoothly, even for someone who asked for less motion.
  it("jumps without the smooth scroll when reduced motion is asked for", () => {
    setReducedMotion(true)
    const el = section()
    jumpTo("ai-models-drill")
    expect(el.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }))
  })

  it("scrolls smoothly otherwise", () => {
    setReducedMotion(false)
    const el = section()
    jumpTo("ai-models-drill")
    expect(el.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }))
  })

  // Focus stayed on the jump, so the next Tab went back up the page.
  it("moves focus to the section's heading", () => {
    setReducedMotion(false)
    section()
    jumpTo("ai-models-drill")
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Governance drill" }))
  })
})

describe("the menu of a tab's sections", () => {
  it("lists the sections under 'On this page' and jumps to the one chosen once it has closed", async () => {
    setReducedMotion(true)
    const el = section()
    render(<SectionJumpMenu jumps={[{ id: "ai-models-drill", label: "Governance drill" }]} />)
    const trigger = screen.getByRole("button", { name: /on this page/i })
    await act(async () => {
      trigger.focus()
      fireEvent.keyDown(trigger, { key: "Enter" })
    })
    const item = await screen.findByRole("menuitem", { name: "Governance drill" })
    await act(async () => {
      fireEvent.click(item)
    })
    await waitFor(() => expect(el.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" })))
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Governance drill" }))
  })

  it("is an icon button the picker's height on a phone, named for a screen reader", () => {
    render(<SectionJumpMenu compact jumps={[{ id: "a", label: "A" }]} />)
    const trigger = screen.getByRole("button", { name: "On this page" })
    expect(trigger.className).toContain("size-11")
  })

  // As a row at the top of the tab, AI & agents' first title sat 52px lower than
  // every other tab's (100px on a phone), and the jumps scrolled away with it.
  it("is never a row at the top of a tab's content", () => {
    const page = readFileSync(join(process.cwd(), "app/app/admin/page.tsx"), "utf8")
    expect(page).not.toMatch(/<SectionJumps\b/)
    const content = page.slice(page.indexOf('<TabsContent value="ai-models"'))
    expect(content.slice(0, content.indexOf("</TabsContent>"))).not.toMatch(/SectionJumpMenu/)
    expect(page).toMatch(/<SectionJumpMenu\b/)
  })
})
