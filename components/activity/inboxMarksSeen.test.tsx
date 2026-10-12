import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// Only the Inbox marks the feed seen, by asking, once its first page is on
// screen. Reading the feed used to mark it seen on the server, and Home reads
// it on every load, so opening the app cleared the badge with replies and
// reactions unseen (TN-BUG-11).

let firstPage: unknown = undefined
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: firstPage, isLoading: firstPage === undefined }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: () => false,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams("tab=all"),
}))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
const markActivitySeen = vi.fn(async () => {})
vi.mock("@/services/activityService", () => ({ markActivitySeen: () => markActivitySeen() }))
vi.mock("@/components/activity/activityFeedList", () => ({ ActivityFeedList: () => <div>feed</div> }))

import { ActivityListTabs } from "@/components/activity/activityListTabs"

afterEach(() => {
  cleanup()
  firstPage = undefined
  markActivitySeen.mockClear()
})

describe("the Inbox", () => {
  it("marks the feed seen once its first page is on screen", () => {
    const { rerender } = render(<ActivityListTabs />)
    // Still loading: nothing has been shown, so nothing is seen.
    expect(markActivitySeen).not.toHaveBeenCalled()
    firstPage = { data: { activities: [], has_more: false } }
    rerender(<ActivityListTabs />)
    expect(markActivitySeen).toHaveBeenCalledTimes(1)
    // The same answer again marks nothing more.
    rerender(<ActivityListTabs />)
    expect(markActivitySeen).toHaveBeenCalledTimes(1)
  })

  it("marks it seen again when a newer first page arrives while it's open", () => {
    firstPage = { data: { activities: [], has_more: false } }
    const { rerender } = render(<ActivityListTabs />)
    expect(markActivitySeen).toHaveBeenCalledTimes(1)
    firstPage = { data: { activities: [], has_more: false } }
    rerender(<ActivityListTabs />)
    expect(markActivitySeen).toHaveBeenCalledTimes(2)
  })
})
