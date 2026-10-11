import { readFileSync } from "node:fs"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PaperCard, PublicFrame } from "./PublicFrame"
import { PublicGone } from "./publicStates"

afterEach(cleanup)

// Every page people outside the workspace see is a finished page (content.md
// rule 6, §1.6.8): the band, the mark, the frame's glow and the credit, with
// the content on a paper card. Public pages go through PublicFrame.
describe("the public frame", () => {
  it("draws the band, the workspace mark and the credit around its content", () => {
    render(
      <PublicFrame surface="guest-doc" workspaceName="Acme" title="How we work">
        <PaperCard>body</PaperCard>
      </PublicFrame>,
    )
    const frame = document.querySelector("[data-public-frame]")!
    expect(frame.className).toMatch(/public-frame/)
    expect(frame.querySelector("[data-guest-band]")?.className).toMatch(/\bh-1\b/)
    expect(frame.querySelector("[data-workspace-mark]")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "How we work" })).toBeTruthy()
    expect(screen.getByText(/Made with OneCamp/)).toBeTruthy()
    expect(frame.querySelector("[data-paper-card]")?.className).toMatch(/sm:rounded-\[16px\]/)
  })

  it("says a dead link stopped working on a paper card, with one way out", () => {
    render(<PublicGone surface="guest-doc" />)
    expect(screen.getByRole("heading", { name: "This link has stopped working" })).toBeTruthy()
    // No buttons: at most the one way out, to the product's site when configured.
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  // The guest channel, board and meeting joined it at the integration (11 Oct),
  // so every guest page shares the one frame (G1); the client view is work's.
  for (const page of ["app/guest/d/[token]/page.tsx", "app/guest/t/[token]/page.tsx", "app/guest/c/[token]/page.tsx", "app/guest/b/[token]/page.tsx", "app/guest/m/[token]/page.tsx", "app/book/[slug]/page.tsx", "app/booking/[token]/page.tsx"]) {
    it(`${page} goes through PublicFrame`, () => {
      const src = readFileSync(page, "utf8")
      expect(src).toMatch(/PublicFrame|PublicGone|BookingFlow|ManageBooking/)
    })
  }
})
