import { expect, test } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// Notif head A: a mention in a task or one of its comments, a mention a message
// gained in a channel or a conversation, a mention in a doc's comment and a
// comment on a task reach Sam's inbox as notices. Each row says who, what and
// where, and opens where it happened; the mentions are on the Mentions tab,
// the comment is not. They read "Akash changed Launch plan" before. At both
// widths (390 with touch) and in both themes.

const AKASH = { user_uuid: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b", user_name: "Akash", user_full_name: "Akash" }
const TASK = "8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const CHANNEL = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a"
const POST = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b"
const MESSAGE = "3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c"
const DOC = "7d1e5c2a-9b3f-4a6e-8c1d-2f4b6a8e0c3d"
const COMMENT = "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d"

// Each notice, its row's words and where it opens; mention: on the Mentions tab.
const ROWS = [
  { kind: "task.mentioned", resource_kind: "task", resource_uuid: TASK, title: "Launch plan", data: { comment_uuid: COMMENT }, words: "Akash mentioned you in a comment on Launch plan", href: `/app/task/${TASK}`, mention: true },
  { kind: "message.mentioned", resource_kind: "channel", resource_uuid: CHANNEL, title: "launch", data: { post_id: POST }, words: "Akash mentioned you in #launch", href: `/app/channel/${CHANNEL}/${POST}`, mention: true },
  { kind: "message.mentioned", resource_kind: "conversation", resource_uuid: `${AKASH.user_uuid} ${SAM.user_uuid}`, data: { message_id: MESSAGE }, words: "Akash mentioned you in your conversation", href: `/app/chat/${AKASH.user_uuid}/${MESSAGE}`, mention: true },
  { kind: "doc.mentioned", resource_kind: "doc", resource_uuid: DOC, title: "Launch notes", data: { comment_uuid: COMMENT }, words: "Akash mentioned you in a comment on Launch notes", href: `/app/doc/${DOC}/comment?comment=${COMMENT}`, mention: true },
  { kind: "task.commented", resource_kind: "task", resource_uuid: TASK, title: "Launch plan", data: { comment_uuid: COMMENT }, words: "Akash commented on Launch plan", href: `/app/task/${TASK}`, mention: false },
] as const

/** A row's words as a link's name: the words as they are, wherever in the name. */
const said = (words: string) => new RegExp(words.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"))

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })
      test("Sam's inbox says a mention in a task or a message, and a comment on a task, and opens where each happened", async ({ page }, testInfo) => {
        const now = Date.now()
        const at = (s: number) => new Date(now - s * 1000).toISOString()
        await stubBackend(page, testInfo, {
          // The inbox's own reads and its read mark, answered as the other inbox specs answer them.
          "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
          "/activity/seen": { msg: "ok" },
          "/activity/unified": {
            msg: "ok",
            data: {
              has_more: false,
              activities: ROWS.map((r, i) => ({
                activity_type: "NOTICE",
                time: at(10 * (i + 1)),
                priority: "normal",
                actor_kind: "person",
                notice: {
                  id: `0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a0${i}`,
                  kind: r.kind,
                  resource_kind: r.resource_kind,
                  resource_uuid: r.resource_uuid,
                  ...("title" in r ? { title: r.title } : {}),
                  data: r.data,
                  can_open: true,
                  reason: r.mention ? "mention" : "participant",
                  actor: AKASH,
                  created_at: at(10 * (i + 1)),
                },
              })),
            },
          },
        })
        await page.goto("/app/inbox?tab=all", { waitUntil: "domcontentloaded", timeout: 120_000 })
        for (const r of ROWS) {
          const row = page.locator("[data-feed-row]").filter({ hasText: r.words })
          await expect(row, r.words).toHaveCount(1, { timeout: 30_000 })
          await expect(page.getByRole("link", { name: said(r.words) }), r.words).toHaveAttribute("href", r.href)
          await expect(row.locator("[data-kind-badge]"), r.words).toHaveAttribute("data-kind-badge", r.mention ? "mention" : "comment")
        }
        await expect(page.locator("[data-feed-row]").filter({ hasText: "changed" })).toHaveCount(0)
        await reviewShot(page, "inbox-mention-notices", theme)

        // The Mentions tab lists the four mentions, and not the comment.
        await page.goto("/app/inbox?tab=mentions", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.locator('[role="tab"][data-tab="mentions"]')).toHaveAttribute("aria-selected", "true", { timeout: 30_000 })
        for (const r of ROWS) {
          await expect(page.locator("[data-feed-row]").filter({ hasText: r.words }), r.words).toHaveCount(r.mention ? 1 : 0, { timeout: 30_000 })
        }
        await reviewShot(page, "inbox-mention-notices-mentions-tab", theme)
      })
    })
  }
}
