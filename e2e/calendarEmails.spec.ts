import { expect, test, type Request } from "@playwright/test"
import { reviewShot, SAM, SHOT_THEMES, stubBackend, tidy } from "./stubbedApp"

// Calendar emails you choose (gcal-5, head E), in a real browser with no
// backend: Settings, Notifications has a Calendar group under the other
// emails, three switches each saved at once on its own key, at 1280 and on a
// phone. Each person changes only their own (/notifications/preferences).

const PREFS = {
  email_supported: true, email_enabled: true, email_mentions: true, email_dms: true, email_task_assigned: true, email_task_status: true,
  email_comments: true, email_calls: true, email_calendar_invites: true, email_calendar_changes: true, email_calendar_answers: true,
  email_channel_invites: true, email_only_when_offline: true, email_digest_frequency: "off", quiet_hours_enabled: false,
  quiet_hours_start: null, quiet_hours_end: null, quiet_hours_tz: null, read_receipts: true, read_receipts_allowed: true,
}

const VIEWS = [
  { name: "1280", use: { viewport: { width: 1280, height: 900 } }, phone: false },
  { name: "390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, phone: true },
] as const

for (const theme of SHOT_THEMES) {
  for (const view of VIEWS) {
    test.describe(`calendar emails at ${view.name}, ${theme}`, () => {
      test.use({ ...view.use, colorScheme: theme })

      test("are a Calendar group of three switches, each saved at once on its own", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: unknown[] = []
        await stubBackend(page, testInfo, {
          "/user/notificationPreferences": (_: URL, request: Request) => {
            if (request.method() === "GET") return { msg: "ok", data: PREFS }
            sent.push(request.postDataJSON())
            return { msg: "ok" }
          },
          "/user/allUsers": { msg: "ok", users: [SAM] },
          "/me/vips": { msg: "ok", data: [] },
        })
        await page.goto("/app/settings/notifications#notifications-email", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const group = page.getByRole("group", { name: "Calendar" })
        await expect(group).toBeVisible({ timeout: 60_000 })
        await tidy(page)
        const names = ["Invitations and bookings", "Changes and cancellations", "Replies to my events"]
        for (const name of names) await expect(group.getByRole("switch", { name })).toBeChecked()
        await expect(group.getByRole("switch")).toHaveCount(3)

        const changes = group.getByRole("switch", { name: "Changes and cancellations" })
        await changes.scrollIntoViewIfNeeded()
        await (view.phone ? changes.tap() : changes.click())
        await expect(changes).not.toBeChecked()
        await expect.poll(() => sent, { timeout: 20_000 }).toEqual([{ email_calendar_changes: false }])
        await expect(group.getByRole("switch", { name: "Invitations and bookings" })).toBeChecked()
        await group.evaluate((g) => g.scrollIntoView({ block: "center" }))
        await reviewShot(page, "e-calendar-emails", theme)
      })
    })
  }
}
