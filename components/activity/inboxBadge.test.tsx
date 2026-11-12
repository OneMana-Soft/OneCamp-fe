import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"

import { pinTestClock } from "@/lib/testing/testClock"

// The Inbox badge (owner's bug, 5 Nov): it stayed on, even on clicking Inbox,
// and nothing in the Inbox said which item it counted. The number now comes
// from the server's answers alone: opening the Inbox sets it from the seen
// write's own answer, a failed write keeps it (never a 0 the server didn't
// confirm), and back at the Inbox from its nav link with something counted,
// the All tab, which lists it, is the one open.

let firstPage: unknown = undefined
let query = "tab=all"
// What SWR hands back for each key; reading a key again is answered at once (lib/http/answered), as the app's reads are.
vi.mock("@/hooks/useFetch", async () => {
  const { noteAnswered } = await import("@/lib/http/answered")
  return { useFetch: (url: string) => ({ data: firstPage, isLoading: firstPage === undefined, mutate: async () => noteAnswered(url) }) }
})
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
  useFeature: () => false,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: (to: string) => (query = to.split("?")[1] ?? "") }),
  useSearchParams: () => new URLSearchParams(query),
}))
const { markActivitySeen, appMutate } = vi.hoisted(() => ({ markActivitySeen: vi.fn(), appMutate: vi.fn() }))
vi.mock("@/services/activityService", () => ({ markActivitySeen }))
vi.mock("@/lib/swrMutate", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/swrMutate")>()), appMutate }))
// The list reports the unread rows in view (none, unless a test says).
const shown = vi.hoisted(() => ({ keys: [] as string[] }))
vi.mock("@/components/activity/activityFeedList", () => ({
  ActivityFeedList: ({ onUnreadKeys }: { onUnreadKeys?: (keys: string[]) => void }) => {
    useEffect(() => onUnreadKeys?.(shown.keys), [onUnreadKeys])
    return <div>feed</div>
  },
}))

const { default: userSlice, setTotalUnreadActivityCount } = await import("@/store/slice/userSlice")
const { ActivityListTabs } = await import("@/components/activity/activityListTabs")

pinTestClock()

const PAGE = { data: { activities: [], has_more: false } }
const { activityKey } = await import("@/lib/activity/feedPages")

function inbox(badge: number) {
  const store = configureStore({ reducer: { users: userSlice.reducer } })
  store.dispatch(setTotalUnreadActivityCount({ count: badge }))
  const view = () => (
    <Provider store={store}>
      <ActivityListTabs />
    </Provider>
  )
  const ui = render(view())
  return { store, badge: () => store.getState().users.userSidebar.totalUnreadActivityCount, rerender: () => ui.rerender(view()) }
}

/** Lets the seen write's answer land. */
const settle = () => act(async () => {})

afterEach(() => {
  cleanup()
  firstPage = undefined
  query = "tab=all"
  shown.keys = []
  window.localStorage.clear()
  markActivitySeen.mockReset()
  appMutate.mockReset()
})

describe("the Inbox badge as the Inbox opens", () => {
  it("Mark all read is a seen write too, and takes the dots off every row the badge counted (A4, CR-B10 M1)", async () => {
    markActivitySeen.mockResolvedValue(0)
    const inView = { activity_type: "MENTION", time: "2026-11-05T09:00:00Z", priority: "high", unread: true, mention: { mention_post: { post_uuid: "p-1" } } }
    const elsewhere = { ...inView, priority: "normal", mention: { mention_post: { post_uuid: "p-2" } } }
    firstPage = { data: { activities: [inView, elsewhere], has_more: false } }
    shown.keys = [activityKey(inView as never)]
    inbox(2)
    await settle()
    expect(markActivitySeen).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem("activity:counted") ?? "[]")).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }))
    await settle()
    expect(markActivitySeen).toHaveBeenCalledTimes(2)
    // Both counted rows are read here, the one out of view too: no dot comes back when the page is read again.
    expect(JSON.parse(window.localStorage.getItem("activity:counted") ?? "[]")).toEqual([])
    expect(JSON.parse(window.localStorage.getItem("activity:read") ?? "[]")).toEqual(expect.arrayContaining([activityKey(inView as never), activityKey(elsewhere as never)]))
  })

  it("is what the seen write answers, and never a 0 before it", async () => {
    markActivitySeen.mockResolvedValue(2) // two arrived between the read and the write
    firstPage = PAGE
    const { badge } = inbox(5)
    expect(badge()).toBe(5)
    await settle()
    expect(markActivitySeen).toHaveBeenCalledTimes(1)
    expect(badge()).toBe(2)
  })

  it("keeps its number when the seen write fails, and tries again when the app is back online (C5)", async () => {
    markActivitySeen.mockResolvedValue(false)
    firstPage = PAGE
    const { badge } = inbox(5)
    await settle()
    expect(badge()).toBe(5)
    markActivitySeen.mockResolvedValue(0)
    await act(async () => {
      window.dispatchEvent(new Event("online"))
    })
    expect(markActivitySeen).toHaveBeenCalledTimes(2)
    expect(badge()).toBe(0)
  })

  it("reads the count again when the seen write was done but couldn't be counted", async () => {
    markActivitySeen.mockResolvedValue(null)
    firstPage = PAGE
    const { badge } = inbox(5)
    await settle()
    expect(badge()).toBe(5)
    expect(appMutate).toHaveBeenCalledWith("/activity/unread")
  })

  it("opens All, which lists what it counted, when its nav link brings you back with something counted (C9)", async () => {
    markActivitySeen.mockResolvedValue(false)
    query = "tab=mentions"
    firstPage = PAGE
    const { rerender } = inbox(3)
    await settle()
    expect(screen.getByRole("tab", { name: /Mentions/ }).getAttribute("aria-selected")).toBe("true")
    // The nav's Inbox link: the address without a tab.
    query = ""
    rerender()
    await settle()
    expect(screen.getByRole("tab", { name: /^All/ }).getAttribute("aria-selected")).toBe("true")
  })
})
