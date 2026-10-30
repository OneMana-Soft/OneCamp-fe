import { expect, test, type Page } from "@playwright/test"

import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// On a phone a menu is a bottom sheet (app/overlay.css §8) that rises under
// the finger that opened it. Opened on the finger's pointerdown, the click the
// browser sends as it lifts landed on the row that had risen there, and chose
// it: a tap on the call dock's "More" could start a recording (CALLS-LEAD, 20
// Oct 2026). The composer's "+" stands at the same foot of the screen, over
// the same kind of sheet, and a call needs a call server this run hasn't got.
// A tap opens the sheet and chooses nothing, whether the sheet has risen before
// the finger lifts (a finger held as long as a real one) or stands there at
// once (reduced motion, a quick tap).

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }

const message = (i: number) => ({
  chat_uuid: `0c4a0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  chat_from: i % 2 ? SAM : MAYA,
  chat_to: i % 2 ? MAYA : SAM,
  chat_created_at: new Date(Date.UTC(2026, 9, 14, 9, i)).toISOString(),
  chat_body_text: `<p>Message ${i + 1}: the launch notes, in order.</p>`,
  chat_attachments: [],
  chat_comment_count: 0,
})

/** A conversation with Maya, on a phone unless `phone` is false; returns the composer's "+". */
async function openConversation(page: Page, testInfo: Parameters<typeof stubBackend>[1], phone = true) {
  await stubBackend(page, testInfo, {
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: Array.from({ length: 6 }, (_, i) => message(i)), has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
    // The conversation's own reads. Left to the 404, each raised a "Not
    // found" toast at a moment that depends on the machine's load, over the
    // sheet's rows.
    "/command/catalog": { msg: "ok", data: { commands: [] } },
    "/user/notificationStatus/": { msg: "ok", data: {} },
    "/message/scheduled": { msg: "ok", data: [] },
    "/ai/voice-input": { msg: "ok", data: { available: false } },
  })
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Message 6:")).toBeVisible({ timeout: 60_000 })
  const plus = (phone ? page.locator("[data-phone-composer]") : page).getByRole("button", { name: "Add to the message" })
  await expect(plus).toBeVisible()
  return plus
}

/** A finger on the middle of `box`, held `ms` and lifted: the browser makes the tap, and its click. */
async function fingerTap(page: Page, box: { x: number; y: number; width: number; height: number }, ms: number) {
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] })
  await page.waitForTimeout(ms)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  return at
}

/** The sheet is open, stays open once whatever the tap could do is done, and nothing in it was chosen. */
async function openWithNothingChosen(page: Page) {
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Create a poll" })).toBeVisible()
  // Risen (300ms), and long past the click that followed the finger.
  await page.waitForTimeout(900)
  await expect(menu, "the sheet is still open").toBeVisible()
  // No row's work was done. The last row, under the finger, is "Draft with AI"
  // (its sheet asks "Tell it what to write") or, without AI, "Create a poll"
  // ("/poll " in the box); "Create a task" opens its form.
  await expect(page.getByLabel("Tell it what to write")).toHaveCount(0)
  await expect(page.locator("[data-phone-composer] [contenteditable=true]")).toHaveText("")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  return menu
}

test.describe("a menu's sheet on a phone", () => {
  test("a finger held as long as a real one opens the composer's + and chooses nothing, though a row rose under it", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const plus = await openConversation(page, testInfo)
    const at = await fingerTap(page, (await plus.boundingBox())!, 150)
    const menu = await openWithNothingChosen(page)
    // The test means something: the risen sheet's row stands where the finger was.
    const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent?.trim() ?? null, at)
    expect(under, "a row of the risen sheet is under the finger").not.toBeNull()
    // A second tap, on a row, chooses it.
    await menu.getByRole("menuitem", { name: "Create a poll" }).tap()
    await expect(menu).toBeHidden()
    await expect(page.locator("[data-phone-composer] [contenteditable=true]")).toContainText("/poll")
  })

  test("with reduced motion, where the sheet stands at the foot at once, a quick tap on the composer's + opens it and chooses nothing", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ reducedMotion: "reduce" })
    const plus = await openConversation(page, testInfo)
    await plus.tap()
    await openWithNothingChosen(page)
  })
})

// The page's scrim under a menu's sheet asked for a layer the scale had
// dropped (--z-modal-backdrop, folded into --z-modal on 23 Oct 2026) and fell
// to z-index: auto. The top bar (the fixed layer) and a table's sticky header
// stayed bright over it, and took the tap that should close the sheet (main,
// 26 Oct). The scrim stands one layer under the sheet, over the bars.
for (const theme of ["light", "dark"] as const) {
  test.describe(`a menu's sheet on a phone, ${theme}`, () => {
    test.use({ colorScheme: theme })

    test("its scrim covers the top bar, and a tap there closes the sheet and does nothing else", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const plus = await openConversation(page, testInfo)
      await plus.tap()
      const menu = await openWithNothingChosen(page)
      await reviewShot(page, "scrim-menu", theme)
      const box = (await page.locator("[data-phone-topbar]").boundingBox())!
      const top = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        return el === document.body ? "the scrim" : el?.closest("[data-phone-topbar]") ? "the top bar" : (el?.tagName.toLowerCase() ?? "nothing")
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      expect(top, "the top thing at the middle of the top bar while the sheet is up").toBe("the scrim")
      const z = await menu.evaluate((el) => ({
        scrim: getComputedStyle(document.body, "::after").zIndex,
        sheet: getComputedStyle(el.closest("[data-radix-popper-content-wrapper]") ?? el).zIndex,
        bar: getComputedStyle(document.querySelector("[data-phone-topbar]")!).zIndex,
      }))
      expect(Number(z.scrim), `the scrim's layer (${z.scrim}) is under the sheet's (${z.sheet})`).toBeLessThan(Number(z.sheet))
      expect(Number(z.scrim), `the scrim's layer (${z.scrim}) is over the top bar's (${z.bar})`).toBeGreaterThan(Number(z.bar))
      const url = page.url()
      await fingerTap(page, box, 80)
      await expect(menu).toBeHidden()
      expect(page.url(), "the tap opened nothing under the scrim").toBe(url)
      await expect(page.getByRole("dialog")).toHaveCount(0)
    })
  })
}

// Offline, the connection pill floated over every sheet (z toast, above the sheets' modal level) and covered
// its foot: here the + sheet's last row, on the failed shell menu its Try again (DESIGN-BUILD-16, 25 Oct 2026).
// It sits with the corner cards now: over the page, under anything opened on top of it.
test("offline, the connection pill stays under a menu's sheet, and the sheet's last row takes the tap", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const plus = await openConversation(page, testInfo)
  await page.context().setOffline(true)
  const pill = page.locator('[data-connection-pill="offline"]')
  await expect(pill).toBeVisible({ timeout: 30_000 })
  await plus.tap()
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem", { name: "Create a poll" })).toBeVisible()
  await expect.poll(() => menu.evaluate((el) => el.getAnimations().filter((a) => a.playState === "running").length), { message: "the sheet has risen" }).toBe(0)
  const box = (await pill.boundingBox())!
  const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-connection-pill]"), { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  expect(onTop, "the pill is not drawn over the open sheet").toBe(false)
  const last = menu.getByRole("menuitem").last()
  const reach = await last.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!top && el.contains(top)
  })
  expect(reach, "the sheet's last row is the top thing at its middle").toBe(true)
  await page.getByRole("menuitem", { name: "Create a poll" }).tap()
  await expect(menu).toBeHidden()
  await expect(page.locator("[data-phone-composer] [contenteditable=true]")).toContainText("/poll")
  await expect(pill, "the pill is back once the sheet goes").toBeVisible()
  await page.context().setOffline(false)
})

// On a computer a menu is a menu, not a sheet, and nothing dims the page (app/overlay.css 8 is a phone's).
test.describe("a menu on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false })

  test("the composer's + opens its menu with no scrim over the page", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const plus = await openConversation(page, testInfo, false)
    await plus.click()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem", { name: "Create a poll" })).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body, "::after").content), "a scrim on a computer").toBe("none")
    await reviewShot(page, "scrim-menu", "light")
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
  })
})
