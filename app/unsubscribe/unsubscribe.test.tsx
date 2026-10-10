import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The page an email's unsubscribe link lands on. Its "change your mind" form
// posted to `${BACKEND}/public/...`, and the configured address already ends in
// a slash, so it went to //public/notifications/resubscribe, a route the API
// doesn't have. It is also the sign-in pages' frame now, in plain words.

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
})
const nav = vi.hoisted(() => ({ search: "" }))
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import UnsubscribePage from "./page"

afterEach(cleanup)

describe("after unsubscribing", () => {
  it("posts a change of mind to the API's own address", async () => {
    nav.search = "status=unsubscribed&token=t-1"
    render(<UnsubscribePage />)
    const form = (await screen.findByRole("button", { name: "Turn emails back on" })).closest("form")!
    expect(form.getAttribute("action")).toBe("https://api.example.com/public/notifications/resubscribe?token=t-1")
    expect(form.getAttribute("method")).toBe("post")
  })

  it("says what happened in the frame the other signed-out pages share", async () => {
    nav.search = "status=unsubscribed&token=t-1"
    render(<UnsubscribePage />)
    expect(await screen.findByRole("heading", { level: 1, name: "You're unsubscribed" })).toBeTruthy()
    expect(screen.getByText("OneCamp")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Manage notification settings" }).getAttribute("href")).toBe("/app/settings/notifications")
  })
})

describe("the other ways to arrive", () => {
  it("calls a link without its token incomplete, not 'missing token'", async () => {
    nav.search = "missing=1"
    render(<UnsubscribePage />)
    expect(await screen.findByRole("heading", { name: "This link is incomplete" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/token/i)
  })

  it("explains held-back emails from the person's side", async () => {
    nav.search = "status=resubscribed&warn=suppressed"
    render(<UnsubscribePage />)
    expect(await screen.findByRole("heading", { name: "Emails are back on" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/provider level|suppression/i)
    expect(screen.getByText(/Ask your workspace admin/)).toBeTruthy()
  })
})
