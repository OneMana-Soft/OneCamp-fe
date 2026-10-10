import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SectionJumps } from "@/components/admin/SectionJumps"

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

function page() {
  return render(
    <>
      <SectionJumps jumps={[{ id: "ai-models-drill", label: "Governance drill" }]} />
      <section id="ai-models-drill">
        <h2>Governance drill</h2>
      </section>
    </>,
  )
}

describe("the jump row", () => {
  // It always scrolled smoothly, even for someone who asked for less motion.
  it("jumps without the smooth scroll when reduced motion is asked for", () => {
    setReducedMotion(true)
    page()
    const section = document.getElementById("ai-models-drill") as HTMLElement
    section.scrollIntoView = vi.fn()
    fireEvent.click(screen.getByRole("button", { name: "Governance drill" }))
    expect(section.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }))
  })

  it("scrolls smoothly otherwise", () => {
    setReducedMotion(false)
    page()
    const section = document.getElementById("ai-models-drill") as HTMLElement
    section.scrollIntoView = vi.fn()
    fireEvent.click(screen.getByRole("button", { name: "Governance drill" }))
    expect(section.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }))
  })

  // Focus stayed on the jump, so the next Tab went back up the page.
  it("moves focus to the section's heading", () => {
    setReducedMotion(false)
    page()
    const section = document.getElementById("ai-models-drill") as HTMLElement
    section.scrollIntoView = vi.fn()
    fireEvent.click(screen.getByRole("button", { name: "Governance drill" }))
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Governance drill" }))
  })
})
