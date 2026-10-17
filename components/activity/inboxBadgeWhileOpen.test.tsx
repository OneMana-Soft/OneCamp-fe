import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"

// A notice that arrives while the Inbox is open counts on the badge (the
// realtime handler can't tell that the Inbox is open) and reads the Inbox's
// first page in, which then tells the server it is seen. The badge stayed on
// 1 beside the Inbox the reader was looking at, and in the tab's title, until
// they left and came back, while the server's count was already 0.

let firstPage: unknown = undefined
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: firstPage, isLoading: firstPage === undefined }) }))
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
const { markActivitySeen, clearActivityUnread } = vi.hoisted(() => ({ markActivitySeen: vi.fn(async () => {}), clearActivityUnread: vi.fn() }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread }))
vi.mock("@/services/activityService", () => ({ markActivitySeen }))
vi.mock("@/components/activity/activityFeedList", () => ({ ActivityFeedList: () => <div>feed</div> }))
vi.mock("@/components/ai/InboxNudges", () => ({ default: () => null }))

const { default: userSlice, incrementTotalUnreadActivityCount } = await import("@/store/slice/userSlice")
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
  clearActivityUnread.mockClear()
})

describe("the Inbox badge while the Inbox is open", () => {
  it("is clear again once the page that shows a new notice is on screen", () => {
    firstPage = { data: { activities: [], has_more: false } }
    const { store, badge, rerender } = inbox()
    expect(badge()).toBe(0)

    // The notice: the realtime handler counts it on the badge...
    act(() => {
      store.dispatch(incrementTotalUnreadActivityCount())
    })
    expect(badge()).toBe(1)

    // ...and the Inbox's first page answers again, with it on screen.
    firstPage = { data: { activities: [], has_more: false } }
    rerender()
    expect(markActivitySeen).toHaveBeenCalledTimes(2)
    expect(badge()).toBe(0)
    // The sidenav's cache says the same (services/unreadCache).
    expect(clearActivityUnread).toHaveBeenCalledTimes(2)
  })
})
