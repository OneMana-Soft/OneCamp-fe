import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { MenuOnDemand } from "@/components/ui/menuOnDemand"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

// The menu mounts on the press or key that opens it (F-1 #2), so Radix's root
// never heard the opening key: Enter on a card's "⋯" left focus on the menu,
// not its first item, and the keys had nothing to move from (boardCardMenu e2e).
installPointerEvent()
afterEach(cleanup)

function Menu() {
  return (
    <MenuOnDemand
      menu={(onDemand) => (
        <DropdownMenuContent {...onDemand}>
          <DropdownMenuItem>Open</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      )}
    >
      <button type="button" aria-label="Card actions">
        ⋯
      </button>
    </MenuOnDemand>
  )
}

/** Rows that are radios, as a reminder's choices are (components/calendar/rsvp/reminderRow), the first one shut. */
function Choices() {
  return (
    <MenuOnDemand
      menu={(onDemand) => (
        <DropdownMenuContent {...onDemand}>
          <DropdownMenuItem role="menuitemradio" aria-checked={false} disabled>
            At the start
          </DropdownMenuItem>
          <DropdownMenuItem role="menuitemradio" aria-checked={false}>
            No reminder
          </DropdownMenuItem>
          <DropdownMenuItem role="menuitemradio" aria-checked>
            10 minutes before
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    >
      <button type="button" aria-label="Reminders: 10 minutes before">
        10 min
      </button>
    </MenuOnDemand>
  )
}

describe("a menu that joins the tree as it opens", () => {
  it.each(["Enter", " ", "ArrowDown"])("opened by %j from the keys, focuses its first item", async (key) => {
    render(<Menu />)
    const button = screen.getByRole("button", { name: "Card actions" })
    button.focus()
    fireEvent.keyDown(button, { key })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Open" })))
  })

  it("opened from the keys, focuses its first item that can be chosen, of any kind: a reminder's choices are radios", async () => {
    render(<Choices />)
    const button = screen.getByRole("button", { name: "Reminders: 10 minutes before" })
    button.focus()
    fireEvent.keyDown(button, { key: "Enter" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "No reminder" })))
  })

  it("opened by a press, puts focus on no item", async () => {
    render(<Menu />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "Card actions" }), { button: 0, pointerType: "mouse" })
    const menu = await screen.findByRole("menu")
    await waitFor(() => expect(document.activeElement).toBe(menu))
    expect(screen.getAllByRole("menuitem")).not.toContain(document.activeElement)
  })
})
