import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { forgetHoverCard, HOVER_CLOSE_MS, HOVER_OPEN_MS, hoverCardProps, useHoverIntent } from "@/lib/hub/hoverIntent"

// Hover intent for the profile card (hub.md P1): 450ms to open, a 150ms grace
// to close that the card itself holds open, never on touch, Enter at once.

const open = vi.fn()
const close = vi.fn()

function Trigger() {
  const hover = useHoverIntent({ open, close })
  return (
    <>
      <button {...hover}>Maya</button>
      <div data-testid="card" {...hoverCardProps} />
    </>
  )
}

// jsdom has no PointerEvent, so pointerType is set on a mouse event by hand.
// React builds pointerenter and pointerleave from pointerover and pointerout.
function pointer(type: string, pointerType: string) {
  const e = new MouseEvent(type, { bubbles: true })
  Object.defineProperty(e, "pointerType", { value: pointerType })
  return e
}
const enter = (el: Element, pointerType = "mouse") => fireEvent(el, pointer("pointerover", pointerType))
const leave = (el: Element, pointerType = "mouse") => fireEvent(el, pointer("pointerout", pointerType))
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  forgetHoverCard()
  vi.useRealTimers()
  open.mockClear()
  close.mockClear()
})

describe("hover intent", () => {
  it("opens after 450ms at rest, anchored to the element itself", () => {
    render(<Trigger />)
    const t = screen.getByRole("button", { name: "Maya" })
    enter(t)
    wait(HOVER_OPEN_MS - 1)
    expect(open).not.toHaveBeenCalled()
    wait(1)
    expect(open).toHaveBeenCalledWith(t)
  })

  it("does not open when the pointer passes over", () => {
    render(<Trigger />)
    const t = screen.getByRole("button")
    enter(t)
    wait(200)
    leave(t)
    wait(HOVER_OPEN_MS)
    expect(open).not.toHaveBeenCalled()
  })

  it("never opens on touch", () => {
    render(<Trigger />)
    enter(screen.getByRole("button"), "touch")
    wait(HOVER_OPEN_MS * 2)
    expect(open).not.toHaveBeenCalled()
  })

  it("closes 150ms after leaving, unless the pointer moves into the card", () => {
    render(<Trigger />)
    const t = screen.getByRole("button")
    enter(t)
    wait(HOVER_OPEN_MS)
    leave(t)
    wait(HOVER_CLOSE_MS - 50)
    fireEvent(screen.getByTestId("card"), pointer("pointerover", "mouse"))
    wait(HOVER_CLOSE_MS)
    expect(close).not.toHaveBeenCalled()
    fireEvent(screen.getByTestId("card"), pointer("pointerout", "mouse"))
    wait(HOVER_CLOSE_MS)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("opens at once on Enter, and leaving does not close a card opened on purpose", () => {
    render(<Trigger />)
    const t = screen.getByRole("button")
    fireEvent.keyDown(t, { key: "Enter" })
    expect(open).toHaveBeenCalledWith(t)
    leave(t)
    wait(HOVER_CLOSE_MS * 2)
    expect(close).not.toHaveBeenCalled()
  })
})

describe("where people show", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  it("is on message authors, mentions, member lists and assignee chips", () => {
    expect(src("components/message/baseMessageCard.tsx").match(/\{\.\.\.authorHover\}/g)).toHaveLength(2)
    expect(src("components/minimal-tiptap/extensions/mention-list/MentionNodeView.tsx")).toContain("{...hover}")
    expect(src("components/textInput/textInput.tsx")).toContain("{...mentionHover}")
    expect(src("components/admin/AdminUserList.tsx")).toContain("useProfileHover(user.user_uuid)")
    expect(src("components/admin/AdminAdminList.tsx")).toContain("useProfileHover(admin.user_uuid)")
    expect(src("components/task/taskAssigneeCell.tsx")).toContain("{...hover}")
  })

  it("keeps a hovered card open while the pointer is in it", () => {
    expect(src("components/dialog/otherUserProfileDialog.tsx")).toContain("{...hoverCardProps}")
  })
})
