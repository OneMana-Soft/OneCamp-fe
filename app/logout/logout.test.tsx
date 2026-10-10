import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The page shown while signing out. It was a large centred "OneCamp | Logging
// you out…" with a "Go to login page" button that navigated by script; it is
// the signed-out pages' frame now, with a real link.

const logout = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout, isSubmitting: false }) }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import LogoutPage from "./page"

afterEach(() => {
  cleanup()
  logout.mockReset()
})

describe("signing out", () => {
  it("signs out once, and says so in the signed-out pages' frame", () => {
    render(<LogoutPage />)
    expect(logout).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { level: 1, name: "Signing you out…" })).toBeTruthy()
    expect(screen.getByText("OneCamp")).toBeTruthy()
  })

  it("offers a real link to the sign-in page, in sentence case", () => {
    render(<LogoutPage />)
    expect(screen.getByRole("link", { name: "Go to sign in" }).getAttribute("href")).toBe("/")
    expect(screen.queryByRole("button", { name: /login/i })).toBeNull()
  })
})
