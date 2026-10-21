import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ConversationPins } from "@/components/conversation/pins/usePins"
import type { Pin } from "@/lib/conversation/pins"

// What the pin pieces draw from a conversation's pins (chat B25): the mark
// on a pinned row, the More menu's item, and the Details section. usePins is
// stood in for, so no request leaves the test.

let state: ConversationPins
const setPin = vi.fn(async () => {})
// As the hook: a null conversation (outside one) reads nothing.
vi.mock("@/components/conversation/pins/usePins", () => ({
  usePins: (ref: unknown) => (ref ? state : { ...state, pins: [], byMessage: new Map(), canPin: false }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: ({ name }: { name: string }) => <span data-face="">{name}</span> }))
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({ children, onSelect, onClick }: { children: React.ReactNode; onSelect?: () => void; onClick?: () => void }) => (
    <button type="button" role="menuitem" onClick={() => (onSelect ?? onClick)?.()}>{children}</button>
  ),
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const { ComposerHost } = await import("@/components/conversation/ComposerHost")
const { PinnedMark } = await import("@/components/conversation/pins/PinnedMark")
const { PinMenuItem } = await import("@/components/conversation/pins/PinMenuItem")
const { PinnedSection } = await import("@/components/conversation/pins/PinnedSection")

const channel = { kind: "channel", id: "c-1" } as const
const pin = (id: string, by: string, text: string): Pin => ({
  message_id: id,
  pinned_by: { user_uuid: by, user_name: by === "me" ? "me" : "maya" },
  pinned_at: "2026-10-17T09:00:00Z",
  message: { id, html: `<p>${text}</p>`, created_at: "2026-10-16T09:00:00Z", by: { user_uuid: "j", user_name: "jonas" } },
})
const pins = (list: Pin[], canPin = true, status: ConversationPins["status"] = "ready"): ConversationPins => ({
  pins: list,
  byMessage: new Map(list.map((p) => [p.message_id, p])),
  canPin,
  status,
  retry: vi.fn(),
  setPin,
})

afterEach(() => {
  cleanup()
  setPin.mockClear()
})


pinTestClock()

describe("a pinned message", () => {
  it("says who pinned it, as 'you' when it was the reader", () => {
    state = pins([pin("m-1", "maya", "plan"), pin("m-2", "me", "recap")])
    render(
      <ComposerHost target={channel}>
        <PinnedMark messageId="m-1" />
        <PinnedMark messageId="m-2" />
        <PinnedMark messageId="m-3" />
      </ComposerHost>,
    )
    const marks = document.querySelectorAll("[data-pinned]")
    expect(marks).toHaveLength(2)
    expect(marks[0].getAttribute("title")).toBe("Pinned by maya")
    expect(marks[1].getAttribute("title")).toBe("Pinned by you")
  })

  it("isn't marked outside a conversation", () => {
    state = pins([pin("m-1", "maya", "plan")])
    render(<PinnedMark messageId="m-1" />)
    expect(document.querySelector("[data-pinned]")).toBeNull()
  })
})

describe("the More menu's pin", () => {
  it("pins, or unpins what's pinned, for those who may", () => {
    state = pins([pin("m-1", "maya", "plan")])
    render(
      <ComposerHost target={channel}>
        <PinMenuItem messageId="m-1" />
        <PinMenuItem messageId="m-2" />
      </ComposerHost>,
    )
    fireEvent.click(screen.getByRole("menuitem", { name: /Unpin from this channel/ }))
    expect(setPin).toHaveBeenCalledWith("m-1", false)
    fireEvent.click(screen.getByRole("menuitem", { name: /Pin to this channel/ }))
    expect(setPin).toHaveBeenCalledWith("m-2", true)
  })

  it("isn't there for someone who may not pin", () => {
    state = pins([], false)
    render(
      <ComposerHost target={channel}>
        <PinMenuItem messageId="m-1" />
      </ComposerHost>,
    )
    expect(screen.queryByRole("menuitem")).toBeNull()
  })
})

describe("the Details' pinned section", () => {
  it("lists the pins newest first, opens one, and unpins for those who may", () => {
    state = pins([pin("m-2", "me", "recap"), pin("m-1", "maya", "plan")])
    const open = vi.fn()
    render(<PinnedSection conversation={channel} onOpenMessage={open} />)
    const rows = document.querySelectorAll("[data-pin-row]")
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("recap")
    expect(rows[0].textContent).toContain("Pinned by you")
    fireEvent.click(screen.getByRole("button", { name: /jonas: plan/ }))
    expect(open).toHaveBeenCalledWith("m-1")
    fireEvent.click(screen.getAllByRole("button", { name: "Unpin" })[0])
    expect(setPin).toHaveBeenCalledWith("m-2", false)
  })

  it("says when nothing is pinned, when it's loading and when it couldn't load", () => {
    state = pins([])
    const { unmount } = render(<PinnedSection conversation={channel} onOpenMessage={vi.fn()} />)
    expect(document.querySelector("[data-pins-empty]")?.textContent).toContain("Nothing is pinned yet")
    unmount()
    state = pins([], true, "error")
    render(<PinnedSection conversation={channel} onOpenMessage={vi.fn()} />)
    expect(document.body.textContent).toContain("the pinned messages")
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(state.retry).toHaveBeenCalled()
  })

  it("offers no Unpin to someone who may not pin", () => {
    state = pins([pin("m-1", "maya", "plan")], false)
    render(<PinnedSection conversation={channel} onOpenMessage={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Unpin" })).toBeNull()
  })
})
