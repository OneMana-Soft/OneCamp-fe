import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import { SWRConfig, type SWRConfiguration } from "swr"

import { pinTestClock } from "@/lib/testing/testClock"
import type { UnifiedActivityItem } from "@/types/activity"

// Only the Inbox marks the feed seen, by asking, once its first page is on
// screen. Reading the feed used to mark it seen on the server, and Home reads
// it on every load, so opening the app cleared the badge with replies and
// reactions unseen (TN-BUG-11).
//
// CR-B11 M2 (5 Nov): the seen write moves the last look, and the server marks
// unread only what is newer than it. The Inbox wrote it as soon as SWR handed
// back the page cached from the last visit. An item that came while the Inbox
// was away, with no live message for it, was then read as already seen: keep()
// never counted it, its row had no dot, and the badge dropped it. Back inside
// SWR's dedupe window nothing read the page at all; after it, the read and the
// write went together and the write could win. The write now waits for a first
// page answered since the Inbox opened.

pinTestClock()

// The server's one rule (business/Activity): unread is newer than the last look.
const server = vi.hoisted(() => ({
  clock: 0,
  lastLook: 0,
  items: [] as { id: string; at: number }[],
  /** What the server did, in order: each read with the ids it marked unread, and each seen write. */
  log: [] as string[],
  seen: async (): Promise<number> => 0,
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
    default: {
      get: async (url: string) => {
        if (!url.startsWith("/activity/unified")) return { data: { msg: "ok", data: { unread: 0 } } }
        const activities = server.items.map(row)
        server.log.push(`read:${activities.filter((a) => a.unread).map((a) => a.mention?.mention_post?.post_uuid).join(",")}`)
        return { data: { msg: "ok", data: { has_more: false, activities } } }
      },
    },
  }),
)
vi.mock("@/services/activityService", () => ({ markActivitySeen: () => server.seen() }))
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
vi.mock("@/components/ai/InboxNudges", () => ({ default: () => null }))
// The list reads the same first page through its own useFetch, as the app's does, and draws each row's dot.
vi.mock("@/components/activity/activityFeedList", async () => {
  const { useFetch } = await import("@/hooks/useFetch")
  const { activityKey, inboxFeedKey, INBOX_PAGE_SIZE } = await import("@/lib/activity/feedPages")
  const { isUnread } = await import("@/lib/activity/readState")
  type Props = { read: ReadonlySet<string>; markedUnread: ReadonlySet<string>; counted: ReadonlyMap<string, string> }
  return {
    ActivityFeedList: ({ read, markedUnread, counted }: Props) => {
      const { data } = useFetch<{ data?: { activities?: UnifiedActivityItem[] } }>(inboxFeedKey("/activity/unified", INBOX_PAGE_SIZE))
      return (
        <ul>
          {(data?.data?.activities ?? []).map((a) => (
            <li key={activityKey(a)} data-row={a.mention?.mention_post?.post_uuid} data-unread={isUnread(a, activityKey(a), read, markedUnread, counted) ? "" : undefined} />
          ))}
        </ul>
      )
    },
  }
})

function row(i: { id: string; at: number }): UnifiedActivityItem {
  const time = new Date(Date.UTC(2026, 10, 5, 9, i.at)).toISOString()
  return {
    activity_type: "MENTION",
    time,
    priority: "high",
    unread: i.at > server.lastLook,
    mention: { mention_created_at: time, mention_post: { post_uuid: i.id, post_text: i.id } },
  } as UnifiedActivityItem
}

const { activityKey, inboxFeedKey, INBOX_PAGE_SIZE } = await import("@/lib/activity/feedPages")
const { appMutate } = await import("@/lib/swrMutate")
const { SWRMutateBridge } = await import("@/components/providers/SWRMutateBridge")
const { default: userSlice, setTotalUnreadActivityCount } = await import("@/store/slice/userSlice")
const { ActivityListTabs } = await import("@/components/activity/activityListTabs")

const tick = () => ++server.clock
server.seen = async () => {
  server.lastLook = tick()
  server.log.push("seen")
  return server.items.filter((i) => i.at > server.lastLook).length
}
/** The rows kept here as counted by the badge (lib/activity/readState). */
const counted = () => {
  const kept = new Set((JSON.parse(window.localStorage.getItem("activity:counted") ?? "[]") as [string, string][]).map(([k]) => k))
  return server.items.filter((i) => kept.has(activityKey(row(i)))).map((i) => i.id)
}

/** The app's shell, which outlives the Inbox: one SWR cache (the app's config but for `config`), one store. */
function app(config: SWRConfiguration = {}) {
  const store = configureStore({ reducer: { users: userSlice.reducer } })
  const cache = new Map()
  const view = (inbox: boolean) => (
    <SWRConfig value={{ provider: () => cache, ...config }}>
      <SWRMutateBridge />
      <Provider store={store}>{inbox ? <ActivityListTabs /> : <p>Home</p>}</Provider>
    </SWRConfig>
  )
  const ui = render(view(true))
  return {
    store,
    badge: () => store.getState().users.userSidebar.totalUnreadActivityCount,
    show: (inbox: boolean) => ui.rerender(view(inbox)),
  }
}

const dot = (id: string) => document.querySelector(`[data-row="${id}"]`)?.hasAttribute("data-unread")

// Whether the tab is on screen (document.visibilityState), switched as a browser does.
let visibility: DocumentVisibilityState = "visible"
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
const tab = (shown: boolean) =>
  act(() => {
    visibility = shown ? "visible" : "hidden"
    document.dispatchEvent(new Event("visibilitychange"))
  })
/** Any write still to come lands. */
const settle = (ms = 50) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

afterEach(() => {
  cleanup()
  Object.assign(server, { clock: 0, lastLook: 0, items: [], log: [] })
  visibility = "visible"
  window.localStorage.clear()
})

describe("the Inbox", () => {
  it("marks the feed seen once its first page is on screen, once per answer", async () => {
    server.items = [{ id: "p-1", at: tick() }]
    app()
    await waitFor(() => expect(server.log).toEqual(["read:p-1", "seen"]))
    await settle()
    expect(server.log).toHaveLength(2)
  })

  it("marks it seen again when a newer first page arrives while it's open", async () => {
    server.items = [{ id: "p-1", at: tick() }]
    app()
    await waitFor(() => expect(server.log).toEqual(["read:p-1", "seen"]))
    // A live item (hooks/useActivityMessageHandlers arrived()): the page is read, then seen.
    server.items.unshift({ id: "p-2", at: tick() })
    await act(() => appMutate(inboxFeedKey("/activity/unified", INBOX_PAGE_SIZE)))
    await waitFor(() => expect(server.log.slice(2)).toEqual(["read:p-2", "seen"]))
    expect(dot("p-2")).toBe(true)
  })

  // A seen write says the person looked, and nobody looks at a hidden tab. A
  // live item into an Inbox left open in a background tab was read in and
  // marked seen at once, so the badge cleared with the item unseen (lib/ui
  // whenOnScreen, as the DMs mark theirs). The read still happens, so the row
  // and its dot are there to see; the write waits for the tab to show.
  it("never marks it seen while the tab is hidden: a live item waits for the person to look", async () => {
    server.items = [{ id: "p-1", at: tick() }]
    app()
    await waitFor(() => expect(server.log).toEqual(["read:p-1", "seen"]))
    await tab(false)
    server.items.unshift({ id: "p-2", at: tick() })
    await act(() => appMutate(inboxFeedKey("/activity/unified", INBOX_PAGE_SIZE)))
    await waitFor(() => expect(dot("p-2")).toBe(true))
    await settle(100)
    expect(server.log).toEqual(["read:p-1", "seen", "read:p-2"])
    await tab(true)
    await waitFor(() => expect(server.log.filter((e) => e === "seen")).toHaveLength(2))
    await settle()
    expect(server.log.filter((e) => e === "seen")).toHaveLength(2)
    expect(server.log.at(-1)).toBe("seen")
    expect(dot("p-2")).toBe(true)
  })

  it("opened in a hidden tab, it reads the feed and marks nothing until the tab shows", async () => {
    visibility = "hidden"
    server.items = [{ id: "p-1", at: tick() }]
    app()
    await waitFor(() => expect(dot("p-1")).toBe(true))
    await settle(100)
    expect(server.log).toEqual(["read:p-1"])
    await tab(true)
    await waitFor(() => expect(server.log).toContain("seen"))
    await settle()
    expect(server.log.filter((e) => e === "seen")).toHaveLength(1)
  })

  describe.each([
    ["inside SWR's dedupe window, where nothing read the page", {}],
    // Shortened, as is the time away: the app's window is SWR's 2 s.
    ["after it, where the read and the write went together", { dedupingInterval: 50 }],
  ] as const)("back %s (CR-B11 M2)", (_, config) => {
    it("reads the first page before the seen write: what came meanwhile keeps its dot, and the badge clears once it's counted", async () => {
      server.items = [{ id: "p-1", at: tick() }]
      const shell = app(config)
      await waitFor(() => expect(server.log).toEqual(["read:p-1", "seen"]))
      shell.show(false)
      await settle(100)
      // Away from the Inbox: a mention comes with no live message, and the badge's own read counts it.
      server.items.unshift({ id: "p-2", at: tick() })
      act(() => void shell.store.dispatch(setTotalUnreadActivityCount({ count: 1 })))
      server.log = []
      shell.show(true)
      await waitFor(() => expect(server.log).toEqual(["read:p-2", "seen"]))
      expect(dot("p-2")).toBe(true)
      expect(counted()).toEqual(["p-2", "p-1"])
      await waitFor(() => expect(shell.badge()).toBe(0))
      await settle()
      expect(server.log).toHaveLength(2)
      expect(dot("p-2")).toBe(true)
    })
  })
})
