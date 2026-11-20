import { expect, test, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"
import type { Box } from "./boxes"

/** The board Sam, an editor, opens in the phone and touch-target specs. */
export const BOARD = "b0a4d000-0000-4000-8000-0000000000f2"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }

/** Two notes and a box, the board the phone specs draw on. */
export const NOTES_AND_BOX = () =>
  ordered([...note("venue", 40, 140, "Book the venue"), ...note("recap", 200, 140, "Send the recap"), shape("box", "rectangle", 60, 420, 160, 100)])

export type OpenBoard = {
  theme?: "light" | "dark"
  /** A round of dot voting under way (three votes each, started by Lee). */
  voting?: boolean
  /** What the board holds; [] is an empty board, which offers "Start with a template". */
  elements?: unknown[]
  /** Comment threads on the board, by id (the collaboration doc's "comments" map). */
  comments?: Record<string, unknown>[]
}

/**
 * Sam, an editor, opens the board, its camera at the origin, with three saved versions and no viewers yet. Resolves
 * to the canvas's box once the board has synced and its chrome is drawn.
 */
export async function openBoard(page: Page, { theme = "light", voting = false, elements = NOTES_AND_BOX(), comments = [] }: OpenBoard = {}): Promise<Box> {
  await page.emulateMedia({ colorScheme: theme })
  const board = { uuid: BOARD, title: "Phone bar", levels: LEVELS, update: boardDoc(elements) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  if (voting) collab.doc(NAME).getMap("facilitation").set("voting", { id: "r1", perPerson: 3, byId: "lee", byName: "Lee" })
  for (const c of comments) collab.doc(NAME).getMap("comments").set(String(c.id), c)
  await page.context().addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem("onecamp:demo-lead-dismissed", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the notes are then elsewhere, and the taps say so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  const snapshot = (id: string, minutes: number) => ({ id, element_count: 3, state_bytes: 900, reason: "interval", created_at: new Date(Date.now() - minutes * 60_000).toISOString() })
  await fakeApp(page.context(), {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab,
    fixtures: [[/\/board\/getBoardSnapshots/, { msg: "ok", data: [snapshot("s1", 5), snapshot("s2", 90), snapshot("s3", 600)] }], [/\/board\/getViewers/, { msg: "ok", data: [], count: 0 }], ...boardFixtures([board], USERS.sam, USERS.sam)],
  })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await expect(page.locator("[data-board-phone-actions], [data-board-chrome]").first()).toBeVisible()
  const canvas = await page.locator(".excalidraw").first().boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")
  return canvas
}
