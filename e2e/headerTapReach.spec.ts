import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"

import { CALENDAR_READS, SAM, stubBackend } from "./stubbedApp"
import { TableServer } from "./tables/tableServer"
import { overlapping, type Reach } from "./touchReach"

/**
 * A page header's icon actions under a finger (V-1025, 13 Nov 2026). A small
 * control's reach is 44px (app/phone.css F3), so two 28px icons set 12px
 * apart shared 4px of it and the later took the earlier's taps: on the tables
 * page a tap 21px right of Export all tables' centre opened Trash. A header's
 * actions row (data-page-actions) is a touch group under a finger (phone.css
 * F3b): its controls stand 44px less their size apart, so neighbouring
 * reaches meet and never overlap. For every pair the survey found
 * (heads/UX-DS-V1025/SURVEY.md), a tap 2px inside the shared edge of each
 * one's reach lands on that one, in light and dark; at 1280, with a mouse,
 * the header measures exactly as it did before.
 *
 * The calendar's phone bar keeps one rhythm: Today stands in the actions row,
 * 16px from Your week as the icons stand from each other (V-1044). A pressed
 * icon dips what it draws and keeps its box, so its 44px reach holds while a
 * finger is on it (V-1047).
 */

type Header = {
  /** For the test's name and the shots. */
  name: string
  path: string
  /** Where the row is drawn: the page's main, or a phone bar. */
  scope: string
  /** The page's answers; the shell's own reads otherwise. */
  open?: (page: Page, testInfo: TestInfo) => Promise<void>
  /** Neighbours in the row, left to right, by their accessible names. */
  pairs: [string, string][]
  /** Text in the row that must still show whole beside the spaced controls (the calendar's period). */
  fits?: string
  /** Controls in the phone row, left to right, that stand one touch gap (16px) apart, box to box. */
  rhythm?: string[]
  /**
   * At 1280 with a mouse, as on the base (48e8b9cb8): each pair's gap and each
   * control's box, in px. Empty where the row is the phone's only (the
   * calendar's phone bar, the shell's bar).
   */
  wide: { pair: [string, string]; gap: number; boxes: [w: number, h: number][] }[]
}

const tables = (page: Page, testInfo: TestInfo) => new TableServer([{ id: "vendor", name: "Vendor", type: "text" }], [{ vendor: "Acme" }]).attach(page, testInfo, SAM)

/** The calendar's reads, as e2e/calendarPlanWeek.spec.ts answers them; a member has a project, and with it Tasks and Plan my week. */
const calendar = (member: boolean) => (page: Page, testInfo: TestInfo) =>
  stubBackend(page, testInfo, {
    ...CALENDAR_READS,
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/getEvents": { msg: "ok", data: [] },
    "/user/sidebarNav": { msg: "ok", data: member ? { user_projects: [{ project_uuid: "p-launch", project_name: "Launch" }] } : {} },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/events": { msg: "ok", data: [] },
  })

const HEADERS: Header[] = [
  {
    name: "tables",
    path: "/app/tables",
    scope: "main",
    open: tables,
    pairs: [["Export all tables", "Trash"], ["Trash", "Import a spreadsheet"]],
    wide: [
      { pair: ["Export all tables", "Trash"], gap: 12, boxes: [[28, 28], [28, 28]] },
      { pair: ["Trash", "Import a spreadsheet"], gap: 12, boxes: [[28, 28], [81, 28]] },
    ],
  },
  {
    name: "calendar",
    path: "/app/calendar?date=2026-10-21&view=week",
    scope: "[data-calendar-header]",
    open: calendar(false),
    pairs: [["Today", "Your week"], ["Your week", "New event"]],
    rhythm: ["Today", "Your week", "New event"],
    wide: [],
  },
  {
    name: "calendar-member",
    path: "/app/calendar?date=2026-10-21&view=week",
    scope: "[data-calendar-header]",
    open: calendar(true),
    pairs: [["Today", "Your week"], ["Your week", "Tasks"], ["Tasks", "Plan my week"], ["Plan my week", "New event"]],
    fits: "[data-period-title]",
    rhythm: ["Today", "Your week", "Tasks", "Plan my week", "New event"],
    wide: [],
  },
  {
    // The month's arrows join the row: the narrowest it gets.
    name: "calendar-member-month",
    path: "/app/calendar?date=2026-10-21&view=month",
    scope: "[data-calendar-header]",
    open: calendar(true),
    pairs: [["Previous month", "Next month"], ["Today", "Your week"], ["Your week", "Tasks"], ["Tasks", "Plan my week"], ["Plan my week", "New event"]],
    fits: "[data-period-title]",
    rhythm: ["Today", "Your week", "Tasks", "Plan my week", "New event"],
    wide: [],
  },
  {
    name: "docs",
    path: "/app/doc",
    scope: "[data-phone-bar]",
    pairs: [["New doc", "Pages"]],
    wide: [],
  },
]

async function opened(browser: Browser, testInfo: TestInfo, header: Header, phone: boolean) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
    ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
  })
  const page = await context.newPage()
  await (header.open ? header.open(page, testInfo) : stubBackend(page, testInfo))
  await page.goto(header.path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  for (const [left, right] of phone ? header.pairs : header.wide.map((w) => w.pair)) {
    await expect(control(page, header, left)).toBeVisible({ timeout: 60_000 })
    await expect(control(page, header, right)).toBeVisible({ timeout: 60_000 })
  }
  return { page, close: () => context.close() }
}

/** A header control by its accessible name, in the header's row. */
const control = (page: Page, header: Header, name: string) => page.locator(header.scope).getByRole("button", { name, exact: true }).first()

/**
 * Where a finger reaches the control: F3's box, centred on it, at least 44px
 * each way, and whether the control draws it (F3's ::before).
 */
async function reachOf(page: Page, header: Header, name: string): Promise<Reach & { cy: number; drawn: boolean }> {
  const el = control(page, header, name)
  const box = await el.boundingBox()
  if (!box) throw new Error(`${name} has no box`)
  const drawn = await el.evaluate((b) => {
    const before = getComputedStyle(b, "::before")
    return before.content !== "none" && before.position === "absolute"
  })
  const w = Math.max(44, box.width)
  const h = Math.max(44, box.height)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return { name, left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, cy, drawn }
}

/** The control a finger meets at (x, y), by its accessible name; what it meets instead, when not a control. */
const controlAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const hit = document.elementFromPoint(px, py)
    const el = hit?.closest("button, a[href], [role=button]")
    if (el) return el.getAttribute("aria-label") || (el.textContent || "").trim()
    return hit ? `<${hit.tagName.toLowerCase()} class="${(hit.getAttribute("class") || "").slice(0, 60)}">` : null
  }, [x, y] as const)

/**
 * Waits until the controls stand at rest: none still pressed (:active) and none
 * mid-transition. A tapped icon dips to .92 under a finger (app/phone.css) and
 * springs back, and while it dips its reach is narrower too: on wZ39b Trash at
 * .92 reached 19.9px right of its centre, so a point 2px inside its 44px reach
 * (20px out), read just after its own tap, met the row behind it, while the tap
 * there a moment later pressed Trash. What a point meets is read at rest.
 */
async function atRest(page: Page, header: Header, names: readonly string[]) {
  for (const name of names) {
    await expect
      .poll(() => control(page, header, name).evaluate((el) => !el.matches(":active") && el.getAnimations().every((a) => a.playState !== "running")))
      .toBe(true)
  }
}

/**
 * Holds an icon pressed (:active, as a finger on it does) and reads, once its
 * dip has settled, its box, its glyph and what a point 1px inside its reach
 * meets. The icon keeps its box and its 44px reach, and its glyph dips, so the
 * press still shows (V-1047). A control that isn't an icon isn't held.
 */
async function whilePressed(page: Page, header: Header, name: string, x: number, y: number): Promise<string[]> {
  const el = control(page, header, name)
  if ((await el.getAttribute("data-press")) !== "icon") return []
  const glyph = el.locator("svg").first()
  const settled = () => expect.poll(() => el.evaluate((b) => b.getAnimations({ subtree: true }).every((a) => a.playState !== "running"))).toBe(true)
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await atRest(page, header, [name])
  const rest = { box: await el.boundingBox(), glyph: await glyph.boundingBox() }
  await el.evaluate((b) => b.setAttribute("data-held", ""))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const { root } = await cdp.send("DOM.getDocument")
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-held]" })
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] })
  await frames()
  await settled()
  const held = { box: await el.boundingBox(), glyph: await glyph.boundingBox(), met: await controlAt(page, x, y) }
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
  await cdp.detach()
  await el.evaluate((b) => b.removeAttribute("data-held"))
  await frames()
  await settled()
  const off: string[] = []
  const same = (a: { x: number; y: number; width: number; height: number } | null, b: typeof a) =>
    !!a && !!b && Math.abs(a.x - b.x) < 0.25 && Math.abs(a.y - b.y) < 0.25 && Math.abs(a.width - b.width) < 0.25 && Math.abs(a.height - b.height) < 0.25
  if (!same(held.box, rest.box)) off.push(`pressed, "${name}" measured ${held.box?.width.toFixed(2)}px wide (${rest.box?.width.toFixed(2)} at rest)`)
  if (held.met !== name) off.push(`pressed, a point at (${x.toFixed(1)}, ${y.toFixed(1)}), 1px inside "${name}"'s reach, met "${held.met}"`)
  if (!held.glyph || !rest.glyph || held.glyph.width > rest.glyph.width * 0.96) off.push(`pressed, "${name}"'s glyph didn't dip (${held.glyph?.width.toFixed(2)}px, ${rest.glyph?.width.toFixed(2)} at rest)`)
  return off
}

type Tapped = { __tapped?: string | null }

/**
 * Taps land on a name and do nothing more: what a tap pressed is recorded,
 * and the press goes no further (no dialog, no download, no sheet), so one
 * page takes every tap of the run.
 */
async function recordTaps(page: Page) {
  await page.evaluate(() => {
    const name = (t: EventTarget | null) => {
      const el = t instanceof Element ? t.closest("button, a[href], [role=button]") : null
      return el ? el.getAttribute("aria-label") || (el.textContent || "").trim() : null
    }
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"]) window.addEventListener(type, (e) => e.stopImmediatePropagation(), true)
    window.addEventListener(
      "click",
      (e) => {
        ;(window as unknown as Tapped).__tapped = name(e.target)
        e.preventDefault()
        e.stopImmediatePropagation()
      },
      true,
    )
  })
}

async function tapAt(page: Page, x: number, y: number): Promise<string | null> {
  await page.evaluate(() => ((window as unknown as Tapped).__tapped = null))
  await page.touchscreen.tap(x, y)
  await expect.poll(() => page.evaluate(() => (window as unknown as Tapped).__tapped ?? null)).not.toBeNull()
  return page.evaluate(() => (window as unknown as Tapped).__tapped ?? null)
}

/** The header, from the top of the window to below its controls, when SHOTS_DIR is set. */
async function headerShot(page: Page, header: Header, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  let bottom = 0
  for (const pair of header.pairs) for (const name of pair) bottom = Math.max(bottom, (await reachOf(page, header, name)).bottom)
  await page.screenshot({ path: `${dir}/${header.name}-header-390-${theme}.png`, clip: { x: 0, y: 0, width: 390, height: Math.ceil(bottom + 16) } })
}

for (const theme of ["light", "dark"] as const) {
  for (const header of HEADERS) {
    test(`at 390 with touch (${theme}), ${header.name}: a tap at the edge of an icon's reach in the header lands on that icon`, async ({ browser }, testInfo) => {
      const { page, close } = await opened(browser, testInfo, header, true)
      await page.emulateMedia({ colorScheme: theme })
      await headerShot(page, header, theme)
      await recordTaps(page)
      const shared: string[] = []
      const missed: string[] = []
      const undrawn = new Set<string>()
      const pressed: string[] = []
      for (const [left, right] of header.pairs) {
        const a = await reachOf(page, header, left)
        const b = await reachOf(page, header, right)
        for (const r of [a, b]) if (!r.drawn) undrawn.add(r.name)
        shared.push(...overlapping([a, b]))
        // 2px inside the shared edge of each reach, on each one's centre line.
        for (const [want, x, y] of [[left, a.right - 2, a.cy], [right, b.left + 2, b.cy]] as const) {
          await atRest(page, header, [left, right])
          const met = await controlAt(page, x, y)
          const tapped = await tapAt(page, x, y)
          if (met !== want || tapped !== want) missed.push(`a tap at (${x.toFixed(1)}, ${y.toFixed(1)}), inside "${want}"'s reach, met "${met}" and pressed "${tapped}"`)
        }
        for (const [want, x, y] of [[left, a.right - 1, a.cy], [right, b.left + 1, b.cy]] as const) pressed.push(...(await whilePressed(page, header, want, x, y)))
      }
      expect(missed, "a tap at the edge of an icon's reach lands on that icon").toEqual([])
      expect(shared, "neighbouring reaches meet but never overlap").toEqual([])
      expect([...undrawn], "every icon draws its 44px reach (app/phone.css F3)").toEqual([])
      expect.soft([...new Set(pressed)], "a pressed icon keeps its box and its reach, and its glyph dips").toEqual([])
      if (header.rhythm) {
        const boxes = await Promise.all(header.rhythm.map(async (name) => ({ name, box: await control(page, header, name).boundingBox() })))
        const gaps = boxes.slice(1).map((r, i) => ({ pair: `${boxes[i].name} | ${r.name}`, gap: Number((r.box!.x - (boxes[i].box!.x + boxes[i].box!.width)).toFixed(2)) }))
        expect.soft(gaps.filter((g) => Math.abs(g.gap - 16) > 0.5), `one 16px rhythm in the row: ${JSON.stringify(gaps)}`).toEqual([])
      }
      if (header.fits) {
        const text = page.locator(header.scope).locator(header.fits).first()
        // A FitLabel holds hidden copies of every option (its probes), so its
        // scrollWidth is the longest option's: measure the copy it shows.
        const fit = await text.evaluate((el) => {
          const range = document.createRange()
          range.selectNode(el.firstChild!)
          return { shown: range.getBoundingClientRect().width, box: el.getBoundingClientRect().width }
        })
        expect(fit.box > 0 && fit.shown <= fit.box + 1, `${header.fits} shows whole (${JSON.stringify(fit)})`).toBe(true)
      }
      await close()
    })
  }
}

for (const header of HEADERS.filter((h) => h.wide.length > 0)) {
  test(`at 1280 with a mouse, ${header.name}: the header measures as it did before`, async ({ browser }, testInfo) => {
    const { page, close } = await opened(browser, testInfo, header, false)
    const measured = []
    for (const { pair } of header.wide) {
      const a = (await control(page, header, pair[0]).boundingBox())!
      const b = (await control(page, header, pair[1]).boundingBox())!
      measured.push({ pair, gap: Math.round(b.x - (a.x + a.width)), boxes: [[Math.round(a.width), Math.round(a.height)], [Math.round(b.width), Math.round(b.height)]] })
    }
    expect(measured).toEqual(header.wide)
    await close()
  })
}

// The shared rows (PageHeader, SettingsPage) hold no icon pair at 390 today
// (SURVEY.md); the rule holds them all the same: a finger's gap, a mouse's own.
for (const phone of [true, false]) {
  test(`${phone ? "at 390 with touch" : "at 1280 with a mouse"}, a settings page's actions row stands ${phone ? 16 : 8}px apart`, async ({ browser }, testInfo) => {
    const header: Header = { name: "api-tokens", path: "/app/settings/api-tokens", scope: "main", pairs: [], wide: [] }
    const { page, close } = await opened(browser, testInfo, header, phone)
    const row = page.locator("[data-page-actions]").first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    expect(await row.evaluate((el) => [getComputedStyle(el).columnGap, getComputedStyle(el).rowGap])).toEqual(phone ? ["16px", "16px"] : ["8px", "8px"])
    await close()
  })
}
