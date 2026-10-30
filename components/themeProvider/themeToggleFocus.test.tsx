import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

// F6 (REGRESSION-HUNT, 26 Oct 2026): on the signed-out pages the theme toggle
// is a stand-in until its menu's chunk lands, which draws the menu's own
// button in its place. A keyboard user on the stand-in was left on <body>,
// and Enter did nothing. Here the menu's chunk lands when the test says so:
// each test loads the toggle afresh, and the menu's module waits on the gate.
const gate = vi.hoisted(() => {
  let open = () => {}
  let ready = Promise.resolve()
  return {
    reset: () => void (ready = new Promise<void>((r) => (open = r))),
    wait: () => ready,
    open: () => open(),
  }
})
vi.mock("@/components/themeProvider/themeMenu", async (importOriginal) => {
  await gate.wait()
  return importOriginal()
})

let toggle: typeof import("./theme-toggle")
beforeEach(async () => {
  gate.reset()
  vi.resetModules()
  toggle = await import("./theme-toggle")
})
afterEach(cleanup)

const button = () => screen.getByRole("button", { name: "Toggle theme" })

describe("the theme toggle, as its menu lands", () => {
  it("keeps the keyboard's focus on it", async () => {
    render(<toggle.ThemeToggle />)
    const standIn = button()
    standIn.focus()
    gate.open()
    await waitFor(() => expect(button()).not.toBe(standIn))
    expect(document.activeElement).toBe(button())
  })

  it("takes no focus it didn't have", async () => {
    render(
      <>
        <input aria-label="Email" />
        <toggle.ThemeToggle />
      </>,
    )
    const standIn = button()
    const email = screen.getByRole("textbox", { name: "Email" })
    email.focus()
    gate.open()
    await waitFor(() => expect(button()).not.toBe(standIn))
    expect(document.activeElement).toBe(email)
  })
})
