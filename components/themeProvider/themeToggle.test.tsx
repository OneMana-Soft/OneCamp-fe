import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The signed-out pages' theme button: its menu is a chunk of its own
// (themeMenu.tsx), so those pages don't carry the menu primitive. A press
// before the chunk lands opens the menu when it does, and a choice sets the theme.
const setTheme = vi.fn()
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme }) }))

let land: () => void = () => {}
const landed = new Promise<void>((resolve) => (land = resolve))
vi.mock("@/components/themeProvider/themeMenu", async (actual) => {
  await landed
  return actual()
})

const { ThemeToggle } = await import("./theme-toggle")

afterEach(cleanup)

describe("the theme button", () => {
  it("opens its menu on a press made before the menu loaded, and sets the theme", async () => {
    render(<ThemeToggle />)
    const button = screen.getByRole("button", { name: "Toggle theme" })
    expect(button.getAttribute("aria-haspopup")).toBe("menu")
    fireEvent.click(button)
    expect(screen.queryByRole("menu")).toBeNull()
    await act(async () => {
      land()
      await landed
      await new Promise((r) => setTimeout(r, 0))
    })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Dark" }))
    expect(setTheme).toHaveBeenCalledWith("dark")
  })
})
