import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// REGRESSION-HUNT F9 (26 Oct): a board's lane draws its first 50 cards, in the view's order, and a card moved into
// a lane holding 50 or more took its place by that order, past them: it was drawn nowhere ("Show more" found it),
// and after a move from the keyboard the focus fell to <body> and came back later from nowhere. A card moved into a
// lane is now drawn where it was put, last in what the lane draws (as a row added in the grid is kept in sight), and
// stays there with its focus once the save answers, whatever the view's sort then says, and the lane draws no more.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
]
// `doneCards` cards done, then the one that moves: last in the table, so last in Done once there.
const work = (doneCards = 55) => new TableServer(fields, [...Array.from({ length: doneCards }, (_, i) => ({ item: `Done ${i + 1}`, stage: "Done" })), { item: "Late card", stage: "To do" }])
const lateOf = (server: TableServer) => server.rows.length - 1
const done = (page: Page) => page.locator('[data-lane="o_done000000"]')
/** A card by its title, in the page or in one lane. `has` looks inside each card, so the title is found by the page's
 *  locator: the lane's would look for the lane inside the card, and match nothing. */
const card = (page: Page, name: string, lane?: Locator) => (lane ?? page).locator("[data-card-id]").filter({ has: page.getByText(name, { exact: true }) })
const drawn = (page: Page) => done(page).locator("[data-card-id]")
/** Done draws its first 50 of 55 before the move: the lane is found, and the moved card would land past its window. */
const doneAtItsWindow = (page: Page) => expect(drawn(page)).toHaveCount(50)
/** After the move, Done draws its first 50, then the moved card, and says 5 are left: the moved card isn't counted again. */
async function doneDrawsItsWindowAndTheMovedCard(page: Page) {
  await expect(drawn(page)).toHaveCount(51)
  await expect(drawn(page).last()).toContainText("Late card")
  await expect(done(page).getByRole("button", { name: "Show 5 more" })).toBeVisible()
}

// Sorted by Stage, ascending, To do before Done: a card moved to Done sorts with To do until the save answers, then
// among Done by the table's order, last.
const BY_STAGE = "5a7e0000-0000-4000-8000-0000000000f9"
/** The table opened at 1280 on its board view sorted by Stage. */
async function openSortedByStage(browser: Browser, testInfo: TestInfo, server: TableServer) {
  server.savedViews = [{ id: BY_STAGE, table_id: server.id, name: "By stage", type: "board", config: JSON.stringify({ rules: { sort: [{ field: "stage", dir: "asc" }], match: "all", filters: [] } }), position: 0 }]
  const opened = await server.open(browser, testInfo, SAM)
  await opened.page.goto(`/app/tables/${server.id}?v=${BY_STAGE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return opened
}

/** Moves the late card with `move`, then waits for the board to draw the save's answer: the table reads the card's row
 *  again, by id (tables A7), and the next frames draw what it read. */
async function moveAndAnswer(page: Page, server: TableServer, move: () => Promise<void>) {
  const late = server.rows[lateOf(server)].id
  const read = page.waitForResponse((r) => r.request().method() === "GET" && (new URL(r.url()).searchParams.get("ids") ?? "").split(",").includes(late))
  await move()
  await (await read).finished()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(server.valuesOf(lateOf(server)).stage).toBe("Done")
}
/** Counts, from now on, the times the late card's node leaves Done. A node React places anew drops its focus to <body>
 *  in a browser that fixes the focus up at once (Safari, Firefox); Chromium does it at its next rendering, by when the
 *  node is back, so a focus check alone would pass there. */
async function watchLateNode(page: Page, server: TableServer) {
  await page.evaluate((id) => {
    const w = window as unknown as { lateLeft: number }
    w.lateLeft = 0
    const lane = document.querySelector('[data-lane="o_done000000"]')
    const isLate = (n: Node) => n instanceof Element && (n.getAttribute("data-card-id") === id || n.querySelector(`[data-card-id="${id}"]`) !== null)
    if (lane) new MutationObserver((records) => records.forEach((r) => r.removedNodes.forEach((n) => isLate(n) && w.lateLeft++))).observe(lane, { childList: true, subtree: true })
  }, server.rows[lateOf(server)].id)
  return () => page.evaluate(() => (window as unknown as { lateLeft: number }).lateLeft)
}
/** Picks the late card up from the keyboard, carries it right into Done, and puts it down. */
async function byKeys(page: Page) {
  await card(page, "Late card").focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Space")
  await expect(page.locator("[data-board-said]")).toHaveText("Moved to Done.")
}

test("at 1280, by keyboard, a card moved into a lane of 55 is drawn after its first 50 with the focus, and K goes on from it", async ({ browser }, testInfo) => {
  const server = work()
  const { page, close } = await server.open(browser, testInfo, SAM)
  await page.getByRole("button", { name: "Board" }).click()
  await doneAtItsWindow(page)
  await moveAndAnswer(page, server, () => byKeys(page))
  await expect(card(page, "Late card", done(page))).toBeFocused()
  await doneDrawsItsWindowAndTheMovedCard(page)
  await page.keyboard.press("k")
  await expect(card(page, "Done 50", done(page))).toBeFocused()
  await close()
})

test("at 1280, by mouse, a card dragged into a lane of 55 is drawn after its first 50", async ({ browser }, testInfo) => {
  const server = work()
  const { page, close } = await server.open(browser, testInfo, SAM)
  await page.getByRole("button", { name: "Board" }).click()
  await doneAtItsWindow(page)
  const from = await card(page, "Late card").boundingBox()
  const to = await done(page).boundingBox()
  if (!from || !to) throw new Error("no card or lane")
  await moveAndAnswer(page, server, async () => {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 })
    await page.mouse.up()
  })
  await expect(card(page, "Late card", done(page))).toBeVisible()
  await doneDrawsItsWindowAndTheMovedCard(page)
  await close()
})

test("at 390, by touch, a card moved with Move to into a lane of 55 is drawn after its first 50", async ({ browser }, testInfo) => {
  const server = work()
  const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await page.getByRole("button", { name: "Board" }).tap()
  await doneAtItsWindow(page)
  await moveAndAnswer(page, server, async () => {
    await page.getByRole("button", { name: "Move Late card" }).tap()
    await page.getByRole("menuitem", { name: "Done" }).tap()
  })
  await expect(card(page, "Late card", done(page))).toBeAttached()
  await expect(drawn(page)).toHaveCount(51)
  await close()
})

test("at 1280, by keyboard, in a view sorted by Stage, a card moved into a lane of 55 stays drawn there with the focus once the save answers", async ({ browser }, testInfo) => {
  const server = work()
  const { page, close } = await openSortedByStage(browser, testInfo, server)
  await doneAtItsWindow(page)
  await moveAndAnswer(page, server, () => byKeys(page))
  await expect(card(page, "Late card", done(page))).toBeFocused()
  await doneDrawsItsWindowAndTheMovedCard(page)
  await close()
})

test("at 1280, by keyboard, in a view sorted by Stage, a card moved into a short lane keeps the focus once the save answers", async ({ browser }, testInfo) => {
  const server = work(3)
  const { page, close } = await openSortedByStage(browser, testInfo, server)
  await expect(drawn(page)).toHaveCount(3)
  const left = await watchLateNode(page, server)
  await moveAndAnswer(page, server, () => byKeys(page))
  await expect(card(page, "Late card", done(page))).toBeFocused()
  await expect(drawn(page).last()).toContainText("Late card")
  expect(await left(), "the card's node stays put through the answer").toBe(0)
  await close()
})
