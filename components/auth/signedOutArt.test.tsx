import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import { SignInSide } from "@/components/auth/SignInSide"
import NotFoundPage from "@/app/not-found"
import NotAuthorisedPage from "@/app/error/not-authorised/page"

// The playful layer on the pages a person sees before or without the app: the
// ring motif beside the sign-in, and a spot illustration above the heading of
// a 404, an error, a dead link or a welcome. The words still say everything;
// the pictures are decorative and hidden from screen readers.

afterEach(cleanup)

const art = (container: HTMLElement) => container.querySelector("[data-auth-art]")

describe("pictures on the signed-out pages", () => {
  it("draws the ring motif beside the sign-in: rings, an orbit of hued dots, the logo at its centre", () => {
    const { container } = render(<SignInSide />)
    const svgs = container.querySelectorAll("svg")
    expect(svgs.length).toBe(2)
    // Six dots in camp hues round the orbit.
    expect(container.querySelectorAll("[class*='hue-'].fill-hue").length).toBe(6)
    // The workspace at the centre is the logo, not a grey ring.
    expect(container.querySelector('img[src="/logo.svg"]')?.getAttribute("alt")).toBe("")
  })

  it("gives the sign-in page its side", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app", "page.tsx"), "utf8")
    expect(page).toMatch(/<AuthShell side=\{<SignInSide \/>\}>/)
  })

  it("heads the 404 with the magnifier", () => {
    const { container } = render(<NotFoundPage />)
    expect(art(container)?.getAttribute("aria-hidden")).toBe("true")
    expect(art(container)?.querySelector("svg")).not.toBeNull()
  })

  it("heads the sign-in-again page with the error spot", async () => {
    const { container } = render(<NotAuthorisedPage />)
    expect(art(container)?.querySelector("svg")).not.toBeNull()
  })

  // The stateful pages (each with its own harness elsewhere): every heading
  // that is a dead end, a welcome or a done thing carries its picture.
  it.each([
    ["app/reset-password/page.tsx", "This link is incomplete", "SpotError"],
    ["app/reset-password/page.tsx", "This link has expired", "SpotError"],
    ["app/unsubscribe/page.tsx", "This link is incomplete", "SpotError"],
    ["app/unsubscribe/page.tsx", "You're unsubscribed", "SpotInbox"],
    ["app/unsubscribe/page.tsx", "Emails are back on", "SpotInbox"],
    ["app/signup/page.tsx", "Couldn't check your invitation", "SpotError"],
    ["app/signup/page.tsx", "This invitation can't be used", "SpotError"],
    ["app/signup/page.tsx", "You're in, ${joined.name}", "SpotWelcome"],
    ["app/admin-setup/page.tsx", "Set up your workspace", "SpotWelcome"],
  ])("%s: “%s” carries %s", (file, title, spot) => {
    const src = readFileSync(join(__dirname, "..", "..", file), "utf8")
    const at = src.indexOf(title)
    expect(at).toBeGreaterThan(-1)
    const tag = src.slice(at, src.indexOf(">", src.indexOf("art=", at) + 4) + 1)
    expect(tag).toContain(`art={<${spot}`)
  })
})
