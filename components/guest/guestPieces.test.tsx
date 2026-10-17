import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GuestComposer, GuestMessageView, GuestNameForm } from "./guestUi"
import { GuestGateComposer } from "./guestChannel"
import { PublicGone } from "./publicStates"

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
    render(<PublicGone surface="guest-channel" noun="shared channel" />)
    screen.getByRole("heading", { name: "This shared channel doesn't exist or was deleted" })
    const spot = document.querySelector("[data-empty-illustration]")!
    expect(spot).toHaveAttribute("aria-hidden", "true")
  })

  // Review, 15 Oct 2026: a client typing in Japanese, Chinese or Korean sent
  // the team half a word on the Enter that picks it (lib/keys/ime.ts), on a
  // task's comments and in a shared channel. Safari's Enter says keyCode 229
  // and not isComposing.
  it.each([
    ["a task's comments", "Reply", (onSend: (t: string) => Promise<string | null>) => <GuestComposer placeholder="Reply" onSend={onSend} name="Jordan" />],
    ["a shared channel", "Message #acme", (onSend: (t: string) => Promise<string | null>) => <GuestGateComposer name="Jordan" onName={() => {}} placeholder="Message #acme" onSend={onSend} />],
  ])("leaves an input method's Enter to it in %s", async (_where, label, composer) => {
    const onSend = vi.fn<(text: string) => Promise<string | null>>(async () => null)
    render(composer(onSend))
    const box = screen.getByRole("textbox", { name: label })
    fireEvent.change(box, { target: { value: "よろしく" } })
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith("よろしく")
  })
})
