import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PageFrame, PageFrameHeader } from "@/components/ui/settingsPage"
import { SlidersHorizontal } from "@/lib/icons"

// Design v3, admin §1.2: every settings and admin page shares one frame, a
// 720px column (944 when wide), one 36px hue tile, the title in title-1 as the
// page's one h1, and a line at 14/20 ink-2.
afterEach(cleanup)

describe("the page frame", () => {
  it("has one h1 in title-1 and one 36px tile in the section's hue", () => {
    const { container } = render(
      <PageFrame>
        <PageFrameHeader hue="sun" icon={SlidersHorizontal} title="General" description="Uploads, who can join, and where new people start." />
      </PageFrame>,
    )
    const h1s = screen.getAllByRole("heading", { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0].className).toContain("text-title-1")
    const tiles = container.querySelectorAll("[data-page-tile]")
    expect(tiles).toHaveLength(1)
    expect(tiles[0].className).toContain("size-9")
    expect(tiles[0].className).toContain("rounded-[10px]")
    expect(tiles[0].className).toMatch(/\bhue-sun\b/)
    const line = screen.getByText(/Uploads, who can join/)
    expect(line.className).toContain("text-sm")
    expect(line.className).toContain("text-muted-foreground")
    expect(line.className).toContain("max-w-[60ch]")
  })

  it("is 720px wide, or 944 when a page asks for it, and nothing wider", () => {
    const { container, rerender } = render(<PageFrame>x</PageFrame>)
    const frame = () => container.firstElementChild as HTMLElement
    expect(frame().className).toContain("max-w-[720px]")
    rerender(<PageFrame wide>x</PageFrame>)
    expect(frame().className).toContain("max-w-[944px]")
  })

  it("puts actions on the title's line, and keeps the title for screen readers on a phone", () => {
    render(<PageFrameHeader hue="sky" icon={SlidersHorizontal} title="Members" actions={<button type="button">Invite people</button>} />)
    const row = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement
    expect(row.getAttribute("data-page-title-row")).toBe("")
    expect(row.querySelector("[data-page-actions]")?.textContent).toBe("Invite people")
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("max-sm:sr-only")
  })

  it("frames every settings page and the admin page", () => {
    const layout = readFileSync(join(process.cwd(), "app/app/settings/layout.tsx"), "utf8")
    expect(layout).toMatch(/<PageFrame\b/)
    const admin = readFileSync(join(process.cwd(), "app/app/admin/page.tsx"), "utf8")
    expect(admin).toMatch(/<PageFrame\b/)
    expect(admin).toMatch(/<PageFrameHeader\b/)
  })
})
