import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// Where a person approves an outside agent signing in. It drew its own page: a
// centred 40px logo, a theme switch floating in a corner, a centred heading.
// It is the frame the other signed-out pages share now.

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("error=invalid_client") }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/connectService", async (orig) => ({
  ...(await orig<typeof import("@/services/connectService")>()),
  getConsent: vi.fn(),
}))

import ConnectAuthorizePage from "./page"

afterEach(cleanup)

describe("the agent sign-in page", () => {
  it("is in the signed-out pages' frame", async () => {
    const { container } = render(<ConnectAuthorizePage />)
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy()
    expect(screen.getByText("OneCamp")).toBeTruthy()
    expect(screen.getByRole("main")).toBeTruthy()
    // Not its own centred 40px logo.
    expect(container.querySelector('img[alt="OneCamp"]')).toBeNull()
  })

  // Design v3 (F9): a consent card, 440px wide, with the two-mark handshake.
  it("is a 440px consent card with the handshake", async () => {
    const { container } = render(<ConnectAuthorizePage />)
    await screen.findByRole("heading", { level: 1 })
    expect(container.querySelector(".auth-form")?.className).toContain("max-w-[440px]")
    expect(container.querySelector("[data-consent-card] [data-handshake]")).not.toBeNull()
  })
})
