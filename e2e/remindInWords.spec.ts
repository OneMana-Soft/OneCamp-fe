import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// WHEN, IN WORDS (H3; linear-45 #1: "snoozes a notice, or reminds you about
// a task, doc or project, with the time in words"). Later's Remind me takes
// the time as it is said: "tomorrow 9" is said back under the box as it is
// typed, "12/3" is refused in words (3 Dec to some, 12 Mar to others), and
// Enter sets "next monday 2pm" as Mon 19 Oct 14:00, the moment the fields
// under it show too. A dialog at 1280, the box in focus as it opens; the
// sheet at 390 under a finger, Set reminder pinned in its footer. Light and
// dark. With SHOTS_DIR set, each state is saved for review.
//
// The clock is pinned (memory: clock-dependent e2e): Thursday 15 Oct 2026,
// 10:00 in Asia/Kolkata, the zone and the clock's locale pinned with it, so
// the words read the same on any day and any machine.

const NOW = new Date("2026-10-15T04:30:00Z")
const ok = (data: unknown) => ({ msg: "ok", data })
const ITEM = {
  id: "l1",
  item_type: "task",
  item_id: "t1",
  link: "/app/projects/p1?task=t1",
  title: "Launch checklist",
  context: "Acme launch",
  created_at: "2026-10-14T09:00:00Z",
  updated_at: "2026-10-14T09:00:00Z",
}

/** What the page asked for that this file didn't answer, named if a shot fails on it. */
const unanswered: string[] = []

/** Later, one task saved without a reminder, under the pinned clock; the writes it sends, by path. */
async function openLater(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/later/update": (_url: URL, request: Request) => ok({ ...ITEM, remind_at: (request.postDataJSON() as { remind_at?: string }).remind_at }),
    "/later": ok({ items: [ITEM], open: 1, due: 0 }),
  })
  const sent: { path: string; body: unknown }[] = []
  page.on("request", (r) => {
    if (r.method() === "POST") sent.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() })
  })
  page.on("response", (r) => {
    if (r.status() === 404) unanswered.push(new URL(r.url()).pathname)
  })
  await page.goto("/app/later", { waitUntil: "domcontentloaded", timeout: 120_000 })
  return sent
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test"), `unanswered: ${unanswered.join(", ")}`).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 } }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ] as const) {
    test.describe(`Later's Remind me in words ${label}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme, timezoneId: "Asia/Kolkata", locale: "en-US" })

      test("says the time back as it is typed, refuses 12/3 in words, and Enter sets it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openLater(page, testInfo, theme)
        const phone = use.viewport.width < 640
        const row = page.locator("[data-later-row]").filter({ hasText: "Launch checklist" })
        await expect(row).toBeVisible({ timeout: 90_000 })
        // Under a finger the row's tools are the rows of the drawer its Actions opens.
        if (phone) {
          await row.getByRole("button", { name: "Actions" }).tap()
          await page.getByRole("menuitem", { name: "Saved for later", exact: true }).tap()
        } else {
          await row.hover()
          await row.getByRole("button", { name: "Saved for later" }).click()
        }
        const pick = page.getByRole("menuitem", { name: /Pick a date and time/ })
        await (phone ? pick.tap() : pick.click())

        const dialog = page.getByRole("dialog", { name: "Remind me" })
        const box = dialog.getByRole("textbox", { name: "When" })
        await expect(box).toBeVisible({ timeout: 60_000 })
        const set = dialog.getByRole("button", { name: "Set reminder" })
        if (phone) {
          // The sheet, Set reminder pinned in its footer; the sheet keeps the
          // focus, so no keyboard is thrown over it until the box is tapped.
          await expect(page.locator("[data-vaul-drawer][data-state='open']")).toHaveCount(1)
          await expect(set.locator("xpath=ancestor::*[@data-sheet-footer]")).toHaveCount(1)
          await expect(box).not.toBeFocused()
          await box.tap()
        } else {
          await expect(box).toBeFocused()
        }

        await box.fill("tomorrow 9")
        await expect(dialog.getByText(/^tomorrow at 9:00\sAM$/)).toBeVisible()
        await expect(set).toBeEnabled()
        await shot(page, "remind-words", theme)

        await box.fill("12/3")
        const why = dialog.getByText("Write the month as a word, like Dec 3.")
        await expect(why).toBeVisible()
        await expect(box).toHaveAttribute("aria-invalid", "true")
        await expect(set).toBeDisabled()
        await shot(page, "remind-words-refused", theme)

        await box.fill("next monday 2pm")
        await expect(dialog.getByText(/^Mon at 2:00\sPM$/)).toBeVisible()
        await expect(dialog.getByRole("group", { name: "Pick a date and time" }).getByRole("button", { name: /^Date, / })).toHaveAccessibleName(/Mon 19 Oct 2026$/)
        await box.press("Enter")
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => sent.find((r) => r.path.endsWith("/later/update"))?.body).toEqual({ id: "l1", remind_at: "2026-10-19T08:30:00.000Z" })
      })
    })
  }
}
