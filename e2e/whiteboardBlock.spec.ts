import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import * as Y from "yjs"
import { boardDoc, image, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { groundOf, pixelsAt, spreadOf } from "./contrast"
import { CollabRelay } from "./docs/collabRelay"
import { docInfo, stubBackend } from "./stubbedApp"

// A whiteboard in a doc (miro-34, Miro's board in a doc): "/whiteboard" picks
// a board the reader can open, and the doc shows it live, read-only, as the
// reader may see it, with its name and Open board. The canvas stays still
// until the reader asks to look around, so the doc scrolls past it; Escape
// stills it again. Its pictures come through the board's own route, by the
// member's access, as on the board's page. The doc and the board are answered
// in this process (CollabRelay), the board holding a note and a picture.

const DOC = "7d1e0000-0000-4000-8000-0000000000d1"
const BOARD = "b0a4d000-0000-4000-8000-0000000000b1"
const GUEST_LINK = "wbGuestLink0001"
/** The board's picture: its element, and its "files" entry naming the stored object (fakeBoard's own id for it). */
const PICTURE = image("pic", 320, 80)
/**
 * A 1×1 PNG: what the board's picture route redirects to. Opaque blue, so the picture is seen where it stands: a
 * clear one left its slot looking empty, and the fitted drawing looked pushed to one side (DB-103's H-b look).
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOwbvoGAAKvAbS3T615AAAAAElFTkSuQmCC", "base64")

/** A region of the page, by its box: its pixels as drawn, and how many there are in a row. */
async function shot(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const px = await pixelsAt(page, clip)
  return { px, row: Math.round(Math.sqrt(((px.length / 4) * clip.width) / clip.height)) }
}

/** How far the drawing's middle sits from the stage's, as a share of its width: the pixels off the canvas's ground, above the pill's row. */
/** The drawing's ink across the stage: how far it sits in from the stage's left and right sides (px), and how far its
 * middle is off the stage's (a share of the width). The pill's strip at the foot is left out. */
async function inkAcross(page: Page, stage: Locator) {
  const box = (await stage.boundingBox())!
  const clip = { x: Math.ceil(box.x) + 4, y: Math.ceil(box.y) + 4, width: Math.floor(box.width) - 8, height: Math.floor(box.height) - 64 }
  const { px, row } = await shot(page, clip)
  const ground = groundOf(px)
  let left = Infinity
  let right = -Infinity
  for (let i = 0; i < px.length; i += 4) {
    if (Math.max(Math.abs(px[i] - ground.r), Math.abs(px[i + 1] - ground.g), Math.abs(px[i + 2] - ground.b)) < 48) continue
    const x = (i / 4) % row
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  if (left === Infinity) return { offCentre: 1, left: 0, right: 0 }
  return { offCentre: Math.abs((left + right) / 2 - row / 2) / row, left: left + 4, right: row - 1 - right + 4 }
}

async function offCentre(page: Page, stage: Locator) {
  return (await inkAcross(page, stage)).offCentre
}

/** The colour drawn along the stage's inner top edge, middle third: its ground. */
async function topEdge(page: Page, stage: Locator) {
  const box = (await stage.boundingBox())!
  return groundOf((await shot(page, { x: Math.ceil(box.x + box.width / 3), y: Math.ceil(box.y), width: Math.floor(box.width / 3), height: 2 })).px)
}

/** Every button and link in the block has a name a screen reader says. */
async function everyControlNamed(block: Locator) {
  // The ones without: their markup, so a failure says which.
  const bare = await block.locator("button, a[href], [role=button]").evaluateAll((es) =>
    es
      .filter((e) => !e.closest("[inert]") && (e as HTMLElement).offsetParent !== null)
      .filter((e) => !(e.getAttribute("aria-label") || e.getAttribute("title") || e.getAttribute("aria-labelledby") || e.textContent || "").trim())
      .map((e) => e.outerHTML.slice(0, 160)),
  )
  for (const role of ["button", "link"] as const) {
    await expect(block.getByRole(role, { name: /\S/ }), `every ${role} in the block has a name; without: ${bare.join(" | ")}`).toHaveCount(
      await block.getByRole(role).count(),
    )
  }
}

async function openDoc(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch notes", doc_body: "", edit: true }),
    "/board/getBoardList": { msg: "ok", data: { boards: [{ board_uuid: BOARD, board_title: "Launch flow" }], count: 1 } },
    "/entities": { msg: "ok", data: [{ kind: "board", id: BOARD, access: "ok", data: { title: "Launch flow" } }] },
    // The board opens its collaboration session with a token of the member's own.
    "/auth/token": { data: { token: "e2e-sam" } },
    // The doc's public link, for its guest: the session the guest page opens the doc with, and no comments yet.
    [`/guest/collab/${GUEST_LINK}`]: {
      msg: "ok",
      data: { collab_token: "guest", document_name: DOC, resource_type: "doc", resource_id: DOC, capability: "view", title: "Launch notes", workspace_name: "Acme Studio" },
    },
    [`/guest/doc-comments/${GUEST_LINK}`]: { msg: "ok", data: { capability: "view", workspace_name: "Acme Studio", comments: [] } },
  })
  // Registered after the stubs, so it answers first: every picture read, by its path.
  const pictures: string[] = []
  await page.route(/\/(board\/getBoardAttachment|guest\/board-attachment)\//, (route) => {
    pictures.push(new URL(route.request().url()).pathname)
    const origin = route.request().headers()["origin"]
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: origin ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true" } : { "access-control-allow-origin": "*" },
      body: PNG,
    })
  })
  const relay = new CollabRelay()
  Y.applyUpdate(relay.doc(`board:${BOARD}`), boardDoc(ordered([...note("n1", 60, 80, "Ship the flow"), PICTURE.element]), [PICTURE.file]))
  await relay.attach(page, "Sam")
  // The keys tip (onboarding/KeyboardTip) opens over the doc after a while on a computer: it would sit over the stage's
  // pixels that the fit checks read.
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const body = page.getByRole("textbox", { name: "Launch notes" })
  await expect(body).toBeVisible({ timeout: 30_000 })
  return { body, pictures, relay }
}

/** "/whiteboard", then the board picked: the block it leaves in the doc. */
async function addWhiteboard(page: Page, body: ReturnType<Page["getByRole"]>, touch: boolean, held = 0) {
  // On a phone an empty doc's import hint sits over the body's middle: the caret goes in by focus there. A doc that
  // holds the block already ends with it, so the caret goes in as a reader puts it there: a tap or click under the
  // block opens a line below it (focus and Ctrl+End leave the caret beside the block, where typing goes nowhere).
  if (held > 0) {
    await body.evaluate((e) => e.scrollIntoView({ block: "end" }))
    const b = (await body.boundingBox())!
    const [x, y] = [b.x + b.width / 2, b.y + b.height - 4]
    await (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y))
  } else await (touch ? body.focus() : body.click())
  await page.keyboard.type("/whiteboard")
  const entry = page.getByRole("option", { name: /^Whiteboard/ })
  await (touch ? entry.tap() : entry.click())
  const row = page.getByRole("dialog").getByRole("button", { name: /Launch flow/ })
  await (touch ? row.tap() : row.click())
  const blocks = page.locator("[data-whiteboard-embed]")
  await expect(blocks).toHaveCount(held + 1, { timeout: 15_000 })
  const block = blocks.last()
  await expect(block).toBeVisible({ timeout: 15_000 })
  return block
}

for (const [label, touch] of [
  ["1280", false],
  ["390 with touch", true],
] as const) {
  test.describe(label, () => {
    // The phone runs dark, so the block's pill and ring are proved in both themes.
    test.use(touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" } : { viewport: { width: 1280, height: 900 } })

    test("/whiteboard shows the board in the doc, live and read-only, still until looked around, with its pictures and Open board", async ({ page }, testInfo) => {
      const { body, pictures, relay } = await openDoc(page, testInfo)
      const block = await addWhiteboard(page, body, touch)

      // Its name, and a way to the board itself.
      await expect(block.getByText("Launch flow · Whiteboard")).toBeVisible()
      await expect(block.getByRole("link", { name: /Open board/ })).toHaveAttribute("href", `/app/board/${BOARD}`)

      // Live: the board's own document, its note (card and words) and its picture drawn.
      const canvas = block.locator("[data-guest-board]")
      await expect(canvas).toHaveAttribute("data-board-elements", "3", { timeout: 30_000 })
      expect(relay.received.some((m) => m.doc === `board:${BOARD}`), "the block joined the board's document").toBe(true)
      // Read-only: the canvas is in Excalidraw's view mode, with nothing to draw with.
      await expect(block.locator(".excalidraw.excalidraw--view-mode")).toHaveCount(1)
      // Its picture came by the member's own access, never a guest's grant.
      await expect.poll(() => pictures, { timeout: 15_000 }).toContain(`/board/getBoardAttachment/${BOARD}/${PICTURE.file.objectUuid}`)
      expect(pictures.filter((p) => p.startsWith("/guest/"))).toEqual([])

      // Fitted on its first draw: the note and the picture sit round the stage's middle.
      const stage = block.locator("[data-whiteboard-stage]")
      await expect.poll(() => offCentre(page, stage), { timeout: 15_000, message: "the drawing sits round the stage's middle" }).toBeLessThan(0.1)
      // With room round it, never edge to edge (DB-104: at 390 the picture ran under the stage's side and read as cut).
      const ink = await inkAcross(page, stage)
      expect(Math.min(ink.left, ink.right), `the drawing keeps a margin inside the stage (${ink.left} px left, ${ink.right} px right)`).toBeGreaterThanOrEqual(8)

      // Still until the reader asks: the canvas takes no pointer, so the doc scrolls past it.
      await expect(stage).toHaveAttribute("data-looking", "false")
      const inert = stage.locator(":scope > div").first()
      await expect(inert).toHaveCSS("pointer-events", "none")
      // Look around is seen on the still canvas: drawn over its layers, never under them (DB-103: a flat colour there).
      const pill = block.getByText("Look around", { exact: true })
      expect(spreadOf((await shot(page, (await pill.boundingBox())!)).px), "the Look around pill is drawn over the canvas").toBeGreaterThan(40)
      await everyControlNamed(block)
      const still = await topEdge(page, stage)
      const look = block.getByRole("button", { name: "Look around the whiteboard" })
      await (touch ? look.tap() : look.click())
      await expect(stage).toHaveAttribute("data-looking", "true")
      await expect(inert).not.toHaveCSS("pointer-events", "none")
      // Looking, the stage wears the brand's ring, over the canvas (DB-103: in dark it hid under it).
      const ring = await topEdge(page, stage)
      expect(Math.max(Math.abs(ring.r - still.r), Math.abs(ring.g - still.g), Math.abs(ring.b - still.b)), "the looking ring shows at the stage's edge").toBeGreaterThan(60)
      await everyControlNamed(block)
      await page.keyboard.press("Escape")
      await expect(stage).toHaveAttribute("data-looking", "false")

      const open = block.getByRole("link", { name: /Open board/ })
      await (touch ? open.tap() : open.click())
      await expect(page).toHaveURL(new RegExp(`/app/board/${BOARD}$`), { timeout: 30_000 })
    })

    test("a doc that holds the block, opened again: the picker opens over it and its row takes the tap", async ({ page }, testInfo) => {
      const { body } = await openDoc(page, testInfo)
      await addWhiteboard(page, body, touch)
      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(body).toBeVisible({ timeout: 30_000 })
      await expect(page.locator("[data-whiteboard-embed] [data-guest-board]")).toHaveAttribute("data-board-elements", "3", { timeout: 30_000 })
      // DB-103's H-b look: at 390 the sheet's row never took the tap on a doc that held the block.
      const second = await addWhiteboard(page, body, touch, 1)
      await expect(second.getByText("Launch flow · Whiteboard")).toBeVisible()
    })

    test("a public doc that holds the block: its guest reads that it is for the workspace, with no board and no error page", async ({ page }, testInfo) => {
      const { body, relay } = await openDoc(page, testInfo)
      await addWhiteboard(page, body, touch)
      // The doc as the server keeps it holds the block (its board's id is in the doc's state).
      await expect
        .poll(() => [...relay.docs].some(([name, d]) => !name.startsWith("board:") && Buffer.from(Y.encodeStateAsUpdate(d)).includes(BOARD)), { timeout: 15_000 })
        .toBe(true)
      const crashes: string[] = []
      page.on("pageerror", (e) => crashes.push(e.message))
      await page.goto(`/guest/d/${GUEST_LINK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      // DB-105: the guest page has no live connection, and the block's live read threw there ("useMqtt must be used
      // within MqttProvider"), taking the whole page to the app's error page.
      const block = page.locator("[data-whiteboard-embed]")
      await expect(block.getByText("A whiteboard shows here for people in the workspace.")).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText("Something went wrong")).toHaveCount(0)
      expect(crashes.filter((m) => /MqttProvider/.test(m)), "the guest page threw").toEqual([])
      // Nothing of the board: no canvas, no name, no way to it.
      await expect(block.locator("canvas")).toHaveCount(0)
      await expect(block.getByText("Launch flow")).toHaveCount(0)
      await expect(block.getByRole("link", { name: /Open board/ })).toHaveCount(0)
    })
  })
}
