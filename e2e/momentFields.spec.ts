import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM, expectEveryCallAnswered, expectHomeSettled, stubBackend } from "./stubbedApp"

// EVERY DAY AND TIME FROM THE SHARED PICKERS (21 Oct 2026). The owner, 18 Oct:
// Pause's Custom was the browser's own date-time box, mm/dd/yyyy with a clock
// of its own, unlike every other date in the app. It is the shared date and
// time fields now (components/ui/date-time-field): on a computer each opens by
// its field; on a phone, held upright or sideways, as a panel of the Pause
// sheet, with Back and its name, Pause pinned in the footer, and no second
// sheet stacked over the first.

const HOME = {
  "/user/getAllUserEmojiStatusList": { msg: "ok", data: [] },
  "/activity/unified": { msg: "ok", data: null },
  "/user/assignedTaskList": { msg: "ok", data: null },
  "/event/getEvents": { msg: "ok", data: null },
  "/project/overview": { msg: "ok", data: { projects: [] } },
  "/ch/suggested": { msg: "ok", data: [] },
}

const SCREENS = [
  { way: "on a computer", width: 1280, height: 800, touch: false },
  { way: "on a phone held upright", width: 390, height: 844, touch: true },
  { way: "on a phone held sideways", width: 844, height: 390, touch: true },
] as const

/** Pause notifications' Custom…, opened as each screen opens it. */
async function pauseCustom(page: Page, upright: boolean) {
  if (upright) {
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    await page.getByText(/^Pause notifications/).first().click({ timeout: 60_000 })
  } else {
    await page.getByRole("button", { name: "Profile and settings" }).click({ timeout: 120_000 })
    await page.getByRole("menuitem", { name: /Pause notifications/ }).click()
    await page.getByRole("menuitem", { name: "Custom…" }).click()
  }
  await expect(page.locator("[data-pause-menu]").last()).toBeVisible({ timeout: 60_000 })
  await page.getByRole("button", { name: "Custom…" }).last().click()
}

for (const s of SCREENS) {
  test(`${s.way}, Pause until is the app's date and time, each half opening where the sheet rule says`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: s.width, height: s.height }, isMobile: s.touch, hasTouch: s.touch })
    const page = await context.newPage()
    await stubBackend(page, testInfo, HOME)
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
    await expectHomeSettled(page)
    await pauseCustom(page, s.width < 640)

    await expect(page.locator("input[type='datetime-local']"), "the browser's box").toHaveCount(0)
    const fields = page.getByRole("group", { name: "Pause until" })
    await expect(fields).toBeVisible({ timeout: 30_000 })
    await fields.getByRole("button", { name: /^Date, / }).click()
    const month = page.getByRole("grid").last()
    await expect(month).toBeVisible({ timeout: 30_000 })
    const pause = page.getByRole("button", { name: "Pause", exact: true })
    if (s.touch) {
      // One sheet: the day a panel of it, titled, with Back; Pause in its footer.
      await expect(page.locator("[data-vaul-drawer][data-state='open']")).toHaveCount(1)
      await expect(month.locator("xpath=ancestor::*[@data-sheet-panel]")).toHaveCount(1)
      await expect(page.getByRole("heading", { name: "Date" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Back" })).toBeVisible()
      await expect(pause.locator("xpath=ancestor::*[@data-sheet-footer]")).toHaveCount(1)
      await expect(pause).toBeInViewport()
    } else {
      // By its field: a popover, the Pause popover still open under it.
      await expect(month.locator("xpath=ancestor::*[@data-radix-popper-content-wrapper]")).toHaveCount(1)
      await expect(page.locator("[data-pause-popover]")).toBeVisible()
    }
    // The chosen week in view: held sideways the panel opened on the month's
    // first row, past days only, over the pinned Pause (DESIGN-BUILD-3).
    await expect(month.locator('button[name="day"][tabindex="0"]').first(), "the chosen week in view").toBeInViewport()
    // Tomorrow, from the quick days, and the Pause it makes.
    await page.getByRole("button", { name: "Tomorrow", exact: true }).last().click()
    await expect(page.getByRole("grid")).toHaveCount(0)
    await expect(fields.getByRole("button", { name: /^Date, / })).toHaveAccessibleName(/^Date, \w{3} \d{1,2} \w{3} \d{4}$/)
    // The time: its box to type one stays at the top while the hours scroll
    // (a panel shrunk to the sheet scrolled it away with them).
    await fields.getByRole("button", { name: /^Time, / }).click()
    await expect(page.getByRole("listbox", { name: "Time" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByLabel("Type a time"), "the box to type a time").toBeInViewport()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox", { name: "Time" })).toHaveCount(0)
    await expect(pause).toBeEnabled()
    await context.close()
  })
}

// A moment asked for in a popover or a menu: on a phone each half opens a
// sheet of its own, which must lie over the layer that asked for it. At the
// sheets' own layer it rose under Reschedule's popover and the composer's Send
// later menu, which hid its title and the box to type a date in (21 Oct shots).
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }

function conversation() {
  const at = new Date()
  at.setDate(at.getDate() + 1)
  at.setHours(9, 0, 0, 0)
  const message = (i: number, text: string) => ({
    chat_uuid: `0c4a0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    chat_from: i % 2 ? SAM : MAYA,
    chat_to: i % 2 ? MAYA : SAM,
    chat_created_at: new Date(Date.now() - (4 - i) * 3_600_000).toISOString(),
    chat_body_text: `<p>${text}</p>`,
    chat_attachments: [],
    chat_comment_count: 0,
  })
  return {
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [message(0, "Is the launch note ready?"), message(1, "Nearly, after lunch.")], has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
    "/message/scheduled": { msg: "ok", data: [{ id: "s1", kind: "dm", target: MAYA.user_uuid, send_at: at.toISOString(), status: "pending", preview: "The launch note, for Acme on Monday." }] },
  }
}

/**
 * Whether `top` paints over `under`: the layers the page holds them in (its
 * body's own children, where every overlay is portalled) by z-index, then by
 * order. Not what is under a point: a modal sheet turns pointer events off on
 * the layers under it, so a point sees through them.
 */
async function paintsOver(top: Locator, under: Locator) {
  const handle = await under.elementHandle()
  return top.evaluate((a, b) => {
    const layer = (el: Element) => {
      let n = el
      while (n.parentElement && n.parentElement !== document.body) n = n.parentElement
      return n
    }
    const z = (el: Element) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0
    const [la, lb] = [layer(a), layer(b as Element)]
    if (z(la) !== z(lb)) return z(la) > z(lb)
    return Boolean(lb.compareDocumentPosition(la) & Node.DOCUMENT_POSITION_FOLLOWING)
  }, handle)
}

const HOSTS = [
  { way: "Reschedule's popover, on a phone held upright", width: 390, height: 844, touch: true, half: "Date", layer: "[data-radix-popper-content-wrapper]" },
  { way: "the composer's Send later menu, on a phone held sideways", width: 844, height: 390, touch: true, half: "Date", layer: "[role='menu']" },
  { way: "the composer's Send later menu, on a computer", width: 1280, height: 800, touch: false, half: "Time", layer: "[role='menu']" },
] as const

for (const h of HOSTS) {
  test(`${h.way}: the ${h.half.toLowerCase()} picker lies over it, and a pick comes back to it`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: h.width, height: h.height }, isMobile: h.touch, hasTouch: h.touch })
    const page = await context.newPage()
    await stubBackend(page, testInfo, conversation())
    await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })
    if (h.width < 640) {
      await page.getByText(/1 message scheduled for/).first().click({ timeout: 60_000 })
      await page.getByRole("button", { name: "Reschedule" }).click({ timeout: 30_000 })
    } else {
      await page.locator('.ProseMirror[contenteditable="true"]').last().click({ timeout: 60_000 })
      await page.keyboard.type("The launch note is attached.")
      await page.getByRole("button", { name: "Send later" }).click({ timeout: 30_000 })
      await page.getByRole("menuitem", { name: /Custom time/ }).click({ timeout: 30_000 })
    }
    const fields = page.getByRole("group", { name: "Custom time" })
    await fields.getByRole("button", { name: new RegExp(`^${h.half}, `) }).click({ timeout: 30_000 })
    // A phone's sheet of its own, titled; a computer's popover by the field.
    const picker = h.touch
      ? page.locator("[data-vaul-drawer][data-state='open']").last()
      : page.locator("[data-radix-popper-content-wrapper]").filter({ has: page.getByRole("listbox", { name: "Time" }) })
    if (h.touch) await expect(picker.getByRole("heading", { name: h.half })).toBeVisible({ timeout: 30_000 })
    else await expect(picker).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => picker.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length), { timeout: 15_000 }).toBe(0)
    expect(await paintsOver(picker, page.locator(h.layer).last()), `the ${h.half.toLowerCase()} picker over the layer that asked for it`).toBe(true)
    // A pick: the picker goes, and the custom time is there with what was picked.
    if (h.half === "Date") await picker.getByRole("button", { name: "Tomorrow", exact: true }).click()
    else await picker.getByRole("option").last().click()
    await expect(picker).toBeHidden()
    await expect(fields.getByRole("button", { name: /^Date, / })).toBeVisible()
    await expect(page.getByRole("button", { name: "Schedule", exact: true })).toBeEnabled()
    await expectEveryCallAnswered(page)
    await context.close()
  })
}

// Held sideways, Reschedule's popover, taller with the date and time fields,
// ran off the top of the screen: it keeps to the room the window leaves, and
// scrolls (DESIGN-BUILD-3's shots, 21 Oct).
test("Reschedule's popover, on a phone held sideways, stays on the screen", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await stubBackend(page, testInfo, conversation())
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })
  await page.getByText(/1 message scheduled for/).first().click({ timeout: 60_000 })
  await page.getByRole("button", { name: "Reschedule" }).click({ timeout: 30_000 })
  const popover = page.locator("[data-radix-popper-content-wrapper]").filter({ has: page.getByRole("group", { name: "Custom time" }) })
  await expect(popover).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => popover.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length), { timeout: 15_000 }).toBe(0)
  const box = (await popover.locator("[data-overlay]").boundingBox())!
  expect(box.y, "its top on the screen").toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, "its foot on the screen").toBeLessThanOrEqual(390)
  // What doesn't fit scrolls into reach: Schedule, then the first of the presets.
  await page.getByRole("button", { name: "Schedule", exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole("button", { name: "Schedule", exact: true })).toBeInViewport()
  await context.close()
})
