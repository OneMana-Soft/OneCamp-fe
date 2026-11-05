import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import type * as Y from "yjs"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { displayNameOf } from "../lib/personName"
import { boardDoc, boardDocName, boardFixtures, boardInfo, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"
import { topAtMiddle } from "./layers"

// Protected objects on a board (miro-44, Miro's Protected Lock): the board's owner or a workspace admin protects
// objects from the selection's bar, and lifts the protection there. Everyone sees a lock badge on a protected object,
// named for who protected it. An editor who selects one is told who did, gets no Protect or Lift, and is told at once
// that the server puts back their change (Excalidraw's Unlock). The API's POST /board/protect is answered here as the
// collaboration server's protect op answers it (live/ops/protect.js: the record and the objects, with a shape's words,
// in one change); the put-back itself is proven on the server (P-be: the relay's own tests).

const BOARD = "b0a4d000-0000-4000-8000-0000000000e4"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit" }
const SAM = displayNameOf(USERS.sam)

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; version: number; versionNonce?: number; locked?: boolean; isDeleted?: boolean; containerId?: string | null }
type Collab = ReturnType<typeof collabFor>
type Doc = Y.Doc

/** The protect op, as the collaboration server makes it: the record and the objects (and a shape's words) together. */
function protectOp(doc: Doc, ids: string[], protect: boolean, by: typeof USERS.sam): number {
  const elements = doc.getMap("elements")
  const record = doc.getMap("protected")
  const named = new Set(ids)
  const withText = new Set(ids)
  elements.forEach((v: unknown, id: string) => {
    if ((v as Shared)?.containerId && named.has((v as Shared).containerId!)) withText.add(id)
  })
  let changed = 0
  for (const id of withText) {
    const v = elements.get(id) as Shared | undefined
    if (record.has(id) === protect) continue
    if (protect) {
      if (!v || v.isDeleted) continue
      record.set(id, { by: by.user_uuid, name: displayNameOf(by), at: Date.now() })
    } else record.delete(id)
    if (v) elements.set(id, { ...v, locked: protect, version: v.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) })
    if (named.has(id)) changed++
  }
  return changed
}

function shareBoard({ boxProtected = false } = {}) {
  const elements = [...note("venue", 40, 120, "Book the venue"), shape("box", "rectangle", 320, 120, 160, 100, { fill: "#DCE8FF" })]
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(ordered(elements)) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  if (boxProtected) collab.edit(NAME, (doc: Doc) => protectOp(doc, ["box"], true, USERS.sam))
  return { board, collab, asked: [] as Array<{ board_uuid: string; element_ids: string[]; protect: boolean }> }
}

async function open(browser: Browser, device: keyof typeof DEVICES, on: ReturnType<typeof shareBoard>, user = USERS.sam) {
  const { board, collab } = on
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the objects are then elsewhere, and the test says so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  const fixtures: Array<[RegExp, unknown]> = [
    // The board's owner may protect (getBoardInfo's board_can_protect); an editor may not.
    [/\/board\/getBoardInfo\/[^/]+$/, () => ({ msg: "ok", data: { ...boardInfo(board, user, USERS.sam), board_can_protect: user === USERS.sam } })],
    [
      /\/board\/protect$/,
      (_path: string, _url: string, req: { postDataJSON(): { board_uuid: string; element_ids: string[]; protect: boolean } }) => {
        const body = req.postDataJSON()
        on.asked.push(body)
        let changed = 0
        collab.edit(NAME, (doc: Doc) => {
          changed = protectOp(doc, body.element_ids, body.protect, user)
        })
        return { changed }
      },
    ],
    ...boardFixtures([board], user, USERS.sam),
  ]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

/** What the collaboration server holds for an element: its record and its lock. */
function server(collab: Collab) {
  const doc = () => collab.doc(NAME)
  return {
    protectedIds: () => Array.from(doc().getMap("protected").keys()).sort(),
    locked: (id: string) => (doc().getMap("elements").get(id) as Shared | undefined)?.locked === true,
  }
}

async function pressAt(page: Page, device: keyof typeof DEVICES, x: number, y: number) {
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  if (device === "phone") await page.touchscreen.tap(canvas.x + x, canvas.y + y)
  else await page.mouse.click(canvas.x + x, canvas.y + y)
}

for (const device of ["computer", "phone"] as const) {
  test(`the board's owner protects a note from its bar, everyone sees who did, and the owner lifts it (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const on = shareBoard()
    const held = server(on.collab)
    const { context, page } = await open(browser, device, on)
    const press = device === "phone" ? "tap" : "click"

    // The note's bar offers Protect, last.
    await pressAt(page, device, 130, 150)
    const notesBar = page.locator("[data-notes-bar]")
    await notesBar.getByRole("button", { name: "Protect 1 object" })[press]()

    // The server holds the note and its words protected and locked, named for the owner.
    await expect.poll(() => held.protectedIds(), { timeout: 10_000 }).toEqual(["venue", "venue-label"])
    expect(on.asked).toEqual([{ board_uuid: BOARD, element_ids: ["venue"], protect: true }])
    expect(held.locked("venue")).toBe(true)
    await expect(page.getByText("Protected 1 object").first()).toBeVisible()
    // One badge, on the note (its words are protected with it), named for who protected it.
    const badge = page.locator('[data-protected-of="venue"] [data-protected-badge]')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute("data-tip", `Protected by ${SAM}`)
    await expect(page.locator("[data-protected-of]")).toHaveCount(1)
    // The owner's own press writes nothing of this tab's to the protected note: no put-back toast (CR-218 M1).
    await expect(page.getByText("This is protected")).toHaveCount(0)

    // Protected, the note has no notes bar: who protected it, and Lift protection.
    await expect(notesBar).toHaveCount(0)
    const bar = page.locator("[data-protect-bar]")
    await expect(bar.locator("[data-protected-by]")).toHaveText(`Protected by ${SAM}`)
    // Nor Excalidraw's style panel, which would change nothing that stays: the bar and the badge are its only chrome,
    // and on a computer nothing is drawn over the badge (DB-113 F1: the panel buried the note at the board's left).
    await expect(page.locator(".App-menu__left")).toBeHidden()
    if (device === "computer") expect(await topAtMiddle(badge)).toBe(true)
    await bar.getByRole("button", { name: "Lift protection from 1 object" })[press]()
    await expect.poll(() => held.protectedIds(), { timeout: 10_000 }).toEqual([])
    expect(held.locked("venue")).toBe(false)
    await expect(page.locator("[data-protected-of]")).toHaveCount(0)
    await expect(page.locator("[data-notes-bar]").getByRole("button", { name: "Protect 1 object" })).toBeVisible()
    await expect(page.getByText("This is protected")).toHaveCount(0)
    await context.close()
  })
}

test("an editor sees who protected a shape, can't protect or lift, and is told the server puts back their Unlock", async ({ browser }) => {
  test.setTimeout(120_000)
  const on = shareBoard({ boxProtected: true })
  const { context, page } = await open(browser, "computer", on, USERS.ann)
  const badge = page.locator('[data-protected-of="box"] [data-protected-badge]')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute("data-tip", `Protected by ${SAM}`)

  // An unprotected note's bar offers Ann no Protect.
  await pressAt(page, "computer", 130, 150)
  await expect(page.locator("[data-notes-bar]")).toBeVisible()
  await expect(page.getByRole("button", { name: /^Protect/ })).toHaveCount(0)
  await page.keyboard.press("Escape")

  // A right press selects the protected shape and opens Excalidraw's menu. The bar beside the selection steps aside
  // while the menu is open, so it never lies across one of the menu's rows (DB-113 F2).
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  const rightPress = () => page.mouse.click(canvas.x + 400, canvas.y + 170, { button: "right" })
  await rightPress()
  const menu = page.locator(".context-menu")
  await expect(menu).toBeVisible()
  const bar = page.locator("[data-protect-bar]")
  await expect(bar.locator("[data-protected-by]")).toHaveText(`Protected by ${SAM}`)
  await expect(bar).toBeHidden()
  // The menu closed, the shape still selected: who protected it, nothing to press, and none of Excalidraw's style
  // panel, whose changes the server would put back (DB-113 F1).
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(bar).toBeVisible()
  await expect(bar.locator("[data-protected-by]")).toHaveText(`Protected by ${SAM}`)
  await expect(bar.getByRole("button")).toHaveCount(0)
  await expect(page.locator(".App-menu__left")).toBeHidden()
  // Excalidraw's Unlock: the server puts it back, and the tab says why at once.
  await rightPress()
  await menu.getByText("Unlock", { exact: true }).click()
  await expect(page.getByText("This is protected").first()).toBeVisible()
  await expect(page.getByText(`Only the board's owner and admins can change it or lift its protection. ${SAM} protected it.`).first()).toBeVisible()
  expect(on.asked).toEqual([])
  await context.close()
})
