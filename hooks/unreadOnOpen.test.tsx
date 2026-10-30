import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import React from "react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { TEST_TODAY } from "@/lib/testing/testClock"
import type { UserProfileInterface } from "@/types/user"

// Where you left off, opened by its address (chat B27). The "New" line and the
// banner read how many were unread as the conversation opens. A reload, a
// notification or a link opens it with the page, before the sidebar has
// answered, and the count read at once said none, so neither ever drew. The
// count now waits for an answer asked for since it opened: the one kept from
// the last visit (lib/swrCache) predates whatever came since, and the store's
// copy of one that came after has the conversation on screen marked read. A
// DM's or a group's latest page says the count itself, read as that request
// marks the conversation read; the sidebar's, asked for at the same moment,
// may come after that mark.

const SIDE = "/user/sidebarNav"
vi.mock("@/services/endPoints", () => ({ GetEndpointUrl: { SelfProfileSideNav: "/user/sidebarNav" } }))

// The cache as SWR holds it, and when a request of this page made each answer.
const cache = new Map<string, unknown>()
const fetched = new Map<string, number>()
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { data: url ? cache.get(url) : undefined }
  },
}))
vi.mock("@/lib/http/answered", () => ({ answeredAt: (url: string) => fetched.get(url), onAnswered: () => () => {} }))
let inPane = false
vi.mock("@/hooks/useLinkTarget", () => ({ useInSplitPane: () => inPane }))
// Where the page loaded: here (jsdom's address), or elsewhere before coming here.
let loadedHere = false
const navigation = () => [{ name: loadedHere ? location.href : new URL("/app/home", location.href).href }]

const { useUnreadOnOpen } = await import("./useUnreadOnOpen")

type Channels = { ch_uuid: string; unread_post_count?: number }[]
const storeWith = (userChannels: Channels) => configureStore({ reducer: { users: (s = { userSidebar: { userChannels } }) => s } })
const sidebarSays = (userChannels: Channels) => ({ data: { user_channels: userChannels } }) as unknown as UserProfileInterface
const inStore = (id: string) => (s: unknown) =>
  (s as { users: { userSidebar: { userChannels: Channels } } }).users.userSidebar.userChannels.find((c) => c.ch_uuid === id)?.unread_post_count
const inSidebar = (id: string) => (a: UserProfileInterface) => (a.data?.user_channels as Channels | undefined)?.find((c) => c.ch_uuid === id)?.unread_post_count

function open(store: ReturnType<typeof storeWith>, id: string | undefined, latest?: string) {
  return renderHook(({ id }: { id: string | undefined }) => useUnreadOnOpen(id, inStore(id ?? ""), inSidebar(id ?? ""), latest), {
    initialProps: { id: id as string | undefined },
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  })
}

/** An answer a request of this page made, a moment from now (ago, before the conversation opened). */
function answers(key: string, data: unknown, ago = false) {
  cache.set(key, data)
  fetched.set(key, Date.now() + (ago ? -1000 : 1000))
}

beforeEach(() => {
  vi.useFakeTimers({ now: TEST_TODAY, toFake: ["setTimeout", "clearTimeout", "Date"] })
  vi.spyOn(performance, "getEntriesByType").mockImplementation(navigation as never)
  cache.clear()
  fetched.clear()
  asked.length = 0
  inPane = false
  loadedHere = false
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("how many were unread as a conversation opened", () => {
  it("is the store's count when the sidebar had answered before it opened", () => {
    answers(SIDE, sidebarSays([{ ch_uuid: "c1", unread_post_count: 9 }]), true)
    const { result } = open(storeWith([{ ch_uuid: "c1", unread_post_count: 4 }]), "c1")
    // The store's count now (kept live since the answer), not the answer's.
    expect(result.current).toBe(4)
  })

  it("waits for the sidebar's answer when the conversation opened first, and reads it as it came", () => {
    // The app marks the conversation on screen read as the answer lands: the
    // store says none, the answer said seven.
    const { result, rerender } = open(storeWith([{ ch_uuid: "c1", unread_post_count: 0 }]), "c1")
    expect(result.current).toBeUndefined()
    answers(SIDE, sidebarSays([{ ch_uuid: "c1", unread_post_count: 7 }]))
    rerender({ id: "c1" })
    expect(result.current).toBe(7)
    // Read once: the sidebar isn't followed after that.
    asked.length = 0
    rerender({ id: "c1" })
    expect(asked.every((url) => url === "")).toBe(true)
  })

  it("opened with the page, takes the sidebar's answer, never the store's copy, which has it read", () => {
    // A link: the sidebar answered before the conversation's view was drawn,
    // and the store's copy of it has the conversation on screen marked read.
    loadedHere = true
    answers(SIDE, sidebarSays([{ ch_uuid: "c-link", unread_post_count: 6 }]))
    const { result } = open(storeWith([{ ch_uuid: "c-link", unread_post_count: 0 }]), "c-link")
    expect(result.current).toBe(6)
  })

  it("never reads the sidebar's answer kept from the last visit", () => {
    // A reload: the kept answer is there at once, from before what came since.
    loadedHere = true
    cache.set(SIDE, sidebarSays([{ ch_uuid: "c-reload", unread_post_count: 0 }]))
    const { result, rerender } = open(storeWith([{ ch_uuid: "c-reload", unread_post_count: 0 }]), "c-reload")
    expect(result.current).toBeUndefined()
    answers(SIDE, sidebarSays([{ ch_uuid: "c-reload", unread_post_count: 3 }]))
    rerender({ id: "c-reload" })
    expect(result.current).toBe(3)
  })

  it("reads a DM's or a group's count from its latest page, which counts as it marks it read", () => {
    const { result, rerender } = open(storeWith([]), "g1", "/latest/g1")
    // The sidebar came after that mark, and says none: not taken while the page is to come.
    answers(SIDE, sidebarSays([{ ch_uuid: "g1", unread_post_count: 0 }]))
    rerender({ id: "g1" })
    expect(result.current).toBeUndefined()
    answers("/latest/g1", { data: { chats: [], unread: 5 } })
    rerender({ id: "g1" })
    expect(result.current).toBe(5)
  })

  it("takes the sidebar's when the latest page doesn't say (an older server)", () => {
    const { result, rerender } = open(storeWith([]), "g1", "/latest/g1")
    answers("/latest/g1", { data: { chats: [] } })
    rerender({ id: "g1" })
    expect(result.current).toBeUndefined()
    answers(SIDE, sidebarSays([{ ch_uuid: "g1", unread_post_count: 2 }]))
    rerender({ id: "g1" })
    expect(result.current).toBe(2)
  })

  it("never reads a latest page kept from the last visit, or one from an earlier visit", () => {
    loadedHere = true
    cache.set("/latest/g-reload", { data: { chats: [], unread: 8 } })
    const kept = open(storeWith([]), "g-reload", "/latest/g-reload")
    expect(kept.result.current).toBeUndefined()
    answers("/latest/g-reload", { data: { chats: [], unread: 1 } })
    kept.rerender({ id: "g-reload" })
    expect(kept.result.current).toBe(1)

    // Back to it later in the same page: the page it read then says what was
    // unread then; the one asked for as it opens again says now.
    loadedHere = false
    answers("/latest/g2", { data: { chats: [], unread: 8 } }, true)
    const again = open(storeWith([]), "g2", "/latest/g2")
    expect(again.result.current).toBeUndefined()
    answers("/latest/g2", { data: { chats: [], unread: 0 } })
    again.rerender({ id: "g2" })
    expect(again.result.current).toBe(0)
  })

  it("beside the page, opens as any conversation opened after it", () => {
    loadedHere = true
    inPane = true
    answers(SIDE, sidebarSays([{ ch_uuid: "c-pane", unread_post_count: 9 }]), true)
    const { result } = open(storeWith([{ ch_uuid: "c-pane", unread_post_count: 2 }]), "c-pane")
    expect(result.current).toBe(2)
  })

  // A slow connection, or a loaded machine, can take more than 5 s for the
  // latest page: the count said none and the line never drew (whereYouLeftOff's
  // DM case, in a full gate).
  it("waits past 5 s for a DM's or a group's latest page that is still to come", () => {
    const { result, rerender } = open(storeWith([]), "g1", "/latest/g1")
    act(() => void vi.advanceTimersByTime(6000))
    expect(result.current).toBeUndefined()
    answers("/latest/g1", { data: { chats: [], unread: 3 } })
    rerender({ id: "g1" })
    expect(result.current).toBe(3)
  })

  it("opens with none when even its latest page never answers", () => {
    const { result } = open(storeWith([]), "g1", "/latest/g1")
    act(() => void vi.advanceTimersByTime(30_000))
    expect(result.current).toBe(0)
  })

  it("opens with none when nothing answers", () => {
    const { result } = open(storeWith([]), "c1")
    expect(result.current).toBeUndefined()
    act(() => void vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it("reads again for another conversation", () => {
    answers(SIDE, sidebarSays([]), true)
    const store = storeWith([{ ch_uuid: "c1", unread_post_count: 3 }, { ch_uuid: "c2", unread_post_count: 5 }])
    const { result, rerender } = open(store, "c1")
    expect(result.current).toBe(3)
    rerender({ id: "c2" })
    expect(result.current).toBe(5)
  })

  it("waits for an id that comes late, as a DM's does", () => {
    answers(SIDE, sidebarSays([{ ch_uuid: "c1", unread_post_count: 2 }]), true)
    const { result, rerender } = open(storeWith([{ ch_uuid: "c1", unread_post_count: 2 }]), undefined)
    expect(result.current).toBeUndefined()
    rerender({ id: "c1" })
    expect(result.current).toBe(2)
  })
})

// React is used by the JSX in the wrappers.
void React
