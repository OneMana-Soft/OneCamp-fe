import { expect, test, type Locator, type Page } from "@playwright/test"

import { reviewShot, SAM, SHOT_THEMES } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// V-957: in a row's record, a link field's "Add a link", a person link's "Add a person" and a files
// field's "Add files" show on their row's hover. A grid's row is that hover group; a field's row in the
// record was not, so at 1280 they stayed invisible there and let a click through to the cell under them,
// and a mouse could never link, add or attach anything from the record. Now a field's row in the record
// is the group: the pointer anywhere on the field (its name or its value) shows them, and the field's
// comment button. At 1280 by a real mouse (moved onto the field, then pressed on the button, never
// forced), in the side panel and as a page; by the keyboard; at 390 by touch; and a member who may only
// view gets none of them. With SHOTS_DIR set, it saves the frames, light and dark.

const TASK = "9d1c0000-0000-4000-8000-0000000000a1"
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "vendor", name: "Vendor", type: "relation", config: { relation_target: "any" } },
  { id: "owner", name: "Owner", type: "relation", config: { relation_target: "user" } },
  { id: "files", name: "Files", type: "attachment" },
]
const DESKTOP = { viewport: { width: 1280, height: 900 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

function table() {
  const server = new TableServer(fields, [{ item: "Booth", vendor: [{ id: TASK, type: "task" }] }])
  server.names.set(TASK, "Venue")
  return server
}

/** The first row's record, opened from its gutter: clicked at 1280 (the pointer on the row shows its open button), tapped at 390. */
async function openRecord(page: Page, phone: boolean) {
  await expect(page.locator("tbody tr[data-row]").first()).toContainText("Booth", { timeout: 60_000 })
  const open = page.getByRole("button", { name: "Open row 1" })
  // At 1280 the open button shows, and takes a click, under the pointer on its row: the pointer goes there first.
  if (!phone) await pointAt(page, page.locator("tbody tr[data-row]").first())
  await (phone ? open.tap() : open.click())
  const record = page.getByRole("dialog", { name: "Booth, a row of Deals" })
  await expect(record).toBeVisible({ timeout: 30_000 })
  // The linked row's chip, by its words: a link where the reader may edit, plain text where they may only view (relationFace).
  await expect(record.locator("[data-relation-chip]").filter({ hasText: "Venue" })).toBeVisible({ timeout: 30_000 })
  // At 390 the record is a drawer that rises into place: a box read (and a point hit) while it moves
  // misses what it aims at, so the specs read boxes once it holds still.
  if (phone) {
    const top = async () => (await record.boundingBox())?.y
    await expect.poll(async () => { const a = await top(); await page.waitForTimeout(120); return a === (await top()) }, { timeout: 10_000 }).toBe(true)
  }
  return record
}

/** A field's row in the record: its name (the term) and its value (the definition beside it). */
const fieldName = (record: Locator, name: string) => record.getByRole("term").filter({ hasText: name })

/** The real pointer, moved onto the middle of an element's box (a mouse's move: no hover() helper, no forced press). */
async function pointAt(page: Page, target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error("nothing to point at")
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + box.height / 2, { steps: 4 })
}

/** The pointer off every field: on the record's Close button, in its header. */
const pointAway = (page: Page, record: Locator) => pointAt(page, record.getByRole("button", { name: "Close" }))

const shown = (control: Locator, what: string) => expect.soft(control, what).toHaveCSS("opacity", "1")
const written = (server: TableServer) => server.writes.filter((w) => w.kind === "patch" || w.kind === "update" || w.kind === "create" || w.kind === "batch")

for (const theme of SHOT_THEMES) {
  test(`at 1280 by mouse, ${theme}: a field's "Add a link" in the record shows under the pointer and opens its picker, beside the grid and as a page`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const server = table()
    const { page, close } = await server.open(browser, testInfo, SAM, { ...DESKTOP, colorScheme: theme })
    const record = await openRecord(page, false)
    const add = record.getByRole("button", { name: "Add a link" })
    const find = page.getByRole("textbox", { name: "Search tasks, docs and people" })

    for (const where of ["beside the grid", "as a page"]) {
      if (where === "as a page") {
        await record.getByRole("button", { name: "Open as a page" }).click()
        await expect(record.getByRole("button", { name: "Back to the side panel" })).toBeVisible()
      }
      // Off the field, the "+" keeps out of the way; on the field's name, it shows, and a press reaches it.
      await pointAway(page, record)
      await expect(add, `${where}: off the field, the + is hidden`).toHaveCSS("opacity", "0")
      await pointAt(page, fieldName(record, "Vendor"))
      await shown(add, `${where}: with the pointer on the field's name, the + shows`)
      if (where === "beside the grid") await reviewShot(page, "record-reveal-hover", theme)
      await add.click({ timeout: 10_000 })
      await expect(find, `${where}: the press opens the link's picker`).toBeVisible({ timeout: 15_000 })
      await reviewShot(page, where === "as a page" ? "record-reveal-page" : "record-reveal-picker", theme)
      await page.keyboard.press("Escape")
      await expect(find).toHaveCount(0)
    }
    expect(written(server), "a picker opened and shut writes nothing").toEqual([])
    await close()
  })
}

test(`at 1280 by mouse: a person link's "Add a person", a files field's "Add files" and a field's comment button show on the field's value too`, async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const server = table()
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const record = await openRecord(page, false)

  // On the field's value, beside its name: the person's "+" and the field's comment button show.
  const person = record.getByRole("button", { name: "Add a person" })
  const comment = record.getByRole("button", { name: "Comment on Owner" })
  await pointAway(page, record)
  await expect(person).toHaveCSS("opacity", "0")
  await expect(comment).toHaveCSS("opacity", "0")
  // `has` is asked inside each definition, so its locator starts at the page, not at the dialog.
  await pointAt(page, record.getByRole("definition").filter({ has: page.getByRole("button", { name: "Add a person" }) }))
  await shown(person, "with the pointer on the field's value, the person's + shows")
  await shown(comment, "with the pointer on the field's value, its comment button shows")
  await person.click({ timeout: 10_000 })
  const people = page.getByRole("textbox", { name: "Search users" })
  await expect(people, "the press opens the people picker").toBeVisible({ timeout: 15_000 })
  await page.keyboard.press("Escape")
  await expect(people).toHaveCount(0)

  // Files: on the field's name, "Add files" shows, and a press asks for files.
  const files = record.getByRole("button", { name: "Add files" })
  await pointAway(page, record)
  await expect(files).toHaveCSS("opacity", "0")
  await pointAt(page, fieldName(record, "Files"))
  await shown(files, "with the pointer on the field's name, Add files shows")
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 })
  await files.click({ timeout: 10_000 })
  expect((await chooser).isMultiple(), "the press asks for files").toBe(true)

  expect(written(server), "nothing picked, nothing written").toEqual([])
  await close()
})

for (const theme of SHOT_THEMES) {
  test(`at 1280 by keyboard, ${theme}: Tab from a link's chip reaches its × and then its "+", which shows, and Enter opens the picker`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const server = table()
    const { page, close } = await server.open(browser, testInfo, SAM, { ...DESKTOP, colorScheme: theme })
    const record = await openRecord(page, false)
    await pointAway(page, record)
    await record.getByRole("link", { name: "Venue" }).focus()
    // The chip's own × comes first (V-1034: it keeps its slot, so the keyboard reaches it), then the field's +.
    await page.keyboard.press("Tab")
    await expect(record.getByRole("button", { name: "Unlink Venue" })).toBeFocused()
    await page.keyboard.press("Tab")
    const add = record.getByRole("button", { name: "Add a link" })
    await expect(add).toBeFocused()
    await shown(add, "focused by the keyboard, the + shows")
    await reviewShot(page, "record-reveal-keyboard", theme)
    await page.keyboard.press("Enter")
    await expect(page.getByRole("textbox", { name: "Search tasks, docs and people" })).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press("Escape")
    expect(written(server)).toEqual([])
    await close()
  })
}

for (const theme of SHOT_THEMES) {
  test(`at 390 by touch, ${theme}: the record's "+"s are there without a hover, and a tap opens the link's picker`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const server = table()
    const { page, close } = await server.open(browser, testInfo, SAM, { ...PHONE, colorScheme: theme })
    const record = await openRecord(page, true)
    for (const name of ["Add a link", "Add a person", "Add files"]) await shown(record.getByRole("button", { name }), `${name}, on a touch screen`)
    await record.getByRole("button", { name: "Add a link" }).tap()
    const find = page.getByRole("textbox", { name: "Search tasks, docs and people" })
    await expect(find).toBeVisible({ timeout: 15_000 })
    await reviewShot(page, "record-reveal-touch", theme)
    await page.keyboard.press("Escape")
    await expect(find).toHaveCount(0)
    expect(written(server)).toEqual([])
    await close()
  })
}

test("at 1280, a member who may only view: the record's fields offer no +, under the pointer or not", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = table()
  server.canManage = false
  server.canEdit = false
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const record = await openRecord(page, false)
  for (const field of ["Vendor", "Owner", "Files"]) {
    await pointAt(page, fieldName(record, field))
    for (const name of ["Add a link", "Add a person", "Add files"]) await expect(record.getByRole("button", { name }), `${name}, on ${field}`).toHaveCount(0)
  }
  await close()
})

// V-1034: a chip's remove × keeps its slot whether it shows or not. It came and went with display, so a
// chip under the pointer was 18 px wider than at rest: a mouse going from a linked chip to the "+" after
// it saw the + slide left from under it as it left the chip, and the press missed by 8 px. By a real
// pointer path (onto the chip, then in steps to where the + showed, then a press), the chip's width with
// the pointer on it and off it (a link, a person and a file, in the record and in the grid), the
// keyboard's way to the ×, a finger's, and a member who may only view (no ×).

const V1034_FILE = { id: "44444444-4444-4444-8444-444444444444", name: "Floor plan.pdf", size: 1_204, mime: "application/pdf" }

/** The first row links a task, a person and a file: each chip with its ×. */
function linked() {
  const server = new TableServer(fields, [{ item: "Booth", vendor: [{ id: TASK, type: "task" }], owner: [{ id: PRIYA.user_uuid, type: "user" }], files: [V1034_FILE] }])
  server.names.set(TASK, "Venue")
  // A relation names what it links by the server's names, a person too (a person with no name is a chip the reader can't open).
  server.names.set(PRIYA.user_uuid, PRIYA.user_full_name)
  return server
}

/** A field's value in the record, by the button only it has. */
const valueWith = (page: Page, record: Locator, name: string) => record.getByRole("definition").filter({ has: page.getByRole("button", { name }) })

/** No box around the chip is mid-scale (the record's opening): a width is read at the chip's true size. */
const unscaled = (chip: Locator) =>
  expect
    .poll(
      () =>
        chip.evaluate((el) => {
          for (let a: Element | null = el; a; a = a.parentElement) {
            const t = getComputedStyle(a).transform
            const m = new DOMMatrixReadOnly(t === "none" ? undefined : t)
            if (m.a !== 1 || m.d !== 1) return false
          }
          return true
        }),
      { message: "the record has opened: nothing around the chip is scaled" },
    )
    .toBe(true)

/** The chip's width at rest and with the real pointer on it, and its × under the pointer. */
async function widths(page: Page, chip: Locator, x: Locator, away: () => Promise<void>) {
  await away()
  // The record's opening (its scale) done first: a width read under its last frame, scale 0.999999, was
  // 67.9999 at rest and 68 under the pointer, though the chip's own width never changed.
  await unscaled(chip)
  const rest = (await chip.boundingBox())?.width
  await pointAt(page, chip)
  await shown(x, "the pointer on the chip shows its ×")
  const hovered = (await chip.boundingBox())?.width
  return { rest, hovered }
}

test(`V-1034 at 1280 by mouse: from a linked chip to its "+", a press where the + showed opens the picker and links nothing`, async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const record = await openRecord(page, false)
  const chip = record.locator("[data-relation-chip]").filter({ hasText: "Venue" })
  const add = record.getByRole("button", { name: "Add a link" })
  await pointAway(page, record)
  // On the chip: its × and the field's + show, and the + is where the eye finds it.
  await pointAt(page, chip)
  await shown(record.getByRole("button", { name: "Unlink Venue" }), "on the chip, its × shows")
  await shown(add, "on the chip, the field's + shows")
  const aim = await add.boundingBox()
  if (!aim) throw new Error("no + to aim at")
  // Off the chip in steps, onto the middle of where the + showed, and a press there: a hand's path, never a forced click.
  await page.mouse.move(aim.x + aim.width / 2, aim.y + aim.height / 2, { steps: 8 })
  await page.mouse.down()
  await page.mouse.up()
  const find = page.getByRole("textbox", { name: "Search tasks, docs and people" })
  await expect(find, "the press where the + showed opens the link's picker").toBeVisible({ timeout: 15_000 })
  await page.keyboard.press("Escape")
  await expect(find).toHaveCount(0)
  await expect(chip, "the row still links Venue").toBeVisible()
  expect(written(server), "a picker opened and shut writes nothing").toEqual([])
  await close()
})

test("V-1034 at 1280 by mouse: a link's, a person's and a file's chip is as wide under the pointer as at rest, in the grid and in the record", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const row = page.locator("tbody tr[data-row]").first()
  await expect(row).toContainText("Booth", { timeout: 60_000 })
  // The grid's cell: the pointer on the row's Item, then on the chip.
  const inGrid = await widths(page, row.locator("[data-relation-chip]").filter({ hasText: "Venue" }), row.getByRole("button", { name: "Unlink Venue" }), () => pointAt(page, row.getByText("Booth").first()))
  expect(inGrid.rest, "the grid's link chip has a width").toBeGreaterThan(0)
  expect(inGrid.hovered, "the grid's link chip under the pointer is as wide as at rest").toBe(inGrid.rest)

  const record = await openRecord(page, false)
  const away = () => pointAway(page, record)
  const chips: Array<[string, Locator, Locator]> = [
    ["link", record.locator("[data-relation-chip]").filter({ hasText: "Venue" }), record.getByRole("button", { name: "Unlink Venue" })],
    ["person", valueWith(page, record, "Add a person").locator("[data-relation-chip]").first(), record.getByRole("button", { name: /^Remove Priya/ })],
    ["file", record.locator("[data-file-chip]").first(), record.getByRole("button", { name: `Remove ${V1034_FILE.name}` })],
  ]
  for (const [what, chip, x] of chips) {
    const w = await widths(page, chip, x, away)
    expect(w.rest, `the record's ${what} chip has a width`).toBeGreaterThan(0)
    expect(w.hovered, `the record's ${what} chip under the pointer is as wide as at rest`).toBe(w.rest)
  }
  expect(written(server)).toEqual([])
  await close()
})

test("V-1034 at 1280 by keyboard: Tab from a link's chip reaches its ×, which shows, then the +", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const record = await openRecord(page, false)
  await pointAway(page, record)
  await record.getByRole("link", { name: "Venue" }).focus()
  await page.keyboard.press("Tab")
  const x = record.getByRole("button", { name: "Unlink Venue" })
  await expect(x, "Tab from the chip's name reaches its ×").toBeFocused()
  await shown(x, "focused by the keyboard, the × shows")
  await page.keyboard.press("Tab")
  await expect(record.getByRole("button", { name: "Add a link" }), "and the next Tab the field's +").toBeFocused()
  expect(written(server)).toEqual([])
  await close()
})

test("V-1034 at 390 by touch: every chip's × is there without a hover, and a tap on a link's unlinks it", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
  const record = await openRecord(page, true)
  for (const name of ["Unlink Venue", /^Remove Priya/, `Remove ${V1034_FILE.name}`]) await shown(record.getByRole("button", { name }), `${name}, on a touch screen`)
  await record.getByRole("button", { name: "Unlink Venue" }).tap()
  await expect(record.locator("[data-relation-chip]").filter({ hasText: "Venue" }), "the tap unlinks Venue").toHaveCount(0, { timeout: 15_000 })
  expect(written(server).length, "the unlink is written").toBeGreaterThan(0)
  await close()
})

test("V-1034 at 1280, a member who may only view: a chip under the pointer offers no ×", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  server.canManage = false
  server.canEdit = false
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const record = await openRecord(page, false)
  for (const chip of [record.locator("[data-relation-chip]").filter({ hasText: "Venue" }), record.locator("[data-file-chip]").first()]) {
    await pointAt(page, chip)
    await expect(record.getByRole("button", { name: /^(Unlink|Remove) / }), "no × for a viewer").toHaveCount(0)
  }
  await close()
})

// V-1072: under a finger a chip's remove × took a tap across 16 px, right beside its name: hard to hit,
// and a tap meant for the name could land on the remove. Now the × takes the shared 44 px reach
// (app/phone.css F3) without covering its name, the chip line above or the "+" after it. At 1280 the ×
// that shows under the pointer lies in the chip's own room, never over a short name's last letter.

/** Which control a real tap at (x, y) reaches: the button or link the hit test finds there, by its name. */
const hitAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py)?.closest("a, button")
    return el ? el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName : null
  }, [x, y] as const)

test("V-1072 at 390 by touch: a link's, a person's and a file's × takes a tap across 44 px, and never on its name", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
  const record = await openRecord(page, true)
  const cases: Array<[Locator, string]> = [
    [record.locator("[data-relation-chip]").filter({ hasText: "Venue" }), "Unlink Venue"],
    [valueWith(page, record, "Add a person").locator("[data-relation-chip]").first(), `Remove ${PRIYA.user_full_name}`],
    [record.locator("[data-file-chip]").first(), `Remove ${V1034_FILE.name}`],
  ]
  for (const [chip, label] of cases) {
    const x = chip.getByRole("button", { name: label })
    await x.scrollIntoViewIfNeeded()
    const b = await x.boundingBox()
    if (!b) throw new Error(`no ${label}`)
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    // The hit test at the edges of a 44 px square on the ×'s centre (a pixel in from each edge): every one reaches the ×.
    for (const [dx, dy] of [[-21, 0], [21, 0], [0, -21], [0, 21], [-21, -21], [21, 21]]) {
      expect.soft(await hitAt(page, cx + dx, cy + dy), `${label}: a tap ${dx},${dy} px from the ×'s centre reaches it`).toBe(label)
    }
    // Its name (the chip's link or button, else its words) is all its own: no point of it reaches the ×.
    const name = chip.locator("a, button:not(.chip-x), .truncate").first()
    const n = await name.boundingBox()
    if (!n) throw new Error(`no name for ${label}`)
    for (const fx of [0.05, 0.5, 0.95]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        expect.soft(await hitAt(page, n.x + n.width * fx, n.y + n.height * fy), `${label}: the name at ${fx},${fy} is not the ×`).not.toBe(label)
      }
    }
  }
  // The field's "+" after a chip keeps its own taps: its centre and its left edge reach the +.
  const add = await record.getByRole("button", { name: "Add a link" }).boundingBox()
  if (!add) throw new Error("no +")
  expect.soft(await hitAt(page, add.x + 1, add.y + add.height / 2), "the +'s left edge is the +").toBe("Add a link")
  expect(written(server), "no tap was made").toEqual([])
  await close()
})

test("V-1072 at 390 by touch: a tap on a link's name never unlinks it, and a tap beside its × does", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
  const record = await openRecord(page, true)
  const chips = record.locator("[data-relation-chip]")
  const before = await chips.count()
  // A tap on the name's centre: the link takes it (its navigation held here, so the record stays to count).
  await page.evaluate(() => window.addEventListener("click", (e) => { if ((e.target as Element).closest("a")) { e.preventDefault(); e.stopPropagation() } }, true))
  const link = record.getByRole("link", { name: "Venue" })
  const n = await link.boundingBox()
  if (!n) throw new Error("no name")
  expect(await hitAt(page, n.x + n.width / 2, n.y + n.height / 2), "the name's centre is the name").toBe("Venue")
  await page.touchscreen.tap(n.x + n.width / 2, n.y + n.height / 2)
  await page.waitForTimeout(1_500)
  await expect(chips, "a tap on the name unlinks nothing").toHaveCount(before)
  expect(written(server), "and writes nothing").toEqual([])
  // A tap 18 px under the ×'s centre (off its 16 px glyph, inside its reach) unlinks Venue.
  const b = await record.getByRole("button", { name: "Unlink Venue" }).boundingBox()
  if (!b) throw new Error("no ×")
  // The hit test first: Chromium's touch adjustment moves a tap on nothing to the nearest control, so on a
  // 16 px × the tap below alone unlinked too (V-1072's red): the hit test is the ×'s own reach, no adjustment.
  expect(await hitAt(page, b.x + b.width / 2, b.y + b.height / 2 + 18), "18 px under the ×'s centre is the ×").toBe("Unlink Venue")
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2 + 18)
  await expect(chips.filter({ hasText: "Venue" }), "the tap beside the × unlinks Venue").toHaveCount(0, { timeout: 15_000 })
  expect(written(server).length, "the unlink is written").toBeGreaterThan(0)
  await close()
})

test("V-1072 at 1280 by mouse: the × under the pointer leaves a short name whole, in the record, and the chip as wide", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = linked()
  const { page, close } = await server.open(browser, testInfo, SAM, DESKTOP)
  const record = await openRecord(page, false)
  const cases: Array<[Locator, Locator, Locator]> = [
    [record.locator("[data-relation-chip]").filter({ hasText: "Venue" }), record.getByRole("link", { name: "Venue" }), record.getByRole("button", { name: "Unlink Venue" })],
    [record.locator("[data-file-chip]").first(), record.locator("[data-file-chip]").first().getByRole("button", { name: V1034_FILE.name, exact: true }), record.getByRole("button", { name: `Remove ${V1034_FILE.name}` })],
  ]
  for (const [chip, name, x] of cases) {
    const w = await widths(page, chip, x, () => pointAway(page, record))
    expect(w.hovered, "the chip under the pointer is as wide as at rest").toBe(w.rest)
    const n = await name.boundingBox()
    const xb = await x.boundingBox()
    if (!n || !xb) throw new Error("no name or ×")
    expect.soft(xb.x, "the shown × starts after the name's last letter").toBeGreaterThanOrEqual(n.x + n.width)
    expect.soft(await chip.locator(".truncate").first().evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5), "the name shows whole, uncut").toBe(true)
  }
  expect(written(server)).toEqual([])
  await close()
})
