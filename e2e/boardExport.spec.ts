import { readFileSync } from "node:fs"
import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note } from "../scripts/fluidity/fakeBoard.mjs"
import { displayNameOf } from "../lib/personName"

// A board's exports and its file in (whiteboard W-2, miro-36): More ›
// Export… saves the notes as CSV, the board as an .excalidraw file and its
// frames as a PDF (the print dialog, a page a frame); More › Open a board
// file… lays a file's drawing on the board. On a phone the export is a sheet
// with its action in reach.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
// Each person as the board names them (lib/personName), as a note's maker too.
const SAM = displayNameOf(USERS.sam)
const ANN = displayNameOf(USERS.ann)

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type: string; isDeleted?: boolean; customData?: { kind?: string } }

/** The kickoff board, its two notes from before makers were kept, on one collaboration server for everyone who opens it. */
function shareBoard(levels: Record<string, string> = LEVELS) {
  const n1 = note("n1", 0, 0, "Shipped on time")
  const n2 = note("n2", 220, 0, "Fast reviews")
  const board = { uuid: BOARD, title: "Kickoff", levels, update: boardDoc([...n1, ...n2, frame("f1", "Went well", [...n1, ...n2])]) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

async function open(browser: Browser, device: keyof typeof DEVICES, o: { on?: ReturnType<typeof shareBoard>; user?: typeof USERS.sam } = {}) {
  const { board, collab } = o.on ?? shareBoard()
  const user = o.user ?? USERS.sam
  const context = await browser.newContext({ ...DEVICES[device], acceptDownloads: true })
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows; the test reads past it */
    }
    // The print dialog, standing in: what it would print.
    window.print = () => {
      ;(window as unknown as { printed: number }).printed = document.querySelectorAll("[data-board-print] section svg").length
    }
  })
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: boardFixtures([board], user, USERS.sam) as never })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const elements = () => (Array.from(collab.doc(NAME).getMap("elements").values()) as Shared[]).filter((e) => !e.isDeleted)
  const makers = () => Object.fromEntries(collab.doc(NAME).getMap("noteAuthors").entries()) as Record<string, { id: string; name: string }>
  return { context, page, elements, makers }
}

async function more(page: Page) {
  await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
}

async function exportAs(page: Page, format: RegExp) {
  await more(page)
  await page.getByRole("menuitem", { name: "Export…" }).click()
  const dialog = page.getByRole("dialog", { name: "Export this board" })
  await dialog.getByRole("radio", { name: format }).click()
  return dialog
}

test.describe("a board's exports", () => {
  test("saves its notes as CSV and itself as a file, prints its frames a page each, and opens a file", async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page, elements, makers } = await open(browser, "computer")
    await expect.poll(() => elements().length, { timeout: 10_000 }).toBe(5)

    let dialog = await exportAs(page, /Notes as CSV/)
    let download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Export" }).click()
    const csv = await download
    expect(csv.suggestedFilename()).toBe("Kickoff.csv")
    const rows = readFileSync((await csv.path())!, "utf8").trimEnd().split("\r\n")
    // Notes from before makers were kept: an empty Author.
    expect(rows[0]).toBe("Note,Author,Colour,Tags,Frame,Task")
    expect(rows.slice(1).map((r) => r.split(",")[1])).toEqual(["", ""])
    expect(rows.slice(1).map((r) => r.split(",")[0]).sort()).toEqual(["Fast reviews", "Shipped on time"])
    expect(rows[1]).toContain("Went well")

    dialog = await exportAs(page, /Board file/)
    download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Export" }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe("Kickoff.excalidraw")
    // Kept under its own name: a download's path is a random one, and the board says the file's name.
    const path = test.info().outputPath("Kickoff.excalidraw")
    await file.saveAs(path)
    const scene = JSON.parse(readFileSync(path, "utf8")) as { type: string; elements: Shared[] }
    expect(scene.type).toBe("excalidraw")
    expect(scene.elements.map((e) => e.id).sort()).toEqual(["f1", "n1", "n1-label", "n2", "n2-label"])

    dialog = await exportAs(page, /^PDF/)
    await expect(dialog).toContainText("Each frame on a page, in the Frames panel's order (1 page).")
    await dialog.getByRole("button", { name: "Export" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: number }).printed), { timeout: 10_000 }).toBe(1)

    // The file, opened on the board: its drawing laid again, as copies.
    await more(page)
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("menuitem", { name: "Open a board file…" }).click()
    await (await chooser).setFiles(path)
    await expect.poll(() => elements().length, { timeout: 10_000 }).toBe(10)
    // The toast and its announcement for screen readers both say it.
    await expect(page.getByText("5 things from Kickoff.excalidraw laid on the board").first()).toBeVisible()
    // Its notes are copies, so they're the opener's: the board keeps Sam as their maker.
    await expect.poll(() => Object.values(makers()).map((m) => m.name), { timeout: 5_000 }).toEqual([SAM, SAM])
    await context.close()
  })

  test("names each note's maker in the CSV: whoever added it or made a copy of it, and no one for a note from before", async ({ browser }) => {
    test.setTimeout(150_000)
    const on = shareBoard({ sam: "edit", ann: "edit", vic: "view" })
    const sam = await open(browser, "computer", { on })
    const ann = await open(browser, "computer", { on, user: USERS.ann })
    const vic = await open(browser, "computer", { on, user: USERS.vic })
    const notes = () => sam.elements().filter((e) => e.customData?.kind === "note")
    await expect.poll(() => notes().length, { timeout: 10_000 }).toBe(2)

    // Sam adds a note: N, a press on the board, and words.
    const canvas = (await sam.page.locator(".excalidraw").first().boundingBox())!
    await sam.page.locator(".excalidraw").first().focus()
    await sam.page.keyboard.press("n")
    await expect(sam.page.locator("[data-note-ghost]")).toBeAttached()
    await sam.page.mouse.click(canvas.x + 760, canvas.y + 520)
    await expect(sam.page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    await sam.page.keyboard.type("Book the venue", { delay: 10 })
    await sam.page.keyboard.press("Escape")
    await expect.poll(() => notes().length, { timeout: 5_000 }).toBe(3)

    // Ann copies the whole board: every copy is hers, whoever made its original.
    const hers = (await ann.page.locator(".excalidraw").first().boundingBox())!
    await ann.page.mouse.click(hers.x + hers.width - 60, hers.y + hers.height - 160)
    await ann.page.keyboard.press("ControlOrMeta+a")
    await ann.page.keyboard.press("ControlOrMeta+d")
    await expect.poll(() => notes().length, { timeout: 10_000 }).toBe(6)

    // A viewer can't add or copy a note, so makes none.
    const theirs = (await vic.page.locator(".excalidraw").first().boundingBox())!
    await vic.page.mouse.click(theirs.x + theirs.width - 60, theirs.y + theirs.height - 160)
    await vic.page.keyboard.press("ControlOrMeta+a")
    await vic.page.keyboard.press("ControlOrMeta+d")
    await vic.page.keyboard.press("n")
    await vic.page.mouse.click(theirs.x + 760, theirs.y + 520)

    // Sam's CSV: each note's words and maker (a note from before has none). Exported until Ann's copies are on Sam's screen.
    const said = async () => {
      const dialog = await exportAs(sam.page, /Notes as CSV/)
      const download = sam.page.waitForEvent("download")
      await dialog.getByRole("button", { name: "Export" }).click()
      const rows = readFileSync((await (await download).path())!, "utf8").trimEnd().split("\r\n")
      return [rows[0], ...rows.slice(1).map((r) => r.split(",").slice(0, 2).join(",")).sort()]
    }
    await expect
      .poll(said, { timeout: 20_000, intervals: [500, 1_000] })
      .toEqual([
        "Note,Author,Colour,Tags,Frame,Task",
        ...[`Book the venue,${ANN}`, `Book the venue,${SAM}`, "Fast reviews,", `Fast reviews,${ANN}`, "Shipped on time,", `Shipped on time,${ANN}`].sort(),
      ])
    // Kept with the board for everyone, one maker a note; the viewer's keys made nothing.
    expect(notes()).toHaveLength(6)
    expect(Object.values(sam.makers()).map((m) => m.name).sort()).toEqual([ANN, ANN, ANN, SAM].sort())
    for (const b of [sam, ann, vic]) await b.context.close()
  })

  test("on a phone, exporting is a sheet with its action pinned in reach", async ({ browser }) => {
    test.setTimeout(90_000)
    const { context, page } = await open(browser, "phone")
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Export…" }).tap()
    const sheet = page.locator("[data-v3-sheet]").filter({ hasText: "Export this board" })
    await expect(sheet).toBeVisible()
    const run = sheet.getByRole("button", { name: "Export" })
    // A phone's sheet slides up, so its action is read where it stops.
    await expect
      .poll(async () => {
        const b = await run.boundingBox()
        return b ? b.y + b.height : Infinity
      }, { timeout: 10_000 })
      .toBeLessThanOrEqual(844)
    const box = (await run.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    for (const option of await sheet.getByRole("radio").all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await context.close()
  })
})
