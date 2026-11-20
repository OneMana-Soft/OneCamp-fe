import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test"
import { contrastRatio, rgbToHex } from "../lib/color/oklch"
import { inkAndGround } from "./contrast"
import { SAM, reviewShot, stubBackend, withStatus, type Answers } from "./stubbedApp"

// V-941: the page is the one main landmark, and Skip to content's target, at
// every width. A member who opens Admin meets its admins-only guard, which a
// phone drew with no main at all, so landmark navigation found nothing there.
// An admin's Admin drew its own main inside the shell's on a computer.
//
// V-955: the accent's text inside a highlighted menu item. The highlight lays
// --press and the item's tint over the menu, where the accent's text read
// 4.0:1 in light (the workspace menu's plan row, "Remove the 25-person
// limit", on UX-SHELL-H3). The plan row isn't on this build, so the spec
// writes the row's words, in its classes, into a real highlighted item of the
// real workspace menu and reads the colours the browser draws.
//
// V-1013: three screens are drawn instead of the shell, and drew no main: the
// workspace that can't open (its profile request fails), a call's own page on
// a computer, and the crash the app can't recover from (a unit:
// components/error/errorStates.test.tsx). Each now holds the page's one main.

// A call needs a camera and a microphone that answer (meetingChat.spec.ts).
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })
// With SHOTS_DIR=<dir> the guard and the highlighted item are saved.

const ADMIN = { ...SAM, user_is_admin: true }
const GUARD = "Only workspace admins can open Admin."

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

async function open(browser: Browser, testInfo: TestInfo, view: (typeof views)[number], scheme: "light" | "dark", answers: Answers, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    viewport: view.viewport,
    colorScheme: scheme,
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
    ...options,
  })
  const page = await context.newPage()
  await stubBackend(page, testInfo, answers)
  return page
}

/** The page's one main landmark, which Skip to content reaches. */
async function oneMain(page: Page) {
  const main = page.getByRole("main")
  await expect(main).toHaveCount(1)
  await expect(page.locator("main")).toHaveCount(1)
  await expect(main).toHaveAttribute("id", "main-content")
  await expect(page.getByRole("link", { name: "Skip to content", includeHidden: true })).toHaveAttribute("href", "#main-content")
  return main
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: Admin's guard is in the page's one main landmark, and an admin's Admin has one`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const member = await open(browser, testInfo, view, scheme, { "/user/profile": { msg: "ok", data: SAM } })
      await member.goto("/app/admin", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(member.getByText(GUARD)).toBeVisible({ timeout: 60_000 })
      const main = await oneMain(member)
      await expect(main.getByText(GUARD)).toBeVisible()
      await expect(main.getByRole("link", { name: "Back to app" })).toBeVisible()
      // The guard's heading is the page's, inside the landmark (spoken only on a phone, whose bar shows it).
      await expect(main.getByRole("heading", { name: "Admin", level: 1 })).toHaveCount(1)
      await reviewShot(member, "admin-guard", scheme)
      await member.context().close()

      const admin = await open(browser, testInfo, view, scheme, {
        "/user/profile": { msg: "ok", data: ADMIN },
        "/admin/apps": { data: { apps: [] } },
        "/admin/marketplace": { data: { apps: [] } },
      })
      await admin.goto("/app/admin?tab=apps", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(admin.locator("[data-page-frame]").first()).toBeVisible({ timeout: 60_000 })
      await oneMain(admin)
      await admin.context().close()
    })
  }
}

for (const scheme of ["light", "dark"] as const) {
  test(`at 1280, ${scheme}: the accent's text in a highlighted menu item reads at AA`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const page = await open(browser, testInfo, views[0], scheme, {
      "/user/profile": { msg: "ok", data: ADMIN },
      "/activity/unified": { msg: "ok", data: null },
      "/user/assignedTaskList": { msg: "ok", data: null },
      "/event/getEvents": { msg: "ok", data: null },
      "/project/overview": { msg: "ok", data: { projects: [] } },
      "/ch/suggested": { msg: "ok", data: [] },
    })
    // Home has the sidebar's workspace menu (Admin's settings shell has none).
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    // The plan row's words, in its classes, in two of the menu's own rows.
    const rows = menu.locator(".shell-menu-item[role=menuitem]")
    for (const i of [0, 1]) {
      await rows.nth(i).evaluate((row) => {
        const words = document.createElement("span")
        words.className = "text-ui-sm font-medium text-brand-text"
        words.dataset.planWords = ""
        words.textContent = "Remove the 25-person limit"
        row.append(words)
      })
    }
    // The keys put the highlight on the first row; the second is at rest.
    await page.keyboard.press("ArrowDown")
    await expect(rows.nth(0)).toHaveAttribute("data-highlighted", "")
    await expect(rows.nth(1)).not.toHaveAttribute("data-highlighted", "")
    const lit = await inkAndGround(page, rows.nth(0).locator("[data-plan-words]"))
    const rest = await inkAndGround(page, rows.nth(1).locator("[data-plan-words]"))
    const ratio = contrastRatio(lit.ink, lit.ground)
    expect(ratio, `${rgbToHex(lit.ink)} on the highlight ${rgbToHex(lit.ground)} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(rest.ink, rest.ground), `${rgbToHex(rest.ink)} at rest on ${rgbToHex(rest.ground)}`).toBeGreaterThanOrEqual(4.5)
    // The highlight leans the accent toward the ink: darker in light, lighter in dark.
    expect(rgbToHex(lit.ink)).not.toBe(rgbToHex(rest.ink))
    testInfo.annotations.push({ type: "V-955", description: `${scheme}: lit ${rgbToHex(lit.ink)} on ${rgbToHex(lit.ground)} ${ratio.toFixed(2)}:1; rest ${rgbToHex(rest.ink)} on ${rgbToHex(rest.ground)} ${contrastRatio(rest.ink, rest.ground).toFixed(2)}:1` })
    console.log(`V-955 ${scheme}: lit ${rgbToHex(lit.ink)} on ${rgbToHex(lit.ground)} ${ratio.toFixed(2)}:1; rest ${rgbToHex(rest.ink)} on ${rgbToHex(rest.ground)} ${contrastRatio(rest.ink, rest.ground).toFixed(2)}:1`)
    // The menu alone: Home's hub turns for ever, and a page shot waits for a still page.
    if (process.env.SHOTS_DIR) await menu.screenshot({ path: `${process.env.SHOTS_DIR}/menu-lit-ink-1280-${scheme}.png` })
    await page.context().close()
  })
}

const CH = "c0ffee00-0000-4000-8000-0000000000c2"

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a workspace that can't open keeps the page's one main landmark`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const page = await open(browser, testInfo, view, scheme, { "/user/profile": withStatus(500, { msg: "Something went wrong" }) })
      await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const error = page.locator("[data-splash-error]")
      await expect(error).toBeVisible({ timeout: 60_000 })
      await expect(error.getByRole("button", { name: /try again|retrying/i })).toBeVisible()
      await reviewShot(page, "profile-failed", scheme)
      const main = await oneMain(page)
      await expect(main.locator("[data-spot-crash]")).toHaveCount(1)
      await expect(main.getByRole("button", { name: /try again|retrying/i })).toBeVisible()
      // A 500 is not a refusal: the session stays.
      expect(new URL(page.url()).pathname).toBe("/app")
    })

    test(`at ${view.name}, ${scheme}: a call's own page has the one main landmark, around the call and its conversation, focused or not`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const page = await open(browser, testInfo, view, scheme, {
        "/user/profile": { msg: "ok", data: SAM },
        "/config/client": { msg: "ok", data: { features: { calls: true } } },
        "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
        "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
      }, { permissions: ["camera", "microphone"] })
      await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
      const stage = page.locator("[data-call-stage]")
      await expect(stage).toHaveCount(1, { timeout: 30_000 })
      await reviewShot(page, "call-page", scheme)
      const main = await oneMain(page)
      await expect(main.locator("[data-call-stage]")).toHaveCount(1)
      if (view.phone) return
      // The main is the frame around the call and the conversation beside it,
      // as the shell's frame is around the page and its views (CODE-REVIEWER-325).
      await page.getByRole("button", { name: "Chat", exact: true }).click()
      const beside = page.getByRole("region", { name: /^Channel, view \d of \d$/ })
      await expect(beside).toBeVisible()
      await oneMain(page)
      await expect(main.locator("[data-call-stage]")).toHaveCount(1)
      await expect(main.getByRole("region", { name: /^Channel, view/ })).toHaveCount(1)
      // Focused alone, the conversation hides the call's panel. The main stays, around it.
      await beside.getByRole("button", { name: "Focus this channel" }).click()
      await expect(page.getByRole("toolbar", { name: "Call controls" })).toBeHidden()
      await oneMain(page)
      await expect(main).toBeVisible()
      await expect(main.getByRole("region", { name: /^Channel, view/ })).toBeVisible()
      await reviewShot(page, "call-focus", scheme)
    })
  }
}
