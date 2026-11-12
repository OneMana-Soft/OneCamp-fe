import type React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A PHONE THREAD'S SHEETS ASK BEFORE DELETING (UX-CHAT-H1: the audit's
// CHAT-05 and CHAT-04 step 1; closes the chat lane's V-724). On a phone, a
// thread is its own page, and a long press there opened one of five older
// drawers (the root's in a channel, a DM and a group; a reply's in a channel
// and a DM), whose Delete deleted at once, for everyone, with no question,
// while the list's sheet asked "Delete for everyone?" in place. The root's
// drawer had no Follow thread (V-724), and a DM reply's offered Edit to
// anyone and Delete to no one. Each is now the list's sheet.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => <span data-face="" /> }))
// The reader's own profile and the thread's standing: not yet followed.
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: key.endsWith("/follow") ? { data: { root: "p1", following: false, follow: "off" } } : undefined, isLoading: false, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openUI } = await import("@/store/slice/uiSlice")
const { PostMessageLongPressDrawer } = await import("./postMessageLongPressDrawer")
const { DmChatMessageLongPressDrawer } = await import("./dmChatMessageLongPressDrawer")
const { DmGroupChatMessageLongPressDrawer } = await import("./dmGroupChatMessageLongPressDrawer")
const { PostCommentMessageLongPressDrawer } = await import("./postCommentMessageLongPressDrawer")
const { DmChatCommentMessageLongPressDrawer } = await import("./dmChatCommentMessageLongPressDrawer")

beforeEach(() => {
  store.dispatch({ type: RESET_STORE_ACTION })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** What UnifiedUIManager hands every one of the five, whatever it is (its props are unchanged). */
const common = (deleteMessage: () => void) => ({
  drawerOpenState: true,
  setOpenState: vi.fn(),
  onAddEmoji: vi.fn(),
  copyTextToClipboard: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage,
  handleEmojiClick: vi.fn(),
})

const app = (ui: React.ReactNode) => render(<Provider store={store}>{ui}</Provider>)

/** Delete is asked in place: nothing goes until Delete is chosen there; Cancel keeps it. */
async function asksBeforeDeleting(deleted: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: "Delete message" }))
  await act(() => vi.advanceTimersByTimeAsync(500))
  const ask = screen.getByRole("group", { name: "Delete this message?" })
  expect(ask.textContent).toContain("Delete for everyone?")
  expect(deleted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.queryByRole("group", { name: "Delete this message?" })).toBeNull()
  expect(deleted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Delete message" }))
  fireEvent.click(screen.getByRole("button", { name: "Delete" }))
  await act(() => vi.advanceTimersByTimeAsync(500))
  expect(deleted).toHaveBeenCalledTimes(1)
}

const roots = [
  ["a channel", (del: () => void) => <PostMessageLongPressDrawer {...common(del)} postUUID="p1" channelUUID="c1" makeTask={vi.fn()} isOwner />],
  ["a DM", (del: () => void) => <DmChatMessageLongPressDrawer {...common(del)} chatUUID="p1" otherUserUUID="maya" makeTask={vi.fn()} isOwner />],
  ["a group", (del: () => void) => <DmGroupChatMessageLongPressDrawer {...common(del)} chatUUID="p1" grpId="g1" makeTask={vi.fn()} isOwner />],
] as const

describe("a phone thread page's sheets", () => {
  it("a thread page's sheet asks 'Delete for everyone?' before deleting the root, in a channel, a DM and a group", async () => {
    for (const [kind, sheet] of roots) {
      const deleted = vi.fn()
      app(sheet(deleted))
      await asksBeforeDeleting(deleted)
      expect(screen.getByRole("dialog", { name: "Message actions" }), kind).toBeTruthy()
      cleanup()
    }
  })

  it("a reply's sheet asks too, and offers no Thread tile", async () => {
    const channelReply = vi.fn()
    app(<PostCommentMessageLongPressDrawer {...common(channelReply)} isOwner />)
    await asksBeforeDeleting(channelReply)
    expect(screen.queryByRole("button", { name: "Thread" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull()
    expect(screen.getByRole("button", { name: "Copy text" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Edit message" })).toBeTruthy()
    cleanup()

    // A DM reply's drawer is handed no owner by UnifiedUIManager; its opener put it in the sheet's data.
    const dmReply = vi.fn()
    store.dispatch(openUI({ key: "dmChatCommentLongPress", data: { isOwner: true, isAdmin: false } }))
    app(<DmChatCommentMessageLongPressDrawer {...common(dmReply)} />)
    await asksBeforeDeleting(dmReply)
    expect(screen.queryByRole("button", { name: "Thread" })).toBeNull()
    expect(screen.getByRole("button", { name: "Edit message" })).toBeTruthy()
    cleanup()

    // Someone else's DM reply: no Edit and no Delete (the old drawer offered Edit to anyone).
    store.dispatch(openUI({ key: "dmChatCommentLongPress", data: { isOwner: false, isAdmin: false } }))
    app(<DmChatCommentMessageLongPressDrawer {...common(vi.fn())} />)
    expect(screen.getByRole("button", { name: "Copy text" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete message" })).toBeNull()
    cleanup()

    // An admin on someone else's DM reply: Delete, asked like any other, and never Edit (the opener's isAdmin).
    const adminDelete = vi.fn()
    store.dispatch(openUI({ key: "dmChatCommentLongPress", data: { isOwner: false, isAdmin: true } }))
    app(<DmChatCommentMessageLongPressDrawer {...common(adminDelete)} />)
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull()
    await asksBeforeDeleting(adminDelete)
  })

  it("the root's sheet offers Follow thread (V-724)", () => {
    for (const [kind, sheet] of roots) {
      app(sheet(vi.fn()))
      expect(screen.getByRole("button", { name: "Follow thread" }), kind).toBeTruthy()
      // On the thread's own page: no tile to open the thread it is on; its link, Forward, Save and Pin stay.
      expect(screen.queryByRole("button", { name: "Thread" }), kind).toBeNull()
      for (const name of ["Copy link", "Forward", "Save", "Make a task"]) expect(screen.getByRole("button", { name }), `${kind}: ${name}`).toBeTruthy()
      cleanup()
    }
  })
})
