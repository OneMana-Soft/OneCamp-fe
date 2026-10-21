import { expect, test, type Request } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"

// Reactions like Slack's and pins (chat B25), in a real browser with no
// backend: each emoji the reader reacted with is pressed, a click on another
// adds it beside them (it took their one reaction's place), and a pinned
// message says who pinned it. With SHOTS=<dir> the conversation is also saved
// at 1280 and 390, light and dark, for the hand-back's shots.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const PLAN = "0c4a0000-0000-4000-8000-000000000001"
const SHIP = "0c4a0000-0000-4000-8000-000000000002"
const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 9, m)).toISOString()
const reaction = (uid: string, emoji: string, by: typeof SAM | typeof MAYA) => ({
  uid, reaction_emoji_id: emoji, reaction_added_by: by, reaction_added_at: at(5), reaction_on_content_added_by: SAM,
})

const chats = [
  {
    chat_uuid: SHIP, chat_from: SAM, chat_to: MAYA, chat_created_at: at(4), chat_attachments: [], chat_comment_count: 0,
    chat_body_text: "<p>Ship it on Friday? The release notes are ready and the rollback steps are written down.</p>",
    chat_reactions: [reaction("0x1", "+1", SAM), reaction("0x2", "tada", SAM), reaction("0x3", "+1", MAYA), reaction("0x4", "eyes", MAYA)],
  },
  {
    chat_uuid: PLAN, chat_from: MAYA, chat_to: SAM, chat_created_at: at(1), chat_attachments: [], chat_comment_count: 0,
    chat_body_text: "<p>The launch checklist lives in the Q4 launch doc. Everything we agreed is in there.</p>",
    chat_reactions: [],
  },
]

const pins = {
  msg: "ok",
  data: {
    pins: [{ message_id: PLAN, pinned_by: MAYA, pinned_at: at(2), message: { id: PLAN, html: chats[1].chat_body_text, created_at: at(1), by: MAYA } }],
    can_pin: true,
    max: 100,
  },
}

// The composer's and header's own reads, answered so no stray toast sits in the shots.
const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: the reader's reactions are pressed, another is added beside them, and a pin says who`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const page = await context.newPage()
      await stubBackend(page, testInfo, {
        ...QUIET,
        "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
        [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
        [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats, has_more: false } },
        "/pins": pins,
        "/dm/addOrCreateReaction": { msg: "ok", data: { reaction_dgraph_id: "0x9" } },
        "/dm/": { msg: "ok", data: [] },
        "/user/dm-ai-suggestions": { msg: "ok", data: [] },
      })
      const added: Request[] = []
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/dm/addOrCreateReaction")) added.push(r)
      })

      await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByText("Ship it on Friday?")).toBeVisible({ timeout: 60_000 })

      // Pinned by Maya, on her message, said beside its time.
      await expect(page.locator('[data-pinned][title="Pinned by maya"]')).toBeVisible()
      // Both of Sam's emoji are pressed, and Maya's 👀 isn't.
      await expect(page.locator('[data-reaction][aria-pressed="true"]')).toHaveCount(2)
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dm-reactions-pins-${view.name}-${scheme}.png` })

      // A click on Maya's 👀 adds Sam's beside his others: nothing replaced.
      await page.locator('[data-reaction][aria-pressed="false"]').first().click()
      await expect.poll(() => added.length).toBe(1)
      const body = added[0].postDataJSON() as { reaction_emoji_id?: string; reaction_dgraph_id?: string }
      expect(body.reaction_emoji_id).toBe("eyes")
      expect(body.reaction_dgraph_id ?? "").toBe("")
      await expect(page.locator('[data-reaction][aria-pressed="true"]')).toHaveCount(3)
      await context.close()
    })
  }
}
