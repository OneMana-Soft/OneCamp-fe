import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { UnifiedActivityItem } from "@/types/activity"
import { hueFor } from "@/lib/campHue"

vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { ActivityCard } from "@/components/activity/activityCard"

afterEach(cleanup)

const mention = {
  activity_type: "MENTION",
  time: "2026-10-10T10:00:00Z",
  mention: {
    mention_created_at: "2026-10-10T10:00:00Z",
    mention_post: { post_uuid: "p1", post_text: "Can you look at the rollback steps?", post_channel: { ch_uuid: "c1" }, post_by: { user_uuid: "u-jonas", user_name: "Jonas Weber" } },
  },
} as unknown as UnifiedActivityItem

describe("an Activity row", () => {
  // It was a div with role="button" that pushed "app/channel/…", which from
  // /app/activity is /app/app/channel/…: every mention opened a 404.
  it("is a link to the message, from the app's root", () => {
    render(<ActivityCard activity={mention} />)
    const link = document.querySelector("[data-row-link]") as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("/app/channel/c1/p1")
    expect(link.getAttribute("aria-label")).toContain("Jonas Weber mentioned you in")
  })

  it("is not a link when there is nothing to open", () => {
    render(<ActivityCard activity={{ ...mention, mention: { mention_created_at: "2026-10-10T10:00:00Z" } } as unknown as UnifiedActivityItem} />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows who did it in their own colour, not a grey fallback", () => {
    render(<ActivityCard activity={mention} />)
    expect(document.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor("u-jonas"))
  })
})
