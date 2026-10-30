import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { JONAS, LAUNCH, MAYA, POST, VIEWS, openChannel } from "./channelPage"
import { finger } from "./finger"
import { SAM, stubBackend } from "./stubbedApp"

// The lists that share VirtualInfiniteScroll with a phone's task lists, which
// fluid-17 changed to draw only virtua's window: their rows show at a phone's
// width and at a computer's, and so do My Tasks' (a grouped list at 1280).
// The activity feed's rows are held by hubRowTouch (390) and inboxNotices
// (1280). With SHOTS_DIR set, each list is photographed once its rows show.

const CH = "c4a10000-0000-4000-8000-0000000000f1"
const P = "9e0a0000-0000-4000-8000-0000000000e2"
const NONE = "0001-01-01T00:00:00Z"

const recordings = (now: number) =>
  Array.from({ length: 12 }, (_, i) => {
    const at = new Date(now - (i + 1) * 3 * 3_600_000)
    return {
      recording_egress_id: `EG_${i + 1}`,
      recording_stared_at: at.toISOString(),
      recording_ended_at: new Date(at.getTime() + 734_000).toISOString(),
      recording_duration: 734,
      recording_size: 12_900_000,
      recording_obj_key: "",
      recording_transcript: [],
      recording_started_by: SAM,
      recording_channel: { ch_uuid: CH, ch_name: "engineering" },
    }
  })

const channelList = (n: number) => Array.from({ length: n }, (_, i) => ({
  ch_uuid: `c4a10000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ch_name: `team-${i + 1}`,
  ch_icon: "",
  ch_private: false,
  ch_is_user_fav: false,
  ch_about: "",
  ch_call_active: false,
  unread_post_count: 0,
  ch_created_at: "2026-09-01T09:00:00Z",
  ch_is_member: true,
  ch_posts: [],
  ch_created_by: SAM,
  ch_member_count: 2,
  ch_recording: [],
  notification_type: "all",
}))

const tasks = Array.from({ length: 12 }, (_, i) => ({
  task_uuid: `7a5c00e2-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: `Listed task ${i + 1}`,
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_due_date: NONE,
  task_start_date: NONE,
  task_created_at: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Website relaunch" },
}))

const LISTS = [
  {
    name: "recordings",
    rows: () => "[data-recording-row]",
    open: async (page: Page, testInfo: TestInfo) => {
      await stubBackend(page, testInfo, { "/user/recordingList": { msg: "ok", data: { recordings: recordings(Date.now()), has_more: false } } })
      await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
    },
  },
  {
    name: "the channel list",
    rows: () => 'a[href^="/app/channel/c4a10000-0000-4000-8000-0000000000"]',
    open: async (page: Page, testInfo: TestInfo) => {
      await stubBackend(page, testInfo, { "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: channelList(12) } })
      await page.goto("/app/channel", { waitUntil: "domcontentloaded", timeout: 120_000 })
    },
  },
  {
    name: "My Tasks",
    // A phone's list (VirtualInfiniteScroll), or a computer's grouped list.
    rows: (phone: boolean) => (phone ? "[data-phone-task-row]" : '[role="listitem"][data-task-id]'),
    open: async (page: Page, testInfo: TestInfo) => {
      await stubBackend(page, testInfo, {
        "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: tasks } },
        "/task/views": { msg: "ok", data: [] },
      })
      await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
      await page.goto("/app/myTask", { waitUntil: "domcontentloaded", timeout: 120_000 })
    },
  },
]

for (const [width, height, phone] of [
  [390, 844, true],
  [1280, 800, false],
] as const) {
  test.describe(`a shared list's rows at ${width}`, () => {
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone })

    for (const list of LISTS) {
      test(`${list.name}: its rows are seen`, async ({ page }, testInfo) => {
        await list.open(page, testInfo)
        const rows = page.locator(list.rows(phone))
        await expect(rows.first()).toBeVisible({ timeout: 60_000 })
        const seen = await rows.evaluateAll((els) => els.map((el) => getComputedStyle(el).visibility))
        expect(seen.length).toBeGreaterThan(3)
        expect([...new Set(seen)]).toEqual(["visible"])
        await expect(rows.nth(2)).toBeVisible()
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/shared-${list.name.replace(/\W+/g, "-")}-${width}.png` })
      })
    }
  })
}

// A touch the system takes (a swipe home, a sheet over the page) ends with
// touchcancel, not touchend. virtua turned its rows' pointer events off while a
// list scrolled and back on 150 ms after the last scroll, unless a finger was
// down, and it took a finger as down until a touchend. After a cancelled touch
// the rows took no tap until a touch ended normally, and the tap that ended it
// was lost (patches/virtua@0.41.5.patch).
test.describe("a shared list after a cancelled touch, at 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("the channel list: a row takes the next tap", async ({ page }, testInfo) => {
    await stubBackend(page, testInfo, { "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: channelList(40) } })
    await page.goto("/app/channel", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const rows = page.locator('a[href^="/app/channel/c4a10000-0000-4000-8000-0000000000"]')
    await expect(rows.nth(3)).toBeVisible({ timeout: 60_000 })
    // A finger scrolls the list up by 150px, and the system takes the touch.
    const from = (await rows.nth(3).boundingBox())!
    const x = from.x + from.width / 2
    const y = from.y + from.height / 2
    const f = await finger(page)
    await f.down(x, y)
    for (let i = 1; i <= 6; i++) await f.move(x, y - i * 25)
    await f.cancel()
    const scrolled = await rows.first().evaluate((el) => {
      let box = el.parentElement
      while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
      return box?.scrollTop ?? 0
    })
    expect(scrolled, "px the finger scrolled the list").toBeGreaterThan(0)
    // The row across the screen's middle, and what a tap at its middle meets.
    const row = await rows.evaluateAll((els) => {
      const el = els.find((e) => {
        const r = e.getBoundingClientRect()
        return r.top < innerHeight / 2 && r.bottom > innerHeight / 2
      })!
      const r = el.getBoundingClientRect()
      return { href: el.getAttribute("href")!, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    await expect
      .poll(() => page.evaluate((at) => document.elementFromPoint(at.x, at.y)?.closest("a")?.getAttribute("href") ?? "no row", row), {
        message: "what a tap at the middle row meets",
        timeout: 5_000,
      })
      .toBe(row.href)
    await page.touchscreen.tap(row.x, row.y)
    await expect(page).toHaveURL(new RegExp(`${row.href}$`))
  })
})

// virtua turned its rows' pointer events off while a list scrolled, and back
// on 150 ms after the last scroll, so a press on a row that had just come to
// rest landed on the list and did nothing: 14 of 14 presses 32 to 165 ms after
// a wheel scroll stopped (measured 27 Oct 2026; patches/virtua@0.41.5.patch).
// Each press below goes in 40 ms after the list is still, inside that window.
const UPDATES = Array.from({ length: 40 }, (_, i) => {
  const at = new Date(Date.UTC(2026, 9, 19, 8, 0) + i * 60_000).toISOString()
  const id = (0x600 + i).toString(16).padStart(12, "0")
  return {
    ...POST,
    post_uuid: `0c4a0000-0000-4000-8000-${id}`,
    post_text: `<p>Update ${i + 1}: the rollout notes for step ${i + 1}.</p>`,
    post_by: i % 2 ? MAYA : JONAS,
    post_created_at: at,
    post_comment_count: 1,
    post_comments: [{ comment_uuid: `0c4b0000-0000-4000-8000-${id}`, comment_text: "<p>Checked.</p>", comment_by: MAYA, comment_created_at: at }],
  }
}).reverse()
const conversation = () => ({ [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [POST, ...UPDATES], has_more: false } } })

/** Notes the time of the page's last scroll, from now on. */
const trackScrolls = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { lastScroll: number }
    w.lastScroll = 0
    document.addEventListener("scroll", () => (w.lastScroll = performance.now()), { capture: true, passive: true })
    return performance.now()
  })

/**
 * Once the list has scrolled after `since` and been still for `ms`: the update
 * row nearest the middle of the list's viewport, whole in it; its name and
 * post; whether it took no pointer events then; and the middle of its thread
 * chip and of its text, all read in the page in that same moment. The
 * viewport, not the list's content: every message stays mounted, so the
 * content runs thousands of pixels above the screen.
 */
const restingRow = (page: Page, since: number, ms: number) =>
  page.evaluate(
    ([since, ms]) =>
      new Promise<{ update: string; post: string; inert: boolean; chip: { x: number; y: number }; text: { x: number; y: number } }>((done, fail) => {
        const w = window as unknown as { lastScroll: number }
        const start = performance.now()
        const middle = (el: Element) => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        }
        const tick = () => {
          const now = performance.now()
          if (now - start > 5_000) return fail(new Error("the list never scrolled and came to rest"))
          if (w.lastScroll <= since || now - w.lastScroll < ms) return requestAnimationFrame(tick)
          const list = document.querySelector("[data-message-viewport]")!.getBoundingClientRect()
          const y = list.top + list.height / 2
          const whole = (el: Element) => {
            const b = el.getBoundingClientRect()
            return b.top >= list.top && b.bottom <= list.bottom
          }
          const away = (el: Element) => Math.abs(middle(el).y - y)
          const row = [...document.querySelectorAll("[data-message-row]")]
            .filter((r) => /Update \d+:/.test(r.textContent ?? "") && r.querySelector("[data-thread-row]") && whole(r))
            .sort((a, b) => away(a) - away(b))[0]
          if (!row) return fail(new Error("no update row whole in the list's viewport"))
          const text = [...row.querySelectorAll("p")].find((p) => /Update \d+:/.test(p.textContent ?? ""))
          if (!text) return fail(new Error("the row has no text"))
          done({
            update: /Update \d+:/.exec(row.textContent ?? "")![0],
            post: row.id.replace(/^msg-/, ""),
            inert: getComputedStyle(row).pointerEvents === "none",
            chip: middle(row.querySelector("[data-thread-row]")!),
            text: { x: Math.round(text.getBoundingClientRect().left + 20), y: middle(text).y },
          })
        }
        tick()
      }),
    [since, ms] as const,
  )

test.describe("a press on a row that has just come to rest", () => {
  test("at 1280, a click 40 ms after a wheel scroll opens the row's thread", async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const tab = await openChannel(browser, testInfo, VIEWS[0], "light", conversation)
    const box = (await tab.locator("[data-message-viewport]").boundingBox())!
    await tab.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
    const since = await trackScrolls(tab)
    await tab.mouse.wheel(0, -400)
    const row = await restingRow(tab, since, 40)
    await tab.mouse.click(row.chip.x, row.chip.y)
    const chip = tab.locator("[data-message-row]").filter({ hasText: row.update }).locator("[data-thread-row]")
    await expect(chip, `${row.update}'s thread chip (rows inert at rest: ${row.inert})`).toHaveAttribute("aria-expanded", "true")
    await tab.context().close()
  })

  test("at 390 with touch, a tap right after a fling opens the row's thread", async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const tab = await openChannel(browser, testInfo, VIEWS[1], "light", conversation)
    const box = (await tab.locator("[data-message-viewport]").boundingBox())!
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 3)
    const since = await trackScrolls(tab)
    // A finger flings the list down: older updates come in from above.
    const f = await finger(tab)
    await f.down(x, y)
    for (let i = 1; i <= 6; i++) await f.move(x, y + i * 40)
    await f.up()
    const row = await restingRow(tab, since, 40)
    await tab.touchscreen.tap(row.text.x, row.text.y)
    await expect(tab, `${row.update}'s thread (rows inert at rest: ${row.inert})`).toHaveURL(new RegExp(`${row.post}$`))
    await tab.context().close()
  })
})

// With the rows' pointer events kept on, a row the list carried under a
// resting pointer lit and mounted its actions as it passed: 14 to 29 hover
// toolbars a spin, against 1 to 7 before (27 Oct 2026). While the list moves
// nothing lights and no actions come; the row under the pointer gets both once
// it settles (lib/ui/scrollState's list mark).

type Spin = {
  scrolls: number[]
  frames: { t: number; row: string; lit: boolean; actions: boolean }[]
  on: boolean
  under: (x: number, y: number) => { row: string; lit: boolean; actions: boolean } | null
}

/** In the page, per animation frame from now on: the row under the pointer, whether it is lit and shows its actions; and each scroll's time. */
const watchSpin = (page: Page, at: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    // A colour's alpha, in any of the forms Chrome computes: rgb(), rgba(), or a "/ alpha" (oklab, color()).
    const alpha = (c: string) => {
      if (c === "transparent") return 0
      const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c)
      if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1)
      const rgba = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/.exec(c)
      return rgba ? parseFloat(rgba[1]) : 1
    }
    const spin: Spin = {
      scrolls: [],
      frames: [],
      on: true,
      under: (x, y) => {
        const row = document.elementFromPoint(x, y)?.closest("[data-message-row]")
        if (!row) return null
        return {
          row: row.id,
          lit: alpha(getComputedStyle(row).backgroundColor) > 0,
          actions: [...row.querySelectorAll("[data-message-toolbar]")].some((bar) => !bar.closest("[hidden]")),
        }
      },
    }
    ;(window as unknown as { spin: Spin }).spin = spin
    document.addEventListener("scroll", () => spin.scrolls.push(performance.now()), { capture: true, passive: true })
    const frame = (t: number) => {
      if (!spin.on) return
      const now = spin.under(x, y)
      if (now) spin.frames.push({ t, ...now })
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, at)

/**
 * Rests the pointer on the list, then turns the wheel slowly: 16 turns of 60 px, 50 ms apart, so each row stays under
 * the pointer for about two turns, longer than a hover's intent. Returns the rows under the pointer that lit or showed
 * their actions in a frame before the list's last scroll, other than the row it rested on before the spin.
 */
async function spinUnderPointer(page: Page) {
  const box = (await page.locator("[data-message-viewport]").boundingBox())!
  const at = { x: Math.round(box.x + box.width * 0.4), y: Math.round(box.y + box.height / 2) }
  await page.mouse.move(at.x, at.y)
  await watchSpin(page, at)
  const first = await page.evaluate(({ x, y }) => (window as unknown as { spin: Spin }).spin.under(x, y)?.row ?? "", at)
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, -60)
    await page.waitForTimeout(50)
  }
  // Settled: no scroll for 400 ms.
  await expect.poll(() => page.evaluate(() => performance.now() - ((window as unknown as { spin: Spin }).spin.scrolls.at(-1) ?? 0)), { timeout: 10_000 }).toBeGreaterThan(400)
  return page.evaluate((first) => {
    const { spin } = window as unknown as { spin: Spin }
    spin.on = false
    const last = spin.scrolls.at(-1) ?? 0
    const during = spin.frames.filter((f) => f.t < last && f.row !== first)
    const rows = (pick: (f: (typeof during)[number]) => boolean) => [...new Set(during.filter(pick).map((f) => f.row))]
    return { lit: rows((f) => f.lit), actions: rows((f) => f.actions), passed: new Set(during.map((f) => f.row)).size, scrolls: spin.scrolls.length }
  }, first)
}

/** The row under the resting pointer now: whether it is lit and shows its actions (watchSpin's reading). */
const restingUnder = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector("[data-message-viewport]")!.getBoundingClientRect()
    return (window as unknown as { spin: Spin }).spin.under(Math.round(box.x + box.width * 0.4), Math.round(box.y + box.height / 2))
  })

test.describe("a list that moves under a resting pointer", () => {
  test("at 1280, no row shows its actions while the list moves, and the row under the pointer does once it settles", async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const tab = await openChannel(browser, testInfo, VIEWS[0], "light", conversation)
    const spin = await spinUnderPointer(tab)
    expect(spin.passed, `rows the list carried under the pointer (${spin.scrolls} scrolls)`).toBeGreaterThan(3)
    expect(spin.actions, "rows under the pointer that showed their actions while the list moved").toEqual([])
    await expect.poll(async () => (await restingUnder(tab))?.actions, { message: "the row under the resting pointer shows its actions", timeout: 2_000 }).toBe(true)
    await tab.context().close()
  })

  test("at 1280, no row lights while the list moves, and the row under the pointer lights once it settles", async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const tab = await openChannel(browser, testInfo, VIEWS[0], "light", conversation)
    const spin = await spinUnderPointer(tab)
    expect(spin.passed, `rows the list carried under the pointer (${spin.scrolls} scrolls)`).toBeGreaterThan(3)
    expect(spin.lit, "rows under the pointer that lit while the list moved").toEqual([])
    await expect.poll(async () => (await restingUnder(tab))?.lit, { message: "the row under the resting pointer is lit", timeout: 2_000 }).toBe(true)
    await tab.context().close()
  })
})
