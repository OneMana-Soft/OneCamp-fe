import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

/**
 * The Inbox's Threads tab (chat P2): fourth of Priority, All, Mentions and
 * Threads (this edition has no Agents tab), a plain count of the threads with replies you haven't
 * read, ?tab=threads, key 4, and Mark all read reading every thread you
 * follow. Its list loads the first time the tab opens.
 */

const FEED = [
  {
    activity_type: "MENTION",
    time: new Date().toISOString(),
    priority: "high",
    actor_kind: "person",
    mention: { mention_created_at: new Date().toISOString(), mention_post: { post_uuid: "p-9", post_text: "Can you check?", post_channel: { ch_uuid: "c-9", ch_name: "ops" }, post_by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber" } } },
  },
]
const THREADS = [
  {
    root: "p-1",
    conversation: { kind: "channel", id: "c-1" },
    place: { name: "engineering" },
    message: { html: "<p>Rollback plan</p>", by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber" } },
    replies: 4,
    new: 2,
    latest: [],
    unread: true,
    follow: "auto",
  },
]

const { search, post, keys, answers } = vi.hoisted(() => ({ search: { current: "tab=threads" }, post: vi.fn(), keys: new Set<string>(), answers: new Map<string, unknown>() }))
vi.mock("@/hooks/useFetch", () => ({
  // One answer per key, the same object each render, as SWR's cache gives.
  useFetch: (key: string) => {
    keys.add(key)
    if (!answers.has(key)) {
      const data =
        key === "/chat-threads/unread" ? { data: { unread: 2 } } :
        key === "/chat-threads" ? { data: { threads: THREADS, unread: 1 } } :
        key ? { data: { activities: FEED, has_more: false } } : undefined
      answers.set(key, { data, isLoading: false, isError: undefined, mutate: () => {} })
    }
    return answers.get(key)
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
}))
vi.mock("@/lib/axiosInstance", () => ({ default: { put: vi.fn(async () => ({ data: {} })), get: vi.fn(), post }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(), patchCached: vi.fn() }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => true,
  useFeature: () => false,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(search.current),
}))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { isOpen: false, data: {} } } }),
}))
vi.mock("@/hooks/usePhone", () => ({ usePhone: () => false }))
vi.mock("@/components/navigationBar/tablet/useShellBand", () => ({ usePanelPlacement: () => "beside", useShellBand: () => "desktop" }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
vi.mock("@/services/activityService", () => ({ markActivitySeen: async () => {} }))
vi.mock("@/components/ai/InboxNudges", () => ({ default: () => null }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem, keyExtractor }: { items: T[]; renderItem: (item: T, i: number) => ReactNode; keyExtractor?: (item: T, i: number) => string | number }) => (
    <div>
      {items.map((item, i) => (
        <div key={keyExtractor ? keyExtractor(item, i) : i}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}))

import { ActivityListTabs } from "@/components/activity/activityListTabs"

beforeEach(() => {
  search.current = "tab=threads"
  post.mockReset()
  post.mockResolvedValue({ data: { data: { read: 1 } } })
  keys.clear()
  answers.clear()
  localStorage.clear()
})
afterEach(cleanup)

describe("the Threads tab", () => {
  it("is fourth and last, with a plain count (this edition has no Agents tab)", () => {
    render(<ActivityListTabs />)
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((t) => t.querySelector("[data-label]")?.textContent)).toEqual(["Priority", "All", "Mentions", "Threads"])
    const threads = tabs[3]
    expect(threads.textContent).toContain("2")
    // A plain count, as All's: the brand badge is a mention's.
    expect(threads.querySelector("[data-tab-badge]")).toBeNull()
  })

  it("opens from ?tab=threads, and lists the threads you follow", async () => {
    render(<ActivityListTabs />)
    expect(screen.getAllByRole("tab")[3].getAttribute("aria-selected")).toBe("true")
    expect(await screen.findByRole("link", { name: /^Jonas Weber in #engineering\. 4 replies, 2 new$/ })).toBeTruthy()
  })

  it("is key 4 from any tab", async () => {
    search.current = "tab=all"
    render(<ActivityListTabs />)
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true")
    expect(keys.has("/chat-threads"), "the list isn't read until the tab opens").toBe(false)
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "4" })
    })
    expect(screen.getAllByRole("tab")[3].getAttribute("aria-selected")).toBe("true")
    expect(await screen.findByRole("link", { name: /^Jonas Weber in #engineering/ })).toBeTruthy()
  })

  it("marks every thread you follow read", async () => {
    render(<ActivityListTabs />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all read" }))
    })
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith("/chat-threads/read-all", {}, { suppressErrorToast: true }))
  })
})
