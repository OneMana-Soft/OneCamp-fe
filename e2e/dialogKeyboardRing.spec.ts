import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

// The shared dialog (components/ui/dialog.tsx) outside dashboards, opened from the keyboard. It puts
// the focus on its first field (on a desktop), and it never draws a ring round itself, even when it
// holds the focus as the fallback (a dialog whose fields haven't come yet). That is B9-b4's F1 (b),
// DESIGN-BUILD-115. The dialog here is the app's own Keyboard shortcuts list, which "?" opens from
// anywhere off a field. At 1280, and at 390 with touch (a phone with a keyboard), where the shared
// rule never focuses a field because that would throw up the screen keyboard.
// The phone's layout has no Keyboard shortcuts list (app/app/LayoutContent.tsx mounts it on the
// computer's alone), so no key opens it at 390. There the shared dialog is Reports' Add to dashboard,
// opened from the keyboard (Enter on its button): its first control is a picker, its first field is
// Name, and it holds the focus itself while its dashboards load (PROJ-203-B3).

const report = { weeks: ["2026-10-26", "2026-11-02"], done: [1, 2], added: [2, 1], hours: null, open: 3, overdue: 0, due_this_week: 1, done_total: 3, projects: [], people: [], priorities: [], all_projects: [], truncated: false }
const team = { id: "d0a50000-0000-4000-8000-0000000000e1", scope: "workspace", name: "Team pulse", shared: true, created_by: "u", created_at: "2026-11-02T09:00:00Z", updated_at: "2026-11-02T09:00:00Z" }

async function openApp(page: Page, testInfo: TestInfo, phone: boolean) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [{ project_uuid: "p-1", project_name: "Billing revamp", is_admin: 1, open: 3, done: 3, overdue: 0, due_soon: 1 }] } },
    "/project/report": { msg: "ok", data: report },
    "/project/dashboards": { msg: "ok", data: { mine: [], workspace: [team], can_keep_workspace: true } },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto(phone ? "/app/project?view=reports" : "/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("tab", { name: /Reports/ })).toBeVisible({ timeout: 60_000 })
}

for (const phone of [false, true]) {
  test.describe(`a dialog opened from the keyboard at ${phone ? 390 : 1280}`, () => {
    test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } })

    test("focuses its first field on a desktop, and never rings itself", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await openApp(page, testInfo, phone)
      if (phone) {
        const add = page.getByRole("button", { name: "Add to dashboard" })
        await expect(add).toBeEnabled({ timeout: 60_000 })
        await add.focus()
        await page.keyboard.press("Enter")
      } else {
        // "?" off any field opens the list.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await page.keyboard.press("?")
      }
      const dialog = page.getByRole("dialog", { name: phone ? "Add to a dashboard" : "Keyboard shortcuts" })
      await expect(dialog).toBeVisible({ timeout: 30_000 })
      const filter = dialog.getByRole("textbox").first()
      if (phone) await expect(filter).not.toBeFocused()
      else await expect(filter).toBeFocused()
      await expect(dialog).toHaveCSS("outline-style", "none")
      await reviewShot(page, `dialog-keyboard-open-${phone ? 390 : 1280}`, "light")

      // The fallback: the dialog itself holds the focus after a key, so :focus-visible applies. Without
      // F1 (b) the browser's own focus ring draws round the whole dialog here.
      await dialog.evaluate((el) => (el as HTMLElement).focus())
      await expect(dialog).toBeFocused()
      expect(await dialog.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
      await expect(dialog).toHaveCSS("outline-style", "none")
      await reviewShot(page, `dialog-keyboard-fallback-${phone ? 390 : 1280}`, "light")

      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
    })
  })
}
