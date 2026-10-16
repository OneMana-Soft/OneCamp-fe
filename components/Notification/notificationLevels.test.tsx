import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { NotificationLevelMenu } from "./notificationLevels"

afterEach(cleanup)

function open() {
  const bell = screen.getByRole("button", { name: /^Notifications:/ })
  fireEvent.pointerDown(bell, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(bell, { key: "Enter" })
}

// PTC-26: one click on the project's bell changed its level (All, then
// Mentions, then None, round again) and swapped its icon without a word.
describe("a project's notification level", () => {
  it("says the level, and opening the bell changes nothing", () => {
    const choose = vi.fn()
    render(<NotificationLevelMenu level="all" onChoose={choose} />)
    expect(screen.getByRole("button", { name: "Notifications: All activity" })).toBeTruthy()
    open()
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent?.replace(/(All activity|Mentions only|Muted).*/, "$1"))).toEqual(["All activity", "Mentions only", "Muted"])
    expect(screen.getByRole("menuitemradio", { name: /All activity/ }).getAttribute("aria-checked")).toBe("true")
    expect(choose).not.toHaveBeenCalled()
  })

  it("changes only when a level is picked", () => {
    const choose = vi.fn()
    render(<NotificationLevelMenu level="all" onChoose={choose} />)
    open()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Mentions only/ }))
    expect(choose).toHaveBeenCalledWith("mention")
  })

  it("does nothing when the level already chosen is picked again", () => {
    const choose = vi.fn()
    render(<NotificationLevelMenu level="block" onChoose={choose} />)
    expect(screen.getByRole("button", { name: "Notifications: Muted" })).toBeTruthy()
    open()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Muted/ }))
    expect(choose).not.toHaveBeenCalled()
  })
})
