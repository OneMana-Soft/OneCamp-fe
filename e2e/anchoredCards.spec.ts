import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { openDocAs } from "./docs/twoPeople"

// A CARD STANDS BY WHAT OPENED IT (20 Oct 2026). A drag across the calendar's
// hours opened its new-event card in the top-left corner: the card was
// anchored to the drag's ghost, which unmounted as the drag ended, and an
// element off the page measures (0, 0). Every card that stands by something
// other than its own trigger now goes through components/ui/anchor. Each case
// here checks the card is within a few px of what it stands by, at 1280 and
// 390, light and dark. With SHOTS_DIR set, each is saved for review.

// A cold first load (the app's chunks, the editor's) can take a while.
test.describe.configure({ timeout: 180_000 })

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
const EVENT = `[data-hue-block][data-event-uuid="${LAUNCH}"]`
/** The Launch review on the time grid (the day rail lists it too). */
const BLOCK = `[data-day-col] ${EVENT}`
const launch = () => ({
  event_uuid: LAUNCH,
  event_title: "Launch review",
  event_start_time: at(21, 14),
  event_end_time: at(21, 15),
  event_created_by: SAM,
  event_participants: [],
})

/** How far apart two boxes are: 0 when they touch or overlap. */
type Box = { x: number; y: number; width: number; height: number }
const gap = (a: Box, b: Box) =>
  Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width), a.y - (b.y + b.height), b.y - (a.y + a.height))

/** The card sits beside what it stands by (sideOffset 12, and a few px), and never in the corner. */
async function expectBeside(card: Locator, by: Locator, within = 16) {
  await expect(card).toBeVisible()
  // Past its 180 ms entrance, so the box measured is where it rests.
  await card.page().waitForTimeout(250)
  const c = await card.boundingBox()
  const b = await by.boundingBox()
  expect(c, "the card has a box").not.toBeNull()
  expect(b, "what it stands by has a box").not.toBeNull()
  expect(gap(c!, b!), `card ${JSON.stringify(c)} is beside ${JSON.stringify(b)}`).toBeLessThanOrEqual(within)
  expect(c!.x > 24 || c!.y > 24, "not in the top-left corner").toBe(true)
}

async function openCalendar(page: Page, testInfo: TestInfo, path: string) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [launch()] },
    "/event/getEvent/": { msg: "ok", data: launch() },
    "/calendar/events": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-calendar] [data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
}

/** A channel with one message, as the chat's own specs stub it (e2e/cssTips). */
async function openChannel(page: Page, testInfo: TestInfo) {
  const ok = (data: unknown) => ({ msg: "ok", data })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const CH = "c4a70000-0000-4000-8000-000000000003"
  const MAYA = { user_uuid: "5a7a1c11-0000-4000-8000-000000000101", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.test" }
  const channel = { ch_uuid: CH, ch_name: "engineering", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false, unread_post_count: 0, ch_created_at: "2026-09-01T09:00:00Z", ch_is_member: true, ch_posts: [], ch_created_by: SAM, ch_member_count: 2, ch_recording: [], notification_type: "all" }
  const post = { post_uuid: "c4a70000-0000-4000-8000-100000000010", post_text: "<p>We ship on Thursday.</p>", post_by: MAYA, post_created_at: "2026-10-17T09:00:00Z", post_comment_count: 0, post_comments: [], post_reactions: [], post_attachments: [] }
  await stubBackend(page, testInfo, {
    "/user/sidebarNav": ok({ ...SAM, user_channels: [channel], user_dms: [], user_projects: [] }),
    [`/ch/channelBasicInfo/${CH}`]: { msg: "ok", channel_info: channel },
    "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: [channel] },
    [`/po/latestPosts/${CH}`]: ok({ posts: [post], has_more: false }),
    "/agent-card/channel": ok([]),
    "/command/catalog": ok({ commands: [] }),
    "/message/scheduled": ok([]),
    "/ch/markSeen": ok({}),
    "/later": ok({ items: [] }),
  })
  await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("We ship on Thursday.").first()).toBeVisible({ timeout: 60_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${dir}/anchor-${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/** The middle of the Launch review's day column at `hour` (56 px an hour from midnight), scrolled to two hours under the grid's top. */
async function hourIn(page: Page, hour: number) {
  await page.locator("[data-week-scroll]").evaluate((el, top) => {
    el.scrollTop = top
  }, Math.max(0, (hour - 2) * 56))
  const c = (await page.locator("[data-day-col]").filter({ has: page.locator(EVENT) }).boundingBox())!
  return { x: c.x + c.width / 2, y: c.y + hour * 56 }
}

/** A drag down the hours, from `from` for `minutes`, by small steps as a hand does. */
async function dragHours(page: Page, from: number, minutes: number) {
  const p = await hourIn(page, from)
  await page.mouse.move(p.x, p.y + 4)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(p.x, p.y + 4 + ((minutes / 60) * 56 * i) / 6)
  await page.mouse.up()
}

const card = (page: Page) => page.locator("[data-quick-create]")
const ghost = (page: Page) => page.locator("[data-calendar-ghost]")

for (const theme of ["light", "dark"] as const) {
  test.describe(`anchored cards at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme, locale: "en-GB" })

    test("a drag across the week's hours opens New event beside its ghost", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      await dragHours(page, 10, 90)
      await expectBeside(card(page), ghost(page))
      await expect(ghost(page)).toContainText("10:00")
      await shot(page, "week-drag", theme)
      // Typing a time moves the ghost, and the card goes with it.
      await card(page).getByRole("textbox", { name: "Event title" }).fill("Design sync at 4pm")
      await expect(ghost(page)).toContainText("16:00")
      await expectBeside(card(page), ghost(page))
    })

    test("a click on the week's hours opens New event beside its ghost", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      const p = await hourIn(page, 11)
      await page.mouse.click(p.x, p.y + 4)
      await expectBeside(card(page), ghost(page))
    })

    test("a drag across the day's hours opens New event beside its ghost", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=day")
      await dragHours(page, 9, 60)
      await expectBeside(card(page), ghost(page))
      await shot(page, "day-drag", theme)
    })

    test("the all-day row's New opens beside its button", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      const add = page.getByRole("button", { name: "New all-day event on Thursday 22 October" })
      await add.focus()
      await page.keyboard.press("Enter")
      await expectBeside(card(page), add)
    })

    test("a click on a month's day opens New event beside its cell", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=month")
      const cell = page.locator(`[data-month-day="${new Date(2026, 9, 23).toISOString()}"]`)
      const box = (await cell.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8)
      await expectBeside(card(page), cell)
      await shot(page, "month-click", theme)
    })

    test("an event's card opens beside its block, by pointer and by keyboard", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      const block = page.locator(BLOCK).first()
      await block.click()
      const popover = page.locator("[data-event-popover]")
      await expectBeside(popover, block)
      await page.keyboard.press("Escape")
      await expect(popover).toHaveCount(0)
      // Escape gives the focus back to the block it opened from (once the card's focus scope has let go).
      await expect(block).toBeFocused()
      await page.keyboard.press("Enter")
      await expectBeside(popover, block)
      await shot(page, "event-card", theme)
    })

    test("the menu key opens an event's menu by its block, not at (0, 0)", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      const block = page.locator(BLOCK).first()
      await block.focus()
      // What the menu key (Shift+F10) sends: a contextmenu with no pointer, at (0, 0).
      await block.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 0, clientY: 0, button: 2 })
      const menu = page.getByRole("menu")
      await expectBeside(menu, block, 24)
    })

    test("Go to (G) opens by the period's title", async ({ page }, testInfo) => {
      await openCalendar(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      await page.keyboard.press("g")
      await expectBeside(page.locator("[data-go-to]"), page.locator("[data-calendar-header] [data-period-title]"))
    })

    test("the slash menu opens by the caret", async ({ browser }, testInfo) => {
      const relay = new CollabRelay()
      const sam = await openDocAs(browser, testInfo, relay, SAM, { id: "7c1e5a3b-2d4f-4a6b-9c8d-0e1f2a3b4c90" })
      await sam.page.emulateMedia({ colorScheme: theme })
      await sam.body.click()
      await sam.page.keyboard.type("/")
      // The typed "/" is drawn in a decoration of its own: the menu stands under it.
      await expectBeside(sam.page.locator("[data-slash-menu]"), sam.body.locator("[data-decoration-id]"))
      await shot(sam.page, "slash", theme)
      await sam.close()
    })

    test("the reaction picker keeps its place while its message's toolbar hides", async ({ page }, testInfo) => {
      await openChannel(page, testInfo)
      const row = page.locator("[data-message-row]").first()
      await row.hover({ position: { x: 300, y: 10 } })
      const trigger = page.locator("[data-message-toolbar]").getByRole("button", { name: "Add a reaction" })
      await trigger.click()
      const picker = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Search emoji") })
      await expectBeside(picker, trigger)
      const before = (await picker.boundingBox())!
      // What a toolbar that hides does to its button (hidden: display none):
      // the button measures nothing, and the picker is placed again.
      await page.locator("[data-message-toolbar]").evaluate((el) => {
        ;(el.parentElement as HTMLElement).hidden = true
      })
      await page.waitForTimeout(400)
      const after = (await picker.boundingBox())!
      expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`).toBeLessThanOrEqual(2)
      await shot(page, "reaction-picker", theme)
    })

    test("the block menu stays beside its block, inside the doc's pane, as the doc scrolls", async ({ browser }, testInfo) => {
      const relay = new CollabRelay()
      const sam = await openDocAs(browser, testInfo, relay, SAM, { id: "7c1e5a3b-2d4f-4a6b-9c8d-0e1f2a3b4c91" })
      await sam.page.emulateMedia({ colorScheme: theme })
      await sam.body.click()
      for (let i = 1; i <= 40; i++) {
        if (i > 1) await sam.page.keyboard.press("Enter")
        await sam.page.keyboard.type(`Line ${i} of the plan`)
      }
      const block = sam.body.locator(":scope > p").nth(11)
      await block.evaluate((el) => el.scrollIntoView({ block: "center" }))
      const b = (await block.boundingBox())!
      await sam.page.mouse.move(b.x + 30, b.y + 2)
      await sam.page.mouse.move(b.x + 40, b.y + 6, { steps: 3 })
      await sam.page.getByRole("button", { name: "Drag to move or click for options" }).click()
      const menu = sam.page.locator("[data-block-menu]")
      await expect(menu).toBeVisible()
      await sam.page.waitForTimeout(250)
      const pane = sam.page.locator(".doc-scroll")
      const scrollBy = (dy: number) =>
        block.evaluate((el, by) => {
          el.closest(".doc-scroll")!.scrollTop += by
        }, dy)
      const gapY = async () => (await menu.boundingBox())!.y - (await block.boundingBox())!.y
      const before = await gapY()
      // The doc scrolls under the menu: it keeps beside its block.
      await scrollBy(120)
      await sam.page.waitForTimeout(300)
      expect(Math.abs((await gapY()) - before)).toBeLessThanOrEqual(2)
      // Its block near the pane's top: the menu stays inside the pane, never over the app's header.
      const p = (await pane.boundingBox())!
      await scrollBy((await block.boundingBox())!.y - p.y - 8)
      await sam.page.waitForTimeout(300)
      expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(p.y - 1)
      await shot(sam.page, "block-menu-near-top", theme)
      // Its block scrolled out of the pane: the menu goes.
      await scrollBy(300)
      await expect(menu).toHaveCount(0)
      await shot(sam.page, "block-menu-scrolled-out", theme)
      await sam.close()
    })
  })

  // A phone by the one sheet rule (components/ui/overlayMode), held either way:
  // in landscape it is wider than the layout's phone width, and its calendar
  // is the wide one, but New event is still the sheet.
  for (const phone of [
    { name: "upright", width: 390, height: 844, path: "/app/calendar?date=2026-10-21&view=day" },
    { name: "in landscape", width: 844, height: 390, path: "/app/calendar?date=2026-10-21&view=week" },
  ]) {
    test.describe(`the new-event sheet on a phone ${phone.name}, ${theme}`, () => {
      test.use({ viewport: { width: phone.width, height: phone.height }, colorScheme: theme, locale: "en-GB", hasTouch: true })

      test("a tap on the hours opens New event as a sheet, its footer pinned", async ({ page }, testInfo) => {
        await openCalendar(page, testInfo, phone.path)
        const p = await hourIn(page, 11)
        await page.mouse.click(p.x, p.y + 4)
        const sheet = page.locator("[data-event-dialog]")
        await expect(sheet).toBeVisible()
        await expect(card(page)).toHaveCount(0)
        const create = sheet.getByRole("button", { name: "Create event" })
        await expect(create).toBeInViewport()
        // A sheet: it runs to the bottom of the screen, and its footer is the
        // last thing in it, outside the part that scrolls.
        await expect.poll(async () => {
          const s = await sheet.boundingBox()
          return s ? Math.round(s.y + s.height) : 0
        }).toBe(phone.height)
        await expect(page.locator("[data-sheet-footer]").getByRole("button", { name: "Create event" })).toBeVisible()
        await shot(page, `phone-sheet-${phone.name.replace(/ /g, "-")}`, theme)
        // The pinned footer's edge (app/overlay.css #4): a hairline while more of
        // the form is below it, none once the form is scrolled to its end.
        const edge = () => page.locator("[data-sheet-footer]").evaluate((el) => getComputedStyle(el).boxShadow)
        await expect.poll(edge).not.toBe("none")
        await page.locator("[data-event-dialog] [data-overlay-body]").evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
        await expect.poll(edge).toBe("none")
        await shot(page, `phone-sheet-${phone.name.replace(/ /g, "-")}-end`, theme)
      })
    })
  }
}
