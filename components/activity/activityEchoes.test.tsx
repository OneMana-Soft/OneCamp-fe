import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import type { UnifiedActivityItem } from "@/types/activity"
import { collapseEchoes, echoKey } from "@/lib/activity/feedPages"

/**
 * Activity > All showed every mention twice on the live demo (11 Oct).
 *
 * The server sent both: each nightly refresh of the demo renames the curated
 * channels ("engineering-retired-1791614952") and posts the conversation again
 * in new ones, and the visitor is still a member of the old copies. Two posts,
 * two ids, the same sentence. These are the records /activity/unified answered
 * on the demo, trimmed to what the row reads.
 */
const mention = (post: string, channel: string, at: string, by: string, name: string, text: string) =>
  ({
    activity_type: "MENTION",
    time: at.replace(/\.\d+Z$/, "Z"),
    priority: "low",
    actor_kind: "person",
    mention: {
      mention_created_at: at,
      mention_post: {
        post_uuid: post,
        post_text: text,
        post_channel: { ch_uuid: `ch-${channel}`, ch_name: channel },
        post_by: { user_uuid: by, user_full_name: name, user_name: name },
        post_created_at: at,
      },
    },
  }) as unknown as UnifiedActivityItem

const CHIP = '<span data-type="mention" data-id="u-sam@0x1" data-label="Sam Rivera">@Sam Rivera</span>'
const ROLLBACK = `<p>${CHIP} can we get the rollback steps into the Launch sync notes before Thursday? Legal asked for them in writing.</p>`
const HERO = `<p>Final hero for the launch page is in. ${CHIP}, want a look before it ships?</p>`
const ONCALL = `<p>Me. I&#39;m on call Thursday, and the rollback steps take two minutes. ${CHIP} has the full plan.</p>`

const DEMO_FEED = [
  mention("56e2b926", "acme", "2026-10-10T06:49:13.580Z", "u-jonas", "Jonas Weber", ONCALL),
  mention("477a2b02", "design", "2026-10-10T06:49:13.410Z", "u-maya", "Maya Chen", HERO),
  mention("8f108b95", "engineering", "2026-10-10T06:49:13.135Z", "u-jonas", "Jonas Weber", ROLLBACK),
  mention("fb9c7a04", "acme-retired-1791614952", "2026-10-10T04:38:32.580Z", "u-jonas", "Jonas Weber", ONCALL),
  mention("b0115b34", "design-retired-1791614952", "2026-10-10T04:38:32.410Z", "u-maya", "Maya Chen", HERO),
  mention("72db39d6", "engineering-retired-1791614952", "2026-10-10T04:38:32.135Z", "u-jonas", "Jonas Weber", ROLLBACK),
]

describe("one row per thing said", () => {
  it("keeps the newest of each repeated sentence, in the fresh channel", () => {
    const kept = collapseEchoes(DEMO_FEED)
    expect(kept).toHaveLength(3)
    expect(kept.map((a) => a.mention?.mention_post?.post_channel?.ch_name)).toEqual(["acme", "design", "engineering"])
  })

  it("keeps different words, and the same words from someone else", () => {
    const other = mention("x1", "engineering", "2026-10-10T07:00:00.000Z", "u-maya", "Maya Chen", ROLLBACK)
    const later = mention("x2", "engineering", "2026-10-10T07:01:00.000Z", "u-jonas", "Jonas Weber", "<p>Another thing</p>")
    expect(collapseEchoes([later, other, ...DEMO_FEED])).toHaveLength(5)
  })

  it("reads words, not markup: the same sentence written twice is one key", () => {
    const a = mention("a", "x", "2026-10-10T07:00:00.000Z", "u-1", "A", "<p>Ship   it</p>")
    const b = mention("b", "y", "2026-10-10T06:00:00.000Z", "u-1", "A", "Ship it")
    expect(echoKey(a)).toBe(echoKey(b))
  })

  it("never merges two real mentions with the same words when the server names them by different ids", () => {
    const a = { ...DEMO_FEED[2], mention: { ...DEMO_FEED[2].mention, uid: "0xa1" } } as UnifiedActivityItem
    const b = { ...DEMO_FEED[5], mention: { ...DEMO_FEED[5].mention, uid: "0xb2" } } as UnifiedActivityItem
    expect(collapseEchoes([a, b])).toHaveLength(2)
  })

  it("never collapses an item with no words of its own", () => {
    const reaction = { activity_type: "REACTION", time: "2026-10-10T07:00:00Z", reaction: { reaction_emoji_id: "tada" } } as unknown as UnifiedActivityItem
    expect(collapseEchoes([reaction, reaction])).toHaveLength(2)
  })
})

/* The feed itself: Activity > All on the demo's payload draws each mention once. */
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/useFetch", () => {
  // Built on first call: the factory runs before the feed above is defined.
  let answer: unknown
  return {
    useFetch: () =>
      (answer ??= { data: { data: { activities: DEMO_FEED, has_more: false }, msg: "ok" }, isLoading: false, isError: undefined, mutate: () => {} }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
  }
})
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => true,
  useFeature: () => true,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/activity",
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
}))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem }: { items: T[]; renderItem: (item: T, i: number) => ReactNode }) => (
    <div data-testid="rows">{items.map((item, i) => <div key={i}>{renderItem(item, i)}</div>)}</div>
  ),
}))

import { ActivityFeedList } from "@/components/activity/activityFeedList"

afterEach(cleanup)

describe("Activity > All on the demo's feed", () => {
  it("draws each mention once", () => {
    render(<ActivityFeedList view="all" />)
    expect(screen.getAllByText(/rollback steps into the Launch sync notes/)).toHaveLength(1)
    expect(screen.getAllByText(/Final hero for the launch page/)).toHaveLength(1)
    expect(screen.queryByText(/retired-/)).toBeNull()
  })
})
