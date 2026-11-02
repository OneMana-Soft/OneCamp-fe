import { join } from "node:path"
import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, shape } from "../scripts/fluidity/fakeBoard.mjs"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"

// A Miro team's first ten minutes on a OneCamp board (whiteboard W-1;
// miro-07, miro-11, miro-19, miro-04): a sticky note on N and a run of them
// on Tab, a pasted list as notes, a colour from the notes bar, a template
// from the searchable picker, frames in the Frames panel; and on a phone, a
// note from the board's own button, a template from the empty board, and the
// library and the Frames panel from the board's options.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f1"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const TEAL = "#E1F5F6"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type: string; x: number; y: number; width?: number; height?: number; fontSize?: number; lineHeight?: number; strokeColor?: string; isDeleted?: boolean; text?: string; originalText?: string; containerId?: string | null; backgroundColor?: string; name?: string; customData?: { kind?: string; colour?: string; laidIn?: string }; version?: number }

/** The board, empty unless given its drawing; a first visit has no camera kept from before, and `search` opens it by a link. */
/** "#rrggbb" as CSS computes it: "rgb(r, g, b)". */
const hexToRgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`

async function open(
  browser: Browser,
  device: keyof typeof DEVICES,
  {
    drawing = [] as unknown[],
    firstVisit = false,
    search = "",
    route = undefined as ((context: BrowserContext) => Promise<unknown>) | undefined,
    theme = "light" as (typeof SHOT_THEMES)[number],
    // A leg that holds a face the board draws (holdFaces) can't wait for the page's load: the face it holds is part of it.
    waitUntil = "load" as "load" | "domcontentloaded",
  } = {},
) {
  const board = { uuid: BOARD, title: "Kickoff", levels: LEVELS, update: boardDoc(drawing) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme })
  await context.addInitScript(({ key, firstVisit }: { key: string; firstVisit: boolean }) => {
    try {
      if (!firstVisit) localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the test then fails on positions, saying so */
    }
  }, { key: `onecamp:board:viewport:${BOARD}`, firstVisit })
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [], collab, fixtures: boardFixtures([board], USERS.sam, USERS.sam) })
  // A leg's own routes, after the fake app's, so they answer first.
  if (route) await route(context)
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}${search}`, { waitUntil })
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const elements = () => (Array.from(collab.doc(NAME).getMap("elements").values()) as Shared[]).filter((e) => !e.isDeleted)
  const notes = () => elements().filter((e) => e.type === "rectangle" && e.customData?.kind === "note")
  // What was typed: Excalidraw breaks text into lines to fit a note, and keeps what was typed beside it.
  const words = (noteId: string) => {
    const t = elements().find((e) => e.type === "text" && e.containerId === noteId)
    return t?.originalText ?? t?.text ?? ""
  }
  return { context, page, collab, elements, notes, words }
}

/** A point on the canvas, from its top left, in page pixels. */
async function at(page: Page, x: number, y: number) {
  const box = await page.locator(".excalidraw").first().boundingBox()
  if (!box) throw new Error("the canvas isn't on the page")
  return { x: box.x + x, y: box.y + y }
}

/** Excalidraw's faces, each fetched by files of its own folder, and the package's own copy of them. */
const FACES = join(process.cwd(), "node_modules/@excalidraw/excalidraw/dist/prod/fonts")
const faceFiles = (faces: string[]) => new RegExp(`/fonts/(${faces.join("|")})/[^/]+\\.woff2(\\?.*)?$`)
/** The faces a board's notes are written in: a clean board's Nunito and a sketched one's Excalifont (lib/board/notes STYLE_FONT). */
const BOARD_FACES = ["Nunito", "Excalifont"]

/** A leg's route: these faces' files held, as a slow line would hold them, until `landed`, then answered. */
const holdFaces = (faces: string[], landed: Promise<void>) => (context: BrowserContext) =>
  context.route(faceFiles(faces), async (route) => {
    await landed
    const [face, file] = new URL(route.request().url()).pathname.split("/").slice(-2)
    await route.fulfill({ path: join(FACES, face, file) }).catch(() => {})
  })

/** A note's words as the server holds them: the lines they're laid out in, and how wide, in their size and face. */
type Label = { id: string; text: string; width: number; fontSize: number; fontFamily: number }
const labelsOf = (elements: Shared[]) =>
  elements
    .map((e) => e as typeof e & { containerId?: string | null; fontFamily?: number })
    .filter((e) => e.type === "text" && e.containerId && (e.text ?? "").trim())
    .map((e): Label => ({ id: e.id, text: e.text ?? "", width: e.width ?? 0, fontSize: e.fontSize ?? 0, fontFamily: e.fontFamily ?? 5 }))

/**
 * The notes' words whose widest line, measured in the face they're drawn in once it has come, isn't as wide as they're
 * laid out (to a pixel): never wider, so Excalidraw cuts no line, and never narrower, as a face that isn't theirs made
 * them (V-229). Empty when every one fits.
 */
const misfits = (page: Page, labels: Label[]) =>
  page.evaluate(async (ls) => {
    // Excalidraw 0.18.1's FONT_FAMILY, turned round.
    const faces: Record<number, string> = { 1: "Virgil", 2: "Helvetica", 3: "Cascadia", 5: "Excalifont", 6: "Nunito", 7: "Lilita One", 8: "Comic Shanns", 9: "Liberation Sans" }
    const ctx = document.createElement("canvas").getContext("2d")!
    const out: string[] = []
    for (const l of ls) {
      const font = `${l.fontSize}px "${faces[l.fontFamily] ?? "unknown"}"`
      await document.fonts.load(font, l.text)
      if (!document.fonts.check(font, l.text)) {
        out.push(`${l.id}: its face (${font}) hasn't come`)
        continue
      }
      ctx.font = font
      const drawn = Math.max(...l.text.split("\n").map((line) => ctx.measureText(line).width))
      if (Math.abs(drawn - l.width) > 1) out.push(`${l.id} "${l.text.replace(/\n/g, "|")}": laid ${l.width.toFixed(1)} px wide, drawn ${drawn.toFixed(1)} px in ${font}`)
    }
    return out
  }, labels)

test.describe("a board's first ten minutes", () => {
  test("a note on N, a run of notes on Tab, a pasted list, a colour, a template and the Frames panel", async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, "computer")
    const { page } = b

    // The empty board offers the five templates, the rest, and the note key.
    const card = page.locator("[data-empty-canvas]")
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText("or press N for a note")
    // The notes-and-frames pill docks 8px left of Excalidraw's tool bar, centred on it, once both are drawn.
    const pill = page.getByRole("toolbar", { name: "Notes and frames" })
    await expect(pill).toBeVisible()
    await expect
      .poll(async () => {
        const [p, t] = [await pill.boundingBox(), await page.locator(".App-toolbar").first().boundingBox()]
        return p && t ? [Math.round(t.x - (p.x + p.width)), Math.round(p.y + p.height / 2 - (t.y + t.height / 2))] : null
      })
      .toEqual([8, 0])

    // N, a press on the board, and typing: a note, in a plain sans (a new board is clean).
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("n")
    await expect(page.locator("[data-note-ghost]")).toBeAttached()
    const p = await at(page, 420, 300)
    await page.mouse.click(p.x, p.y)
    const editor = page.locator("textarea.excalidraw-wysiwyg")
    await expect(editor).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("Ship the pricing page", { delay: 10 })
    // Tab ends the note and starts the next one beside it.
    await page.keyboard.press("Tab")
    await expect.poll(() => b.notes().length, { timeout: 5_000 }).toBe(2)
    await expect(editor).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("Load test", { delay: 10 })
    await page.keyboard.press("Escape")
    await expect.poll(() => b.notes().map((n) => b.words(n.id)).sort(), { timeout: 5_000 }).toEqual(["Load test", "Ship the pricing page"])
    const [first, second] = [...b.notes()].sort((x, y) => x.x - y.x)
    expect(second.x).toBeGreaterThan(first.x + 150)
    expect(Math.abs(second.y - first.y)).toBeLessThan(1)

    // The notes bar beside the selection: a colour for the note just typed.
    const bar = page.locator("[data-notes-bar]")
    await expect(bar).toBeVisible({ timeout: 5_000 })
    await bar.getByRole("button", { name: "Colour" }).click()
    await page.getByRole("button", { name: "Teal" }).click()
    await expect.poll(() => b.notes().find((n) => n.id === second.id)?.backgroundColor?.toUpperCase(), { timeout: 5_000 }).toBe(TEAL)
    await page.keyboard.press("Escape")

    // A pasted list becomes notes, one a line.
    await page.locator(".excalidraw").first().focus()
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.setData("text/plain", "- Freeze copy\n- Book the retro\n- Call Acme")
      document.querySelector(".excalidraw")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect.poll(() => b.notes().length, { timeout: 5_000 }).toBe(5)
    expect(b.notes().map((n) => b.words(n.id))).toEqual(expect.arrayContaining(["Freeze copy", "Book the retro", "Call Acme"]))

    // A template from the picker, found by name.
    await page.getByRole("button", { name: "Templates" }).click()
    const find = page.getByRole("combobox", { name: "Find a template" })
    await expect(find).toBeVisible()
    expect(await page.getByRole("option").count()).toBeGreaterThanOrEqual(40)
    // Its action sits in the footer, inside the dialog's edges.
    const dialog = (await page.locator("[data-template-picker]").boundingBox())!
    const use = (await page.getByRole("button", { name: "Use this template" }).boundingBox())!
    expect(use.x + use.width).toBeLessThanOrEqual(dialog.x + dialog.width)
    expect(use.y + use.height).toBeLessThanOrEqual(dialog.y + dialog.height)
    await find.fill("continue")
    await page.getByRole("option", { name: /Start, stop, continue/ }).click()
    await expect.poll(() => b.elements().filter((e) => e.type === "frame").map((e) => e.name).sort(), { timeout: 5_000 }).toEqual(["Continue", "Start", "Stop"])

    // The Frames panel lists them, and keeps an order for everyone.
    // Exact: the notes bar's "Cluster into frames" shares the word.
    await page.getByRole("button", { name: "Frames", exact: true }).click()
    const panel = page.getByRole("complementary", { name: "Frames" })
    await expect(panel.getByRole("listitem")).toHaveCount(3)
    await panel.getByRole("button", { name: /^Move Start/ }).focus()
    await page.keyboard.press("Alt+ArrowDown")
    await expect.poll(() => (b.collab.doc(NAME).getMap("boardMeta").get("frameOrder") as string[] | undefined)?.length ?? 0, { timeout: 5_000 }).toBe(3)
    await b.context.close()
  })

  test("on a phone, a note from the board's own button, a template from the empty board, and the library and frames from its options", async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, "phone")
    const { page } = b
    await page.getByRole("button", { name: "Add a note" }).tap()
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("From my phone", { delay: 10 })
    await page.keyboard.press("Escape")
    await expect.poll(() => b.notes().map((n) => b.words(n.id)), { timeout: 5_000 }).toEqual(["From my phone"])
    // A board with a drawing has no empty card: its options offer the library.
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Templates", exact: true }).tap()
    await expect(page.locator("[data-template-picker]")).toHaveAttribute("data-v3-sheet", "")
    // A tap uses a template at once: none looks chosen before it.
    await expect(page.locator("[data-template-picker] [role=option]").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    await b.context.close()

    // A fresh board: its empty card offers the whole library, as a sheet.
    const c = await open(browser, "phone")
    await expect(c.page.locator("[data-empty-canvas]")).toBeVisible({ timeout: 10_000 })
    await c.page.getByRole("button", { name: "See all templates" }).tap()
    const sheet = c.page.locator("[data-template-picker]")
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute("data-v3-sheet", "")
    await c.page.getByRole("option", { name: /Kanban/ }).first().tap()
    await expect.poll(() => c.elements().filter((e) => e.type === "frame").map((e) => e.name).sort(), { timeout: 5_000 }).toEqual(["Doing", "Done", "To do"])
    // Its frames, from the board's options, as a sheet.
    await c.page.getByRole("button", { name: "Board options" }).tap()
    await c.page.getByRole("menuitem", { name: "Frames", exact: true }).tap()
    await expect(c.page.locator("[data-frames-panel] [data-frame-row]")).toHaveCount(3)
    await c.context.close()
  })

  test("a link to an object opens the board at it on a first visit, and one to an object since deleted says so", async ({ browser }) => {
    // Two notes far apart: framing the whole drawing would show both small; the link shows the far one.
    const drawing = [...note("near", 0, 0, "Near"), ...note("far", 6000, 4000, "Far"), { ...shape("gone", "rectangle", 300, 0), isDeleted: true }]
    const b = await open(browser, "computer", { drawing, firstVisit: true, search: "?element=far" })
    await expect.poll(() => b.page.evaluate(() => window.location.search)).toBe("")
    // The camera the board keeps once it has moved: the far note's centre is on screen, the near one's isn't.
    const onScreen = (cx: number, cy: number, page = b.page) =>
      page.evaluate(
        ({ key, cx, cy }) => {
          const v = JSON.parse(localStorage.getItem(key) ?? "null") as { scrollX: number; scrollY: number; zoom: number } | null
          if (!v) return null
          const x = (cx + v.scrollX) * v.zoom
          const y = (cy + v.scrollY) * v.zoom
          return x > 0 && x < innerWidth && y > 0 && y < innerHeight
        },
        { key: `onecamp:board:viewport:${BOARD}`, cx, cy },
      )
    await expect.poll(() => onScreen(6090, 4090), { timeout: 10_000 }).toBe(true)
    expect(await onScreen(90, 90)).toBe(false)
    await b.context.close()

    // A first visit through a link to an object since deleted: the drawing, far from the
    // board's origin, is framed as a visit without the link would (never empty canvas).
    const away = [...note("away", 6000, 4000, "Away"), { ...shape("gone", "rectangle", 300, 0), isDeleted: true }]
    const c = await open(browser, "computer", { drawing: away, firstVisit: true, search: "?element=gone" })
    // The toast's own title: Radix's announcer repeats its words for screen readers a moment.
    await expect(c.page.getByText("That's no longer on the board", { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => c.page.evaluate(() => window.location.search)).toBe("")
    await expect.poll(() => onScreen(6090, 4090, c.page), { timeout: 10_000 }).toBe(true)
    await c.context.close()
  })
})

// A note keeps its size while its words shrink to fit it (miro-07), down to a floor that still reads well: 12 px,
// the app's smallest words. Past the floor the note grows to hold them, as it always has. Alt+N, or the bar's
// sizes, give it the next size, and its words fit that size.
test.describe("a note's words fit it", () => {
  const LONG = "Write the launch plan for the pricing page, test the checkout from end to end, and book the review with the whole team"
  const MORE = " before Friday, then send the notes to everyone who could not make it, with the open questions and who owns each one"

  /** The board's one note, as every screen has it: its sides, and its words' size. */
  const fit = (b: Awaited<ReturnType<typeof open>>) => {
    const [n] = b.notes()
    const t = b.elements().find((e) => e.type === "text" && e.containerId === n?.id)
    return n && t ? { width: Math.round(n.width ?? 0), height: Math.round(n.height ?? 0), font: t.fontSize ?? 0 } : null
  }

  /**
   * Types MORE a word at a time until the note's words come down from `from` px, and returns what it typed. How many
   * words that takes is the browser's font's to say: LONG overflowed 18 px by 5 px with Excalifont loaded, and fit with
   * room in the fallback face when Excalifont couldn't load. Without the fit, the note grows instead, and the words stay.
   */
  const typeUntilShrunk = async (b: Awaited<ReturnType<typeof open>>, from: number) => {
    let typed = ""
    for (const word of MORE.trim().split(" ")) {
      const came = await expect
        .poll(() => fit(b)?.font ?? from, { timeout: 1_000 })
        .toBeLessThan(from)
        .then(
          () => true,
          () => false,
        )
      if (came) break
      await b.page.keyboard.type(` ${word}`, { delay: 5 })
      typed += ` ${word}`
    }
    return typed
  }

  /**
   * How far the note's words reach past its inside (its side less Excalidraw's 5 px either way), measured in the face
   * they're drawn in now, by their widest line and by their lines' height: 0 or less fits. Excalidraw redraws words
   * when their face lands but keeps their line breaks and size, so only a fit made in the face itself holds.
   */
  const spill = async (b: Awaited<ReturnType<typeof open>>) => {
    const [n] = b.notes()
    const t = b.elements().find((e) => e.type === "text" && e.containerId === n?.id)
    if (!n || !t) return Number.POSITIVE_INFINITY
    return b.page.evaluate(
      ({ text, size, lineHeight, inside }) => {
        const ctx = document.createElement("canvas").getContext("2d")!
        ctx.font = `${size}px Excalifont`
        const lines = text.split("\n")
        const wide = Math.max(...lines.map((line) => ctx.measureText(line).width)) - inside.width
        const tall = lines.length * size * lineHeight - inside.height
        return Math.max(wide, tall)
      },
      { text: t.text ?? "", size: t.fontSize ?? 0, lineHeight: t.lineHeight ?? 1.25, inside: { width: (n.width ?? 0) - 10, height: (n.height ?? 0) - 10 } },
    )
  }

  test("on a computer, a note keeps its size as its words grow, down to the floor and past it, and Alt+N sizes it", async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, "computer")
    const { page } = b
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("n")
    await expect(page.locator("[data-note-ghost]")).toBeAttached()
    const p = await at(page, 420, 300)
    await page.mouse.click(p.x, p.y)
    const editor = page.locator("textarea.excalidraw-wysiwyg")
    await expect(editor).toBeVisible({ timeout: 5_000 })

    // A long thought: the note stays 180 square while its words come down from 18 px, as they're typed.
    await page.keyboard.type(LONG, { delay: 5 })
    await typeUntilShrunk(b, 18)
    await expect.poll(() => fit(b), { timeout: 5_000 }).toMatchObject({ width: 180, height: 180 })
    const shrunk = fit(b)!.font
    expect(shrunk, "the words came down").toBeLessThan(18)
    expect(shrunk, "no lower than the floor").toBeGreaterThanOrEqual(12)
    // The words being typed are drawn at that size too.
    await expect(editor).toHaveCSS("font-size", `${shrunk}px`)

    // Past the floor the words stay 12 px, and the note grows to hold them.
    await page.keyboard.type(MORE + MORE, { delay: 2 })
    await expect.poll(() => fit(b)?.font, { timeout: 5_000 }).toBe(12)
    expect(fit(b)!.height, "past the floor, the note grows").toBeGreaterThan(180)

    // A few words again: their own size, in a note its own size.
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("Ship it", { delay: 10 })
    await expect.poll(() => fit(b), { timeout: 5_000 }).toEqual({ width: 180, height: 180, font: 18 })
    await page.keyboard.press("Escape")

    // Alt+N: the next size, round again, and the words take each size's own.
    const bar = page.locator("[data-notes-bar]")
    await expect(bar).toBeVisible({ timeout: 5_000 })
    const sizes = bar.getByRole("group", { name: "Size" })
    await expect(sizes).toHaveAttribute("title", "Size (Alt + N)")
    await expect(sizes).toHaveAttribute("aria-keyshortcuts", "Alt+N")
    await page.keyboard.press("Alt+n")
    await expect.poll(() => fit(b), { timeout: 5_000 }).toEqual({ width: 240, height: 240, font: 24 })
    await expect(sizes.getByRole("button", { name: "Large note" })).toHaveAttribute("aria-pressed", "true")
    await page.keyboard.press("Alt+n")
    await expect.poll(() => fit(b), { timeout: 5_000 }).toEqual({ width: 140, height: 140, font: 16 })
    await page.keyboard.press("Alt+n")
    await expect.poll(() => fit(b), { timeout: 5_000 }).toEqual({ width: 180, height: 180, font: 18 })
    expect(b.words(b.notes()[0].id)).toBe("Ship it")
    await b.context.close()
  })

  test("on a phone, a long note keeps its size, and the bar's sizes keep its words inside it", async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, "phone")
    const { page } = b
    await page.getByRole("button", { name: "Add a note" }).tap()
    const editor = page.locator("textarea.excalidraw-wysiwyg")
    await expect(editor).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type(LONG, { delay: 5 })
    const typed = LONG + (await typeUntilShrunk(b, 18))
    await expect.poll(() => fit(b), { timeout: 5_000 }).toMatchObject({ width: 180, height: 180 })
    expect(fit(b)!.font).toBeLessThan(18)
    expect(fit(b)!.font).toBeGreaterThanOrEqual(12)
    await page.keyboard.press("Escape")

    // The bar's sizes: each keeps the note square at its side, with every word inside it.
    const sizes = page.locator("[data-notes-bar]").getByRole("group", { name: "Size" })
    await expect(sizes).toBeVisible({ timeout: 5_000 })
    for (const [name, side, own] of [["Large note", 240, 24], ["Small note", 140, 16]] as const) {
      await sizes.getByRole("button", { name }).tap()
      await expect.poll(() => fit(b)?.width, { timeout: 5_000 }).toBe(side)
      const now = fit(b)!
      expect(now.height, `${name}: square`).toBe(side)
      expect(now.font, `${name}: no larger than its own size`).toBeLessThanOrEqual(own)
      expect(now.font, `${name}: no lower than the floor`).toBeGreaterThanOrEqual(12)
      expect(b.words(b.notes()[0].id), `${name}: every word kept`).toBe(typed)
    }
    await b.context.close()
  })

  test("on a computer, a note fitted before its face has come fits again when the face lands", async ({ browser }) => {
    test.setTimeout(120_000)
    // Excalidraw fetches its handwriting face (Excalifont) by files of its own: held, then answered (holdFaces).
    let land = () => {}
    const landed = new Promise<void>((resolve) => (land = resolve))
    const b = await open(browser, "computer", { route: holdFaces(["Excalifont"], landed) })
    const { page } = b
    const ready = () => page.evaluate(() => document.fonts.check("18px Excalifont", "Write"))
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("n")
    await expect(page.locator("[data-note-ghost]")).toBeAttached()
    const p = await at(page, 420, 300)
    await page.mouse.click(p.x, p.y)
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type(LONG, { delay: 5 })
    await page.keyboard.press("Escape")
    expect(await ready(), "the face is still on its way").toBe(false)

    // The face lands: the words, drawn in it now, still fit inside their note, and the note keeps its side.
    land()
    await expect.poll(ready, { timeout: 10_000 }).toBe(true)
    await expect.poll(() => spill(b), { timeout: 5_000, message: "the words spill past the note in their own face" }).toBeLessThanOrEqual(0.5)
    expect(fit(b)).toMatchObject({ width: 180, height: 180 })

    // That fit is a correction no undo step of the person's carries: their next step (a size, by Alt+N), undone,
    // brings the note back as it was, its words fitted in their face, never laid out as the fallback face had them.
    await page.keyboard.press("Alt+n")
    await expect.poll(() => fit(b), { timeout: 5_000 }).toMatchObject({ width: 240, height: 240 })
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(() => fit(b), { timeout: 5_000, message: "after an undo, the note is back at its side, with its words" }).toMatchObject({ width: 180, height: 180 })
    expect(b.words(b.notes()[0].id), "after an undo, every word kept").toBe(LONG)
    await expect.poll(() => spill(b), { timeout: 5_000, message: "after an undo, the words spill past the note in their own face" }).toBeLessThanOrEqual(0.5)
    await b.context.close()
  })

  test("on a computer, a note's words wear its ink from their first letter, and keep it through a size (V-95)", async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, "computer")
    const { page } = b
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("n")
    await expect(page.locator("[data-note-ghost]")).toBeAttached()
    const p = await at(page, 420, 300)
    await page.mouse.click(p.x, p.y)
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    // A new note is yellow: its ink is lib/board/notes NOTE_COLOURS.yellow.ink.
    const ink = "#7a5200"
    const wordsInk = () => {
      const [n] = b.notes()
      return b.elements().find((e) => e.type === "text" && e.containerId === n?.id)?.strokeColor?.toLowerCase()
    }
    // The first letter, still typing: the words are the note's ink, never Excalidraw's own.
    await page.keyboard.type("S", { delay: 5 })
    await expect.poll(wordsInk, { timeout: 5_000, message: "the first letter wears the note's ink" }).toBe(ink)
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toHaveCSS("color", hexToRgb(ink))
    await page.keyboard.type("hip it", { delay: 5 })
    await page.keyboard.press("Escape")
    expect(wordsInk(), "the words keep the ink once typed").toBe(ink)
    await page.keyboard.press("Alt+n")
    await expect.poll(() => b.notes()[0]?.width, { timeout: 5_000 }).toBe(240)
    expect(wordsInk(), "a size keeps the words' ink").toBe(ink)
    await b.context.close()
  })

  test("on a computer, a note sized by Alt+N opens its words again on a double press, and the board stays up (V-104)", async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, "computer")
    const { page } = b
    const errors: string[] = []
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text())
    })
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("n")
    await expect(page.locator("[data-note-ghost]")).toBeAttached()
    const p = await at(page, 420, 300)
    await page.mouse.click(p.x, p.y)
    const editor = page.locator("textarea.excalidraw-wysiwyg")
    await expect(editor).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("Ship it", { delay: 10 })
    await page.keyboard.press("Escape")
    await expect(editor).toBeHidden({ timeout: 5_000 })
    // Medium to Large: the board is fine after the size.
    await page.keyboard.press("Alt+n")
    await expect.poll(() => fit(b), { timeout: 5_000 }).toEqual({ width: 240, height: 240, font: 24 })
    // A double press on the note's words, at their middle (the camera is the page's own: zoom 1, no scroll).
    const [n] = b.notes()
    const t = b.elements().find((e) => e.type === "text" && e.containerId === n.id)!
    const w = await at(page, t.x + (t.width ?? 0) / 2, t.y + (t.height ?? 0) / 2)
    // Every frame drawn from here: the editor's words' size, so a frame with the fit's one-write nudge (V-104) shows.
    await page.evaluate(() => {
      const seen: string[] = []
      ;(window as unknown as { v104Frames: string[] }).v104Frames = seen
      const tick = () => {
        const editor = document.querySelector<HTMLTextAreaElement>("textarea.excalidraw-wysiwyg")
        if (editor) seen.push(getComputedStyle(editor).fontSize)
        if (seen.length < 600) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.mouse.dblclick(w.x, w.y)
    await page.waitForTimeout(500)
    await expect(page.getByRole("heading", { name: "Something broke on this page" }), "the board stays up as the words open").toHaveCount(0)
    // The editor opens on the note's own words, and the board stays up.
    await expect(editor, "the note's words open again").toBeVisible({ timeout: 5_000 })
    await expect(editor).toHaveValue("Ship it")
    // A loop of writes takes a few frames to blow up: give it time to, then check the page.
    await page.waitForTimeout(1_000)
    await expect(page.getByRole("heading", { name: "Something broke on this page" }), "the board stays up").toHaveCount(0)
    await expect(editor).toBeVisible()
    expect(errors.filter((e) => /Maximum update depth|#185/.test(e)), "no update loop").toEqual([])
    // With its words open the note keeps the size's own side, and no frame drew the words off their size.
    expect(fit(b), "the note keeps 240 with its words open").toEqual({ width: 240, height: 240, font: 24 })
    const frames = await page.evaluate(() => (window as unknown as { v104Frames: string[] }).v104Frames)
    expect(frames.length, "frames drawn with the words open").toBeGreaterThan(0)
    expect([...new Set(frames)], "every frame at the words' own size").toEqual(["24px"])
    // Typing goes on in the sized note, and Escape keeps the words at the size's own.
    await page.keyboard.press("End")
    await page.keyboard.type("!", { delay: 10 })
    await page.keyboard.press("Escape")
    await expect.poll(() => b.words(b.notes()[0].id), { timeout: 5_000 }).toBe("Ship it!")
    await expect.poll(() => fit(b), { timeout: 5_000 }).toEqual({ width: 240, height: 240, font: 24 })
    await b.context.close()
  })

  // V-229: a template laid on a phone before its words' face has come (a phone's first board has drawn no words in it,
  // as a computer's empty board has) kept the widths the fallback face gave its notes' words; Excalidraw then drew them
  // in the face, as wide as the face makes them, inside those widths, and cut each note's widest line at both ends
  // ("\/hat slowed u" on the demo). Each note's words are laid out again when their face lands, as a typed note's are:
  // as wide as their widest line in the face they're drawn in.
  /** Lays the Retrospective from a phone's empty board, and returns its three prompts' words as the server holds them. */
  async function layRetro(b: Awaited<ReturnType<typeof open>>) {
    await expect(b.page.locator("[data-empty-canvas]")).toBeVisible({ timeout: 10_000 })
    await b.page.getByRole("button", { name: "See all templates" }).tap()
    await b.page.getByRole("option", { name: /Retrospective/ }).first().tap()
    await expect.poll(() => b.elements().filter((e) => e.type === "frame").map((e) => e.name).sort(), { timeout: 5_000 }).toEqual(["Actions", "To improve", "Went well"])
    const labels = labelsOf(b.elements())
    expect(labels.map((l) => l.text.replace(/\n/g, " ")).sort(), "the template's three prompts").toEqual(["What slowed us down?", "What went well?", "Who does what by when?"])
    return labels
  }

  for (const theme of SHOT_THEMES) {
    test(`on a phone, a template laid before its face has come has its notes' words fitted again when it lands, no line cut (V-229, ${theme})`, async ({ browser }) => {
      test.setTimeout(120_000)
      let land = () => {}
      const landed = new Promise<void>((resolve) => (land = resolve))
      const b = await open(browser, "phone", { theme, route: holdFaces(BOARD_FACES, landed), waitUntil: "domcontentloaded" })
      await layRetro(b)
      // The face lands: each prompt is as wide as its widest line in the face it's drawn in, on the server.
      land()
      await expect.poll(() => misfits(b.page, labelsOf(b.elements())), { timeout: 10_000, message: "each prompt laid out in the face it's drawn in" }).toEqual([])
      await reviewShot(b.page, "board-template-retro-phone", theme)
      await b.context.close()
    })
  }

  // V-229, boards laid before the fix (main, 1 Nov): a board laid out on a phone while its words' face couldn't come keeps
  // the fallback face's widths on the server, and every screen cut its prompts. When someone who may edit opens it and
  // the face lands, each note's words are laid out again in the face, once, as an edit everyone gets; and a board whose
  // words are already right in their face is never written when it's opened.
  test("on a phone, a board laid out while its words' face couldn't come is laid out again in it when opened and the face lands, and only once (V-229)", async ({ browser }) => {
    test.setTimeout(150_000)
    const a = await open(browser, "phone", { route: (context) => context.route(faceFiles(BOARD_FACES), (route) => route.abort()) })
    const laid = await layRetro(a)
    // As a board laid out before words carried the face they were laid out in (main, 1 Nov 18:4x): no stamp.
    const saved = a.elements().map((e) => (e.type === "text" ? { ...e, customData: {} } : e))
    expect.soft(a.elements().filter((e) => e.type === "text" && e.containerId).map((e) => e.customData?.laidIn), "laid out while the face couldn't come").toEqual(["fallback", "fallback", "fallback"])
    await a.context.close()

    let land = () => {}
    const landed = new Promise<void>((resolve) => (land = resolve))
    const b = await open(browser, "phone", { drawing: saved, route: holdFaces(BOARD_FACES, landed), waitUntil: "domcontentloaded" })
    land()
    await expect.poll(() => misfits(b.page, labelsOf(b.elements())), { timeout: 10_000, message: "each saved prompt laid out again in the face it's drawn in, on the server" }).toEqual([])
    const widths = new Map(laid.map((l) => [l.id, l.width]))
    expect(labelsOf(b.elements()).filter((l) => widths.get(l.id) !== l.width).length, "the saved prompts were laid out in another face").toBeGreaterThan(0)

    // Opened again, its words right in their face: nothing is written. The refit runs a frame after the board syncs,
    // so a beat after that is enough to see a write if one came.
    const versions = () => b.elements().map((e) => `${e.id}:${(e as { version?: number }).version}`).sort().join(" ")
    const healed = versions()
    await b.page.reload()
    await expect(b.page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
    await b.page.waitForTimeout(2_000)
    expect(versions(), "a board whose words fit their face is never written when it's opened").toBe(healed)

    // Words stamped as laid out in their face are never laid out again for measuring otherwise (CODE-REVIEWER-159; main,
    // 1 Nov 18:4x): screens measure one face otherwise, Chromium and WebKit by up to 22 px. The healed board with one
    // prompt as another screen laid it out in its face, 6 px wider, opened where the face comes at once: nothing written.
    const board = b.elements()
    await b.context.close()
    const prompt = labelsOf(board)[0]
    expect.soft(board.find((e) => e.id === prompt.id)?.customData?.laidIn, "the healed prompt says the face it was laid out in").toMatch(/^Nunito [0-9.]+px$/)
    const elsewhere = board.map((e) => (e.id === prompt.id ? { ...e, width: prompt.width + 6, customData: { laidIn: `Nunito ${prompt.fontSize}px` } } : e))
    const c = await open(browser, "phone", { drawing: elsewhere, route: holdFaces(BOARD_FACES, Promise.resolve()), waitUntil: "domcontentloaded" })
    await expect.poll(() => c.page.evaluate((f) => document.fonts.check(f, "What"), `${prompt.fontSize}px "Nunito"`), { timeout: 10_000, message: "the face has come" }).toBe(true)
    await c.page.waitForTimeout(2_000)
    const opened = (els: Shared[]) => els.map((e) => `${e.id}:${e.version}:${e.width}`).sort().join(" ")
    expect(opened(c.elements()), "a prompt stamped as laid out in its face, measured otherwise here, is never written").toBe(opened(elsewhere))
    await c.context.close()
  })
})

test.describe("a board's faces come from this server", () => {
  test("on a computer, a note's handwriting face loads with no CDN to reach, and nothing asks one (V-94)", async ({ browser }) => {
    test.setTimeout(120_000)
    // Excalidraw's own default fetches its faces from esm.sh: a self-hosted install with no way out, or a slow line
    // to it, kept a note's words blank. Here esm.sh can't be reached at all, and anything asking it is counted.
    const cdn: string[] = []
    const b = await open(browser, "computer", {
      route: async (context) => {
        context.on("request", (r) => {
          if (/^https?:\/\/([^/]*\.)?esm\.sh\//.test(r.url())) cdn.push(r.url())
        })
        await context.route(/^https?:\/\/([^/]*\.)?esm\.sh\//, (route) => route.abort())
      },
    })
    const { page } = b
    await page.locator(".excalidraw").first().focus()
    await page.keyboard.press("n")
    await expect(page.locator("[data-note-ghost]")).toBeAttached()
    const p = await at(page, 420, 300)
    await page.mouse.click(p.x, p.y)
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("Ship it", { delay: 5 })
    await page.keyboard.press("Escape")
    const face = () =>
      page.evaluate(() => Array.from(document.fonts).some((f) => f.family.replace(/["']/g, "") === "Excalifont" && f.status === "loaded"))
    await expect.poll(face, { timeout: 10_000, message: "the note's handwriting face loads" }).toBe(true)
    // Every file of the face came from this server's own copy of the package's (lib/board/vendored.json).
    const files = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\/fonts\/Excalifont\//.test(u)),
    )
    expect(files.length, "the face's files were fetched").toBeGreaterThan(0)
    const origin = new URL(page.url()).origin
    for (const u of files) expect(u.startsWith(`${origin}/board/vendor/excalidraw-`), u).toBe(true)
    expect(cdn, "nothing asked esm.sh").toEqual([])
    await b.context.close()
  })
})
