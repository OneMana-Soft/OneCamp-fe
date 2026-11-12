import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The board's drawing tools as a Miro team uses them (miro-10): a highlighter
// beside the pen (its button, or M) whose wide see-through ink never hides
// what it crosses, and a pen's stroke held still at its end that becomes the
// shape it looks like, as one undo step. A quick stroke stays ink; a viewer
// gets neither tool; another person's tab gets what was drawn. The
// collaboration server is the spec's own fake: nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"
import { finger } from "./finger"
import { SHOT_THEMES, reviewShot, tidy } from "./stubbedApp"

const BOARD = "b0a4d000-0000-4000-8000-0000000000d7"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit", vic: "view" }
/** The words on the note a highlight crosses. */
const WORDS = "Ship the beta"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES

type Shared = { id: string; type: string; x: number; y: number; width: number; height: number; opacity?: number; strokeWidth?: number; simulatePressure?: boolean; pressures?: number[]; roughness?: number; isDeleted?: boolean; text?: string; originalText?: string; containerId?: string | null; customData?: { kind?: string } }
type Pt = { x: number; y: number }
type Doc = { getMap: (name: string) => { set: (k: string, v: unknown) => void } }

/**
 * The board with one note, as `user` opens it; `collab` makes it the same board another tab has open. `style`: the board's
 * own (boardMeta), as someone chose it; a board with a drawing that never said is hand-drawn (components/board/boardStyle).
 */
async function open(
  browser: Browser,
  device: Device,
  { theme = "light" as string, user = USERS.sam, collab = undefined as ReturnType<typeof collabFor> | undefined, noteAt = { x: 420, y: 160 }, style = undefined as "clean" | "sketch" | undefined } = {},
) {
  const board = { uuid: BOARD, title: "Launch", levels: LEVELS, update: boardDoc([...note("n1", noteAt.x, noteAt.y, WORDS)]) }
  const server = collab ?? collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  if (style) server.edit(NAME, (doc: Doc) => doc.getMap("boardMeta").set("style", style))
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark" })
  // The camera kept at the scene's origin, so a place on the scene is the same place on the canvas.
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the test then fails on positions, saying so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab: server, fixtures: boardFixtures([board], user, USERS.sam) })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  // As the server has the board: what's on it, and what was rubbed out or undone.
  const all = () => Array.from(server.doc(NAME).getMap("elements").values()) as Shared[]
  const drawn = () => all().filter((e) => !e.isDeleted)
  return { context, page, collab: server, all, drawn }
}
type Opened = Awaited<ReturnType<typeof open>>

/** A point on the canvas, from its top left, in page pixels. */
async function at(page: Page, x: number, y: number): Promise<Pt> {
  const box = await page.locator(".excalidraw").first().boundingBox()
  if (!box) throw new Error("the canvas isn't on the page")
  return { x: box.x + x, y: box.y + y }
}

/** The points of a stroke through `corners`, one every few pixels, as a hand's moves come. */
function along(corners: Pt[], step = 8): Pt[] {
  const out: Pt[] = [corners[0]]
  for (let i = 1; i < corners.length; i++) {
    const [a, b] = [corners[i - 1], corners[i]]
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let s = 1; s <= n; s++) out.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n })
  }
  return out
}

/**
 * A stroke as the device draws it: a mouse's drag at a desk, a finger on a phone. `held`: the hand rests at the end
 * (650 ms, past the 500 ms that makes a stroke a shape) before it lifts; a quick stroke lifts as it stops (a finger
 * rests a moment, since a lift mid-move is a fling).
 */
async function stroke(page: Page, device: Device, corners: Pt[], held: boolean) {
  const [first, ...rest] = along(corners)
  if (device === "phone") {
    const f = await finger(page)
    await f.down(first.x, first.y)
    for (const p of rest) {
      await f.move(p.x, p.y)
      await page.waitForTimeout(8)
    }
    await page.waitForTimeout(held ? 650 : 150)
    await f.up()
  } else {
    await page.mouse.move(first.x, first.y)
    await page.mouse.down()
    for (const p of rest) await page.mouse.move(p.x, p.y)
    if (held) await page.waitForTimeout(650)
    await page.mouse.up()
  }
}

/** A square's corners from its top left, round to where it began (a hand's square ends near its start). */
const square = (p: Pt, side: number): Pt[] => [p, { x: p.x + side, y: p.y }, { x: p.x + side, y: p.y + side }, { x: p.x, y: p.y + side }, { x: p.x + 2, y: p.y + 4 }]

/** Two frames: the tools' effects (the pen's ink put back) have run before the next stroke. */
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))

/** Whether a tool in the row is lit: the board's lit ground and its dot (excalidrawTheme.css) on its icon. */
const lit = (page: Page, input: string) =>
  page
    .locator(`label:has(${input}) .ToolIcon__icon`)
    .first()
    .evaluate((el) => getComputedStyle(el, "::after").content !== "none" && getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)")
const HIGHLIGHTER = "[data-highlighter-tool]"
const PEN = '[data-testid="toolbar-freedraw"]'

const highlighter = (page: Page) => page.getByRole("checkbox", { name: "Highlighter" })
const pen = (page: Page) => page.locator('[data-testid="toolbar-freedraw"]')
const highlights = (b: Opened) => b.drawn().filter((e) => e.type === "freedraw" && e.opacity === 45)
const ink = (b: Opened) => b.drawn().filter((e) => e.type === "freedraw" && e.opacity !== 45)
const shapes = (b: Opened) => b.drawn().filter((e) => e.type !== "freedraw" && e.customData?.kind !== "note" && e.containerId == null && e.type !== "text")

/** The highlighter picked up as the device does: M at a desk, its button in the tool row on a phone. */
async function takeHighlighter(page: Page, device: Device) {
  if (device === "phone") await page.locator("label:has([data-highlighter-tool])").tap()
  else {
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("m")
  }
  await expect(highlighter(page)).toBeChecked()
  // In hand as the pen in the marker's ink; only the highlighter lit (DB-137 F1).
  await expect(pen(page)).toBeChecked()
  await expect.poll(() => lit(page, HIGHLIGHTER), { timeout: 5_000 }).toBe(true)
  await expect.poll(() => lit(page, PEN), { timeout: 5_000 }).toBe(false)
}

/** The pen again, as the device picks it: P at a desk, the pen's button on a phone. */
async function takePen(page: Page, device: Device) {
  if (device === "phone") await page.locator('label:has([data-testid="toolbar-freedraw"])').tap()
  else await page.keyboard.press("p")
  await expect(highlighter(page)).not.toBeChecked()
  await expect(pen(page)).toBeChecked()
  await expect.poll(() => lit(page, PEN), { timeout: 5_000 }).toBe(true)
  await expect.poll(() => lit(page, HIGHLIGHTER), { timeout: 5_000 }).toBe(false)
  await frames(page)
}

/** On a phone: the ground between the note and the board's bars, where a finger's stroke is the pen's (a stroke begun on a bar is the bar's). */
async function phoneGround(page: Page, noteBottom: number) {
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  const bars = (await page.getByRole("toolbar", { name: "Facilitation" }).boundingBox())!
  const top = canvas.y + noteBottom + 24
  const bottom = bars.y - 24
  expect(bottom - top, "room for a square between the note and the board's bars").toBeGreaterThan(90)
  return { left: canvas.x + 30, right: canvas.x + 220, top, side: Math.min(130, bottom - top) }
}

test.describe("a board's highlighter and its held strokes (miro-10)", () => {
  for (const device of ["computer", "phone"] as const) {
    for (const theme of SHOT_THEMES) {
      test(`a highlight across a note leaves it readable, a held square becomes a rectangle that undo gives back as ink, a quick stroke stays ink (${device}, ${theme})`, async ({ browser }) => {
        test.setTimeout(150_000)
        const noteAt = device === "phone" ? { x: 100, y: 170 } : { x: 420, y: 160 }
        // A clean board at the desk, a hand-drawn one on the phone: the shape is drawn in whichever the board is.
        const style = device === "phone" ? "sketch" : "clean"
        const b = await open(browser, device, { theme, noteAt, style })
        // Another person on the same board, at a desk (on the computer's leg only: one second tab proves the sync).
        const ann = device === "computer" ? await open(browser, "computer", { user: USERS.ann, collab: b.collab, noteAt }) : null
        const { page } = b
        await tidy(page)
        if (ann) await tidy(ann.page)

        // 1. The highlighter across the note, held at its end: a mark, never a shape. Wide, see-through ink over the
        //    note, whose words are still there (and readable in the shot).
        await takeHighlighter(page, device)
        await reviewShot(page, "board-highlighter-in-hand", theme)
        const mid = noteAt.y + 90
        await stroke(page, device, [await at(page, noteAt.x - 20, mid), await at(page, noteAt.x + 200, mid + 6)], true)
        await expect.poll(() => highlights(b).map((e) => [e.strokeWidth, e.opacity]), { timeout: 5_000 }).toEqual([[6, 45]])
        // An even marker (DB-137 F2): not drawn with a simulated, tapering pressure, and one pressure end to end.
        const [h] = highlights(b)
        expect(h.simulatePressure, "a marker, not a brush").toBe(false)
        expect(new Set(h.pressures).size, "as wide at its ends as in its middle").toBe(1)
        if (device === "computer") await reviewShot(page, "board-highlight-mouse", theme)
        await page.waitForTimeout(300)
        expect(shapes(b), "a highlight is never made a shape").toEqual([])
        const words = b.drawn().find((e) => e.type === "text" && e.containerId === "n1")
        expect(words?.originalText ?? words?.text).toBe(WORDS)
        // The pen's long-press on a touch screen opens no menu at a stroke's resting end.
        await expect(page.locator(".excalidraw .context-menu")).toHaveCount(0)

        // 2. The pen again, its own ink back. A quick square stays ink; a held one becomes a rectangle, in the board's
        //    style, and its stroke goes.
        await takePen(page, device)
        const g =
          device === "phone"
            ? await phoneGround(page, noteAt.y + 180)
            : { left: (await at(page, 700, 0)).x, right: (await at(page, 880, 0)).x, top: (await at(page, 0, 170)).y, side: 120 }
        await stroke(page, device, square({ x: g.left, y: g.top }, g.side), false)
        await expect.poll(() => ink(b).length, { timeout: 5_000 }).toBe(1)
        expect(ink(b)[0].opacity, "the pen's own ink, not the marker's").toBe(100)
        await page.waitForTimeout(300)
        expect(shapes(b), "a quick stroke stays ink").toEqual([])

        await stroke(page, device, square({ x: g.right, y: g.top }, g.side), true)
        await expect.poll(() => shapes(b).map((e) => e.type), { timeout: 5_000 }).toEqual(["rectangle"])
        await expect.poll(() => ink(b).length, { timeout: 5_000 }).toBe(1)
        const [made] = shapes(b)
        expect(made.roughness, `the board's ${style} style`).toBe(style === "clean" ? 0 : 1)
        const canvasAt = await at(page, 0, 0)
        expect(Math.abs(made.x - (g.right - canvasAt.x)), "on the stroke's own place").toBeLessThan(12)
        expect(Math.abs(made.width - g.side), "the stroke's own size").toBeLessThan(16)
        await expect(page.locator(".excalidraw .context-menu")).toHaveCount(0)

        // 3. Undo gives the hand's stroke back, in one step; redo makes it the rectangle again.
        if (device === "phone") await page.locator(".excalidraw").getByRole("button", { name: "Undo", exact: true }).tap()
        else await page.keyboard.press("ControlOrMeta+z")
        await expect.poll(() => shapes(b).length, { timeout: 5_000 }).toBe(0)
        await expect.poll(() => ink(b).length, { timeout: 5_000 }).toBe(2)
        expect(highlights(b), "one undo takes back the shape only").toHaveLength(1)
        if (device === "phone") await page.locator(".excalidraw").getByRole("button", { name: "Redo", exact: true }).tap()
        else await page.keyboard.press("ControlOrMeta+Shift+z")
        await expect.poll(() => shapes(b).map((e) => e.type), { timeout: 5_000 }).toEqual(["rectangle"])
        await expect.poll(() => ink(b).length, { timeout: 5_000 }).toBe(1)

        // Let go (the selection tool, nothing selected) for the shot: the highlight over the note, the ink, the rectangle.
        await page.keyboard.press("Escape")
        await reviewShot(page, "board-highlight-shape", theme)

        // 4. Ann's tab has the rectangle: she picks it by its edge and rubs it out, and the server's goes.
        if (ann) {
          const rect = shapes(b)[0]
          const edge = await at(ann.page, rect.x, rect.y + rect.height / 2)
          await ann.page.mouse.click(edge.x, edge.y)
          await expect(ann.page.locator(".excalidraw .App-menu__left")).toBeVisible({ timeout: 5_000 })
          await ann.page.keyboard.press("Delete")
          await expect.poll(() => shapes(b).length, { timeout: 5_000 }).toBe(0)
          await ann.context.close()
        }
        await b.context.close()
      })
    }

    if (device === "computer") {
      for (const theme of SHOT_THEMES) {
        test(`the highlighter is reached by Tab from the pen (${theme})`, async ({ browser }) => {
          test.setTimeout(90_000)
          const b = await open(browser, device, { theme })
          await tidy(b.page)
          await pen(b.page).focus()
          await b.page.keyboard.press("Tab")
          await expect(highlighter(b.page)).toBeFocused()
          // Its ring, for the design look; the key M picks it up from anywhere on the board.
          await reviewShot(b.page, "board-highlighter-focus", theme)
          await b.context.close()
        })
      }
    }

    test(`a viewer gets neither the highlighter nor the pen, and M does nothing (${device})`, async ({ browser }) => {
      test.setTimeout(90_000)
      const vic = await open(browser, device, { user: USERS.vic })
      await tidy(vic.page)
      await expect(vic.page.locator(".excalidraw.excalidraw--view-mode")).toBeAttached()
      await expect(highlighter(vic.page)).toHaveCount(0)
      await expect(vic.page.locator("[data-highlighter-slot]")).toHaveCount(0)
      await expect(pen(vic.page)).toHaveCount(0)
      if (device === "computer") {
        await vic.page.locator(".excalidraw").first().focus()
        await vic.page.keyboard.press("m")
        const p = await at(vic.page, 760, 200)
        await stroke(vic.page, device, [p, { x: p.x + 120, y: p.y + 40 }], true)
        await vic.page.waitForTimeout(300)
        await expect(highlighter(vic.page)).toHaveCount(0)
      }
      expect(vic.drawn().map((e) => e.type).sort(), "nothing drawn by a viewer").toEqual(["rectangle", "text"])
      await vic.context.close()
    })
  }
})
