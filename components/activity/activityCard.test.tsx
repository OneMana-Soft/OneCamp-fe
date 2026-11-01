import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { UnifiedActivityItem } from "@/types/activity"
import { personHue } from "@/lib/utils/getAvatarColor"
import { pinTestClock } from "@/lib/testing/testClock"

vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { ActivityCard } from "@/components/activity/activityCard"

afterEach(cleanup)
// Its rows say when (dated against today), so today is the test's own.
pinTestClock()

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
    // One colour per person (app/personHue.test.ts): by their name, as everywhere.
    expect(document.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(personHue("Jonas Weber"))
  })
})

const noticeOf = (kind: string, extra: Record<string, unknown> = {}) =>
  ({
    activity_type: "NOTICE",
    time: "2026-10-12T12:00:00Z",
    notice: { id: "n1", kind, resource_kind: "task", resource_uuid: "t1", title: "Q4-2 Review the pricing page", can_open: true, reason: "subject", created_at: "2026-10-12T12:00:00Z", ...extra },
  }) as unknown as UnifiedActivityItem

// Every rule notice in the Inbox read "Someone A rule asks you to look at …"
// beside an "S" face, as if a person had sent it (DESIGN-BUILD-48, 30 Oct).
describe("a notice whose sentence is its own subject", () => {
  it("draws no name and no face for a rule's notice", () => {
    render(<ActivityCard activity={noticeOf("work.rule")} />)
    expect(document.body.textContent).toContain("A rule asks you to look at")
    expect(document.body.textContent).not.toContain("Someone")
    expect(document.querySelector("[data-row-link]")?.getAttribute("aria-label")).toMatch(/^A rule asks you to look at Q4-2 Review the pricing page/)
    expect(document.querySelector("[data-hue]")).toBeNull()
  })

  it("draws no name and no face for a rule that stopped itself", () => {
    render(<ActivityCard activity={noticeOf("work.rule.paused", { resource_kind: "rule", resource_uuid: "r1", title: "Triage", data: { project_id: "p1" } })} />)
    expect(document.body.textContent).toContain("Your rule stopped itself:")
    expect(document.body.textContent).not.toContain("Someone")
    expect(document.querySelector("[data-hue]")).toBeNull()
  })

  it("still says Someone for a person whose name is empty, and for one a notice keeps unnamed", () => {
    const post = mention.mention!.mention_post!
    render(<ActivityCard activity={{ ...mention, mention: { ...mention.mention, mention_post: { ...post, post_by: { user_uuid: "u-x", user_name: "" } } } } as unknown as UnifiedActivityItem} />)
    expect(document.querySelector("[data-row-link]")?.getAttribute("aria-label")).toContain("Someone mentioned you in")
    expect(document.querySelector("[data-hue]")).not.toBeNull()
    cleanup()
    // Who declined is never said (lib/activity/notice.ts): the row's subject is "Someone".
    render(<ActivityCard activity={noticeOf("doc.access_answered", { resource_kind: "doc", resource_uuid: "d1", data: { status: "declined", level: "view" } })} />)
    expect(document.body.textContent).toContain("Someone declined your request to")
  })

  // An empty face's room with a small bubble at its corner read as a picture
  // that didn't load (DESIGN-BUILD-49, 30 Oct): the rule's own mark leads.
  it("leads a rule's notice with the rule's mark at the face's size, and no corner badge", () => {
    for (const kind of ["work.rule", "work.rule.paused"]) {
      render(<ActivityCard activity={noticeOf(kind)} />)
      const marks = document.querySelectorAll<HTMLElement>(".hub-row-lead [data-kind-badge]")
      expect(marks).toHaveLength(1)
      expect(marks[0].dataset.kindBadge).toBe("rule")
      expect(marks[0].dataset.lead).toBe("32")
      expect(document.querySelector("[data-no-face]")).toBeNull()
      cleanup()
    }
    render(<ActivityCard activity={noticeOf("work.rule")} compact />)
    expect(document.querySelectorAll(".hub-row-lead [data-kind-badge]")).toHaveLength(1)
    expect(document.querySelector<HTMLElement>(".hub-row-lead [data-kind-badge]")?.dataset.lead).toBe("24")
  })

  it("keeps a person's face, with the kind's badge at its corner, on every other row", () => {
    render(<ActivityCard activity={mention} />)
    const badge = document.querySelector<HTMLElement>(".hub-row-lead [data-kind-badge]")
    expect(badge?.dataset.kindBadge).toBe("mention")
    expect(badge?.dataset.lead).toBeUndefined()
    expect(document.querySelector(".hub-row-lead [data-hue]")).not.toBeNull()
  })
})
