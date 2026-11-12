import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { ReactNode } from "react"
import type { UnifiedActivityItem } from "@/types/activity"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// What may move the Inbox badge (owner's bug, 5 Nov): only the server's count
// (GET /activity/unread) and the Inbox's seen answer. The sidenav carried the
// number too, and its request, sent as the nav remounted on the click to Inbox,
// landed after the Inbox's clear and put the old number back beside the open
// Inbox (C1). A live item added 1 to it, whether or not the Inbox would ever
// list that item (C2), or was open in front of it (C3). A read elsewhere, or
// the Inbox opened in another tab, told this tab nothing (C6, C7). And the
// Inbox's dots used a rule of their own, not the badge's (C8).

const { appMutate, sidenav } = vi.hoisted(() => ({ appMutate: vi.fn(), sidenav: { data: undefined as unknown } }))
vi.mock("@/lib/swrMutate", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/swrMutate")>()), appMutate }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => sidenav }))
// The badge's own read, kept quiet: these tests are about the other sources.
vi.mock("swr", async (importOriginal) => ({ ...(await importOriginal<typeof import("swr")>()), default: () => ({ data: undefined }) }))

const { default: userSlice, setTotalUnreadActivityCount } = await import("@/store/slice/userSlice")
const { default: messageResyncSlice, triggerMessageCatchUp } = await import("@/store/slice/messageResyncSlice")
const { useHydrateUserSidebar } = await import("@/hooks/useHydrateUserSidebar")
const { useActivityMessageHandlers } = await import("@/hooks/useActivityMessageHandlers")
const { applyReadMoved } = await import("@/lib/conversation/readMoved")
const { isUnread } = await import("@/lib/activity/readState")
type Item = Partial<UnifiedActivityItem>

function withStore(badge: number) {
  const store = configureStore({ reducer: { users: userSlice.reducer, messageResync: messageResyncSlice.reducer } })
  store.dispatch(setTotalUnreadActivityCount({ count: badge }))
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return { store, wrapper, badge: () => store.getState().users.userSidebar.totalUnreadActivityCount }
}

const recounted = () => appMutate.mock.calls.filter(([key]) => key === "/activity/unread").length

afterEach(() => {
  cleanup()
  appMutate.mockReset()
  sidenav.data = undefined
})

describe("the Inbox badge's sources", () => {
  it("never takes the sidenav's number: its answer can predate the Inbox's seen write (C1)", () => {
    const { wrapper, badge } = withStore(0) // the Inbox's seen answer: 0
    sidenav.data = { msg: "ok", data: { user_uuid: "sam", user_total_unread_activity_count: 4 } }
    renderHook(() => useHydrateUserSidebar(), { wrapper })
    expect(badge()).toBe(0)
  })

  it("reads the count again for a live item instead of adding 1 to it (C2, C3)", () => {
    const { wrapper, badge } = withStore(0)
    const { result } = renderHook(() => useActivityMessageHandlers({ userUuid: "sam" }), { wrapper })
    act(() => {
      result.current.handleActivityMessage(JSON.stringify({ type: 1, data: { user_uuid: "sam", activity: { activity_type: "MENTION" } } }))
    })
    expect(badge()).toBe(0)
    expect(recounted()).toBe(1)
    act(() => {
      result.current.handleNoticeMessage(JSON.stringify({ type: 2, data: { user_uuid: "sam", activity: { activity_type: "NOTICE" } } }))
    })
    expect(badge()).toBe(0)
    expect(recounted()).toBe(2)
  })

  // The count was read before the live connection's subscriptions were
  // answered, and an Inbox event sent in between reached no one (V-577). Each
  // time the connection is live again (RealtimeEngine's onSubscribed, the
  // first connection and every reconnect), the server's count is read again.
  it("reads the count again each time the live connection is back", () => {
    const { store, wrapper } = withStore(1)
    renderHook(() => useActivityMessageHandlers({ userUuid: "sam" }), { wrapper })
    expect(recounted()).toBe(0)
    act(() => void store.dispatch(triggerMessageCatchUp()))
    expect(recounted()).toBe(1)
    act(() => void store.dispatch(triggerMessageCatchUp()))
    expect(recounted()).toBe(2)
  })

  it("reads the count again when the Inbox was opened in another tab or device (C6)", () => {
    applyReadMoved(vi.fn(), { kind: "inbox", unread: 0, seen: "2026-11-05T09:00:00Z" })
    expect(recounted()).toBe(1)
  })

  it("reads the count again when a conversation was read, here or elsewhere (C7)", () => {
    applyReadMoved(vi.fn(), { kind: "channel", id: "c1", unread: 0 })
    expect(recounted()).toBe(1)
  })

  it("draws the Inbox's dots on the items the badge counted (C8)", () => {
    const none = new Set<string>()
    // The server's mark, whatever the item's priority: a demoted one it counted still gets its dot.
    const demoted: Item = { priority: "low", unread: true }
    const urgentRead: Item = { priority: "high", unread: false }
    const unmarked: Item = { priority: "high" }
    expect(isUnread(demoted, "k", none)).toBe(true)
    expect(isUnread(urgentRead, "k", none)).toBe(false)
    expect(isUnread(unmarked, "k", none)).toBe(false)
    // Marked read in this browser: no dot.
    expect(isUnread({ unread: true }, "k", new Set(["k"]))).toBe(false)
  })
})
