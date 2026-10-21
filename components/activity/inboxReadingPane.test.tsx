import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

/**
 * The Inbox reads beside its list (STEP4 #6).
 *
 * At 1280 the right quarter of the Inbox was empty, every row left the Inbox
 * for its page, and the demo's twelve rows said the same thing ("shared …
 * With you. You can edit it."). Now a thread, a task or an event opens in the
 * right panel beside the list, J and K walk the rows with the panel
 * following, one person's shares fold into one row that lists its docs, and
 * Compact draws one line a row.
 */

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const JONAS = { user_uuid: "u-jonas", user_full_name: "Jonas Weber", user_name: "Jonas Weber" }
const MAYA = { user_uuid: "u-maya", user_full_name: "Maya Chen", user_name: "Maya Chen" }
const share = (n: number, title: string) => ({
  activity_type: "NOTICE",
  time: ago(20 + n),
  priority: "normal",
  actor_kind: "person",
  notice: { id: `n-${n}`, kind: "doc.shared", resource_kind: "doc", resource_uuid: `d-${n}`, title, can_open: true, reason: "subject", actor: JONAS, data: { level: "edit" }, created_at: ago(20 + n) },
})
const FEED = [
  {
    activity_type: "MENTION",
    time: ago(5),
    priority: "high",
    actor_kind: "person",
    mention: { mention_created_at: ago(5), mention_post: { post_uuid: "p-1", post_text: "Can you check the rollback steps?", post_channel: { ch_uuid: "c-1", ch_name: "engineering" }, post_by: JONAS } },
  },
  {
    activity_type: "COMMENT",
    time: ago(10),
    priority: "normal",
    actor_kind: "person",
    comment: { comment_uuid: "k-1", comment_created_at: ago(10), comment_text: "Pilot moved to Thursday", comment_by: MAYA, comment_task: { task_uuid: "t-1", task_name: "Customer onboarding" } },
  },
  share(1, "Press kit notes"),
  share(2, "Roadmap"),
  share(3, "Specs"),
  {
    activity_type: "NOTICE",
    time: ago(40),
    priority: "normal",
    actor_kind: "person",
    notice: { id: "n-9", kind: "doc.mentioned", resource_kind: "doc", resource_uuid: "d-9", title: "Q4 launch plan", can_open: true, reason: "mention", actor: MAYA, created_at: ago(40) },
  },
]

const { answer } = vi.hoisted(() => ({ answer: { current: undefined as unknown } }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => (answer.current ??= { data: { data: { activities: FEED, has_more: false }, msg: "ok" }, isLoading: false, isError: undefined, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
}))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
  useFeature: () => false,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams("tab=all"),
}))

// The right panel, as the store holds it, and what the Inbox asks of it.
const { dispatch, store } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  store: { panel: { isOpen: false, data: {} } as { isOpen: boolean; data: Record<string, string> } },
}))
vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
  useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: store.panel } }),
}))
const { screenIs } = vi.hoisted(() => ({ screenIs: { phone: false, placement: "beside" as "beside" | "over" } }))
vi.mock("@/hooks/usePhone", () => ({ usePhone: () => screenIs.phone }))
vi.mock("@/components/navigationBar/tablet/useShellBand", () => ({ usePanelPlacement: () => screenIs.placement, useShellBand: () => "desktop" }))

vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
vi.mock("@/services/activityService", () => ({ markActivitySeen: async () => {} }))
vi.mock("@/components/ai/InboxNudges", () => ({ default: () => null }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
// jsdom lays nothing out, so the virtual list would draw no rows: every row here.
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
import { INBOX_DENSITY_KEY } from "@/components/activity/activityFeedList"
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"

beforeEach(() => {
  dispatch.mockClear()
  store.panel = { isOpen: false, data: {} }
  screenIs.phone = false
  screenIs.placement = "beside"
  localStorage.clear()
})
afterEach(cleanup)

const rowLink = (name: RegExp) => screen.getByRole("link", { name })
const rowOf = (el: Element) => el.closest("[data-feed-row]") as HTMLElement
const MENTION = /^Jonas Weber mentioned you in #engineering$/
const COMMENT = /^Maya Chen commented on Customer onboarding$/

describe("a row opens beside the Inbox", () => {
  it("opens a thread in the panel, and the Inbox stays", () => {
    render(<ActivityListTabs />)
    const followed = fireEvent.click(rowLink(MENTION))
    expect(followed, "the link's own navigation is held").toBe(false)
    expect(dispatch).toHaveBeenCalledWith(openRightPanel({ channelUUID: "c-1", postUUID: "p-1" }))
  })

  it("opens a task in the panel", () => {
    render(<ActivityListTabs />)
    fireEvent.click(rowLink(COMMENT))
    expect(dispatch).toHaveBeenCalledWith(openRightPanel({ taskUUID: "t-1" }))
  })

  it("leaves a modifier click, a doc and a phone to the page", () => {
    const { unmount } = render(<ActivityListTabs />)
    expect(fireEvent.click(rowLink(MENTION), { ctrlKey: true }), "a new tab, as a link").toBe(true)
    expect(fireEvent.click(rowLink(/^Maya Chen mentioned you in Q4 launch plan$/)), "a doc opens as its page").toBe(true)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: openRightPanel.type }))
    unmount()

    screenIs.phone = true
    render(<ActivityListTabs />)
    expect(fireEvent.click(rowLink(MENTION))).toBe(true)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: openRightPanel.type }))
  })

  it("chooses the row the panel shows, and only that one", () => {
    store.panel = { isOpen: true, data: { channelUUID: "c-1", postUUID: "p-1" } }
    render(<ActivityListTabs />)
    expect(rowOf(rowLink(MENTION)).getAttribute("data-selected")).toBe("true")
    expect(rowOf(rowLink(COMMENT)).hasAttribute("data-selected")).toBe(false)
  })
})

describe("J and K walk the rows", () => {
  it("moves to the next row, and the panel follows it", () => {
    store.panel = { isOpen: true, data: { channelUUID: "c-1", postUUID: "p-1" } }
    render(<ActivityListTabs />)
    rowLink(MENTION).focus()
    fireEvent.keyDown(document.activeElement!, { key: "j" })
    expect(document.activeElement).toBe(rowLink(COMMENT))
    expect(dispatch).toHaveBeenLastCalledWith(openRightPanel({ taskUUID: "t-1" }))
  })

  it("closes the panel on a row it can't hold, rather than show the last one", () => {
    store.panel = { isOpen: true, data: { taskUUID: "t-1" } }
    render(<ActivityListTabs />)
    rowLink(COMMENT).focus()
    fireEvent.keyDown(document.activeElement!, { key: "j" })
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Jonas Weber shared 3 docs with you/)
    expect(dispatch).toHaveBeenLastCalledWith(closeRightPanel())
  })

  it("starts at the first row from the page, and only moves while the panel is closed", () => {
    render(<ActivityListTabs />)
    fireEvent.keyDown(document.body, { key: "j" })
    expect(document.activeElement).toBe(rowLink(MENTION))
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(rowLink(COMMENT))
    fireEvent.keyDown(document.activeElement!, { key: "k" })
    expect(document.activeElement).toBe(rowLink(MENTION))
    // Nothing was open, so nothing opens.
    for (const type of [openRightPanel.type, closeRightPanel.type]) expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type }))
  })

  it("marks the row read with U, and unread again", () => {
    render(<ActivityListTabs />)
    const row = rowOf(rowLink(COMMENT))
    expect(row.hasAttribute("data-unread")).toBe(true)
    rowLink(COMMENT).focus()
    fireEvent.keyDown(document.activeElement!, { key: "u" })
    expect(row.hasAttribute("data-unread")).toBe(false)
    fireEvent.keyDown(document.activeElement!, { key: "u" })
    expect(row.hasAttribute("data-unread")).toBe(true)
  })
})

describe("one person's shares, folded", () => {
  it("is one row that names the docs, and opens in place to list them", () => {
    render(<ActivityListTabs />)
    const fold = screen.getByRole("button", { name: /^Jonas Weber shared 3 docs with you\. Show them$/ })
    expect(rowOf(fold).textContent).toContain("Press kit notes, Roadmap and Specs")
    expect(screen.queryByRole("list", { name: "Docs Jonas Weber shared with you" })).toBeNull()

    fireEvent.click(fold)
    expect(fold.getAttribute("aria-expanded")).toBe("true")
    const docs = screen.getByRole("list", { name: "Docs Jonas Weber shared with you" })
    const links = Array.from(docs.querySelectorAll("a"))
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/app/doc/d-1", "/app/doc/d-2", "/app/doc/d-3"])
    expect(docs.textContent).toContain("Can edit")
    // Seen once it's open.
    expect(rowOf(fold).hasAttribute("data-unread")).toBe(false)
  })
})

describe("the reading pane before anything is open", () => {
  it("says what opens there while the panel is closed beside a wide Inbox", () => {
    render(<ActivityListTabs />)
    const pane = document.querySelector("[data-reading-pane]")
    expect(pane?.textContent).toContain("Threads, tasks and events open here")
  })

  it("is gone while the panel is open, where the panel opens over the page, and on a phone", () => {
    store.panel = { isOpen: true, data: { taskUUID: "t-1" } }
    const a = render(<ActivityListTabs />)
    expect(document.querySelector("[data-reading-pane]")).toBeNull()
    a.unmount()

    store.panel = { isOpen: false, data: {} }
    screenIs.placement = "over"
    const b = render(<ActivityListTabs />)
    expect(document.querySelector("[data-reading-pane]")).toBeNull()
    b.unmount()

    screenIs.placement = "beside"
    screenIs.phone = true
    render(<ActivityListTabs />)
    expect(document.querySelector("[data-reading-pane]")).toBeNull()
  })
})

describe("Compact", () => {
  it("draws one line a row, and is remembered", async () => {
    render(<ActivityListTabs />)
    expect(rowOf(rowLink(MENTION)).getAttribute("data-density")).toBe("feed")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compact" }))
    })
    const row = rowOf(rowLink(MENTION))
    expect(row.getAttribute("data-density")).toBe("compact")
    // One line: the preview follows the sentence, and the kind badge is gone.
    expect(row.querySelector("[data-kind-badge]")).toBeNull()
    expect(row.textContent).toContain("Can you check the rollback steps?")
    expect(localStorage.getItem(INBOX_DENSITY_KEY)).toBe(JSON.stringify("compact"))
  })

  it("isn't offered on a phone, whatever was chosen", () => {
    localStorage.setItem(INBOX_DENSITY_KEY, JSON.stringify("compact"))
    screenIs.phone = true
    render(<ActivityListTabs />)
    expect(screen.queryByRole("button", { name: "Compact" })).toBeNull()
    expect(rowOf(rowLink(MENTION)).getAttribute("data-density")).toBe("feed")
  })
})

describe("the Inbox's header beside an open panel", () => {
  // With a thread open beside it, a 1280 window leaves the Inbox about 600px,
  // and the header's controls, laid out by the window's width, pushed the
  // Mentions badge out of sight. The header's own width decides now.
  it("folds its controls into the menu by its own width, not the window's", () => {
    render(<ActivityListTabs />)
    const header = document.querySelector("[data-hub-header]")!
    expect(header.className).toContain("@container/hubhead")
    expect(screen.getByRole("button", { name: "Mark all read" }).className).toContain("@[46rem]/hubhead:inline-flex")
    expect(screen.getByRole("button", { name: "Inbox options" }).className).toContain("@[46rem]/hubhead:hidden")
    // None of its controls still answers to the window.
    const controls = header.lastElementChild as HTMLElement
    expect(controls.innerHTML).not.toMatch(/\bmd:(flex|inline-flex|grid|hidden)\b/)
  })
})
