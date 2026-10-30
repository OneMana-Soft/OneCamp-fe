import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// Voting from the notes bar (miro-07 6): while a round of dot voting is on, the
// bar beside selected notes has Vote, on Alt+U, which gives each of them the
// person's vote, or takes them all back, in the same round the facilitation
// bar runs (components/board/useBoardVoting): its dots on the notes and the
// shared votes say the same.

const BOARD = "b0a4d000-0000-4000-8000-0000000000b8"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const ROUND = "r1"
const MINE = `${ROUND}:${USERS.sam.user_uuid}`

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

/** Two notes side by side, and a round of voting on the board, `perPerson` votes each. */
function votingBoard(perPerson: number) {
  const notes = [...note("venue", 40, 120, "Book the venue"), ...note("recap", 240, 120, "Send the recap")]
  const board = { uuid: BOARD, title: "Sprint retro", levels: LEVELS, update: boardDoc(ordered(notes)) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  collab.doc(NAME).getMap("facilitation").set("voting", { id: ROUND, perPerson, byId: "lee", byName: "Lee" })
  return { board, collab }
}

async function open(browser: Browser, device: keyof typeof DEVICES, perPerson = 3) {
  const { board, collab } = votingBoard(perPerson)
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(
    (key: string) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        // The camera at the board's origin, so the notes are where they were drawn.
        localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      } catch {
        /* the notes are then elsewhere, and the test says so */
      }
    },
    `onecamp:board:viewport:${BOARD}`,
  )
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [], collab, fixtures: [...boardFixtures([board], USERS.sam, USERS.sam)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const mine = () => (collab.doc(NAME).getMap("votes").get(MINE) as string[] | undefined) ?? []
  const canvas = await page.locator(".excalidraw").first().boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")
  return { context, page, mine, canvas }
}

test("on a computer, Alt+U votes for each selected note and takes them all back from Vote, as the dots say", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "computer")
  // The round is on: the facilitation bar's dots offer a vote on each note.
  await expect(b.page.getByRole("button", { name: "Vote for Book the venue" })).toBeVisible()
  await b.page.mouse.click(b.canvas.x + 130, b.canvas.y + 150)
  await b.page.keyboard.down("Shift")
  await b.page.mouse.click(b.canvas.x + 330, b.canvas.y + 150)
  await b.page.keyboard.up("Shift")
  const bar = b.page.locator("[data-notes-bar]")
  await expect(bar.getByRole("toolbar", { name: "2 notes" })).toBeVisible()
  const vote = bar.getByRole("button", { name: "Vote", exact: true })
  await expect(vote).toHaveAttribute("title", "Vote (Alt + U): 3 left")
  // No number on the button (the votes left are in its title and the facilitation bar), and not pressed yet.
  await expect(vote).toHaveText("")
  await expect(vote).toHaveAttribute("aria-pressed", "false")
  await b.page.keyboard.press("Alt+u")
  await expect.poll(b.mine, { timeout: 5_000 }).toEqual(["venue", "recap"])
  // Both dots are the person's now, the bar's Vote is pressed, and one vote is left.
  for (const text of ["Book the venue", "Send the recap"]) {
    await expect(b.page.getByRole("button", { name: `Take back your vote for ${text}` })).toHaveAttribute("aria-pressed", "true")
  }
  await expect(vote).toHaveAttribute("aria-pressed", "true")
  await expect(vote).toHaveAttribute("title", "Vote (Alt + U): 1 left")
  await vote.click()
  await expect.poll(b.mine, { timeout: 5_000 }).toEqual([])
  await expect(b.page.getByRole("button", { name: "Vote for Send the recap" })).toHaveAttribute("aria-pressed", "false")
  await expect(vote).toHaveAttribute("aria-pressed", "false")
  await b.context.close()
})

test("on a computer, a vote for more notes than are left changes nothing and says so", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "computer", 1)
  await b.page.mouse.click(b.canvas.x + 130, b.canvas.y + 150)
  await b.page.keyboard.down("Shift")
  await b.page.mouse.click(b.canvas.x + 330, b.canvas.y + 150)
  await b.page.keyboard.up("Shift")
  await b.page.locator("[data-notes-bar]").getByRole("button", { name: "Vote", exact: true }).click()
  await expect(b.page.getByText("1 vote left", { exact: true })).toBeVisible()
  // A refusal reads neutral: the info tile, never the success tick.
  await expect(b.page.locator('[data-tone="info"]').filter({ hasText: "1 vote left" })).toBeVisible()
  await b.page.waitForTimeout(500)
  expect(b.mine()).toEqual([])
  await b.context.close()
})

test("on a phone, a tap on Vote in the notes bar votes for the note, and a second takes it back", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "phone")
  await expect(b.page.getByRole("button", { name: "Vote for Book the venue" })).toBeVisible()
  await b.page.touchscreen.tap(b.canvas.x + 130, b.canvas.y + 150)
  const vote = b.page.locator("[data-notes-bar]").getByRole("button", { name: "Vote", exact: true })
  await vote.tap()
  await expect.poll(b.mine, { timeout: 5_000 }).toEqual(["venue"])
  await expect(vote).toHaveAttribute("aria-pressed", "true")
  await expect(vote).toHaveText("")
  await expect(b.page.getByRole("button", { name: "Take back your vote for Book the venue" })).toHaveAttribute("aria-pressed", "true")
  await vote.tap()
  await expect.poll(b.mine, { timeout: 5_000 }).toEqual([])
  await b.context.close()
})
