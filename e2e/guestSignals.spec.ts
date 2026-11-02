import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { displayNameOf } from "../lib/personName"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"

// A share link's guest reacts and raises a hand (miro-24 W3-B2), on one collaboration server with a member's board: the
// guest's reaction rises on the editor's screen under the guest's name, the editor hears of the guest's hand and lowers
// it, and the guest, who may not edit, hears of no one's hand. A reaction sent before the guest came never rises for
// them. The server's naming of guests, and its drop of a guest's lower, are pinned by the collaboration service's
// presenceGuard.test.js; a forged lower's drop by tabs, by boardSignals.spec.ts.

const BOARD = "b0a4d000-0000-4000-8000-0000000000d5"
const NAME = boardDocName(BOARD)
const TOKEN = "gs-link-token"
const LEVELS = { ann: "edit", guest: "view" }
const ANN = displayNameOf(USERS.ann)

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

function shareBoard() {
  const board = { uuid: BOARD, title: "Kickoff", levels: LEVELS, update: boardDoc(note("n1", 40, 120, "Agenda")) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
}

async function openMember(browser: Browser, on: ReturnType<typeof shareBoard>) {
  const context = await browser.newContext(DEVICES.computer)
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows, beside the test */
    }
  })
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.ann, docs: [], collab: on.collab, fixtures: [...boardFixtures([on.board], USERS.ann, USERS.vic)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await expect(page.locator("[data-board-react]")).toBeEnabled({ timeout: 20_000 })
  return page
}

/** `handshakeMs`: how long the guest's collaboration socket takes to carry anything (a slow network's handshakes). */
async function openGuest(browser: Browser, on: ReturnType<typeof shareBoard>, use: BrowserContextOptions, handshakeMs?: number) {
  const context = await browser.newContext(use)
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Kickoff", workspace_name: "Acme" }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: on.collab, handshakeMs, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${TOKEN}`)
  const react = page.locator("[data-board-react]")
  await expect(react).toBeEnabled({ timeout: 30_000 })
  return { page, react, tray: page.locator("[data-board-react-tray]") }
}

test("a link's guest on a phone reacts and raises a hand; the editor sees the reaction, hears of the hand and lowers it", async ({ browser }) => {
  test.setTimeout(150_000)
  const on = shareBoard()
  const ann = await openMember(browser, on)
  const guest = await openGuest(browser, on, DEVICES.phone)

  // The guest's tray is a sheet at the phone's foot; a reaction rises from their button, and on Ann's screen, named.
  await guest.react.tap()
  await expect(guest.tray).toBeVisible()
  const sheet = (await guest.tray.boundingBox())!
  expect(sheet.width, "the tray is the window's width").toBeGreaterThan(380)
  await guest.tray.getByRole("button", { name: "Heart" }).tap()
  await expect(guest.tray).toBeHidden()
  await expect(guest.page.locator('[data-board-reactions] > li[data-reaction="mine"]')).toHaveCount(1)
  await expect(ann.locator("[data-board-reactions] > li")).toHaveCount(1, { timeout: 10_000 })
  await expect(ann.locator("[data-board-reactions] > li .sr-only")).toHaveText("Guest reacted: Heart")

  // The guest raises a hand: Ann hears of it and lowers it from the toast; the guest's hand comes down, and they are told.
  await guest.react.tap()
  await guest.tray.getByRole("button", { name: "Raise hand" }).tap()
  await expect(guest.page.getByRole("button", { name: "React, or lower your hand" })).toBeVisible()
  const heard = ann.locator(".toast-root").filter({ hasText: "Guest raised a hand" })
  await expect(heard).toBeVisible({ timeout: 10_000 })
  await heard.getByRole("button", { name: "Lower" }).click()
  await expect(guest.page.getByRole("button", { name: "React or raise your hand" })).toBeVisible({ timeout: 10_000 })
  await expect(guest.page.locator(".toast-root").filter({ hasText: `${ANN} lowered your hand` })).toBeVisible()

  // Ann raises her hand: the guest, who may not edit, hears of no one's hand and is offered no Lower.
  await ann.locator("[data-board-react]").click()
  await ann.locator("[data-board-react-tray]").getByRole("button", { name: "Raise hand" }).click()
  await guest.page.waitForTimeout(1500)
  await expect(guest.page.locator(".toast-root").filter({ hasText: "raised a hand" })).toHaveCount(0)
  await expect(guest.page.getByRole("button", { name: /^Lower/ })).toHaveCount(0)
})

// A guest's board counts as opened at its first sync, as a member's does: the guest viewer passes its own `synced` to
// the board's signal hooks (CODE-REVIEW-LOG rows 2311 and 2312). The guest's network is slow (their socket's handshakes
// take 2.5 s), so their React button is in well before the board's drawing. A reaction Ann sent before the guest came
// was said before they came, and nothing rises; what she sends next does.
for (const device of ["computer", "phone"] as const) {
  test(`on a ${device}, a reaction sent before a link's guest opens the board never rises for them, and the next one does`, async ({ browser }) => {
    test.setTimeout(150_000)
    const on = shareBoard()
    const ann = await openMember(browser, on)
    const annTray = ann.locator("[data-board-react-tray]")
    await ann.locator("[data-board-react]").click()
    await annTray.getByRole("button", { name: "Heart" }).click()
    await expect(ann.locator('[data-board-reactions] > li[data-reaction="mine"]')).toHaveCount(1)

    // The guest opens the board cold, on a slow network. From the moment their React button is in until three seconds
    // after the board's drawing came (its first sync), nothing Ann said before they came rises.
    const guest = await openGuest(browser, on, DEVICES[device], 2500)
    const rising = guest.page.locator("[data-board-reactions] > li")
    const drawn = guest.page.locator('[data-guest-board][data-board-elements]:not([data-board-elements="0"])')
    for (let i = 0, quiet = 0; quiet < 15; i++) {
      expect(i, "the board's drawing comes within 30 s").toBeLessThan(150)
      expect(await rising.count(), "a reaction sent before the guest came rises").toBe(0)
      if (quiet > 0 || (await drawn.count()) > 0) quiet++
      await guest.page.waitForTimeout(200)
    }

    // What Ann sends next is news: it rises on the guest's screen, once, under her name.
    await ann.locator("[data-board-react]").click()
    await annTray.getByRole("button", { name: "Thumbs up" }).click()
    await expect(rising).toHaveCount(1, { timeout: 10_000 })
    await expect(rising.locator(".sr-only")).toHaveText(`${ANN} reacted: Thumbs up`)
  })
}

test("on a computer a link's guest reacts from a popover under the React button", async ({ browser }) => {
  test.setTimeout(120_000)
  const on = shareBoard()
  const guest = await openGuest(browser, on, DEVICES.computer)
  // Excalidraw's zoom stays the guest's (DB-82 F1): each control is what a press at its middle reaches, with the
  // React button beside them and with its tray open.
  const zoom = guest.page.locator(".zoom-out-button, .reset-zoom-button, .zoom-in-button")
  await expect(zoom).toHaveCount(3)
  const reached = () =>
    zoom.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !!at && el.contains(at)
      }),
    )
  expect(await reached(), "zoom out, 100% and zoom in, each reached at its middle").toEqual([true, true, true])
  await guest.react.click()
  await expect(guest.tray).toBeVisible()
  expect(await reached(), "the tray leaves the zoom clear").toEqual([true, true, true])
  const card = (await guest.tray.boundingBox())!
  expect(card.width, "a card, not a sheet").toBeLessThan(400)
  await guest.tray.getByRole("button", { name: "Heart" }).click()
  await expect(guest.tray).toBeHidden()
  await expect(guest.page.locator('[data-board-reactions] > li[data-reaction="mine"]')).toHaveCount(1)
})
