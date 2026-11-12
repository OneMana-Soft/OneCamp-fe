import { expect, test } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// CR-B27 F1: a mention an edit adds to a message reaches Sam's feed only as a
// message.mentioned notice (notif head A). Home's "What needs me now" lists it
// as it lists the mention a send made: who, where, and the message it opens.
// At both widths (390 with touch) and in both themes.

const JONAS = { user_uuid: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b", user_name: "Jonas Weber", user_full_name: "Jonas Weber" }
const CHANNEL = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a"
const POST = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b"
const MESSAGE = "3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c"

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      // Reduced motion, as homeGreeting.spec.ts: on a computer the greeting's orbits turn for six minutes, and a
      // review shot waits for a still page. At rest it draws what it ends on; the mention rows are the case here.
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } })
      test("Home lists a mention an edit added to a message, and opens the message", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const now = Date.now()
        const at = (s: number) => new Date(now - s * 1000).toISOString()
        const notice = (id: string, s: number, extra: Record<string, unknown>) => ({
          activity_type: "NOTICE",
          time: at(s),
          priority: "normal",
          actor_kind: "person",
          notice: { id, kind: "message.mentioned", can_open: true, reason: "mention", actor: JONAS, created_at: at(s), ...extra },
        })
        await stubBackend(page, testInfo, {
          "/activity/unified": {
            msg: "ok",
            data: {
              has_more: false,
              activities: [
                notice("0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a01", 60, { resource_kind: "channel", resource_uuid: CHANNEL, title: "engineering", data: { post_id: POST } }),
                notice("0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a02", 120, { resource_kind: "conversation", resource_uuid: `${JONAS.user_uuid} ${SAM.user_uuid}`, data: { message_id: MESSAGE } }),
              ],
            },
          },
          // Home's other sources: answered empty, so the mentions are the whole of it.
          "/approvals/waiting": { msg: "ok", data: { items: [] } },
          "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
          "/event/getEvents": { msg: "ok", data: [] },
          "/project/overview": { msg: "ok", data: { projects: [] } },
        })
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const rows = page.locator('[data-needs-me] [data-needs-kind="reply"]')
        await expect(rows).toHaveCount(2, { timeout: 60_000 })
        await expect(rows.first().getByRole("link", { name: /Jonas mentioned you in #engineering/ })).toHaveAttribute("href", `/app/channel/${CHANNEL}/${POST}`)
        await expect(rows.nth(1).getByRole("link", { name: /Jonas mentioned you in a message/ })).toHaveAttribute("href", `/app/chat/${JONAS.user_uuid}/${MESSAGE}`)
        // At 390 the rows sit below the fold, under the tab bar (DESIGN-BUILD-119 G1): brought into view, as a thumb
        // would, so the shot shows their wrap and their actions on touch.
        if (phone) await rows.last().evaluate((el) => el.scrollIntoView({ block: "center" }))
        await reviewShot(page, "home-mention-notice", theme)
      })
    })
  }
}
