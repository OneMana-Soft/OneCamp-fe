import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { reviewShot, stubBackend, withStatus, type Answers } from "./stubbedApp"

// A call's notices ("Maya Chen turned off video for everyone") are the app's
// toasts, and at 1280 they sat in the window's corner, over the call's side
// column: one covered the call chat's held line (DESIGN-BUILD-18, 26 Oct).
// They now sit over the stage, 16px inside where the column starts, and go
// back to the corner when it closes. On a phone they stay centred above the
// dock, whatever covers the stage, and come in at the top while a sheet
// covers the dock: More's sheet held Raise your hand under one (DESIGN-BUILD-20).
// At the top they sit under the call's own top row, never over its place pill.
//
// The call's server never answers here (stubBackend accepts every socket and
// says nothing), so the call is still connecting: its stage, dock and side
// column are up, which is all this needs.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const CH = "c0ffee00-0000-4000-8000-0000000000c9"
/** What this server says it has: calls. */
const CALLS_ON = { features: { calls: true } }

async function joinCall(page: Page, testInfo: TestInfo, answers: Answers = {}) {
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: CALLS_ON },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    ...answers,
  })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
}

/**
 * The notices above the page, the same on every build. Only a build for the demo shows the shared demo's note, once
 * per browser, so it is marked seen. Sam is a workspace admin of an install that says it can't send email (the app
 * takes email as working until told otherwise), which every build tells an admin in a notice that can be dismissed
 * ("Email is off.", components/banner/EmailOffBanner); the other admin notices' reads are answered with nothing to say.
 */
async function emailOffNoticeOnly(page: Page): Promise<Answers> {
  await page.addInitScript(() => localStorage.setItem("onecamp:demo-shared-note-seen", "1"))
  return {
    "/config/client": { msg: "ok", data: { ...CALLS_ON, email_enabled: false } },
    // The shell reads who is an admin from the side bar's profile (app/app/LayoutContent).
    "/user/sidebarNav": { msg: "ok", data: { user_is_admin: true } },
    "/admin/disk": { data: { available: true, level: "ok" } },
    "/admin/import/outcomes": { outcomes: [] },
  }
}
const emailOff = (page: Page) => page.getByRole("status").filter({ hasText: "Email is off." })

/** Where an element is drawn. The toasts' viewport, which every toast sits in, has no height while it is empty. */
const box = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number })
/**
 * A notice at its tallest on a phone, a title on two lines, its detail and the older notice peeking behind, is 66px
 * (DESIGN-BUILD-20); 6px more keeps its edge off the row under it.
 */
const TALLEST_NOTICE = 66 + 6
/**
 * While More's sheet is up the notices come in 12px under the call's top row (its place pill), wherever the call
 * sits on the page, with room for the tallest one above the sheet's first row. Says where the pill and that row end.
 */
async function underTheTopRow(page: Page, toasts: Locator) {
  const firstItem = page.getByRole("menu").getByRole("menuitem").first()
  await expect(firstItem).toBeVisible()
  const pill = page.locator("[data-place-pill]")
  await expect(pill).toBeVisible()
  const p = await box(pill)
  const pillEnd = Math.round(p.y + p.height)
  await expect.poll(async () => Math.round((await box(toasts)).y), { message: "12px under the call's top row" }).toBe(pillEnd + 12)
  const firstRow = Math.round((await box(firstItem)).y)
  expect(pillEnd + 12 + TALLEST_NOTICE, "the tallest notice ends above More's first row").toBeLessThan(firstRow)
  return { pillEnd, firstRow }
}
/** The toasts end 12px above the dock, as they did before the column moved them (the dock's floor). */
async function aboveTheDock(page: Page, toasts: Locator) {
  const dockTop = Math.round((await box(page.getByRole("toolbar", { name: "Call controls" }))).y)
  await expect.poll(async () => { const b = await box(toasts); return Math.round(b.y + b.height) }).toBe(dockTop - 12)
}

test.describe("at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("a call's notices sit over its stage, clear of the side column, and back in the corner once it closes", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinCall(page, testInfo)
    const toasts = page.locator(".toast-viewport")
    const open = page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: /^People/ })
    await expect(open).toBeVisible({ timeout: 30_000 })

    // No column: the window's corner, 24px in, above the dock.
    await expect.poll(async () => { const b = await box(toasts); return Math.round(1280 - b.x - b.width) }).toBe(24)
    await aboveTheDock(page, toasts)

    await open.click()
    const panel = page.getByRole("complementary", { name: "People" })
    await expect(panel).toBeVisible()
    // The column starts where its slot does; the toasts end 16px before it.
    const columnStart = Math.round((await box(panel.locator(".."))).x)
    expect(columnStart).toBeLessThan(1280 - 300)
    await expect.poll(async () => { const b = await box(toasts); return Math.round(b.x + b.width) }).toBe(columnStart - 16)

    await panel.getByRole("button", { name: "Close People" }).click()
    await expect(panel).toHaveCount(0)
    await expect.poll(async () => { const b = await box(toasts); return Math.round(1280 - b.x - b.width) }).toBe(24)
  })

  test("a call hidden beside its focused channel lets the toasts go to the corner, and takes them back when it shows", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinCall(page, testInfo)
    const toasts = page.locator(".toast-viewport")
    const dock = page.getByRole("toolbar", { name: "Call controls" })
    const chat = page.getByRole("button", { name: "Chat", exact: true })
    await expect(chat).toBeVisible({ timeout: 30_000 })
    const callEnd = async () => { const b = await box(page.locator("[data-meeting-call]")); return Math.round(b.x + b.width) }
    const overTheStage = async () => { const b = await box(toasts); return Math.round(b.x + b.width) <= (await callEnd()) - 16 }

    await chat.click()
    const beside = page.getByRole("region", { name: /^Channel, view \d of \d$/ })
    await expect(beside).toBeVisible()
    await expect.poll(overTheStage).toBe(true)

    // Focusing the channel hides the call, which runs on (MeetingSplit). Its
    // stage and dock have no box, and places read from it put every toast off
    // screen (CODE-REVIEWER-50, 26 Oct): they take the window's corner.
    await beside.getByRole("button", { name: "Focus this channel" }).click()
    await expect(dock).toBeHidden()
    await expect.poll(async () => { const b = await box(toasts); return Math.round(1280 - b.x - b.width) }).toBe(24)
    const corner = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--corner-right-h")) || 0)
    await expect.poll(async () => { const b = await box(toasts); return Math.round(860 - b.y - b.height) }).toBe(Math.round(24 + corner))

    await beside.getByRole("button", { name: "Show every view" }).click()
    await expect(dock).toBeVisible()
    await expect.poll(overTheStage).toBe(true)
    await aboveTheDock(page, toasts)
  })
})

test.describe("on a phone, by touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("a call's notices stay centred above the dock while People covers the stage", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinCall(page, testInfo)
    const toasts = page.locator(".toast-viewport")
    const dock = page.getByRole("toolbar", { name: "Call controls" })
    await expect(dock.getByRole("button", { name: /^More call options/ })).toBeVisible({ timeout: 30_000 })
    const centre = async () => { const b = await box(toasts); return Math.round(b.x + b.width / 2) }
    await expect.poll(centre).toBe(195)
    await aboveTheDock(page, toasts)

    await dock.getByRole("button", { name: /^More call options/ }).tap()
    await page.getByRole("menuitem", { name: /^People/ }).tap()
    await expect(page.getByRole("complementary", { name: "People" })).toBeVisible()
    await expect.poll(centre).toBe(195)
  })

  // More is a menu, which a phone shows as a sheet over the dock (app/overlay.css 8). While it is up the notices
  // come in at the top, as under any sheet (app/phone.css C9). On the call's own page the call sits under the app
  // bar and any notice above the page, and a notice under the bar covered its place pill (DESIGN-BUILD-20, 26 Oct):
  // they come in 12px under the call's top row, clear of the sheet's rows, and go back above the dock when it closes.
  test("a call's notices come in under its top row while More's sheet is up, below the bar and a banner, and go back above the dock after", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    // The one running the call may record it, and this server can't start a recording: the call says so in a notice.
    await joinCall(page, testInfo, {
      ...(await emailOffNoticeOnly(page)),
      "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: true, ch_call_active: true } },
      "/ch/startCallRecording": withStatus(503, {}),
    })
    const toasts = page.locator(".toast-viewport")
    const more = page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: /^More call options/ })
    await expect(more).toBeVisible({ timeout: 30_000 })
    await expect(emailOff(page)).toBeVisible()

    await more.tap()
    await page.getByRole("menuitem", { name: "Record call" }).tap()
    const notice = page.locator(".toast-root").filter({ hasText: "Couldn't start the recording" })
    await expect(notice).toBeVisible()
    await aboveTheDock(page, toasts)

    await more.tap()
    const { pillEnd, firstRow } = await underTheTopRow(page, toasts)
    const n = await box(notice)
    expect(Math.round(n.y), "the notice, 12px under the place pill").toBe(pillEnd + 12)
    expect(Math.round(n.y + n.height), "the notice ends above More's first row").toBeLessThan(firstRow)
    await reviewShot(page, "notice-in-page-more", "light")

    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toBeHidden()
    await aboveTheDock(page, toasts)
  })

  // With the notice above the page dismissed, the call's top row moves up right under the app bar, where the bar's
  // own slot covered it.
  test("with no banner above the call, its notices come in under its top row, which moves up with the call", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinCall(page, testInfo, await emailOffNoticeOnly(page))
    const toasts = page.locator(".toast-viewport")
    const more = page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: /^More call options/ })
    await expect(more).toBeVisible({ timeout: 30_000 })
    await emailOff(page).getByRole("button", { name: "Dismiss" }).tap()
    await expect(emailOff(page)).toBeHidden()

    await more.tap()
    await underTheTopRow(page, toasts)
  })
})
