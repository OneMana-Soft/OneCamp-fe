import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// Design v3 chat, C61: the phone's long-press sheet lifts the pressed message
// above itself as a copy, offers six reactions and three tiles, and keeps Edit
// and Delete to the message's owner.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/services/aiService", () => ({ useTranslateText: () => ({ translateText: async () => null, isSubmitting: false }) }))
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
    for (const e of SHEET_EMOJIS) expect(screen.getByRole("button", { name: `React with ${e.name}` })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pick another reaction" })).toBeTruthy()
    for (const name of ["Thread", "Quote", "Save"]) expect(screen.getByRole("button", { name })).toBeTruthy()
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

  it("dims the page with black at 32% and no blur, and buzzes once", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("components/drawers/messageActionSheet.tsx", "utf8")
    expect(src).toContain("bg-black/[0.32]")
    expect(src).not.toMatch(/backdrop-blur/)
    // The long press that opened it buzzes through feedback() (mobile F3: impact).
    expect(src).toContain(`feedback("impact")`)
  })
})
