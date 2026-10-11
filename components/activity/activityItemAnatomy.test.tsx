import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import type { UnifiedActivityItem } from "@/types/activity"

vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
}))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { ActivityCard } from "@/components/activity/activityCard"

afterEach(cleanup)

/** The notification item (hub.md A4). */
const mention = {
  activity_type: "MENTION",
  time: "2026-10-11T08:00:00Z",
  priority: "normal",
  mention: {
    mention_created_at: "2026-10-11T08:00:00.1Z",
    mention_post: {
      post_uuid: "p1",
      post_text: '<p><span data-type="mention" data-id="u-sam@0x1" data-label="Sam Rivera">@Sam Rivera</span> can we get the rollback steps?</p>',
      post_channel: { ch_uuid: "c1", ch_name: "engineering" },
      post_by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber" },
    },
  },
} as unknown as UnifiedActivityItem

describe("a notification item", () => {
  it("names the place in its sentence, actor and place in bold", () => {
    const { container } = render(<ActivityCard activity={mention} />)
    const bold = [...container.querySelectorAll("[data-feed-row] b")].map((b) => b.textContent)
    expect(bold).toEqual(["Jonas Weber", "#engineering"])
    expect(container.textContent).toContain("mentioned you in")
    expect(container.textContent).not.toContain("in a post")
  })

  it("shows your own mention as the @You chip, never your raw name", () => {
    const { container } = render(<ActivityCard activity={mention} />)
    const me = container.querySelector(".hub-me")
    expect(me?.textContent).toBe("@You")
    expect(container.textContent).not.toContain("@Sam Rivera")
  })

  it("draws read and unread with the same weights: only the dot differs", () => {
    const unread = render(<ActivityCard activity={mention} unread onToggleRead={() => {}} />).container.innerHTML
    cleanup()
    const read = render(<ActivityCard activity={mention} unread={false} onToggleRead={() => {}} />).container.innerHTML
    const strip = (h: string) => h.replace(/ data-read=""/g, "").replace(/ data-unread=""/g, "").replace(/Mark (un)?read/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "")
    expect(strip(unread)).toBe(strip(read))
    expect(unread).toContain("hub-unread-dot")
  })

  it("carries the mention badge on its lead", () => {
    const { container } = render(<ActivityCard activity={mention} />)
    expect(container.querySelector(".hub-row-lead [data-kind-badge=mention]")).toBeTruthy()
  })

  it("marks itself read when opened", () => {
    const toggle = vi.fn()
    const { container } = render(<ActivityCard activity={mention} unread onToggleRead={toggle} />)
    ;(container.querySelector("[data-row-link]") as HTMLAnchorElement).click()
    expect(toggle).toHaveBeenCalledWith([expect.any(String)], true)
  })
})
