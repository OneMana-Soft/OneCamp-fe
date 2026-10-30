import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"
import { SCHEMES, SCREENS, press, type Screen } from "../screens"

// "Viewed by" opens with the doc's last 28 days (docs C6-3): members, and its
// published page's visitors apart, said to be counted per day; then the list
// of who viewed it, and the doc's recent changes. On a computer from More, on a phone from the doc's
// options, by touch. The views API is answered here; nothing reaches a real server.
// SHOTS=<dir> saves the dialog at 1280 and 390, light and dark, for review.

const DOC = "d1c3e5a7-2b4d-4f6a-8c0e-1a2b3c4d5e6f"
const day = (n: number) => new Date(Date.UTC(2026, 8, 23 + n)).toISOString().slice(0, 10)
const days = Array.from({ length: 28 }, (_, n) => ({
  day: day(n),
  member_views: [0, 2, 1, 3, 0, 0, 4][n % 7],
  members: [0, 1, 1, 2, 0, 0, 3][n % 7],
  page_views: n > 20 ? [5, 9, 3, 12, 7, 4, 6][n - 21] : 0,
  visitors: n > 20 ? [4, 6, 3, 9, 5, 3, 4][n - 21] : 0,
}))
const sum = (k: "member_views" | "page_views" | "visitors") => days.reduce((n, d) => n + d[k], 0)
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const events = [
  { action: "doc.published", summary: "Published ‘Launch plan’", actor_kind: "human", actor: "Priya Shah", at: ago(45) },
  { action: "doc.shared", summary: "Shared ‘Launch plan’ with 2 people (edit)", actor_kind: "human", actor: "Sam Rivera", at: ago(1440) },
]
const insights = { from: day(0), days, members: 5, member_views: sum("member_views"), page_views: sum("page_views"), visitor_days: sum("visitors"), events }
// Everyone who ever opened it (7) is at least the members of the last 28 days (5).
const viewers = [
  ["Priya Shah", 12],
  ["Dana Ross", 180],
  ["Jonas Weber", 1500],
  ["Maya Patel", 4000],
  ["Ola Nordmann", 9000],
  ["Lee Chen", 60000],
  ["Ana Silva", 90000],
].map(([name, minutes], n) => ({
  user_uuid: `${n + 1}${n + 1}${n + 1}${n + 1}${n + 1}${n + 1}${n + 1}${n + 1}-1111-4111-8111-111111111111`,
  user_full_name: name as string,
  first_viewed_at: ago((minutes as number) + 100000),
  last_viewed_at: ago(minutes as number),
}))
const answers = {
  "/doc/getInsights": { msg: "Success", data: insights },
  "/doc/getViewers": { msg: "Success", data: viewers, count: viewers.length, has_more: false },
}

async function openViewedBy(page: Page, screen: Screen) {
  if (screen.isMobile) {
    await press(screen, page.getByRole("button", { name: "Document options" }))
    await press(screen, page.getByRole("button", { name: "Viewed by" }).or(page.getByRole("menuitem", { name: "Viewed by" })).first())
  } else {
    // The page's actions register as their chunk loads: open More until it has them.
    const menu = page.locator("[data-doc-more-menu]")
    await expect(async () => {
      if (!(await menu.isVisible())) await page.getByRole("button", { name: "More doc actions" }).click()
      const found = await menu.getByRole("menuitem", { name: "Viewed by" }).isVisible()
      if (!found) await page.keyboard.press("Escape")
      expect(found).toBe(true)
    }).toPass({ timeout: 30_000 })
    await menu.getByRole("menuitem", { name: "Viewed by" }).click()
  }
  const dialog = page.getByRole("dialog").filter({ hasText: "Viewed by" })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  return dialog
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test(`Viewed by opens with the last 28 days, ${screen.name}, ${scheme}`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const relay = new CollabRelay()
      const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC, title: "Launch plan" }, answers, screen)
      await tab.page.emulateMedia({ colorScheme: scheme })
      const asked: string[] = []
      tab.page.on("request", (r) => {
        if (r.url().includes("/doc/getInsights")) asked.push(new URL(r.url()).search)
      })
      const dialog = await openViewedBy(tab.page, screen)
      const strip = dialog.locator("[data-view-insights]")
      await expect(strip).toBeVisible()
      await expect(strip.getByRole("heading", { name: "Last 28 days" })).toBeVisible()
      await expect(dialog.getByRole("heading", { name: "Viewed by 7" })).toBeVisible()
      // Opened by pointer, the dialog holds the focus itself: no ring on its close button.
      await expect(dialog.getByRole("button", { name: "Close" })).not.toBeFocused()
      await expect(strip.getByText("Members", { exact: true })).toBeVisible()
      await expect(strip.getByText("Page visitors", { exact: true })).toBeVisible()
      await expect(strip.getByText(/counted per day/)).toBeVisible()
      await expect(strip.locator("[data-spark]")).toBeVisible()
      await expect(dialog.getByText("Priya Shah", { exact: true })).toBeVisible()
      // The review's shot is the panel as it opens, before anything scrolls.
      const dir = process.env.SHOTS
      if (dir) await dialog.screenshot({ path: `${dir}/viewed-by-${screen.name}-${scheme}.png`, animations: "disabled" })
      const changes = dialog.getByRole("region", { name: "Recent changes" })
      await changes.scrollIntoViewIfNeeded()
      await expect(changes.getByText("Published ‘Launch plan’")).toBeVisible()
      await expect(strip.getByRole("link", { name: "Change whether your views are recorded" })).toBeVisible()
      expect(asked[0]).toBe(`?doc_uuid=${DOC}`)
      await tab.close()
    })
  }
}
