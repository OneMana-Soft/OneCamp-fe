import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The theme button when its menu's code can't come (no network, V-64b): the
// button stays where it is, a press asks again, and the menu opens once its
// code comes, never the page's error boundary.
const setTheme = vi.fn()
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme }) }))

let loads = 0
vi.mock("@/components/themeProvider/themeMenu", async (actual) => {
  if (++loads === 1) throw new TypeError("Failed to fetch dynamically imported module")
  return actual()
})

const { ThemeToggle } = await import("./theme-toggle")

afterEach(cleanup)

describe("the theme button, offline", () => {
  it("stays when its menu can't load, and a press opens the menu once its code comes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<ThemeToggle />)
    // The failed try is drawn, not a try still on its way.
    await waitFor(() => expect(warn).toHaveBeenCalled())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(loads).toBe(1)
    const button = screen.getByRole("button", { name: "Toggle theme" })
    expect(screen.queryByRole("menu")).toBeNull()

    fireEvent.click(button)
    fireEvent.click(await screen.findByRole("menuitem", { name: "Dark" }))
    expect(loads).toBe(2)
    expect(setTheme).toHaveBeenCalledWith("dark")
    warn.mockRestore()
  })
})
