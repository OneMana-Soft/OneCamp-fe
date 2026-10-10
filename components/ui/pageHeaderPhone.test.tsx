import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { PageHeader } from "@/components/ui/pageHeader"

// A phone's top bar names every page, so a page header under it said the
// name twice ("Boards" over "Boards", "Settings" over "Yours / Settings").
// Below sm the kicker and title are for screen readers only; the line under
// the title and the controls stay. Home's greeting is not the page's name,
// so Home keeps it.
afterEach(cleanup)

describe("PageHeader on a phone", () => {
  it("leaves the name to the top bar, keeping it as the page's heading", () => {
    render(
      <PageHeader eyebrow="Yours" title="Settings" actions={<button type="button">New</button>}>
        <p>What you decide here</p>
      </PageHeader>,
    )
    expect(screen.getByRole("heading", { level: 1 }).className).toMatch(/max-sm:sr-only/)
    expect(screen.getByText("Yours").className).toMatch(/max-sm:sr-only/)
    expect(screen.getByText("What you decide here").className).not.toMatch(/sr-only/)
    expect(screen.getByRole("button", { name: "New" }).closest("[class*='sr-only']")).toBeNull()
  })

  it("shows the title where it isn't the page's name", () => {
    render(<PageHeader eyebrow="Saturday" title="Good evening, Sam" phoneTitle />)
    expect(screen.getByRole("heading", { level: 1 }).className).not.toMatch(/sr-only/)
    expect(screen.getByText("Saturday").className).not.toMatch(/sr-only/)
  })

  it("is how Home asks for its greeting, on the phone and the desktop", () => {
    const root = join(__dirname, "..", "..")
    for (const f of ["components/home/mobile/mobileHome.tsx", "components/home/desktop/desktopDashboard.tsx"]) {
      expect(readFileSync(join(root, f), "utf8")).toMatch(/<PageHeader [^>]*phoneTitle/)
    }
  })
})
