import { expect, type Locator, type Page } from "@playwright/test"

import { pixelsAt } from "./contrast"
import { finger, flingEnded } from "./finger"

// A LIBRARY'S OVERLAY AS THE APP'S SHEET, as a finger meets it (miro-40 H1).
// On a phone the board's Excalidraw overlays dock as the app's sheet through
// components/ui/foreignSheets: on the bottom edge (or the keyboard) at the
// screen's width, the thing a finger meets at its middle, and the primary
// action in view and met there. Every surface a board is drawn on keeps it:
// the board page (boardSheets.spec) and a call's stage (callBoardStates.spec).

/** The docked overlay's mark (components/ui/foreignSheets). */
export const FOREIGN = "[data-foreign-sheet]"

/** A sheet shows at least this much of what it holds (a finger's row and its margins), however short its space. */
const SHOWN = 64

/** What a docked sheet holds runs to within this of its inner edges: a dialog's own padding (Excalidraw's is 40px) and a row's inset (8px). */
const GUTTER = 48

/** What a docked popover holds keeps the sheet's own gutter (components/ui/foreignSheets.css). */
const SURFACE_GUTTER = 16

/** A docked sheet's grabber (components/ui/foreignSheets.css): one pill this size at the middle of its top edge. A "menu" sheet has none. */
const PILL = { width: 36, height: 5 }

/** A box a finger works draws its row to its own edges (a menu's row is one), so its box is what it holds. */
const CONTROL = "button, input, select, textarea, [role=button], [role=menuitem], [role=option]"

/** What takes text or a choice: what brings up a keyboard (lib/ui/visualViewport's bringsUpKeyboard), and a select. */
const FIELD =
  "input:not([type=button], [type=checkbox], [type=color], [type=file], [type=hidden], [type=image], [type=radio], [type=range], [type=reset], [type=submit]), textarea, select, [contenteditable]:not([contenteditable=false])"

/** On a touch screen a field draws its text at this size or more: iOS Safari zooms the page into a smaller one as it takes focus. */
const FIELD_TEXT = 16

/** Where `el` is against the visible screen (the keyboard's top while it is up), and what a finger meets at its middle. */
export function placeOf(el: Locator) {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect()
    const vv = window.visualViewport
    const foot = vv ? vv.offsetTop + vv.height : window.innerHeight
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: window.innerWidth, foot, meets: !!hit && (hit === node || node.contains(hit)) }
  })
}

/**
 * `sheet` is a phone's sheet: risen, on the bottom edge (or the keyboard) at
 * the screen's width (640 at most), the thing a finger meets at its middle;
 * and `action`, its primary action where it has one, in view and met there.
 * What it holds shows. A docked sheet (DB-93's F1 and F2, miro-40 H1): the
 * box the library drew as its own (its only child) lies at its width, edge to
 * edge; what it holds fills that width (every box it draws with none inside
 * it, and every control, runs to within GUTTER of its inner edges), a
 * popover's keeps SURFACE_GUTTER in from them, and every row or grid of
 * buttons a popover holds spreads across it; it is as tall as what it holds,
 * up to its tallest, with the rest to scroll; its grabber is one pill of its
 * own (expectGrabber); and on a touch screen its fields draw their text at
 * FIELD_TEXT or more (expectFieldText). These are soft, so a walk goes on and
 * names every sheet that fails. Any other sheet shows what it holds, or SHOWN px of it
 * with the rest to scroll.
 * A docked sheet's row of actions is its pinned footer: see expectPinned.
 */
export async function expectSheet(sheet: Locator, what: string, action?: Locator) {
  await expect(sheet, `${what} is open`).toBeVisible()
  await sheet.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)))
  const at = await placeOf(sheet)
  const said = `${what}: ${JSON.stringify(at)}`
  expect(Math.abs(at.bottom - at.foot), `${said} stands on the screen's foot`).toBeLessThanOrEqual(1)
  expect(at.left, `${said} starts at the left edge`).toBeLessThanOrEqual(0.5)
  expect(at.right, `${said} runs to the right edge`).toBeGreaterThanOrEqual(Math.min(at.width, 640) - 0.5)
  expect(at.top, `${said} is on the screen`).toBeGreaterThanOrEqual(0)
  expect(at.meets, `${said} is what a finger meets at its middle`).toBe(true)
  const held = await sheet.evaluate((node, control) => {
    const s = getComputedStyle(node)
    const left = node.getBoundingClientRect().left + node.clientLeft + parseFloat(s.paddingLeft)
    const room = node.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    // How far in from its inner edges boxes run, left and right (Infinity for none).
    const gutters = (boxes: DOMRect[]) => [
      Math.round(Math.min(...boxes.map((b) => b.left)) - left),
      Math.round(left + room - Math.max(...boxes.map((b) => b.right))),
    ]
    const drawn: DOMRect[] = []
    for (const el of node.querySelectorAll("*")) {
      if (el.children.length && !el.matches(control)) continue
      const b = el.getBoundingClientRect()
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue
      drawn.push(b)
    }
    // A docked popover (data-side, as Radix marks it) holds rows and grids of buttons. One spreads when its buttons
    // fill its first line: a flex row's, or a grid's with at least as many as its columns (a colour picker's two
    // most-used swatches take 2 of 5 columns, where they belong).
    const side = node.querySelector(":scope > [data-side]")
    const rows: { at: string; gutters: number[] }[] = []
    for (const box of side ? side.querySelectorAll("*") : []) {
      const kids = [...box.children]
      if (kids.length < 2 || kids.some((k) => k.tagName !== "BUTTON")) continue
      const shown = kids.map((k) => k.getBoundingClientRect()).filter((b) => b.width && b.height)
      if (shown.length < 2) continue
      const bs = getComputedStyle(box)
      const line = Math.min(...shown.map((b) => b.top))
      const columns = bs.gridTemplateColumns.split(" ").length
      const fills = bs.display.endsWith("flex")
        ? !bs.flexDirection.startsWith("column") && shown.filter((b) => b.top < line + 1).length > 1
        : bs.display.endsWith("grid") && columns > 1 && shown.length >= columns
      if (fills) rows.push({ at: `${box.tagName.toLowerCase()}.${String(box.className).split(" ")[0]}`, gutters: gutters(shown) })
    }
    // A popper's arrow (Radix: a box of its own beside the surface, placed absolutely) points from a floating popover
    // at what opened it. A docked sheet points at nothing, and the arrow, hung off its foot, made it hold 10 px more
    // than it showed (V-384: the font list, on a build whose popover floats above what opened it).
    const arrows = side ? [...side.children].filter((k) => k.tagName === "SPAN" && getComputedStyle(k).position === "absolute" && k.getBoundingClientRect().height > 0).length : 0
    const only = node.children.length === 1 ? node.children[0].getBoundingClientRect() : null
    return {
      docked: node.hasAttribute("data-foreign-sheet"),
      grabber: node.hasAttribute("data-foreign-sheet") && node.getAttribute("data-foreign-sheet") !== "menu",
      popover: !!side,
      arrows,
      own: only && [Math.round(only.left - left), Math.round(left + room - only.right)],
      room,
      gutters: drawn.length ? gutters(drawn) : [Infinity, Infinity],
      rows,
      shown: node.clientHeight,
      holds: node.scrollHeight,
      // Its max-height is its border box's, and what it shows is inside its borders (its grabber's band).
      tallest: (parseFloat(s.maxHeight) || Infinity) - (node.getBoundingClientRect().height - node.clientHeight),
    }
  }, CONTROL)
  const told = `${what}: ${JSON.stringify(held)}`
  if (held.docked) {
    if (held.own) expect.soft(Math.max(...held.own.map(Math.abs)), `${told} the box it holds lies at its width, edge to edge`).toBeLessThanOrEqual(1)
    expect.soft(Math.max(...held.gutters), `${told} what it holds fills its width`).toBeLessThanOrEqual(GUTTER)
    if (held.popover)
      expect.soft(Math.min(...held.gutters), `${told} what a popover holds keeps the sheet's ${SURFACE_GUTTER}px gutter`).toBeGreaterThanOrEqual(SURFACE_GUTTER - 1)
    expect.soft(held.arrows, `${told} draws no arrow: a docked sheet points at nothing`).toBe(0)
    const boxed = held.rows.filter((row) => Math.max(...row.gutters) > GUTTER)
    expect.soft(boxed, `${told} every row or grid of buttons it holds spreads across its width`).toEqual([])
    expect.soft(held.shown, `${told} is as tall as what it holds, up to its tallest`).toBeGreaterThanOrEqual(Math.min(held.holds, held.tallest) - 1)
    if (held.grabber) await expectGrabber(sheet, told)
    await expectFieldText(sheet, what)
  } else expect(held.shown, `${told} shows what it holds, or ${SHOWN} px of it`).toBeGreaterThanOrEqual(Math.min(held.holds, SHOWN))
  if (!action) return
  await expect(action, `${what}'s action is there`).toBeVisible()
  const act = await placeOf(action)
  const did = `${what}'s action: ${JSON.stringify(act)}`
  expect(act.top >= at.top && act.bottom <= act.foot + 0.5, `${did} is in view`).toBe(true)
  expect(act.meets, `${did} is what a finger meets`).toBe(true)
  if (await action.evaluate((node) => node.hasAttribute("data-foreign-sheet-actions"))) await expectPinned(action, what, act.bottom)
}

/**
 * On a touch screen every field `sheet` holds draws its text at FIELD_TEXT px
 * or more (V-373). iOS Safari zooms the page into a field whose text is
 * smaller as it takes focus, and zoomed in, the app no longer fits a sheet to
 * the keyboard (lib/ui/visualViewport: a zoom is the person's), so the sheet
 * stays behind it. Playwright's WebKit never zooms (iOS does that outside the
 * page), so the size is what is checked. Soft, and it names every field that
 * is smaller.
 */
export async function expectFieldText(sheet: Locator, what: string) {
  const small = await sheet.evaluate(
    (node, { field, least }) =>
      matchMedia("(pointer: coarse)").matches
        ? [...node.querySelectorAll(field)]
            .filter((el) => el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < least)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${getComputedStyle(el).fontSize}`)
        : [],
    { field: FIELD, least: FIELD_TEXT },
  )
  expect.soft(small, `${what}: every field it holds draws its text at ${FIELD_TEXT}px or more on a touch screen`).toEqual([])
}

/**
 * A docked sheet's grabber (components/ui/foreignSheets.css), as the screen
 * draws it: one PILL at the middle of its top edge, drawn its full height
 * all along its straight middle (a bar that only touches its round ends is a
 * dumbbell, CR-189's and DB-94's F3), in one ink from tip to tip (no layer
 * drawn over another), and its own: nothing the sheet holds runs over it, so
 * a finger on it meets the sheet itself.
 */
async function expectGrabber(sheet: Locator, told: string) {
  const edge = await sheet.evaluate((node) => {
    const r = node.getBoundingClientRect()
    // Its band: the sheet's own, above the box of what it holds.
    return { x: r.left + r.width / 2, y: r.top, band: node.clientTop + parseFloat(getComputedStyle(node).paddingTop), k: devicePixelRatio }
  })
  const reach = PILL.width / 2 + 8
  // Read inside the band, in whole pixels, clear of the sheet's edge, which blends with what is behind it.
  const top = Math.ceil(edge.y) + 1
  const clip = { x: Math.round(edge.x - reach), y: top, width: 2 * reach, height: Math.max(Math.floor(edge.y + edge.band) - 1 - top, PILL.height + 2) }
  const px = await pixelsAt(sheet.page(), clip)
  const k = edge.k
  const w = Math.round(clip.width * k)
  const at = (x: number, y: number) => px.slice((y * w + x) * 4, (y * w + x) * 4 + 3)
  const far = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
  // The sheet's middle, in the clip. The band beside the pill is its ground, and its ink is what stands farthest from that in its middle column.
  const middle = edge.x - clip.x
  const column = [...Array(px.length / 4 / w).keys()]
  const ground = at(Math.round(2 * k), Math.floor(column.length / 2))
  const mid = Math.floor(middle * k)
  const peak = column.reduce((a, y) => (far(at(mid, y), ground) > far(at(mid, a), ground) ? y : a), 0)
  const contrast = far(at(mid, peak), ground)
  expect.soft(contrast, `${told} draws a grabber at the middle of its top edge`).toBeGreaterThan(24)
  if (contrast <= 24) return
  const inked = (x: number, y: number) => far(at(x, y), ground) > contrast / 2
  // Its rows are the run of inked rows about the peak in its middle column.
  let y0 = peak
  let y1 = peak
  while (y0 > 0 && inked(mid, y0 - 1)) y0--
  while (y1 < column.length - 1 && inked(mid, y1 + 1)) y1++
  const tall = (x: number) => column.filter((y) => y >= y0 && y <= y1 && inked(x, y)).length
  const cols = [...Array(w).keys()].filter((x) => tall(x) > 0)
  // Its straight middle: every column more than a round end's radius, and half a pixel, in from its ends.
  const straight = PILL.width / 2 - PILL.height / 2 - 0.5
  const pill = {
    width: (cols[cols.length - 1] - cols[0] + 1) / k,
    height: (y1 - y0 + 1) / k,
    pinched: cols.filter((x) => Math.abs((x + 0.5) / k - middle) <= straight && tall(x) < y1 - y0).map((x) => +((x + 0.5) / k - middle).toFixed(2)),
  }
  const said = `${told} its grabber ${JSON.stringify(pill)}`
  expect.soft(Math.abs(pill.width - PILL.width), `${said} is ${PILL.width}px wide`).toBeLessThanOrEqual(1)
  expect.soft(Math.abs(pill.height - PILL.height), `${said} is ${PILL.height}px tall`).toBeLessThanOrEqual(0.5)
  expect.soft(pill.pinched, `${said} is one pill, drawn its full height along its middle`).toEqual([])
  // One ink all along its middle row, between the anti-aliased pixel at each tip: its ink has alpha, so a
  // layer drawn over another draws darker (light) or brighter (dark), as a 31px bar over its 5px round ends
  // drew 178 in a 213 pill (DB-94's F3, round 2). Each pixel off that ink is listed as offset:r,g,b.
  const row = Math.floor((y0 + y1) / 2)
  const along = [...Array(w).keys()].filter((x) => inked(x, row))
  const ink = at(mid, row)
  const off = [...Array(Math.max(along[along.length - 1] - along[0] - 1, 0)).keys()]
    .map((i) => along[0] + 1 + i)
    .filter((x) => at(x, row).some((v, c) => Math.abs(v - ink[c]) > 3))
    .map((x) => `${((x + 0.5) / k - middle).toFixed(2)}:${at(x, row).join(",")}`)
  expect.soft(off, `${said} is one ink (${ink.join(",")}) all along its middle row`).toEqual([])
  const meets = await sheet.evaluate((node, p) => document.elementFromPoint(p.x, p.y) === node, { x: edge.x, y: top + (y0 + y1 + 1) / 2 / k })
  expect.soft(meets, `${said} is the sheet's own: a finger on it meets the sheet, not what it holds`).toBe(true)
}

/**
 * A docked sheet's row of actions (components/ui/foreignSheets) is its pinned
 * footer: at the end of the sheet's scroll it stands where it stood when the
 * sheet opened (`bottom`), a finger meets it, and what the sheet holds ends
 * clear of it. The sheet goes back to its top after.
 */
export async function expectPinned(row: Locator, what: string, bottom: number) {
  const end = await row.evaluate(async (node) => {
    const sheet = node.closest("[data-foreign-sheet]")!
    sheet.scrollTo({ top: sheet.scrollHeight, behavior: "instant" })
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const r = node.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    // The lowest thing the sheet draws outside the row: every drawn box with no box inside it.
    let held = 0
    let lowest = ""
    for (const el of sheet.querySelectorAll("*")) {
      if (node.contains(el) || el.children.length) continue
      const b = el.getBoundingClientRect()
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden" || b.bottom <= held) continue
      held = b.bottom
      lowest = `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`
    }
    const scrolled = sheet.scrollTop
    sheet.scrollTo({ top: 0, behavior: "instant" })
    return { top: r.top, bottom: r.bottom, scrolled, meets: !!hit && node.contains(hit), held, lowest }
  })
  const said = `${what}'s actions at the end of its scroll: ${JSON.stringify(end)}`
  expect(Math.abs(end.bottom - bottom), `${said} stand where they stood on the sheet's foot`).toBeLessThanOrEqual(0.5)
  expect(end.meets, `${said} are what a finger meets`).toBe(true)
  expect(end.held, `${said}: what the sheet holds ends clear of them`).toBeLessThanOrEqual(end.top + 0.5)
}

/** Excalidraw's overlay is docked: the marked sheet holds `root`. */
export function foreign(page: Page, root: string) {
  return page.locator(FOREIGN).filter({ has: page.locator(root) }).or(page.locator(`${FOREIGN}${root}`)).first()
}

/** Escape closes the docked overlay, and no sheet is left. */
export async function closeForeign(page: Page) {
  await page.keyboard.press("Escape")
  await expect(page.locator(FOREIGN)).toHaveCount(0)
}

/**
 * More tools, reached as a finger reaches it. On a phone Excalidraw's tool row
 * is wider than the screen, so a swipe along the row brings More tools in and
 * a tap opens it. Before miro-40 H1 the row didn't scroll: More tools sat past
 * the screen's right edge, out of a finger's reach. The page holds one board.
 */
export async function reachMoreTools(page: Page) {
  const row = page.locator(".App-toolbar--mobile")
  const box = await row.boundingBox()
  if (!box) throw new Error("the phone's tool row isn't on the page")
  const f = await finger(page)
  const y = box.y + box.height / 2
  await f.down(box.x + box.width - 24, y)
  for (let i = 1; i <= 10; i++) await f.move(box.x + box.width - 24 - i * 24, y)
  await f.up()
  await flingEnded(row)
  const at = await page.locator(".App-toolbar__extra-tools-trigger").boundingBox()
  const width = page.viewportSize()?.width ?? 0
  expect(!!at && at.x >= 0 && at.x + at.width <= width, "More tools is on the screen after a swipe along the row").toBe(true)
  await page.touchscreen.tap(at!.x + at!.width / 2, at!.y + at!.height / 2)
}
