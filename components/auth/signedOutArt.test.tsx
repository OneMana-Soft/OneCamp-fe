import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import { SignInSide } from "@/components/auth/SignInSide"
import { CampHero } from "@/components/auth/CampArt"
import NotFoundPage from "@/app/not-found"
import NotAuthorisedPage from "@/app/error/not-authorised/page"

// The playful layer on the pages a person sees before or without the app: the
// ring motif beside the sign-in, and a spot illustration above the heading of
// a 404, an error, a dead link or a welcome. The words still say everything;
// the pictures are decorative and hidden from screen readers.

afterEach(cleanup)

const art = (container: HTMLElement) => container.querySelector("[data-auth-art]")

describe("pictures on the signed-out pages", () => {
  // Design v3 (admin.md F1, mock M10): the camp canvas, with the gradient
  // ring, three orbits, five anonymous people and an agent square. Owner
  // decision D2: the people are gradient discs only, no initials and no
  // names, so nothing on a customer's sign-in page pretends to be one of
  // their members.
  it("draws the camp beside the sign-in: the canvas, the ring, three orbits, five anonymous people and an agent", () => {
    const { container } = render(<SignInSide />)
    expect(container.querySelector("[data-camp][data-panel]")).not.toBeNull()
    expect(container.querySelectorAll("[data-gradient-ring]").length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll(".auth-orbit")).toHaveLength(3)
    const people = container.querySelectorAll("[data-anon-avatar]")
    expect(people).toHaveLength(5)
    for (const p of people) {
      expect(p.querySelector("text")).toBeNull()
      expect(p.textContent).toBe("")
    }
    expect(container.querySelectorAll("[data-agent-square]").length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll("[data-hue-dot]")).toHaveLength(4)
    expect(container.querySelectorAll("[data-brand-spark]")).toHaveLength(1)
    // At most two chips, each a real claim.
    expect(container.querySelectorAll(".auth-chip").length).toBeLessThanOrEqual(2)
    // The edition without AI makes no claim about agents.
    expect(container.textContent).not.toMatch(/Agents act/)
  })

  it("names this server in its chip, from the page's own address", () => {
    const { container } = render(<SignInSide />)
    expect(container.querySelector('[data-claim="server"]')?.textContent).toContain(window.location.host)
  })

  // The glow is the theme's own light, so a blue-theme person sees a blue
  // camp: the ember layer paints rgb(var(--glow)), which themes.css sets per
  // theme on <body> from the stored choice.
  it("paints the ember in the theme's glow", () => {
    const css = readFileSync(join(__dirname, "..", "..", "app", "styles", "admin", "auth.css"), "utf8")
    const ember = css.slice(css.indexOf(".auth-camp-ember {"), css.indexOf("}", css.indexOf(".auth-camp-ember {")))
    expect(ember).toMatch(/rgb\(var\(--glow\)/)
  })

  // Under reduced motion the composition is static: no parallax listener, and
  // every orbit, pop and chip animation is stilled in the stylesheet.
  it("is still under reduced motion", () => {
    const listen = vi.spyOn(window, "addEventListener")
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const { container } = render(<CampHero host="example.test" reduced />)
    expect(container.querySelector("[data-camp-hero]")?.hasAttribute("data-reduced")).toBe(true)
    expect(listen.mock.calls.some(([type]) => type === "pointermove")).toBe(false)
    listen.mockRestore()
    const css = readFileSync(join(__dirname, "..", "..", "app", "styles", "admin", "auth.css"), "utf8")
    const still = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))
    for (const cls of [".auth-rot-outer", ".auth-rot-mid", ".auth-rot-inner", ".auth-pop", ".auth-chip"]) expect(still).toContain(cls)
  })

  it("gives the sign-in page its side", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app", "page.tsx"), "utf8")
    expect(page).toMatch(/<AuthShell side=\{<SignInSide \/>\}>/)
  })

  it("draws the 404 as every dead link, with its spot hidden from screen readers", () => {
    const { container } = render(<NotFoundPage />)
    const spot = container.querySelector("[data-public-gone] [data-empty-illustration]")
    expect(spot?.getAttribute("aria-hidden")).toBe("true")
    expect(spot?.querySelector("svg")).not.toBeNull()
  })

  // Design v3 (F10): the shield with a lock, "You don't have access to this",
  // and Go to Home as the one primary.
  it("heads the not-authorised page with the shield-lock spot and offers Home", async () => {
    const { container, getByRole } = render(<NotAuthorisedPage />)
    expect(art(container)?.querySelector("svg")).not.toBeNull()
    expect(getByRole("heading", { level: 1 }).textContent).toBe("You don't have access to this")
    expect(getByRole("link", { name: "Go to Home" }).getAttribute("href")).toBe("/app/home")
  })

  // The stateful pages (each with its own harness elsewhere): every heading
  // that is a dead end, a welcome or a done thing carries its picture.
  it.each([
    ["app/reset-password/page.tsx", "This link is missing or used", "SpotKey"],
    ["app/reset-password/page.tsx", "This link has expired", "SpotKey"],
    ["app/unsubscribe/page.tsx", "This link is incomplete", "SpotEnvelopeBadge"],
    ["app/unsubscribe/page.tsx", "You won't get these emails", "SpotEnvelopeBadge"],
    ["app/unsubscribe/page.tsx", "You're back on the list", "SpotEnvelopeBadge"],
    ["app/signup/page.tsx", "Couldn't check your invitation", "SpotError"],
    ["app/signup/page.tsx", "This invitation can't be used", "SpotInbox"],
    ["app/signup/page.tsx", "You're in, ${joined.name}", "SpotWelcome"],
    ["app/admin-setup/page.tsx", "Couldn't reach this server", "SpotError"],
  ])("%s: “%s” carries %s", (file, title, spot) => {
    const src = readFileSync(join(__dirname, "..", "..", file), "utf8")
    const at = src.indexOf(title)
    expect(at).toBeGreaterThan(-1)
    const tag = src.slice(at, src.indexOf(">", src.indexOf("art=", at) + 4) + 1)
    expect(tag).toContain(`art={<${spot}`)
  })
})
