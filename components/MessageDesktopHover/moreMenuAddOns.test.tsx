import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Bookmark } from "@/lib/icons"

// A message's More menu draws what an edition's add-ons offer (lib/addOns),
// naming none itself: each as an item, held while it's at work.
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { default: MessageDesktopDropdown } = await import("@/components/MessageDesktopHover/MessageDesktopDropdown")

afterEach(cleanup)

const menu = (busy: boolean, run: () => void) => {
  render(
    <MessageDesktopDropdown
      setIsDropdownOpen={() => {}}
      editMessage={() => {}}
      deleteMessage={() => {}}
      isOwner={false}
      addOns={[{ key: "keep", label: "Keep for the brief", icon: Bookmark, busy, run }]}
    />,
  )
  const more = screen.getByRole("button", { name: /more/i })
  fireEvent.pointerDown(more, { button: 0, pointerType: "mouse" })
  fireEvent.keyDown(more, { key: "Enter" })
}

describe("a message's More menu", () => {
  it("offers an add-on's action, which runs when chosen", async () => {
    const run = vi.fn()
    menu(false, run)
    fireEvent.click(await screen.findByRole("menuitem", { name: "Keep for the brief" }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("holds an action at work", async () => {
    const run = vi.fn()
    menu(true, run)
    const item = await screen.findByRole("menuitem", { name: "Keep for the brief" })
    expect(item.getAttribute("aria-disabled")).toBe("true")
  })
})
