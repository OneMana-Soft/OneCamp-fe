import { expect, test, type Page } from "@playwright/test"

// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"
import { finger } from "./finger"
import { FOREIGN, closeForeign, expectSheet, foreign, reachMoreTools } from "./foreignSheets"
import { openKeyboard } from "./keyboard"

// EVERY BOARD OVERLAY IS A SHEET ON A PHONE (miro-40 H1). Excalidraw's own
// overlays (More tools, a long press's menu, a colour picker, a link's editor
// and linking to an object, the library, its menu and its Reset's confirm, Save
// as image, and the shape panel's popovers: the font list and the arrowheads'
// picker) dock as the app's sheet through components/ui/foreignSheets, and the
// board's own (a new comment, a comment's thread, the AI composer) are the
// shared Drawer. Each one, at 390x844 with touch and at 390x664 with the
// keyboard up for a field, in both themes: on the bottom edge at the screen's
// width, the thing a finger meets at its middle, and its primary action in view
// and the thing a finger meets there (e2e/foreignSheets, which a call's stage
// keeps too: callBoardStates.spec). On a computer they float where they did.
//
// Two of Excalidraw's overlays a phone never reaches on the board, so no walk
// opens them there: its main menu, hidden at every width
// (components/board/excalidrawTheme.css), whose items are the board's own in
// Board options; and Help, its keyboard shortcuts, which Board options offers
// only off a phone (app/app/board/[board-id]/page.tsx: a phone has no keys to
// learn).

const BOARD = "b0a4d000-0000-4000-8000-0000000000e7"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const DRAWER = '[data-vaul-drawer][data-state="open"]'

/** An arrow on its own from (x, y), `length` to the right, its head at its end. */
const looseArrow = (id: string, x: number, y: number, length: number) =>
  Object.assign(shape(id, "arrow", x, y, length, 0), {
    points: [
      [0, 0],
      [length, 0],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
    roundness: { type: 2 },
  })

/** Sam, an editor, opens a board with a note, a box and an arrow (clear of every tap the walks make), its camera at the board's origin, in `theme`. */
async function open(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme })
  const elements = ordered([...note("venue", 40, 140, "Book the venue"), shape("box", "rectangle", 60, 420, 160, 100), looseArrow("link", 250, 380, 100)])
  const board = { uuid: BOARD, title: "Sheets", levels: LEVELS, update: boardDoc(elements) }
  await page.context().addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The demo's corner card opens after ninety seconds on a page and sat
      // over the board's box by the colour picker: turned down already
      // (components/banner/DemoLeadPrompt), as other walks seed it.
      localStorage.setItem("onecamp:demo-lead-dismissed", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the note and the box are then elsewhere, and the taps say so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(page.context(), {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]),
    fixtures: [...boardFixtures([board], USERS.sam, USERS.sam)],
  })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  // Excalidraw marks only its dark theme (theme--dark); light is its absence.
  await expect(page.locator(theme === "dark" ? ".excalidraw.theme--dark" : ".excalidraw:not(.theme--dark)").first(), `the board is ${theme}`).toBeAttached()
  const canvas = await page.locator(".excalidraw").first().boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")
  return canvas
}

/** The board's "Board options" menu on a phone, then `item`. */
async function boardOption(page: Page, item: string) {
  await page.getByRole("button", { name: "Board options" }).tap()
  await page.getByRole("menuitem", { name: item }).tap()
}

/** The board hasn't slid sideways under its tool row, so a touch on it still meets the canvas (it once left a strip no touch reached). */
async function expectBoardStill(page: Page) {
  await expect.poll(() => page.locator(".excalidraw").first().evaluate((el) => el.scrollLeft), { message: "the board never slides sideways" }).toBe(0)
}

/**
 * A finger selects what's at (x, y), and the shape panel is left shut. An open
 * panel lies over the board, so it is shut before the tap, and again if it
 * comes back with the selection. "Edit" is on a phone's tool row only while
 * something is selected (Excalidraw hides it otherwise), so it shows the tap
 * met a shape.
 */
async function select(page: Page, x: number, y: number) {
  const edit = page.locator(".App-toolbar-content").getByRole("button", { name: "Edit" })
  const panel = page.locator(".App-mobile-menu")
  if (await panel.isVisible()) await edit.tap()
  await expect(panel).toBeHidden()
  await page.touchscreen.tap(x, y)
  await expect(edit, "the tap selected a shape").toBeVisible()
  if (await panel.isVisible()) await edit.tap()
  await expect(panel).toBeHidden()
  return edit
}

/** What a finger selects at (x, y), then its shape panel: "Edit" on a phone's tool row. */
async function shapePanel(page: Page, x: number, y: number) {
  const edit = await select(page, x, y)
  await edit.tap()
  const panel = page.locator(".App-mobile-menu")
  await expect(panel).toBeVisible()
  return panel
}

/** A long press on the board's empty middle-right, held until Excalidraw's menu is up. */
async function longPress(page: Page, canvas: { x: number; y: number; width: number; height: number }) {
  const f = await finger(page)
  await f.down(canvas.x + 260, canvas.y + canvas.height * 0.45)
  await expect(page.locator(".context-menu")).toBeVisible({ timeout: 5_000 })
  await f.up()
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

  for (const theme of ["light", "dark"] as const) {
    test(`every board overlay is a sheet at 390x844 with touch, ${theme}`, async ({ page }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: 390, height: 844 })
      const canvas = await open(page, theme)

      await test.step("More tools, reached along the row", async () => {
        await reachMoreTools(page)
        await expectSheet(foreign(page, ".App-toolbar__extra-tools-dropdown"), "More tools")
        await closeForeign(page)
        await expectBoardStill(page)
      })

      await test.step("a long press's menu", async () => {
        await longPress(page, canvas)
        await expectSheet(foreign(page, ".context-menu"), "a long press's menu")
        await closeForeign(page)
      })

      await test.step("a colour picker", async () => {
        // The box's outline: Excalidraw selects a shape with no fill only
        // where a finger meets its outline, at every width (a tap at its
        // middle selects nothing), and the box is drawn unfilled.
        await page.touchscreen.tap(canvas.x + 60, canvas.y + 470)
        await page.locator(".App-toolbar-content").getByRole("button", { name: "Edit" }).tap()
        await page.locator(".App-mobile-menu .color-picker__button.active-color").first().tap()
        await expectSheet(foreign(page, ".color-picker-content"), "a colour picker")
        await closeForeign(page)
      })

      await test.step("a link's editor, then linking to an object", async () => {
        // The box is still selected, its panel open. On a phone Excalidraw's element menu, where a computer adds a
        // link, closes as the finger lifts, so the panel's "Add link" is the way in.
        await page.locator(".App-mobile-menu").getByRole("button", { name: "Add link" }).tap()
        const editor = foreign(page, ".excalidraw-hyperlinkContainer")
        await expectSheet(editor, "a link's editor")
        await editor.getByRole("button", { name: "Link to object" }).tap()
        const dialog = foreign(page, ".ElementLinkDialog")
        await expectSheet(dialog, "linking to an object", dialog.getByRole("button", { name: "Confirm" }))
        await closeForeign(page)
      })

      await test.step("the library, its menu, and its Reset's confirm", async () => {
        // The library offers to add what's selected, and then Reset has something to take, and asks first. Linking
        // to an object, shut on Escape, leaves nothing selected (h1ered1: no "Edit" on the tool row, and the
        // library's "Select an item on canvas to add it here"), so the box is selected again on its outline.
        await select(page, canvas.x + 60, canvas.y + 470)
        await boardOption(page, "Library")
        const library = foreign(page, ".sidebar")
        await expectSheet(library, "the library")
        // The pending unit takes the selection in. Its "+" pulses without end and lets taps through (pointer-events:
        // none), so a finger there meets the unit itself, .library-unit__pulse while it waits.
        await library.locator(".library-unit__pulse").first().tap()
        await library.locator(".dropdown-menu-button").first().tap()
        await expectSheet(foreign(page, ".library-menu"), "the library's menu")
        await page.locator(".library-menu .dropdown-menu-item").filter({ hasText: /Reset/ }).tap()
        const confirm = foreign(page, ".confirm-dialog-buttons")
        await expectSheet(confirm, "the library's Reset confirm", confirm.locator(".confirm-dialog-buttons"))
        await confirm.getByRole("button", { name: "Cancel" }).tap()
        await expect(confirm, "Cancel shuts the confirm and keeps the library").toHaveCount(0)
        await expect(library).toBeVisible()
        await library.getByTestId("sidebar-close").tap()
        await expect(page.locator(FOREIGN)).toHaveCount(0)
      })

      await test.step("Save as image", async () => {
        await boardOption(page, "Export…")
        const exportSheet = page.locator("[data-v3-sheet]").filter({ hasText: "Export this board" })
        await exportSheet.getByRole("radio", { name: /^Picture/ }).tap()
        await exportSheet.getByRole("button", { name: "Export" }).tap()
        const dialog = foreign(page, ".Modal__content")
        await expectSheet(dialog, "Save as image", dialog.locator(".ImageExportModal__settings__buttons"))
        await closeForeign(page)
      })

      await test.step("a new comment, then its thread", async () => {
        await page.getByRole("button", { name: "Add a comment" }).tap()
        await page.touchscreen.tap(canvas.x + 280, canvas.y + 120)
        const composer = page.locator(`${DRAWER}[data-board-comment]`)
        // Comment and Reply wait for words: disabled, no finger meets them. So the words come first.
        await composer.getByRole("textbox").fill("Bring the banners")
        await expectSheet(composer, "a new comment", composer.getByRole("button", { name: "Comment", exact: true }))
        await composer.getByRole("button", { name: "Comment", exact: true }).tap()
        // Posted, a comment opens its thread (boardComments' addComment): the one sheet left.
        const thread = page.locator(`${DRAWER}[data-board-comment]`)
        await expect(thread).toHaveCount(1)
        await expect(thread).toContainText("Bring the banners")
        await thread.getByPlaceholder("Reply… (use @ to mention)").fill("On it")
        await expectSheet(thread, "a comment's thread", thread.getByRole("button", { name: "Reply" }))
        await thread.getByRole("button", { name: "Reply" }).tap()
        await expect(thread).toContainText("On it")
        await page.keyboard.press("Escape")
        await expect(page.locator(DRAWER)).toHaveCount(0)
      })

      await test.step("in comment mode, a tap on a comment's sheet stays on the sheet", async () => {
        // A pin's tap opens its thread and leaves comment mode on. A tap in the thread's sheet then went up React's
        // tree, through the portal, to the board's overlay, which placed a new comment there: a second sheet over
        // the thread (CR-184's F1). Every sheet ends React's walk at its edge (components/ui/sheetMark).
        await page.getByRole("button", { name: "Add a comment" }).tap()
        await page.locator("[data-board-pin]").first().tap()
        const thread = page.locator(`${DRAWER}[data-board-comment]`)
        await expect(thread).toContainText("Bring the banners")
        await thread.getByPlaceholder("Reply… (use @ to mention)").tap()
        await expect(page.locator(`${DRAWER}[data-board-comment]`), "one comment sheet: the thread").toHaveCount(1)
        await expect(page.getByPlaceholder("Add a comment… (use @ to mention)"), "no new comment under the tap").toHaveCount(0)
      })
    })

    test(`a sheet with a field keeps its action on the keyboard at 390x664, and the rest dock there too, ${theme}`, async ({ page }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: 390, height: 664 })
      const canvas = await open(page, theme)

      await test.step("More tools and a long press's menu", async () => {
        await reachMoreTools(page)
        await expectSheet(foreign(page, ".App-toolbar__extra-tools-dropdown"), "More tools")
        await closeForeign(page)
        await expectBoardStill(page)
        await longPress(page, canvas)
        await expectSheet(foreign(page, ".context-menu"), "a long press's menu")
        await closeForeign(page)
      })

      await test.step("Save as image", async () => {
        await boardOption(page, "Export…")
        const exportSheet = page.locator("[data-v3-sheet]").filter({ hasText: "Export this board" })
        await exportSheet.getByRole("radio", { name: /^Picture/ }).tap()
        await exportSheet.getByRole("button", { name: "Export" }).tap()
        const dialog = foreign(page, ".Modal__content")
        await expectSheet(dialog, "Save as image", dialog.locator(".ImageExportModal__settings__buttons"))
        await closeForeign(page)
      })

      await test.step("a link's editor, then linking to an object, the keyboard up", async () => {
        // At 664 the box's outline at +470 is under the tool row: its top edge.
        await shapePanel(page, canvas.x + 140, canvas.y + 420)
        await page.locator(".App-mobile-menu").getByRole("button", { name: "Add link" }).tap()
        const editor = foreign(page, ".excalidraw-hyperlinkContainer")
        const field = editor.locator("input")
        await field.tap()
        let close = await openKeyboard(page, "visual")
        await expectSheet(editor, "a link's editor over the keyboard", field)
        await close()
        await editor.getByRole("button", { name: "Link to object" }).tap()
        const dialog = foreign(page, ".ElementLinkDialog")
        await dialog.locator("input").tap()
        close = await openKeyboard(page, "visual")
        await expectSheet(dialog, "linking to an object over the keyboard", dialog.getByRole("button", { name: "Confirm" }))
        await close()
        await closeForeign(page)
      })

      await test.step("a new comment, the keyboard up", async () => {
        await page.getByRole("button", { name: "Add a comment" }).tap()
        await page.touchscreen.tap(canvas.x + 280, canvas.y + 120)
        const composer = page.locator(`${DRAWER}[data-board-comment]`)
        await composer.getByRole("textbox").tap()
        const close = await openKeyboard(page, "visual")
        await composer.getByRole("textbox").fill("Bring the banners")
        await expectSheet(composer, "a new comment over the keyboard", composer.getByRole("button", { name: "Comment", exact: true }))
        await close()
      })
    })

    test(`the shape panel's popovers are sheets at 390x844 with touch, ${theme}`, async ({ page }) => {
      // Excalidraw's Radix popovers off the shape panel floated on a phone, beside a docked colour picker (CR-185's N1).
      test.setTimeout(90_000)
      await page.setViewportSize({ width: 390, height: 844 })
      const canvas = await open(page, theme)

      await test.step("the font list", async () => {
        const panel = await shapePanel(page, canvas.x + 130, canvas.y + 230)
        await panel.getByTestId("font-family-show-fonts").tap()
        await expectSheet(foreign(page, ".properties-content"), "the font list")
        // The list it holds is a menu's (.dropdown-menu): the font list's own, never a sheet of its own.
        await expect(page.locator(FOREIGN), "one sheet: the font list").toHaveCount(1)
        await closeForeign(page)
      })

      await test.step("the arrowheads' picker", async () => {
        const panel = await shapePanel(page, canvas.x + 300, canvas.y + 380)
        // Excalidraw names its arrowhead buttons by their keys, untranslated.
        await panel.getByRole("button", { name: "arrowhead_end" }).tap()
        await expectSheet(foreign(page, ".picker"), "the arrowheads' picker")
        await expect(page.locator(FOREIGN), "one sheet: the picker").toHaveCount(1)
        await closeForeign(page)
      })
    })
  }
})

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("the overlays float where they did: no sheet", async ({ page }) => {
    test.setTimeout(90_000)
    const canvas = await open(page, "light")

    await page.locator(".App-toolbar__extra-tools-trigger").click()
    await expect(page.locator(".App-toolbar__extra-tools-dropdown")).toBeVisible()
    await expect(page.locator(FOREIGN)).toHaveCount(0)
    await page.keyboard.press("Escape")

    await page.mouse.click(canvas.x + 700, canvas.y + 400, { button: "right" })
    await expect(page.locator(".context-menu")).toBeVisible()
    await expect(page.locator(FOREIGN)).toHaveCount(0)
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Comment", exact: true }).click()
    await page.mouse.click(canvas.x + 700, canvas.y + 300)
    await expect(page.getByPlaceholder("Add a comment… (use @ to mention)")).toBeVisible()
    await expect(page.locator("[data-vaul-drawer]")).toHaveCount(0)
  })
})
