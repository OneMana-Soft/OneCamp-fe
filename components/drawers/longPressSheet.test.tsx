import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// Design v3 chat, C61: the phone's long-press sheet lifts the pressed message
// above itself as a copy, offers six reactions and three tiles, and keeps Edit
// and Delete to the message's owner.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => <span data-face="" /> }))

const { MessageActionSheet, SHEET_EMOJIS } = await import("./messageActionSheet")

function sheet(extra: Record<string, unknown> = {}) {
  return render(
    <MessageActionSheet
      open
      onOpenChange={() => {}}
      preview={{ name: "Maya Chen", html: "<p>Added them under Decisions.</p>", createdAt: "2026-10-10T10:31:00Z" }}
      threadPath="/app/channel/c1/p1"
      laterTarget={{ itemType: "post", itemId: "p1", link: "/app/channel/c1/p1", title: "Added them" }}
      onReply={() => {}}
      onAddEmoji={() => {}}
      handleEmojiClick={() => {}}
      copyText={() => {}}
      editMessage={() => {}}
      deleteMessage={() => {}}
      messageText="Added them under Decisions."
      {...extra}
    />,
  )
}

describe("the long-press sheet", () => {
  afterEach(cleanup)

  it("lifts a copy of the pressed message above the sheet", () => {
    sheet()
    const copy = document.querySelector("[data-sheet-preview]")!
    expect(copy).toBeTruthy()
    expect(copy.textContent).toContain("Maya Chen")
    expect(copy.textContent).toContain("Added them under Decisions.")
    expect(copy.className).toContain("bottom-full")
  })

  it("offers six reactions, a picker, and the three tiles", () => {
    sheet()
    expect(SHEET_EMOJIS).toHaveLength(6)
    for (const e of SHEET_EMOJIS) expect(screen.getByRole("button", { name: `React with ${e.label}` })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pick another reaction" })).toBeTruthy()
    for (const name of ["Thread", "Quote", "Save"]) expect(screen.getByRole("button", { name })).toBeTruthy()
  })

  // MC-77: the six were always the same six; they lead with your recent ones.
  it("leads its reactions with the ones you used last", async () => {
    const { noteReaction } = await import("@/lib/chat/recentReactions")
    noteReaction({ id: "fire", native: "🔥", name: "Fire" })
    try {
      const picked = vi.fn()
      sheet({ handleEmojiClick: picked })
      const names = screen.getAllByRole("button", { name: /^React with / }).map((b) => b.getAttribute("aria-label"))
      expect(names).toEqual(["React with Fire", "React with done", "React with looking", "React with nice work", "React with rocket", "React with celebrate"])
      screen.getByRole("button", { name: "React with Fire" }).click()
      expect(picked).toHaveBeenCalledWith("fire")
    } finally {
      localStorage.clear()
    }
  })

  // SD-5: Delete asks here, in the sheet, as a computer's More menu does; a
  // dialog opened half a second after the sheet had closed.
  it("asks before deleting, in the sheet, and deletes on Delete", async () => {
    const deleted = vi.fn()
    const closed = vi.fn()
    sheet({ isOwner: true, deleteMessage: deleted, onOpenChange: closed })
    fireEvent.click(screen.getByRole("button", { name: "Delete message" }))
    const ask = screen.getByRole("group", { name: "Delete this message?" })
    expect(ask.textContent).toContain("Delete for everyone?")
    expect(deleted).not.toHaveBeenCalled()

    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("group", { name: "Delete this message?" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Delete message" }))
    fireEvent.click(within(screen.getByRole("group", { name: "Delete this message?" })).getByRole("button", { name: "Delete" }))
    expect(closed).toHaveBeenCalledWith(false)
    await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1))
  })

  // The question takes the place of the row that asked it: the focus goes to
  // its Cancel, and back to the row when it's cancelled. It was left on the
  // removed row, so a keyboard or a screen reader lost its place in the sheet.
  it("moves the focus into the question, and back to Delete message on Cancel", () => {
    sheet({ isOwner: true })
    const row = screen.getByRole("button", { name: "Delete message" })
    row.focus()
    fireEvent.click(row)
    const ask = screen.getByRole("group", { name: "Delete this message?" })
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }))

    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete message" }))
  })

  it("hides the owner's actions from everyone else", () => {
    sheet()
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete message" })).toBeNull()
    cleanup()
    sheet({ isOwner: true })
    expect(screen.getByRole("button", { name: "Edit message" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Delete message" }).className).toContain("text-danger-ink")
  })

  it("dims the page with the shared sheet's one scrim, no blur, and buzzes once", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("components/drawers/messageActionSheet.tsx", "utf8")
    // The shared sheet's scrim (32% ink, 55% black in dark), none of its own:
    // its own could stay over the page after an interrupted close (db2 F2).
    expect(src).toMatch(/<DrawerContent\b/)
    expect(src).not.toMatch(/Overlay|bg-black\//)
    expect(src).not.toMatch(/backdrop-blur/)
    // The long press that opened it buzzes through feedback() (mobile F3: impact).
    expect(src).toContain(`feedback("impact")`)
  })
})
