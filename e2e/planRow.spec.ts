import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, expectHomeSettled, reviewShot, stubBackend } from "./stubbedApp"

// The plan and its seats for an admin (SHELL-15), in a real browser with no
// backend: on the free plan at 20 of 25 people, the workspace menu says so,
// with a track and the way past the limit, and a notice says 5 places are
// left until it's dismissed. A member sees neither. With SHOTS_DIR=<dir> each
// is saved at 1280 and 390, light and dark.

const ADMIN = { ...SAM, user_is_admin: true }
// GET /admin/plan's answer (types/plan.ts), as the server gives it on the free plan.
const LINKS = { licence: "https://shop.example/buy?plan=lifetime", cloud: "https://shop.example/buy?plan=cloud", account: "https://shop.example/account", pricing: "https://shop.example/pricing" }
const PLAN = { msg: "ok", status: "success", data: { plan: "free", used: 20, limit: 25, free_plan: true, locked: ["sso", "ldap", "scim", "audit_export"], upgrade_url: "https://shop.example/buy", links: LINKS } }

async function home(page: Page, testInfo: TestInfo, who: typeof SAM, planAsked?: string[]) {
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: who },
    // The shell reads who is an admin from the side bar's profile (app/app/LayoutContent).
    "/user/sidebarNav": { msg: "ok", data: { user_is_admin: who.user_is_admin } },
    "/admin/disk": { data: { available: true, level: "ok" } },
    "/admin/import/outcomes": { outcomes: [] },
    "/admin/plan": () => {
      planAsked?.push("/admin/plan")
      return PLAN
    },
    "/me/capabilities": { msg: "ok", data: { "invitation.create": true } },
    "/activity/unified": { msg: "ok", data: null },
    "/user/assignedTaskList": { msg: "ok", data: null },
    "/event/getEvents": { msg: "ok", data: null },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/ch/suggested": { msg: "ok", data: [] },
    "/admin/onboarding": { msg: "ok", data: { dismissed: true, steps: [], done: 0, total: 0, complete: true, skipped: 0 } },
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expectHomeSettled(page)
}

/** The workspace menu's chevron, close up (SHELL-34): points down, turns over while open. */
async function chevronShot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir || theme !== "light") return
  const box = await page.locator(".shell-ws").first().boundingBox()
  if (!box) return
  await page.screenshot({ path: `${dir}/${name}-1280-${theme}.png`, clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.width + 24, height: box.height + 24 } })
}

for (const theme of SHOT_THEMES) {
  test.describe(`the plan for an admin at 1280, ${theme}`, () => {
    // Reduced motion, as homeGreeting.spec.ts: on a computer Home's greeting orbits for minutes, so a shot would wait on it.
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } })

    test("an admin on the free plan sees 20 of 25 and the way to remove the limit", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
      await home(page, testInfo, ADMIN)
      const notice = page.locator("[data-notice]").filter({ hasText: "5 places left on the free plan." })
      await expect(notice).toBeVisible({ timeout: 60_000 })
      await expect(notice.getByRole("link", { name: "Remove the 25-person limit" })).toHaveAttribute("href", LINKS.licence)
      await reviewShot(page, "plan-notice", theme)

      // The chevron points down at rest and turns over while the menu is open.
      const chevron = page.locator(".shell-ws .shell-chevron").first()
      await expect(chevron).toHaveCSS("transform", "none")
      await chevronShot(page, "plan-chevron-closed", theme)
      await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
      await expect(chevron).toHaveCSS("transform", /^matrix\(-1, 0, 0, -1,/)
      const row = page.getByRole("menuitem", { name: "Plan: Free, 20 of 25 people. Remove the 25-person limit" })
      await expect(row).toBeVisible({ timeout: 60_000 })
      await expect(row).toContainText("Free · 20 of 25 people")
      await expect(row.locator("[data-plan-track]")).toHaveAttribute("data-tone", "sun")
      await reviewShot(page, "plan-row", theme)
      await chevronShot(page, "plan-chevron-open", theme)
      // The keyboard reaches it: it is one of the menu's rows.
      await page.keyboard.press("ArrowDown")
      await expect(row).toBeFocused()
      await page.keyboard.press("Escape")

      await notice.getByRole("button", { name: "Dismiss" }).click()
      await expect(notice).toHaveCount(0)
      await page.reload({ waitUntil: "domcontentloaded" })
      await expectHomeSettled(page)
      await expect(page.getByText("5 places left on the free plan.")).toHaveCount(0)
    })
  })

  test.describe(`the plan for an admin on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } })

    test("an admin on a phone is told 5 places are left, with the way past the limit", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
      await home(page, testInfo, ADMIN)
      const notice = page.locator("[data-notice]").filter({ hasText: "5 places left on the free plan." })
      // A phone shows one notice, the most urgent (NoticeStack); here the demo
      // build's own note leads, so the rest fold behind "+1 more notice".
      const more = page.getByRole("button", { name: /more notices?$/ })
      await expect(notice.or(more).first()).toBeVisible({ timeout: 60_000 })
      if (await more.isVisible()) await more.tap()
      await expect(notice).toBeVisible()
      const way = notice.getByRole("link", { name: "Remove the 25-person limit" })
      // 36 px to look at with a 44 px reach: its ::after reaches 4 px past each edge (globals.css, mobile C10).
      const reach = await way.evaluate((el) => {
        const a = getComputedStyle(el, "::after")
        const out = a.content !== "none" && a.position === "absolute" ? -parseFloat(a.top) - parseFloat(a.bottom) : 0
        return el.getBoundingClientRect().height + Math.max(0, out)
      })
      expect(reach).toBeGreaterThanOrEqual(44 - 0.01)
      await reviewShot(page, "plan-notice", theme)

      // The workspace sheet carries the same row, a sheet row a thumb can take.
      await page.getByRole("button", { name: "Open organisation profile" }).first().click({ timeout: 120_000 })
      const row = page.getByRole("button", { name: "Plan: Free, 20 of 25 people. Remove the 25-person limit" })
      await expect(row).toBeVisible({ timeout: 60_000 })
      await expect(row).toContainText("Free · 20 of 25 people")
      await expect(row.locator("[data-plan-track]")).toHaveAttribute("data-tone", "sun")
      expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44 - 0.01)
      await reviewShot(page, "plan-sheet", theme)
      // Taking it closes the sheet and opens the way past the limit (held here: no network).
      await page.evaluate(() => {
        const w = window as unknown as { opened: string[] }
        w.opened = []
        window.open = (u?: string | URL) => (w.opened.push(String(u)), null)
      })
      await row.tap()
      await expect(row).toHaveCount(0)
      expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([LINKS.licence])
    })
  })
}

test.describe("the plan for a member, at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 }, contextOptions: { reducedMotion: "reduce" } })

  test("a member sees no plan row and no notice, and the plan isn't asked for", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const asked: string[] = []
    await home(page, testInfo, SAM, asked)
    await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
    await expect(page.getByRole("menuitem", { name: /Invite people/ })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: /^Plan:/ })).toHaveCount(0)
    await expect(page.getByText(/places? left on the free plan/)).toHaveCount(0)
    await reviewShot(page, "plan-member", "light")
    expect(asked).toEqual([])
  })
})

test.describe("the plan for a member, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, contextOptions: { reducedMotion: "reduce" } })

  test("a member's workspace sheet has no plan row, and the plan isn't asked for", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const asked: string[] = []
    await home(page, testInfo, SAM, asked)
    await page.getByRole("button", { name: "Open organisation profile" }).first().click({ timeout: 120_000 })
    await expect(page.getByRole("button", { name: /^Projects/ })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("button", { name: /^Plan:/ })).toHaveCount(0)
    expect(asked).toEqual([])
  })
})
