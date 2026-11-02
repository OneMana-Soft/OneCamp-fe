import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { authFrame, awarenessFrame } from "../scripts/fluidity/fakeCollab.mjs"
import { displayNameOf } from "../lib/personName"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"

// A board's reactions and raised hands (miro-24), between two screens on one collaboration server: a reaction rises
// from under its sender's face and is said to a screen reader; a viewer raises a hand from a phone's sheet, the editor
// hears of it, sees it on the face and in Here now's queue, and lowers it; a viewer's forged lower moves no hand; with
// reduced motion a reaction only fades; and what was on the board as someone opened it never shows them as new.

const BOARD = "b0a4d000-0000-4000-8000-0000000000d4"
const NAME = boardDocName(BOARD)
const LEVELS = { ann: "edit", vic: "view" }
const ANN = displayNameOf(USERS.ann)
const VIC = displayNameOf(USERS.vic)

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

function shareBoard() {
  const board = { uuid: BOARD, title: "Kickoff", levels: LEVELS, update: boardDoc(note("n1", 40, 120, "Agenda")) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
}

/** `handshakeMs`: how long this screen's collaboration socket takes to carry anything (a slow network's handshakes). */
async function open(browser: Browser, on: ReturnType<typeof shareBoard>, user: typeof USERS.ann, use: BrowserContextOptions, handshakeMs?: number) {
  const context = await browser.newContext(use)
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows, beside the test */
    }
  })
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab: on.collab, handshakeMs, fixtures: [...boardFixtures([on.board], user, USERS.ann)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const react = page.locator("[data-board-react]")
  await expect(react).toBeEnabled({ timeout: 20_000 })
  return { context, page, react }
}

/** Someone's face in this screen's stack, by the start of its name. */
const faceOf = (page: Page, name: string) => page.locator(`[data-presence-stack] > [aria-label^="${name}"]`)

/** Where the newest reaction on this screen stands: its x, and what it says to a screen reader. */
const risen = (page: Page) =>
  page.locator("[data-board-reactions] > li").last().evaluate((li) => ({ x: parseFloat((li as HTMLElement).style.left), said: li.querySelector(".sr-only")?.textContent }))

test("a phone's viewer reacts and raises a hand; the editor sees it under the face, lowers it, and a forged lower moves nothing", async ({ browser }) => {
  test.setTimeout(150_000)
  const on = shareBoard()
  const ann = await open(browser, on, USERS.ann, DEVICES.computer)
  const vic = await open(browser, on, USERS.vic, DEVICES.phone)
  await expect(faceOf(ann.page, VIC)).toBeVisible({ timeout: 15_000 })

  // Vic's tray is a sheet on his phone: the window's width, at its foot. A reaction closes it and rises from his button.
  await vic.react.tap()
  const tray = vic.page.locator("[data-board-react-tray]")
  await expect(tray).toBeVisible()
  const sheet = (await tray.boundingBox())!
  expect(sheet.width, "the tray is the window's width").toBeGreaterThan(380)
  expect(sheet.y + sheet.height, "the tray sits at the window's foot").toBeGreaterThan(830)
  await tray.getByRole("button", { name: "Heart" }).tap()
  await expect(tray).toBeHidden()
  await expect(vic.page.locator('[data-board-reactions] > li[data-reaction="mine"]')).toHaveCount(1)

  // On Ann's computer it rises from under Vic's face, and is said once.
  await expect(ann.page.locator("[data-board-reactions] > li")).toHaveCount(1, { timeout: 10_000 })
  const face = (await faceOf(ann.page, VIC).boundingBox())!
  const r = await risen(ann.page)
  expect(r.said).toBe(`${VIC} reacted: Heart`)
  expect(r.x, "it rises under his face").toBeGreaterThanOrEqual(face.x)
  expect(r.x).toBeLessThanOrEqual(face.x + face.width)

  // Vic raises his hand: Ann hears of it, sees it on his face and first in Here now's queue.
  await vic.react.tap()
  await tray.getByRole("button", { name: "Raise hand" }).tap()
  await expect(vic.page.getByRole("button", { name: "React, or lower your hand" })).toBeVisible()
  await expect(ann.page.locator(".toast-root").filter({ hasText: `${VIC} raised a hand` })).toBeVisible({ timeout: 10_000 })
  await expect(faceOf(ann.page, VIC)).toHaveAttribute("aria-label", /hand raised$/)

  // Someone with Vic's viewer link claims an editor's stamp and lowers his hand: the relay restamps it, nothing moves.
  const vicTabs = (await faceOf(ann.page, VIC).getAttribute("data-presence-client"))!.split(" ").map(Number)
  const forger = on.collab.connect(() => {}, () => {})
  forger.receive(authFrame(NAME, USERS.vic.token))
  const state = { user: { id: USERS.vic.user_uuid, name: VIC, edit: true }, lower: vicTabs.map((client, i) => ({ id: `forged-${i}`, client })) }
  forger.receive(awarenessFrame(NAME, [{ clientId: 434343, clock: 1, state }]))
  await ann.page.waitForTimeout(1500)
  await expect(vic.page.getByRole("button", { name: "React, or lower your hand" }), "a viewer's lower moves no hand").toBeVisible()
  await expect(faceOf(ann.page, VIC)).toHaveAttribute("aria-label", /hand raised$/)
  forger.closed()

  // Ann lowers it from Here now: Vic's tab drops it and is told who did.
  await ann.page.locator("[data-presence-stack]").click()
  const row = ann.page.locator("[data-hand-row]")
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(VIC)
  await row.getByRole("button", { name: `Lower ${VIC}'s hand` }).click()
  await expect(vic.page.locator(".toast-root").filter({ hasText: `${ANN} lowered your hand` })).toBeVisible({ timeout: 10_000 })
  await expect(vic.page.getByRole("button", { name: "React or raise your hand" })).toBeVisible()
  await expect(faceOf(ann.page, VIC)).not.toHaveAttribute("aria-label", /hand raised/, { timeout: 10_000 })
  for (const c of [vic, ann]) await c.context.close()
})

test("on a computer a reaction from the header's popover rises under its sender's face, and with reduced motion only fades", async ({ browser }) => {
  test.setTimeout(120_000)
  const on = shareBoard()
  const ann = await open(browser, on, USERS.ann, DEVICES.computer)
  const vic = await open(browser, on, USERS.vic, { ...DEVICES.computer, reducedMotion: "reduce" })
  await expect(faceOf(vic.page, ANN)).toBeVisible({ timeout: 15_000 })

  // Ann's tray is a popover under her button, not a sheet.
  await ann.react.click()
  const tray = ann.page.locator("[data-board-react-tray]")
  await expect(tray).toBeVisible()
  expect((await tray.boundingBox())!.width, "a popover, not the window's width").toBeLessThan(400)
  await tray.getByRole("button", { name: "Thumbs up" }).click()

  await expect(vic.page.locator("[data-board-reactions] > li")).toHaveCount(1, { timeout: 10_000 })
  const face = (await faceOf(vic.page, ANN).boundingBox())!
  const r = await risen(vic.page)
  expect(r.said).toBe(`${ANN} reacted: Thumbs up`)
  expect(r.x).toBeGreaterThanOrEqual(face.x)
  expect(r.x).toBeLessThanOrEqual(face.x + face.width)
  // Reduced motion: its animation changes only its opacity.
  const moves = await vic.page
    .locator("[data-board-reactions] > li")
    .last()
    .evaluate((li) => li.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().map((k) => k.transform ?? null)))
  expect(moves.filter(Boolean), "nothing moves").toEqual([])
  for (const c of [vic, ann]) await c.context.close()
})

// Here now is drawn as soon as the board has its connection, before the first sync brings who is already on it (CODE-
// REVIEW-LOG row 2308). Ann's network is slow (her socket's handshakes take 2.5 s), so it is drawn well before. A
// reaction or hand that was there as she opened the board was said before she came: on a computer his hand shows on
// his face and in the queue (a phone draws no faces), but nothing rises and nothing tells her he raised it. What he
// sends next does.
for (const device of ["computer", "phone"] as const) {
  test(`on a ${device}, a reaction and a raised hand sent before someone opens the board never show to them as new, and the next ones do`, async ({ browser }) => {
    test.setTimeout(150_000)
    const on = shareBoard()
    const vic = await open(browser, on, USERS.vic, DEVICES.computer)
    const tray = vic.page.locator("[data-board-react-tray]")
    await vic.react.click()
    await tray.getByRole("button", { name: "Heart" }).click()
    await expect(vic.page.locator('[data-board-reactions] > li[data-reaction="mine"]')).toHaveCount(1)
    await vic.react.click()
    await tray.getByRole("button", { name: "Raise hand" }).click()
    await expect(vic.page.getByRole("button", { name: "React, or lower your hand" })).toBeVisible()

    // Ann, an editor, opens the board cold, on a slow network.
    const ann = await open(browser, on, USERS.ann, DEVICES[device], 2500)
    const computer = device === "computer"
    if (computer) await expect(faceOf(ann.page, VIC)).toHaveAttribute("aria-label", /hand raised$/, { timeout: 15_000 })

    // For three seconds nothing he said before she came rises, and nothing tells her he raised his hand.
    const rising = ann.page.locator("[data-board-reactions] > li")
    const handToast = ann.page.locator(".toast-root").filter({ hasText: `${VIC} raised a hand` })
    for (let i = 0; i < 15; i++) {
      expect(await rising.count(), "a reaction sent before she came rises").toBe(0)
      expect(await handToast.count(), "she is told of a hand raised before she came").toBe(0)
      await ann.page.waitForTimeout(200)
    }
    // Here now's queue still has his hand.
    if (computer) {
      await ann.page.locator("[data-presence-stack]").click()
      await expect(ann.page.locator("[data-hand-row]")).toHaveCount(1)
      await expect(ann.page.locator("[data-hand-row]")).toContainText(VIC)
      await ann.page.keyboard.press("Escape")
      await expect(ann.page.locator("[data-hand-row]")).toHaveCount(0)
    }

    // What he sends next is news: a new reaction rises, once, and a hand raised again is told.
    await vic.react.click()
    await tray.getByRole("button", { name: "Thumbs up" }).click()
    await expect(rising).toHaveCount(1, { timeout: 10_000 })
    expect((await risen(ann.page)).said).toBe(`${VIC} reacted: Thumbs up`)
    await vic.react.click()
    await tray.getByRole("button", { name: "Lower hand" }).click()
    await expect(vic.page.getByRole("button", { name: "React or raise your hand" })).toBeVisible()
    if (computer) await expect(faceOf(ann.page, VIC)).not.toHaveAttribute("aria-label", /hand raised/, { timeout: 10_000 })
    await vic.react.click()
    await tray.getByRole("button", { name: "Raise hand" }).click()
    await expect(handToast).toBeVisible({ timeout: 10_000 })
    await expect(rising).toHaveCount(1)
    for (const c of [vic, ann]) await c.context.close()
  })
}
