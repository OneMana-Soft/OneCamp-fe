import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GuestComposer, GuestLinkGone, GuestMessageView, GuestNameForm } from "./guestUi"

const pointer = (fine: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("pointer: fine") ? fine : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe("the pieces every guest page shares", () => {
  afterEach(() => cleanup())

  it("sets a message at a readable measure, not the column's width", () => {
    render(<GuestMessageView m={{ author: "Ada", text: "Launch is Friday", created_at: "2026-10-09T10:00:00Z" }} />)
    expect(screen.getByText("Launch is Friday").className).toMatch(/\bmax-w-prose\b/)
  })

  it("shows where the keyboard is on the Change button", () => {
    render(<GuestComposer placeholder="Reply" onSend={async () => null} name="Jordan" onRename={() => {}} />)
    expect(screen.getByRole("button", { name: "Change" }).className).toMatch(/focus-visible:ring-2/)
  })

  it("labels the name field where it can be seen", () => {
    pointer(true)
    render(<GuestNameForm onName={() => {}} />)
    const box = screen.getByLabelText("Your name, as the team will see it")
    expect(box).toHaveAttribute("autocomplete", "name")
    expect(screen.getByText("Your name, as the team will see it").tagName).toBe("LABEL")
  })

  it("puts the cursor in the name field on a computer", () => {
    pointer(true)
    render(<GuestNameForm onName={() => {}} />)
    expect(screen.getByLabelText("Your name, as the team will see it")).toHaveFocus()
  })

  it("doesn't, on a phone, where it would pull the keyboard over the page", () => {
    pointer(false)
    render(<GuestNameForm onName={() => {}} />)
    expect(screen.getByLabelText("Your name, as the team will see it")).not.toHaveFocus()
  })

  it("keeps the dead link's icon from screen readers", () => {
    render(<GuestLinkGone />)
    const heading = screen.getByRole("heading", { name: "This link is no longer available" })
    const icon = heading.parentElement!.querySelector("svg")!
    expect(icon).toHaveAttribute("aria-hidden", "true")
  })
})
