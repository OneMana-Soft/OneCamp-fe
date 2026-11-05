import { readFileSync } from "node:fs"
import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note } from "../scripts/fluidity/fakeBoard.mjs"
import { displayNameOf } from "../lib/personName"
import { expectTouchSize } from "./touchTarget"
import { expectToastOnTop, toast } from "./toasts"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"

// A board's exports and its file in (whiteboard W-2, miro-36): More ›
// Export… saves the notes as CSV, the board as an .excalidraw file and its
// frames as a PDF (the print dialog, a page a frame); More › Open a board
// file… lays a file's drawing on the board. On a phone the export is a sheet
// with its action in reach. Every export the browser makes is told to the
// admin audit log (miro-44): the dialog's, a picture's PNG and SVG from
// Excalidraw's image dialog, and Ctrl or Cmd+S's board file, on the board's
// page and on a call's stage alike. It is told before the file is made, and
// one the log refuses (too many in a few minutes) isn't made (V-363).

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

// A call's stage (the last describe) joins with a fake camera and microphone. Playwright takes launch options
// only at a file's top level (a describe's would force a new worker), so every test here launches with them.
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

type Shared = { id: string; type: string; isDeleted?: boolean; customData?: { kind?: string } }

/** The kickoff board, its two notes from before makers were kept, on one collaboration server for everyone who opens it. */
function shareBoard(levels: Record<string, string> = LEVELS) {
  const n1 = note("n1", 0, 0, "Shipped on time")
  const n2 = note("n2", 220, 0, "Fast reviews")
  const board = { uuid: BOARD, title: "Kickoff", levels, update: boardDoc([...n1, ...n2, frame("f1", "Went well", [...n1, ...n2])]) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

/** The sidebar's list of boards (the workspace's newest 8), which the tab names a board's page from. */
const listedIn = (board: { uuid: string; title: string }) =>
  [/\/user\/sidebarNav$/, { msg: "ok", data: { user_boards: [{ board_uuid: board.uuid, board_title: board.title }] } }] as const

/** What each page here starts with, on the board's page and on a call's stage alike. Sent to the browser as its source, so it reads nothing of this file. */
function asTested() {
  try {
    localStorage.setItem("oc_keys_tip_seen", "1")
  } catch {
    /* the tip then shows; the test reads past it */
  }
  // The print dialog, standing in: what it would print.
  window.print = () => {
    ;(window as unknown as { printed: number }).printed = document.querySelectorAll("[data-board-print] section svg").length
  }
  // Excalidraw's own saves download, as in a browser without the file pickers, instead of opening a
  // save dialog that a headless browser leaves waiting.
  delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker
}

/**
 * Pictures that take their time, as a big board's or a busy laptop's do: each canvas's PNG reaches its caller
 * 600 ms late. Excalidraw's PNG button shows its spinner past 50 ms and is disabled meanwhile, which used to drop
 * the keyboard's focus to the page, so Escape missed the image dialog (V-362). Sent to the browser as its source.
 */
function slowPictures() {
  const toBlob = HTMLCanvasElement.prototype.toBlob
  HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, done: BlobCallback, type?: string, quality?: number) {
    toBlob.call(this, (blob) => window.setTimeout(() => done(blob), 600), type, quality)
  }
}

async function open(browser: Browser, device: keyof typeof DEVICES, o: { on?: ReturnType<typeof shareBoard>; user?: typeof USERS.sam; listed?: boolean } = {}) {
  const { board, collab } = o.on ?? shareBoard()
  const user = o.user ?? USERS.sam
  const context = await browser.newContext({ ...DEVICES[device], acceptDownloads: true })
  await context.addInitScript(asTested)
  const fixtures = [...(o.listed ? [listedIn(board)] : []), ...boardFixtures([board], user, USERS.sam)]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: fixtures as never })
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

/** Each export the page tells the admin log, as the server is sent it. */
function toldExports(page: Page) {
  const told: { board_uuid: string; format: string }[] = []
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/board/recordExport")) told.push(r.postDataJSON())
  })
  return told
}
const tells = (...formats: string[]) => formats.map((format) => ({ board_uuid: BOARD, format }))

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

  test("tells the admin log each export the browser makes: the dialog's, a picture's PNG and SVG, and Ctrl or Cmd+S's board file", async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page } = await open(browser, "computer", { listed: true })
    const told = toldExports(page)

    let dialog = await exportAs(page, /Notes as CSV/)
    let download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Export" }).click()
    await download
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv"))

    dialog = await exportAs(page, /^PDF/)
    await dialog.getByRole("button", { name: "Export" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: number }).printed), { timeout: 10_000 }).toBe(1)
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv", "pdf"))

    // A picture: Excalidraw's image dialog shows one and tells nothing; its PNG and SVG save one each, told. The
    // PNG takes its time here, so its button is disabled while it's made: the keyboard's focus stays in the dialog
    // and comes back to the button, so Escape still closes the dialog (V-362).
    await page.evaluate(slowPictures)
    dialog = await exportAs(page, /^Picture/)
    await dialog.getByRole("button", { name: "Export" }).click()
    await expect(dialog).toBeHidden()
    const png = page.getByRole("button", { name: "Export to PNG" })
    await expect(png).toBeVisible({ timeout: 10_000 })
    expect(told).toEqual(tells("csv", "pdf"))
    download = page.waitForEvent("download")
    await png.click()
    expect((await download).suggestedFilename()).toMatch(/\.png$/)
    await expect(png).toBeFocused()
    const svg = page.getByRole("button", { name: "Export to SVG" })
    download = page.waitForEvent("download")
    await svg.click()
    expect((await download).suggestedFilename()).toMatch(/\.svg$/)
    await expect(svg).toBeFocused()
    // Focus the person moves while a picture is made stays where they put it: here, the file's name, the image
    // dialog's one text field (a plain input there; ProjectName is only the save dialogs').
    const fileName = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Export image" }) }).getByRole("textbox")
    download = page.waitForEvent("download")
    await png.click()
    await expect(png).toBeDisabled()
    await fileName.click()
    expect((await download).suggestedFilename()).toMatch(/\.png$/)
    await expect(png).toBeEnabled()
    await expect(fileName).toBeFocused()
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv", "pdf", "picture", "picture", "picture"))
    await page.keyboard.press("Escape")
    await expect(png).toBeHidden()

    // Ctrl or Cmd+S on the board: the dialog's board file, named as the board's tab names it, and told.
    await page.locator(".excalidraw-container").first().focus()
    download = page.waitForEvent("download")
    await page.keyboard.press("ControlOrMeta+s")
    expect((await download).suggestedFilename()).toBe("Kickoff.excalidraw")
    await expect(page.getByText("Saved as Kickoff.excalidraw").first()).toBeVisible()
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv", "pdf", "picture", "picture", "picture", "file"))

    // Ctrl or Cmd+Shift+S, Excalidraw's save to disk: the same told board file.
    await page.locator(".excalidraw-container").first().focus()
    download = page.waitForEvent("download")
    await page.keyboard.press("ControlOrMeta+Shift+S")
    expect((await download).suggestedFilename()).toBe("Kickoff.excalidraw")
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv", "pdf", "picture", "picture", "picture", "file", "file"))
    await context.close()
  })

  test("on a phone, a board's exports are told too: the sheet's, and a picture's PNG", async ({ browser }) => {
    test.setTimeout(90_000)
    const { context, page } = await open(browser, "phone")
    const told = toldExports(page)
    const exportWith = async (format: RegExp) => {
      await page.getByRole("button", { name: "Board options" }).tap()
      await page.getByRole("menuitem", { name: "Export…" }).tap()
      const sheet = page.locator("[data-v3-sheet]").filter({ hasText: "Export this board" })
      await sheet.getByRole("radio", { name: format }).tap()
      await sheet.getByRole("button", { name: "Export" }).tap()
    }
    let download = page.waitForEvent("download")
    await exportWith(/Notes as CSV/)
    await download
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv"))
    await exportWith(/^Picture/)
    const png = page.getByRole("button", { name: "Export to PNG" })
    await expect(png).toBeVisible({ timeout: 10_000 })
    download = page.waitForEvent("download")
    await png.tap()
    expect((await download).suggestedFilename()).toMatch(/\.png$/)
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("csv", "picture"))
    await context.close()
  })

  test("makes no export the admin log refused, and says why on top of the dialog or sheet: the dialog's CSV and a picture's PNG on a computer, a picture's PNG on a phone", async ({ browser }) => {
    test.setTimeout(120_000)
    // Past the member's budget of tells (V-363), the server answers 429 in its own words.
    const TOO_MANY = "You've exported a lot in the last few minutes. Wait a few minutes and try again."
    for (const device of ["computer", "phone"] as const) {
      const { context, page } = await open(browser, device)
      const told = toldExports(page)
      let refusing = true
      await page.route("**/board/recordExport", (route) =>
        refusing
          ? route.fulfill({ status: 429, contentType: "application/json", headers: { "Retry-After": "600" }, body: JSON.stringify({ msg: TOO_MANY, status: "rate_limited" }) })
          : route.fallback(),
      )
      const saved: string[] = []
      page.on("download", (d) => saved.push(d.suggestedFilename()))
      // The log refused: the toast says why, on top, the tells are `formats` and no file came beyond `files`.
      const refusedHere = async (formats: string[], files: string[] = []) => {
        const words = toast(page, TOO_MANY)
        await expect(words).toBeVisible({ timeout: 10_000 })
        // Said over the dialog or the sheet it was asked from, never under it (V-491: Excalidraw's dialog layer).
        await expectToastOnTop(words)
        await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells(...formats))
        // The file is made only once the log has the tell: nothing came.
        await page.waitForTimeout(500)
        expect(saved).toEqual(files)
        refusing = false
      }
      if (device === "computer") {
        const dialog = await exportAs(page, /Notes as CSV/)
        await dialog.getByRole("button", { name: "Export" }).click()
        await refusedHere(["csv"])
        // The dialog stays, and once the log takes tells again the same Export makes the file.
        const download = page.waitForEvent("download")
        await dialog.getByRole("button", { name: "Export" }).click()
        expect((await download).suggestedFilename()).toMatch(/\.csv$/)
        expect(told).toEqual(tells("csv", "csv"))
        await page.keyboard.press("Escape")
        await expect(dialog).toBeHidden()
        // A picture: Excalidraw's own image dialog, whose PNG the log refuses, once the CSV's toast has gone.
        await expect(toast(page, TOO_MANY)).toHaveCount(0, { timeout: 15_000 })
        refusing = true
        const files = [...saved]
        const picture = await exportAs(page, /^Picture/)
        await picture.getByRole("button", { name: "Export" }).click()
        const png = page.getByRole("button", { name: "Export to PNG" })
        await expect(png).toBeVisible({ timeout: 10_000 })
        await png.click()
        await refusedHere(["csv", "csv", "picture"], files)
      } else {
        await page.getByRole("button", { name: "Board options" }).tap()
        await page.getByRole("menuitem", { name: "Export…" }).tap()
        const sheet = page.locator("[data-v3-sheet]").filter({ hasText: "Export this board" })
        await sheet.getByRole("radio", { name: /^Picture/ }).tap()
        await sheet.getByRole("button", { name: "Export" }).tap()
        const png = page.getByRole("button", { name: "Export to PNG" })
        await expect(png).toBeVisible({ timeout: 10_000 })
        await png.tap()
        await refusedHere(["picture"])
        const download = page.waitForEvent("download")
        await png.tap()
        expect((await download).suggestedFilename()).toMatch(/\.png$/)
        expect(told).toEqual(tells("picture", "picture"))
      }
      await context.close()
    }
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
    expectTouchSize(box.height)
    for (const option of await sheet.getByRole("radio").all()) expectTouchSize((await option.boundingBox())!.height, "an option")
    await context.close()
  })
})

// A call's stage mounts the board's canvas without the board's page (no Export
// dialog there), so what Excalidraw exports itself is all a member can save
// from it, and it is told as on the page. The call connects to a fake server
// (fakeCallServer), so the board goes up on the stage as LiveKit brings it.
test.describe("a board's exports on a call's stage", () => {
  const CALL = "c0ffee00-0000-4000-8000-0000000000ce"
  const SESSION = "5e550000-0000-4000-8000-0000000000ae"
  const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }

  test("tells a picture's PNG once, and Ctrl or Cmd+S's board file, named Board: the call's tab names no board", async ({ browser }) => {
    test.setTimeout(180_000)
    const { board, collab } = shareBoard()
    const user = USERS.sam
    const context = await browser.newContext({ ...DEVICES.computer, acceptDownloads: true, permissions: ["camera", "microphone"] })
    await context.addInitScript(asTested)
    const call = [
      [/\/config\/client$/, { msg: "ok", data: { features: { calls: true } } }],
      [/\/ch\/getCallToken$/, { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } }],
      [/\/ch\/channelBasicInfo/, { msg: "ok", channel_info: { ch_uuid: CALL, ch_name: "launch", ch_is_admin: false, ch_call_active: true } }],
      [/\/calls\/current$/, { msg: "ok", data: { live: true, session: { id: SESSION, people: [] }, you: { role: "participant", can: [] } } }],
    ]
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: [...call, ...boardFixtures([board], user, USERS.sam)] as never })
    const page = await context.newPage()
    const told = toldExports(page)
    // Priya presents the kickoff board, and everyone draws on it.
    const server = await fakeCallServer(page, {
      you: { identity: user.user_uuid, name: SAM },
      others: [PRIYA],
      metadata: { board: { uuid: BOARD, by: PRIYA.identity, draw: "everyone" } },
    })
    await page.goto(`/app/meet/ch/${CALL}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
    await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
    await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
    const canvas = page.locator("[data-board-canvas] .excalidraw-container").first()

    // A picture: Excalidraw's own image dialog, its PNG saved and told once. It takes its time, as on the board's
    // page, and the keyboard's focus comes back to its button, so Escape closes the dialog (V-362).
    await page.evaluate(slowPictures)
    await canvas.focus()
    await page.keyboard.press("ControlOrMeta+Shift+E")
    const png = page.getByRole("button", { name: "Export to PNG" })
    await expect(png).toBeVisible({ timeout: 10_000 })
    let download = page.waitForEvent("download")
    await png.click()
    expect((await download).suggestedFilename()).toMatch(/\.png$/)
    await expect(png).toBeFocused()
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("picture"))
    await page.keyboard.press("Escape")
    await expect(png).toBeHidden()

    // Ctrl or Cmd+S: the board file, told. The call's tab names the call, so the file is "Board".
    await canvas.focus()
    download = page.waitForEvent("download")
    await page.keyboard.press("ControlOrMeta+s")
    expect((await download).suggestedFilename()).toBe("Board.excalidraw")
    await expect(page.getByText("Saved as Board.excalidraw").first()).toBeVisible()
    await expect.poll(() => told, { timeout: 10_000 }).toEqual(tells("picture", "file"))
    await context.close()
  })
})
