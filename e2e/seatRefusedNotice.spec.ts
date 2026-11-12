import { expect, test } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// ADMIN-02: when the free plan's limit refuses someone's own way in, every
// admin is told in their Inbox, once that day, and the row opens Plan. The
// address rides in the notice's words, which the server sends only to a
// reader who may open it (an admin now): anyone else's row names nobody and
// opens nothing. The joiner hears that their admin was told, and nothing of
// prices. At both widths, in both themes.

const PERSON = "3f9a6c1e-2b4d-5e7f-8a9b-0c1d2e3f4a5b"
const LINE = "Remove the 25-person limit, or free a place."

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("an admin's Inbox names someone the limit kept out and opens Plan", async ({ page }, testInfo) => {
        const now = new Date()
        const at = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
        const refused = (id: string, s: number, can_open: boolean) => ({
          activity_type: "NOTICE",
          time: at(s),
          priority: "normal",
          actor_kind: "person",
          notice: {
            id,
            kind: "member.seat_refused",
            resource_kind: "seat_refused",
            resource_uuid: PERSON,
            reason: "admin",
            created_at: at(s),
            can_open,
            ...(can_open ? { title: "Your free plan" } : {}),
            data: { ...(can_open ? { text: "ana@example.com" } : {}), limit: "25", line: LINE },
          },
        })
        await stubBackend(page, testInfo, {
          "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
          "/activity/seen": { msg: "ok" },
          "/activity/unified": {
            msg: "ok",
            data: {
              has_more: false,
              activities: [
                refused("7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", 10, true),
                // Read by someone who is no longer an admin: no address, no line, no way in.
                refused("8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e", 30, false),
              ],
            },
          },
        })
        await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })

        const link = page.getByRole("link", { name: /ana@example\.com couldn't join: your free plan is full/ })
        await expect(link).toBeVisible({ timeout: 30_000 })
        await expect(link).toHaveAttribute("href", "/app/admin?tab=plan")
        // The row's words sit under its link (a whole-row overlay).
        const row = page.locator("[data-feed-row]").filter({ has: link })
        await expect(row).toContainText(LINE)
        // Someone asking to come in wears the invite's badge.
        await expect(row.locator("[data-kind-badge]")).toHaveAttribute("data-kind-badge", "invite")

        const hidden = page.locator("[data-feed-row]").filter({ hasText: "Someone couldn't join" })
        await expect(hidden).toHaveCount(1)
        await expect(hidden).not.toContainText("ana@example.com")
        await expect(hidden).not.toContainText(LINE)
        await expect(page.getByRole("link", { name: /Someone couldn't join/ })).toHaveCount(0)
        await reviewShot(page, "inbox-seat-refused", theme)
      })

      test("the joiner hears their admin was told, and nothing of prices", async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, {
          // No session: the sign-in page draws its form and the refusal.
          "/user/profile": withStatus(401, { msg: "Not signed in" }),
          "/auth/providers": { providers: { email: true } },
        })
        await page.goto("/?error=seat_limit", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const notice = page.getByText("Your admin has been told; try again once they've freed a place or removed the limit.")
        await expect(notice).toBeVisible({ timeout: 60_000 })
        await expect(page.getByText("No free seat")).toBeVisible()
        // What the page shows (innerText, not the inline scripts' text).
        expect(await page.locator("body").innerText()).not.toMatch(/pricing|licence|₹|\$/i)
        await reviewShot(page, "signin-seat-refused", theme)
      })
    })
  }
}
