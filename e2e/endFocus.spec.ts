import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { expectHomeSettled, stubBackend } from "./stubbedApp"

// Ending focus time, in a real browser with no backend, from every End the app
// offers: the sidebar's and the profile menu's at 1280, and the You sheet's on
// a phone at 390 by touch. The focus time was started somewhere else (the
// phone, the desktop app, the calendar, another browser), so this browser
// holds no record of it; the server ends whatever focus time is running.
//
// Why (23 Oct 2026, the owner: "End focus button is not working"): End could
// only end the block its own browser had started, from a record in that
// browser's storage. For any other it opened the calendar and ended nothing,
// and the phone had no End at all. The only test mocked the hook.

const FOCUS_EVENT = "6c0f1d2e-0000-4000-8000-00000000f0c5"

/** Home in focus time started elsewhere, and what End sends: the server's focus ends with the first. */
async function inFocus(page: Page, testInfo: TestInfo) {
  const until = new Date(Date.now() + 40 * 60_000).toISOString()
  const ends: Request[] = []
  const writes: string[] = []
  await stubBackend(page, testInfo, {
    "/user/notificationPreferences": () => ({ msg: "ok", data: { notifications_paused_until: null, focus_until: ends.length ? null : until } }),
    "/event/endFocus": (_url: URL, req: Request) => {
      ends.push(req)
      return { msg: "Ended focus time", data: { ended: [FOCUS_EVENT] } }
    },
    "/event/updateEvent": (url: URL) => {
      writes.push(url.pathname)
      return { msg: "Updated event!" }
    },
    // Home's own reads, answered empty: a "Not found" toast is a layer too.
    "/activity/unified": { msg: "ok", data: null },
    "/user/assignedTaskList": { msg: "ok", data: null },
    "/event/getEvents": { msg: "ok", data: null },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/ch/suggested": { msg: "ok", data: [] },
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expectHomeSettled(page)
  return { ends, writes }
}

/** End reached the server once, as a POST, and nothing else was written or opened. */
async function endedOnTheServer(page: Page, sent: { ends: Request[]; writes: string[] }) {
  await expect.poll(() => sent.ends.length, { message: "End sent nothing to the server", timeout: 15_000 }).toBe(1)
  expect(sent.ends[0].method()).toBe("POST")
  expect(sent.writes, "End wrote to an event of its own").toEqual([])
  expect(new URL(page.url()).pathname, "End opened the calendar instead").toBe("/app/home")
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("the sidebar's End ends focus time started elsewhere", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const sent = await inFocus(page, testInfo)
    const end = page.getByRole("button", { name: /^End focus time/ })
    await expect(end).toBeVisible({ timeout: 120_000 })
    await end.click()
    await endedOnTheServer(page, sent)
    await expect(end, "the sidebar still says you are in focus").toHaveCount(0)
  })

  test("the profile menu's End focus time ends it too", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const sent = await inFocus(page, testInfo)
    await expect(page.getByRole("button", { name: /^End focus time/ })).toBeVisible({ timeout: 120_000 })
    await page.getByRole("button", { name: "Profile and settings" }).click()
    await page.getByRole("menuitem", { name: "End focus time" }).click()
    await endedOnTheServer(page, sent)
    await expect(page.getByRole("button", { name: /^End focus time/ })).toHaveCount(0)
    await page.getByRole("button", { name: "Profile and settings" }).click()
    await expect(page.getByRole("menuitem", { name: "Start focus time" })).toBeVisible()
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("the You sheet's End focus time ends focus time started elsewhere", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const sent = await inFocus(page, testInfo)
    await page.getByRole("button", { name: "Your profile" }).first().tap({ timeout: 120_000 })
    await expect(page.locator("[data-you-status]")).toContainText("In focus until", { timeout: 60_000 })
    await page.getByRole("button", { name: /^End focus time/ }).tap({ timeout: 30_000 })
    await endedOnTheServer(page, sent)
    await page.getByRole("button", { name: "Your profile" }).first().tap()
    await expect(page.getByRole("button", { name: /^Start focus time/ })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("[data-you-status]")).not.toContainText("In focus")
  })
})
