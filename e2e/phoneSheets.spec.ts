import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { expectHomeSettled, stubBackend } from "./stubbedApp"
import { LAYERED_SCRIM, footIsGutter, layersOverSheet, scrimOverLayerBelow, sheetLayout, topScrimFill, topSheet, type SheetLayout } from "./sheetLayout"
import { openKeyboard } from "./keyboard"

// The phone's sheets (components/ui/drawer, design v3 mobile C5) keep one
// scroller, run nothing sideways, take no modal over them, and are as tall
// as what they hold (e2e/sheetLayout). The owner, 17 Oct 2026, on a phone:
// "the user status drawer has both scroll bars", "the emoji picker drawer is
// expanding way too much", and status → Custom "looks broken". Then, on a
// real phone: the status field "trimmed from left and right", the sheet
// smaller after the keyboard went with the scroll bar back, and Set status
// out of place. Measured at three phones' sizes, on a touch screen (a
// control's 44px reach is on), through the keyboard both ways (e2e/keyboard).

const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 780 },
  { width: 430, height: 932 },
]

/** The rules every sheet keeps, naming what broke them. */
function keepsTheRules(name: string, l: SheetLayout) {
  expect(l.sideways, `${name}: runs sideways`).toEqual([])
  expect(l.nested, `${name}: a scroller with a height of its own inside the sheet`).toEqual([])
  expect(l.vertical.length, `${name}: more than one scroller (${l.vertical.join(", ")})`).toBeLessThanOrEqual(1)
  // A sheet as tall as its content, under its cap, fits it: it doesn't scroll.
  if ((l.detent === "menu" || l.detent === "medium") && l.height < l.cap - 2) {
    expect(l.vertical, `${name}: fits what it holds, and still scrolls`).toEqual([])
  }
  expect(l.clipped, `${name}: a field's halo cut off at the edge of what clips it`).toEqual([])
  expect(l.inline, `${name}: a height or a bottom left written on the sheet`).toEqual({ height: "", bottom: "" })
  expect(l.seeThrough, `${name}: what scrolls shows through a pinned part`).toEqual([])
}

async function nothingOver(page: Page, name: string) {
  const layers = await layersOverSheet(page)
  expect(layers.modals, `${name}: a modal over the sheet`).toEqual([])
  expect(layers.popovers, `${name}: a popover over the sheet (a phone's field opens a sheet of its own)`).toEqual([])
}

/**
 * The sheet on top, once it has risen: no animation running on it or in it
 * (a panel's slide in, which a measure taken mid-slide reads as running
 * sideways), and none of its rise left in its transform. WebKit calls the rise
 * finished while the sheet still stands up to 70px low, for a second or more
 * on a busy machine. An endless animation (a spinner) never finishes, so it
 * doesn't count.
 */
async function risen(page: Page) {
  const sheet = topSheet(page)
  await expect(sheet).toBeVisible()
  await expect
    .poll(() => sheet.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity).length))
    .toBe(0)
  await expect
    .poll(() => sheet.evaluate((el) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)), { timeout: 30_000 })
    .toBeLessThan(0.5)
  return sheet
}

async function statusSheet(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/user/getAllUserEmojiStatusList": { msg: "ok", data: [] },
    "/user/updateStatusEmojiStatus": { msg: "status updated", status: "success" },
    // Home's own reads, answered empty: a "Not found" toast is a layer too.
    "/activity/unified": { msg: "ok", data: null },
    "/user/assignedTaskList": { msg: "ok", data: null },
    "/event/getEvents": { msg: "ok", data: null },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/ch/suggested": { msg: "ok", data: [] },
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expectHomeSettled(page)
  await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
  await expect(page.locator("[data-you-status]")).toBeVisible({ timeout: 60_000 })
  keepsTheRules("the You sheet", await sheetLayout(await risen(page)))
  await page.getByRole("button", { name: /^(Set a status|Change your status)$/ }).click()
  const field = page.getByRole("textbox", { name: "Status" })
  await expect(field).toBeVisible({ timeout: 60_000 })
  await expect(page.locator("[data-you-status]")).toBeHidden()
  await risen(page)
  return field
}

/**
 * Where a sheet's action sits: whole on what the screen shows (above the
 * keyboard while it is up), a finger's 44px tall, and in the lower part of
 * the screen, where a thumb reaches.
 */
async function inReach(page: Page, name: RegExp, when: string) {
  const at = await page.getByRole("button", { name }).last().evaluate((b) => {
    const r = b.getBoundingClientRect()
    const vv = window.visualViewport
    return { top: r.top, bottom: r.bottom, height: r.height, seen: (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) }
  })
  expect(at.height, `${when}: the action is under a finger's 44px`).toBeGreaterThanOrEqual(44)
  expect(at.top, `${when}: the action is off the top`).toBeGreaterThanOrEqual(0)
  expect(at.bottom, `${when}: the action is under the screen's edge or the keyboard`).toBeLessThanOrEqual(at.seen + 0.5)
  expect((at.top + at.bottom) / 2, `${when}: the action is out of a thumb's reach`).toBeGreaterThanOrEqual(at.seen * 0.55)
}

/** Whether the sheet on top stands on the keyboard: its bottom at the bottom of what the screen shows. */
const onKeyboard = (page: Page) =>
  topSheet(page).evaluate((s) => {
    const vv = window.visualViewport
    return Math.abs(s.getBoundingClientRect().bottom - ((vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight))) <= 1
  })

for (const phone of PHONES) {
  test.describe(`a ${phone.width}x${phone.height} phone`, () => {
    test.use({ viewport: phone, isMobile: true, hasTouch: true })

    test("the status sheet scrolls in one place, up and down only", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await statusSheet(page, testInfo)
      keepsTheRules("the status sheet", await sheetLayout(topSheet(page)))
    })

    test("the emoji sheet is half the screen, filled, over the status sheet", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const field = await statusSheet(page, testInfo)
      await page.getByRole("button", { name: "Choose a status emoji" }).click()
      const search = page.getByPlaceholder("Search", { exact: true })
      await expect(search).toBeVisible({ timeout: 60_000 })
      const emoji = await sheetLayout(await risen(page))
      expect(emoji.pageScaled, "the emoji sheet pushed the page back as a card").toBe(false)
      expect(emoji.height, "the emoji sheet: about half the screen").toBeLessThanOrEqual(Math.round(phone.height * 0.6))
      expect(emoji.emptyBelow, "the emoji sheet: empty under its emoji").toBeLessThanOrEqual(24)
      keepsTheRules("the emoji sheet", emoji)
      expect(await scrimOverLayerBelow(page), "the status sheet is left undimmed above the emoji sheet's scrim").toBe(true)
      expect(await topScrimFill(page), "the emoji sheet's scrim is the lighter one a layer wears").toBe(LAYERED_SCRIM.light)
      // Searching keeps the half sheet where no on-screen keyboard comes up (a
      // computer's narrow window). With one up the sheet stands on it and
      // takes what it leaves, so the finds show; once it goes, the sheet is
      // half the screen again.
      await search.focus()
      expect((await sheetLayout(topSheet(page))).height, "the emoji sheet grew with no keyboard to make room for").toBe(emoji.height)
      const close = await openKeyboard(page, "visual")
      await expect.poll(() => onKeyboard(page), { message: "the emoji sheet isn't on the keyboard" }).toBe(true)
      expect((await sheetLayout(topSheet(page))).height, "the emoji sheet: what the keyboard leaves").toBeGreaterThanOrEqual(Math.round((phone.height - 336) * 0.92) - 2)
      await search.blur()
      await close()
      await expect.poll(async () => (await sheetLayout(topSheet(page))).height, { message: "the emoji sheet after the keyboard" }).toBe(emoji.height)
      keepsTheRules("the emoji sheet after the keyboard", await sheetLayout(topSheet(page)))
      // One layer per Escape press (INTERACTION_SPEC §7.7): this sheet, not the status sheet.
      await page.keyboard.press("Escape")
      await expect(search).toBeHidden()
      await expect(field).toBeVisible()
    })

    // The owner, 18 Oct: "in case of custom date time picker in status we get
    // popup in mobile". Each field opened a second, untitled sheet stacked
    // over the status sheet. Now each is a panel of the status sheet, with
    // Back and its name, and Set status kept in the footer (components/ui/drawer).
    test("a custom end is a day and a time in the status sheet, each a panel of it", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const field = await statusSheet(page, testInfo)
      await page.getByRole("radio", { name: "Custom" }).click()
      await page.locator("[data-status-custom]").waitFor()
      await nothingOver(page, "status → Custom")
      keepsTheRules("the status sheet with Custom", await sheetLayout(topSheet(page)))

      // The time: a panel of the sheet, the quarter hours in its one scroller.
      const time = page.getByRole("button", { name: /^Clears at/ })
      await time.click()
      const list = page.getByRole("listbox", { name: "Time" })
      await expect(list).toBeVisible({ timeout: 60_000 })
      await nothingOver(page, "the time panel")
      await expect(page.locator('[data-vaul-drawer][data-state="open"]'), "one sheet, not a sheet over a sheet").toHaveCount(1)
      await expect(page.locator("[data-sheet-panel]")).toBeVisible()
      await expect(page.getByRole("button", { name: "Back" })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Clears at" })).toBeVisible()
      keepsTheRules("the time panel", await sheetLayout(await risen(page)))
      await inReach(page, /^(Set status|Save)$/, "with the time panel open")
      const pick = list.getByRole("option").nth(2)
      const picked = ((await pick.locator("span").first().textContent()) ?? "").trim()
      await pick.click()
      await expect(list).toBeHidden()
      await expect(time).toContainText(picked)
      await expect(field).toBeVisible()

      // The day: a panel too, the month the sheet's width, gone again at one Escape.
      await page.getByRole("button", { name: /^Clears on/ }).click()
      const month = page.getByRole("grid")
      await expect(month).toBeVisible({ timeout: 60_000 })
      await nothingOver(page, "the date panel")
      await expect(page.locator('[data-vaul-drawer][data-state="open"]')).toHaveCount(1)
      keepsTheRules("the date panel", await sheetLayout(await risen(page)))
      await page.keyboard.press("Escape")
      await expect(month).toBeHidden()
      await expect(field).toBeVisible()
      await expect(page.locator('[data-vaul-drawer][data-state="open"]'), "Escape closed the panel, not the sheet").toHaveCount(1)
    })

    // The owner's real phone, 17 Oct: the field "trimmed from left and right",
    // the sheet "smaller" once the keyboard went with the scroll bar back, and
    // Set status under the screen's edge at the end of the list. Each kind of
    // keyboard (e2e/keyboard), closed as a finger closes it: the field let go
    // of first, then the keyboard (vaul #650 left its sheets short so).
    test("the status sheet keeps its field whole and Set status in reach, on the keyboard and after it", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const field = await statusSheet(page, testInfo)
      const sheet = topSheet(page)
      await field.fill("Out for lunch")
      const rest = await sheetLayout(sheet)
      keepsTheRules("the status sheet", rest)
      await inReach(page, /^(Set status|Save)$/, "at rest")
      // Its foot is its gutter, never under 16px, on the keyboard too: the one rule for every phone sheet (V-73).
      await footIsGutter(sheet, "the status sheet")
      for (const kind of ["visual", "resize"] as const) {
        await field.focus()
        const close = await openKeyboard(page, kind)
        await expect.poll(() => onKeyboard(page), { message: `the status sheet isn't on the ${kind} keyboard` }).toBe(true)
        await inReach(page, /^(Set status|Save)$/, `with the ${kind} keyboard up`)
        keepsTheRules(`the status sheet on the ${kind} keyboard`, await sheetLayout(sheet))
        await footIsGutter(sheet, `the status sheet on the ${kind} keyboard`)
        await sheet.locator("h2").first().tap()
        await close()
        await expect.poll(async () => (await sheetLayout(sheet)).height, { message: `the status sheet's height after the ${kind} keyboard` }).toBe(rest.height)
        keepsTheRules(`the status sheet after the ${kind} keyboard`, await sheetLayout(sheet))
        await inReach(page, /^(Set status|Save)$/, `after the ${kind} keyboard`)
      }
    })
  })
}
