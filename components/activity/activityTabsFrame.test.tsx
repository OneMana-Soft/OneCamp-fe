import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * /app/activity's tabs share one frame and one row.
 *
 * The owner found every tab laid out differently: the AI tab was the settings
 * page's card, Mentions had no toolbar row and read a different payload (and
 * read it wrongly, so it was always empty), and the empty and error states
 * centred their column on some tabs and not others. These tests render the
 * real tabs and hold them to one frame.
 */

type Mode = "data" | "empty" | "error" | "loading"
let mode: Mode = "data"
let search = ""

const mention = {
  activity_type: "MENTION",
  time: "2026-10-10T06:49:13Z",
  priority: "high",
  actor_kind: "person",
  mention: {
    mention_created_at: "2026-10-10T06:49:13.580166492Z",
    mention_post: {
      post_uuid: "p1",
      post_text: "Can you check the rollback steps?",
      post_channel: { ch_uuid: "c1", ch_name: "engineering" },
      post_by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber", user_name: "jonas" },
    },
  },
}
const comment = {
  activity_type: "COMMENT",
  time: "2026-10-10T05:00:00Z",
  priority: "normal",
  actor_kind: "person",
  comment: {
    comment_created_at: "2026-10-10T05:00:00.100Z",
    comment_text: "Looks good to me",
    comment_by: { user_uuid: "u-maya", user_full_name: "Maya Chen" },
    comment_post: { post_uuid: "p2", post_channel: { ch_uuid: "c1" } },
  },
}
const refusal = {
  kind: "audit",
  title: "agent.drill.refused",
  actor: "visitor@demo.onemana.dev",
  summary: "Drill: post in #drill-finance refused (you are not a member of this channel)",
  status: "refused",
  source: "agent",
  at: "2026-10-10T06:00:00Z",
  seq: 46,
  prev_hash: "d94363b0aaaaaaaaaaaaaaaa3fa89917",
  entry_hash: "91582c2abbbbbbbbbbbbbbbbd15dfa87",
  initiator: "person",
}

// One answer per request and mode, as SWR gives: a new object each render
// would be a new answer each render to the lists' effects.
const answers = new Map<string, unknown>()
const mutate = vi.fn()
function answerFor(url: string) {
  const key = `${mode}|${url}`
  if (!answers.has(key)) {
    const ai = url.startsWith("/ai/activity")
    const mentions = url.startsWith("/activity/mentions")
    let data: unknown
    if (mode === "data" || mode === "empty") {
      const empty = mode === "empty"
      data = ai
        ? { data: empty ? [] : [refusal] }
        : mentions
          ? // The server's own shape for the old endpoint: the list is under `data`.
            { data: { mentions: empty ? [] : [mention.mention], has_more: false }, msg: "ok" }
          : { data: { activities: empty ? [] : [mention, comment], has_more: false }, msg: "ok" }
    }
    answers.set(key, {
      data,
      isLoading: mode === "loading",
      isError: mode === "error" ? new Error("500") : undefined,
      mutate,
    })
  }
  return answers.get(key)
}

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => answerFor(url),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => true,
  useFeature: () => true,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/activity",
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
// jsdom lays nothing out, so the virtual list would draw no rows: every row here.
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem, keyExtractor }: { items: T[]; renderItem: (item: T, i: number) => ReactNode; keyExtractor?: (item: T, i: number) => string | number }) => (
    <div data-testid="rows">
      {items.map((item, i) => (
        <div key={keyExtractor ? keyExtractor(item, i) : i}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}))

import { ActivityListTabs } from "@/components/activity/activityListTabs"
import { FEED_SKELETON_ROWS } from "@/components/activity/activityFeedFrame"

afterEach(() => {
  cleanup()
  mode = "data"
  search = ""
})

const TABS = ["priority", "all", "mentions", "ai"] as const

function renderTab(tab: (typeof TABS)[number]) {
  search = `tab=${tab}`
  return render(<ActivityListTabs />)
}

/** The frame a tab drew, and the parts of it every tab must have. */
function frameOf(container: HTMLElement) {
  const frames = container.querySelectorAll("[data-feed-frame]")
  expect(frames, "one feed frame").toHaveLength(1)
  const frame = frames[0] as HTMLElement
  return {
    frame,
    toolbar: frame.querySelector(":scope > [data-feed-toolbar]") as HTMLElement | null,
    body: frame.querySelector(":scope > [data-feed-body]") as HTMLElement | null,
  }
}

describe("every Activity tab", () => {
  it.each(TABS)("%s draws in the shared frame, with its toolbar row", (tab) => {
    const { container } = renderTab(tab)
    const { frame, toolbar, body } = frameOf(container)
    // The list's column: bounded, starting at the panel's edge, never centred.
    expect(frame.className).toContain("max-w-[880px]")
    expect(frame.className).not.toContain("mx-auto")
    expect(toolbar, "a toolbar row on every tab").toBeTruthy()
    expect(toolbar!.className).toContain("h-9")
    expect(body).toBeTruthy()
    // No card in a tab: the AI tab was the settings page's card, with a title of its own.
    expect(screen.queryByText("What the AI did for you")).toBeNull()
    expect(container.querySelector(".rounded-lg.border.bg-card")).toBeNull()
  })

  it("draws the same frame and toolbar on all four", () => {
    const seen = TABS.map((tab) => {
      const { container, unmount } = renderTab(tab)
      const { frame, toolbar } = frameOf(container)
      const out = `${frame.className}|${toolbar!.className}`
      unmount()
      return out
    })
    expect(new Set(seen).size).toBe(1)
  })

  it.each(TABS)("%s draws its rows with the feed's one row", (tab) => {
    const { container } = renderTab(tab)
    const row = container.querySelector("[data-feed-body] [data-feed-row]") as HTMLElement
    expect(row, "a row").toBeTruthy()
    // ListRow at the feed's density, led by a 36px mark.
    expect(row.className).toContain("md:min-h-16")
    expect(row.className).toContain("min-h-[72px]")
    const mark = row.querySelector("[data-hue]") as HTMLElement
    expect(mark).toBeTruthy()
    expect(mark.getAttribute("style") ?? mark.className).toMatch(/36px|size-9/)
  })
})

describe("a mention", () => {
  // Mentions read another endpoint and kept only the mention, so it lost the
  // priority (and its "Needs reply") that All showed. It also read the list
  // from the wrong place and was always empty.
  it("is the same row in All and in Mentions", () => {
    const rowIn = (tab: "all" | "mentions") => {
      const { unmount } = renderTab(tab)
      const html = screen.getByText("Can you check the rollback steps?").closest("a")?.outerHTML
      unmount()
      return html
    }
    const inAll = rowIn("all")
    const inMentions = rowIn("mentions")
    expect(inAll).toBeTruthy()
    expect(inMentions).toBe(inAll)
    expect(inMentions).toContain("Needs reply")
  })

  it("is the only kind Mentions shows", () => {
    renderTab("mentions")
    expect(screen.queryByText("Looks good to me")).toBeNull()
  })
})

describe("the skeleton, empty and error states", () => {
  it.each(TABS)("%s loads with the frame's skeleton, in the rows' place", (tab) => {
    mode = "loading"
    const { container } = renderTab(tab)
    const { body } = frameOf(container)
    const skeleton = body!.querySelector(":scope > [data-feed-skeleton]")
    expect(skeleton).toBeTruthy()
    expect(skeleton!.querySelectorAll("[data-feed-skeleton-row]")).toHaveLength(FEED_SKELETON_ROWS)
    // Shaped like a loaded row, so nothing moves when the data lands.
    expect((skeleton!.querySelector("[data-feed-skeleton-row]") as HTMLElement).className).toContain("md:min-h-16")
  })

  it.each(TABS)("%s says it is empty in the frame's place, with its spot", (tab) => {
    mode = "empty"
    const { container } = renderTab(tab)
    const { body } = frameOf(container)
    const state = body!.querySelector(":scope > [data-feed-state]")
    expect(state).toBeTruthy()
    expect(state!.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  it.each(TABS)("%s says a failure in the frame's place, never that it is empty", (tab) => {
    mode = "error"
    const { container } = renderTab(tab)
    const { body } = frameOf(container)
    const state = body!.querySelector(":scope > [data-feed-state]")
    expect(state?.textContent).toMatch(/Couldn.t load/)
    expect(state!.querySelector("[data-empty-illustration]")).toBeNull()
    expect(container.textContent).not.toMatch(/Nothing yet|caught up|No mentions yet|No activity yet/)
  })

  it("places every tab's state the same way", () => {
    const placed = new Set<string>()
    for (const m of ["empty", "error"] as const) {
      for (const tab of TABS) {
        mode = m
        const { container, unmount } = renderTab(tab)
        placed.add((container.querySelector("[data-feed-state]") as HTMLElement).className)
        unmount()
      }
    }
    expect(placed.size).toBe(1)
  })
})

// The AI tab draws in this frame, so the frame is imported by AI code; the
// edition without AI carries these files and must build without components/ai.
describe("the shared Activity feed", () => {
  it.each(["components/activity/activityFeedFrame.tsx", "components/activity/activityFeedList.tsx", "lib/activity/feedPages.ts"])(
    "%s imports nothing from the AI edition",
    (file) => {
      const src = readFileSync(join(__dirname, "..", "..", file), "utf8")
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
      expect(imports.filter((spec) => /@\/components\/ai\b|@\/lib\/ai\b/.test(spec))).toEqual([])
    },
  )
})
