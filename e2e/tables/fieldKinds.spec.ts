import { expect, test, type Locator } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// Tables B1's kinds (T3, STEP5 spec E): a status's lozenges in their groups, people's
// faces, a phone's call button, a duration as hours and minutes, a rating's
// stars, a long text's box, and what a row says of itself (its id, when it was
// made and by whom). With TABLE_SHOTS set to a folder, it also saves the grid
// with every kind filled and one empty row, each picker open, and the footers,
// at 1280 and 390, light and dark, for the design review.

const ago = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString()
const person = (p: { user_uuid: string }) => ({ id: p.user_uuid, type: "user" })

const fields = [
  { id: "name", name: "Deal", type: "text" },
  {
    id: "stage",
    name: "Stage",
    type: "status",
    config: { options: [{ id: "o_ns00000000", label: "Not started", group: "todo" }, { id: "o_bd00000000", label: "Building", group: "doing" }, { id: "o_sh00000000", label: "Shipped", group: "done" }] },
  },
  { id: "owners", name: "Owners", type: "people" },
  { id: "phone", name: "Phone", type: "phone" },
  { id: "took", name: "Took", type: "duration" },
  { id: "stars", name: "Stars", type: "rating" },
  { id: "notes", name: "Notes", type: "long_text" },
  { id: "key", name: "ID", type: "autonumber", config: { prefix: "DEAL" } },
  { id: "made", name: "Made", type: "created_time" },
  { id: "madeBy", name: "Made by", type: "created_by" },
]
const rows = () => [
  { name: "Booth for the launch", stage: "Building", owners: [person(SAM), person(PRIYA)], phone: "+91 98765 43210", took: 5400, stars: 4, notes: "Venue opens at nine\nKeys by eight", key: 1, made: ago(50), madeBy: [person(SAM)] },
  { name: "Printed banners", stage: "Shipped", owners: [person(PRIYA)], phone: "(020) 7946-0958", took: 2700, stars: 5, notes: "Sizes from print", key: 2, made: ago(30), madeBy: [person(PRIYA)] },
  { name: "Power for two screens", stage: "Not started", owners: [], took: 39600, stars: 3, key: 3, made: ago(140), madeBy: [person(SAM)] },
  { name: "", key: 4, made: ago(0.1), madeBy: [person(SAM)] },
]


test("the B1 kinds draw as spec E says, and take what they're given", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const sam = await server.open(browser, testInfo, SAM)
  const page = sam.page
  // A status is its lozenge, with its group's glyph.
  await expect(page.locator('[data-status-group="doing"]').first()).toBeVisible({ timeout: 30_000 })
  // One person shows a first name; two, their faces.
  await expect(page.getByText("Priya", { exact: true })).toBeVisible()
  // A duration in hours and minutes (its box holds it as written); a row's id as its key.
  await expect(page.getByRole("textbox", { name: "Took" }).first()).toHaveValue("1h 30m")
  await expect(page.getByText("DEAL-2")).toBeVisible()
  // The footer counts a status by group, sums the durations, averages the stars.
  await expect(page.locator("[data-summary-bar]")).toContainText("13h 15m")
  await expect(page.locator("[data-summary-bar]")).toContainText("4 ★")

  // A rating: a click on the fifth star of the third row (the second row's fifth is its rating, to clear).
  await page.getByRole("button", { name: "Rate 5 of 5" }).nth(1).click()
  await expect.poll(() => server.valuesOf(2).stars).toBe(5)

  // A status from the combobox, grouped; a pick closes it.
  await page.getByRole("button", { name: "Stage: Not started" }).click()
  await expect(page.getByText("In progress", { exact: true })).toBeVisible()
  await page.getByRole("option", { name: "Building" }).click()
  await expect.poll(() => server.valuesOf(2).stage).toBe("Building")
  await expect(page.locator("[data-status-picker]")).toHaveCount(0)

  // People from the members, faces and all.
  await page.getByRole("button", { name: "Owners: no one" }).first().click()
  await expect(page.locator("[data-people-picker]")).toBeVisible({ timeout: 15_000 })
  await page.getByRole("option", { name: /sam@example\.com/ }).click()
  await expect.poll(() => server.valuesOf(2).owners).toEqual([person(SAM)])
  await page.keyboard.press("Escape")

  // A duration typed as minutes.
  const took = page.getByRole("textbox", { name: "Took" }).nth(3)
  await took.click()
  await took.fill("90")
  await took.press("Tab")
  await expect.poll(() => server.valuesOf(3).took).toBe(5400)

  // A long text in its box: Enter makes a line, Cmd/Ctrl+Enter saves.
  await page.getByRole("button", { name: "Notes: empty" }).first().click()
  const box = page.getByRole("textbox", { name: "Notes" })
  await box.fill("First line")
  await box.press("Enter")
  await box.type("Second line")
  await box.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter")
  await expect.poll(() => server.valuesOf(2).notes).toBe("First line\nSecond line")

  // Nothing writes what a row says of itself.
  expect(server.writes.every((w) => !("key" in ((w.body.values as object) ?? {})) && !("made" in ((w.body.values as object) ?? {})))).toBe(true)
  await sam.close()
})

// The status and people pickers under a finger: SA-3's combobox reaches web beta
// with these cells. Every row takes a finger's 44px (phone.css F3), the row lit
// on opening is the one chosen and not the first, and a tap picks.
test("at 390 under a finger, the status and people pickers' rows take 44px and a tap picks", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
  }, server.id)
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-status-group="doing"]').first()).toBeVisible({ timeout: 60_000 })
  // Rounded, as connectedPanel.spec.ts does: a 44px row can measure 43.99994.
  const rowHeights = (picker: string) => page.locator(`[${picker}] [cmdk-item]`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))

  await page.getByRole("button", { name: "Stage: Building" }).first().tap()
  await expect(page.locator("[data-status-picker]")).toBeVisible()
  // The three statuses, and Clear status under them.
  const statusRows = await rowHeights("data-status-picker")
  expect(statusRows).toHaveLength(4)
  for (const h of statusRows) expect(h, "a status row under a finger").toBeGreaterThanOrEqual(44)
  await expect(page.locator('[data-status-picker] [cmdk-item][data-selected="true"]')).toHaveText("Building")
  await page.getByRole("option", { name: "Shipped" }).tap()
  await expect.poll(() => server.valuesOf(0).stage).toBe("Shipped")
  await expect(page.locator("[data-status-picker]")).toHaveCount(0)

  await page.getByRole("button", { name: "Owners: no one" }).first().tap()
  await expect(page.getByRole("option", { name: /priya@example\.com/ })).toBeVisible({ timeout: 15_000 })
  const peopleRows = await rowHeights("data-people-picker")
  expect(peopleRows).toHaveLength(2)
  for (const h of peopleRows) expect(h, "a person's row under a finger").toBeGreaterThanOrEqual(44)
  await page.getByRole("option", { name: /priya@example\.com/ }).tap()
  await expect.poll(() => server.valuesOf(2).owners).toEqual([person(PRIYA)])
  await context.close()
})

// DESIGN-BUILD-11's S4: on a phone the long text's box saved on any tap away,
// and only Esc, a key a phone hasn't got, put it back. On a phone it opens in
// the shared sheet, titled with the field's name, with Cancel and Save pinned
// under it, each a finger's 44px.
test("at 390 under a finger, a long text opens in a sheet with Cancel and Save under it", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
  }, server.id)
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const notes = page.getByRole("button", { name: "Notes: Venue opens at nine" })
  await expect(notes).toBeVisible({ timeout: 60_000 })
  const wroteNotes = () => server.writes.some((w) => "notes" in ((w.body.values as object) ?? {}))

  await notes.tap()
  const sheet = page.getByRole("dialog", { name: "Notes" })
  await expect(sheet).toBeVisible()
  const box = sheet.getByRole("textbox", { name: "Notes" })
  await expect(box).toHaveValue("Venue opens at nine\nKeys by eight")
  const footer = sheet.locator("[data-sheet-footer]")
  for (const name of ["Cancel", "Save"]) {
    const b = (await footer.getByRole("button", { name }).boundingBox())!
    expect(Math.round(b.height), `${name} under a finger`).toBeGreaterThanOrEqual(44)
  }
  // Cancel puts it back, and nothing is written.
  await box.fill("Venue opens at ten")
  await footer.getByRole("button", { name: "Cancel" }).tap()
  await expect(sheet).toHaveCount(0)
  await expect(notes).toBeVisible()
  expect(wroteNotes()).toBe(false)

  // Save writes it.
  await notes.tap()
  await sheet.getByRole("textbox", { name: "Notes" }).fill("Venue opens at ten\nKeys by eight")
  await sheet.locator("[data-sheet-footer]").getByRole("button", { name: "Save" }).tap()
  await expect.poll(() => server.valuesOf(0).notes).toBe("Venue opens at ten\nKeys by eight")
  await expect(page.getByRole("button", { name: "Notes: Venue opens at ten" })).toBeVisible()
  await context.close()
})

// The sheet was in the cell pickers' chunk, so on a slow line a phone's tap on
// a long text showed nothing until that chunk landed. It's the cell's own now:
// it answers at once, and saves, while the pickers' chunk is still on its way.
test("at 390 under a finger, a long text's sheet answers at once while the pickers' chunk is on its way", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
  }, server.id)
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  // The pickers' chunk is held to the end: a computer's long-text box (data-long-text-editor) marks it.
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (body.includes("data-long-text-editor")) await held
    await route.fulfill({ response, body })
  })
  try {
    await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const notes = page.getByRole("button", { name: "Notes: Venue opens at nine" })
    await expect(notes).toBeVisible({ timeout: 60_000 })
    await notes.tap()
    const sheet = page.getByRole("dialog", { name: "Notes" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("textbox", { name: "Notes" }).fill("Venue opens at ten")
    await sheet.locator("[data-sheet-footer]").getByRole("button", { name: "Save" }).tap()
    await expect.poll(() => server.valuesOf(0).notes).toBe("Venue opens at ten")
  } finally {
    release()
    await context.close()
  }
})

const shots = process.env.TABLE_SHOTS
for (const [width, height] of [
  [1280, 900],
  [390, 844],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`the B1 kinds, ${width} ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!shots, "shots only when TABLE_SHOTS names a folder")
      const server = new TableServer(fields, rows())
      // A finger on a phone, the pointer at a desk.
      const phone = width < 640
      const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width, height }, colorScheme: scheme, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
      const press = (l: Locator) => (phone ? l.tap() : l.click())
      // The grid on a phone too (its list is the default with this many fields), and the first-run tip seen.
      await context.addInitScript((id) => {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
      }, server.id)
      const page = await context.newPage()
      await server.attach(page, testInfo, SAM)
      await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator('[data-status-group="doing"]').first()).toBeVisible({ timeout: 60_000 })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `${shots}/kinds-grid-${width}-${scheme}.png`, animations: "disabled" })
      // The rest of the columns: the grid scrolled until Took starts at the frozen column's edge,
      // so no column the shot is for sits half under it (scrolled to the end, the ID's key did).
      const at = await page.locator("[data-table-grid]").evaluate(async (el, phone) => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
        const edge = () => (el.querySelector("td[data-frozen]") as HTMLElement).getBoundingClientRect().right
        const th = () => [...el.querySelectorAll("th")].find((h) => h.textContent?.includes("Took"))!.getBoundingClientRect()
        // On a phone Took is wider than what's beside the frozen column, so its right edge
        // (where its figures sit) goes to the grid's right edge instead.
        const gap = () => (phone ? th().right - el.getBoundingClientRect().right : th().left - edge())
        for (let i = 0; i < 6 && Math.abs(gap()) > 1; i++) {
          el.scrollLeft += gap()
          await frame()
        }
        return { gap: gap(), left: el.scrollLeft, max: el.scrollWidth - el.clientWidth }
      }, phone)
      console.log(`grid-end ${width}: ${JSON.stringify(at)}`)
      await page.screenshot({ path: `${shots}/kinds-grid-end-${width}-${scheme}.png`, animations: "disabled" })
      await page.locator("[data-table-grid]").evaluate((el) => el.scrollTo({ left: 0 }))
      // The footers, scrolled to.
      await page.locator("[data-summary-bar]").scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${shots}/kinds-footers-${width}-${scheme}.png`, animations: "disabled" })
      // Each picker open: the status's groups, the members, the long text's box.
      await press(page.getByRole("button", { name: "Stage: Building" }).first())
      await expect(page.getByText("In progress", { exact: true })).toBeVisible()
      await page.screenshot({ path: `${shots}/kinds-status-picker-${width}-${scheme}.png`, animations: "disabled" })
      await page.keyboard.press("Escape")
      await expect(page.locator("[data-status-picker]")).toHaveCount(0)
      await press(page.getByRole("button", { name: /^Owners: Sam Rivera, Priya Shah$/ }))
      await expect(page.locator("[data-people-picker]")).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole("option", { name: /priya@example\.com/ })).toBeVisible({ timeout: 15_000 })
      await page.screenshot({ path: `${shots}/kinds-people-picker-${width}-${scheme}.png`, animations: "disabled" })
      await page.keyboard.press("Escape")
      // Its focus goes back to Owners and scrolls the grid there: wait for that before Notes.
      await expect(page.locator("[data-people-picker]")).toHaveCount(0)
      await expect(page.getByRole("button", { name: /^Owners: Sam Rivera, Priya Shah$/ })).toBeFocused()
      await press(page.getByRole("button", { name: "Notes: Venue opens at nine" }))
      const box = page.getByRole("textbox", { name: "Notes" })
      await expect(box).toBeVisible()
      await expect(box).toBeInViewport({ ratio: 1 })
      // Inside the screen, 16 px in, however near the grid's edge the cell is.
      const b = (await box.boundingBox())!
      expect(b.x + b.width).toBeLessThanOrEqual(width - 16 + 1)
      await page.screenshot({ path: `${shots}/kinds-long-text-${width}-${scheme}.png`, animations: "disabled" })
      await context.close()
    })
  }
}
