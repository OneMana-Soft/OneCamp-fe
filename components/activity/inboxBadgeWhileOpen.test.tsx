import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"

// A notice that arrives while the Inbox is open is counted by the server (the
// badge reads its count again: 1) and reads the Inbox's first page in, which
// then tells the server it is seen. The badge is that write's answer, 0. It
// stayed on 1 beside the Inbox the reader was looking at, and in the tab's
// title, until they left and came back, while the server's count was 0.

let firstPage: unknown = undefined
// What SWR hands back; reading a key again is answered at once (lib/http/answered), as the app's reads are.
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
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams("tab=all"),
}))
const { markActivitySeen } = vi.hoisted(() => ({ markActivitySeen: vi.fn(async () => 0) }))
vi.mock("@/services/activityService", () => ({ markActivitySeen }))
vi.mock("@/components/activity/activityFeedList", () => ({ ActivityFeedList: () => <div>feed</div> }))
vi.mock("@/components/ai/InboxNudges", () => ({ default: () => null }))

const { default: userSlice, setTotalUnreadActivityCount } = await import("@/store/slice/userSlice")
const { noteAnswered } = await import("@/lib/http/answered")
const { inboxFeedKey, INBOX_PAGE_SIZE } = await import("@/lib/activity/feedPages")
const { ActivityListTabs } = await import("@/components/activity/activityListTabs")

function inbox() {
  const store = configureStore({ reducer: { users: userSlice.reducer } })
  const ui = render(
    <Provider store={store}>
      <ActivityListTabs />
    </Provider>,
  )
  const badge = () => store.getState().users.userSidebar.totalUnreadActivityCount
  const rerender = () =>
    ui.rerender(
      <Provider store={store}>
        <ActivityListTabs />
      </Provider>,
    )
  return { store, badge, rerender }
}

afterEach(() => {
  cleanup()
  firstPage = undefined
  markActivitySeen.mockClear()
})

/** Lets the seen write's answer land. */
const settle = () => act(async () => {})

describe("the Inbox badge while the Inbox is open", () => {
  it("is clear again once the page that shows a new notice is on screen", async () => {
    firstPage = { data: { activities: [], has_more: false } }
    const { store, badge, rerender } = inbox()
    await settle()
    expect(badge()).toBe(0)

    // The notice: the server's count, read again, says 1...
    act(() => {
      store.dispatch(setTotalUnreadActivityCount({ count: 1 }))
    })
    expect(badge()).toBe(1)

    // ...and the Inbox's first page answers again, with it on screen: seen,
    // and the write's answer is the badge.
    firstPage = { data: { activities: [], has_more: false } }
    rerender()
    act(() => noteAnswered(inboxFeedKey("/activity/unified", INBOX_PAGE_SIZE)))
    await settle()
    expect(markActivitySeen).toHaveBeenCalledTimes(2)
    expect(badge()).toBe(0)
  })
})
