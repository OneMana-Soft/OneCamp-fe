import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures } from "../scripts/fluidity/fakeBoard.mjs"

// A board brought over from Miro (whiteboard W-2, miro-37) opens as any board
// does. The server writes its drawing with no restore pass after it (the
// canvas puts the shared document's elements on the scene as they are), so
// every kind the import draws, from notes and outlines to bound arrows,
// placeholders and frame fills, must be whole as written. The fixture is the
// backend converter's golden board (business/Import/providers/miro/testdata/
// board.golden.json), copied.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f4"
const LEVELS = { sam: "edit" }
type Element = { id: string; type: string; isDeleted?: boolean; customData?: { kind?: string } }
const { elements } = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "miroBoard.json"), "utf8")) as { elements: Element[] }

test("a board brought from Miro opens with everything on it, and its notes are notes", async ({ browser }) => {
  test.setTimeout(90_000)
  const board = { uuid: BOARD, title: "Launch retro", levels: LEVELS, update: boardDoc(elements) }
  const collab = collabFor([{ id: boardDocName(BOARD), update: board.update, levels: LEVELS }])
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows; the test reads past it */
    }
  })
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab,
    fixtures: boardFixtures([board], USERS.sam, USERS.sam) as never,
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/app/board/${BOARD}`)

  const live = elements.filter((e) => !e.isDeleted).length
  const canvas = page.locator('[data-board-canvas][data-board-synced="true"]')
  await expect(canvas).toBeAttached({ timeout: 30_000 })
  await expect(canvas).toHaveAttribute("data-board-elements", String(live), { timeout: 10_000 })
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible()

  // A note that came from Miro is a note to the board: its bar opens on it.
  const notes = elements.filter((e) => e.customData?.kind === "note")
  expect(notes.length).toBeGreaterThan(2)
  await page.locator(".excalidraw").first().focus()
  await page.keyboard.press("Control+a")
  await expect(page.locator("[data-notes-bar]")).toBeVisible({ timeout: 5_000 })

  expect(errors).toEqual([])
  await context.close()
})
