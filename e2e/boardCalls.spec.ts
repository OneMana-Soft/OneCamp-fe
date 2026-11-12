import { expect, test, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory collaboration server.
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"

// miro-27 H5b1, calls with the board: the board's Call button lists the calls that showed it, as
// GET /board/getBoardCalls/{board} answers its reader. A call going on now offers Join, its conversation's own call
// page; one that ended shows when and how long, where, who showed it and what it kept: its recording and its words
// open in the one player by the conversation's own routes, its notes open as a doc. A board no call showed says so;
// a refused read says so with Try again. A computer's is a popover; a phone's a sheet with its footer pinned.
// The route is the backend head H5a's, not on beta yet: the fake server answers it here.

const BOARD = "b0a4d000-0000-4000-8000-0000000000e5"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const ME = USERS.sam.user_uuid
const LEE = "5a7a1c11-0000-4000-8000-00000000001e"
const CH = "c4a11000-0000-4000-8000-0000000000c1"
const NOTES = "d0c00000-0000-4000-8000-0000000000e1"
const hour = (h: number, m = 0) => new Date(Date.now() - h * 3_600_000 + m * 60_000).toISOString()

const LIVE = { session_id: "s-live", kind: "dm", conversation: `${ME} ${LEE}`, started_at: hour(0, -20), live: true, on_stage: true, shown_by: "Lee Park", shown_at: hour(0, -18), people: 2, artefacts: [] }
const PAST = {
  session_id: "s-past", kind: "channel", conversation: CH, started_at: hour(26), ended_at: hour(26, 42), live: false, on_stage: false, shown_by: "Maya Chen", shown_at: hour(26, 3), people: 4,
  artefacts: [
    { key: "call-s-past", started_at: hour(26), ended_at: hour(26, 42), lines: 3, notes_doc: NOTES, recorded: false },
    { key: "EG_board", started_at: hour(26, 1), ended_at: hour(26, 40), lines: 3, recorded: true },
  ],
}

type Answer = unknown | (() => unknown)

/** The board, opened by Sam on this test's screen, its calls answered by `calls`; `log` gets every API call. */
async function open(page: Page, calls: Answer, log: string[]) {
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(note("n1", 40, 120, "Agenda")) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  await page.context().addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows, beside the test */
    }
  })
  const words = { msg: "ok", data: { recording_transcript: [{ transcript_from: { ...USERS.sam, user_profile_object_key: "" }, transcript_text: "Let's walk the launch plan.", transcript_timestamp: 0, transcript_offset_ms: 0 }], transcript_count: 1 }, pageCount: 1 }
  const fixtures: Array<[RegExp, unknown]> = [
    [/\/board\/getBoardCalls\//, () => (typeof calls === "function" ? (calls as () => unknown)() : calls)],
    [/\/ch\/getRecordingURL\//, (path: string) => ({ msg: "ok", data: path.endsWith("/EG_board") ? { status: "recording" } : { status: "transcript_only" } })],
    [/\/ch\/getRecordingTranscript\//, words],
    ...boardFixtures([board], USERS.sam, USERS.sam),
  ]
  await fakeApp(page.context(), { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [], collab, fixtures, log })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const button = page.locator("[data-board-call]")
  await expect(button).toBeVisible({ timeout: 20_000 })
  await expect(button).toHaveAccessibleName("Calls with this board")
  return { button, panel: page.getByRole("dialog", { name: "Calls with this board" }) }
}

const listed = (calls: unknown[]) => ({ msg: "ok", data: { calls } })
/** A past call like PAST, `days` days before it, which kept its recording, words and notes, or nothing. */
const pastOn = (days: number, kept: boolean) => {
  const h = 26 + 24 * days
  const artefacts = [
    { key: `call-s-past-${days}`, started_at: hour(h), ended_at: hour(h, 42), lines: 3, notes_doc: NOTES, recorded: false },
    { key: `EG_board_${days}`, started_at: hour(h, 1), ended_at: hour(h, 40), lines: 3, recorded: true },
  ]
  return { ...PAST, session_id: `s-past-${days}`, started_at: hour(h), ended_at: hour(h, 42), shown_at: hour(h, 3), artefacts: kept ? artefacts : [] }
}

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [
    [1280, false],
    [390, true],
  ] as const) {
    test.describe(`a board's calls at ${width}${phone ? " with touch" : ""}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("lists a live call to join and a past one whose recording and words open in the one player", async ({ page }) => {
        test.setTimeout(120_000)
        const log: string[] = []
        const b = await open(page, listed([PAST, LIVE]), log)
        await b.button.click()
        await expect(b.panel).toBeVisible()
        const live = b.panel.getByRole("region", { name: "On a call now" })
        await expect(live).toContainText("In a direct message")
        await expect(live).toContainText("Lee Park put it up")
        await expect(live.getByRole("link", { name: "Join" })).toHaveAttribute("href", `/app/meet/chat/${LEE}`)
        const past = b.panel.getByRole("region", { name: "Calls with this board" })
        await expect(past).toContainText("In a channel · shown by Maya Chen")
        await expect(past.getByRole("link", { name: "Call notes" })).toHaveAttribute("href", `/app/doc/${NOTES}`)
        await expect(past.getByRole("link", { name: "Its chat" })).toHaveAttribute("href", `/app/channel/${CH}`)
        // A conversation's call keeps no recap chat of its own (only an event's call does), so its chat is linked once.
        await expect(past.getByRole("link", { name: "Conversation" })).toHaveCount(0)
        // The list lines up under the title, as the other overlays' bodies do (DESIGN-BUILD-122 F2).
        const title = b.panel.getByRole("heading", { name: "Calls", exact: true })
        await expect.poll(async () => Math.round((await past.boundingBox())!.x) - Math.round((await title.boundingBox())!.x)).toBe(0)
        if (phone) {
          // A sheet at the screen's foot once it has slid up, its Done pinned under the list.
          await expect.poll(async () => b.panel.boundingBox().then((box) => box && Math.round(box.y + box.height))).toBe(844)
          await expect(b.panel.locator("[data-overlay-footer]").getByRole("button", { name: "Done" })).toBeVisible()
        } else {
          expect((await b.panel.boundingBox())!.width).toBeLessThan(400)
          await expect(b.panel.locator("[data-overlay-footer]")).toHaveCount(0)
        }
        await reviewShot(page, "board-calls-list", theme)

        await past.getByRole("button", { name: "Play recording" }).click()
        const player = page.getByRole("dialog").filter({ hasNot: page.locator("[data-board-calls]") })
        await expect(player).toBeVisible()
        await expect.poll(() => log.filter((l) => l === `GET /ch/getRecordingURL/${CH}/EG_board`).length).toBeGreaterThan(0)
        await expect.poll(() => log.some((l) => l.startsWith(`GET /ch/getRecordingTranscript/${CH}/EG_board`))).toBe(true)
        await page.keyboard.press("Escape")
        await expect(player).toBeHidden()

        await b.button.click()
        await b.panel.getByRole("button", { name: "Read transcript" }).click()
        await expect(page.getByRole("dialog")).toContainText("Let's walk the launch plan.")
        expect(log).toContain(`GET /ch/getRecordingURL/${CH}/call-s-past`)
        expect(log.some((l) => l.startsWith(`GET /ch/getRecordingTranscript/${CH}/call-s-past`))).toBe(true)
        // Read afresh on each open.
        expect(log.filter((l) => l === `GET /board/getBoardCalls/${BOARD}`)).toHaveLength(2)
      })

      test("says a board no call showed has none", async ({ page }) => {
        const b = await open(page, listed([]), [])
        await b.button.click()
        await expect(b.panel.getByRole("heading", { name: "No calls with this board yet." })).toBeVisible()
        await expect(b.panel).toContainText("Show this board in a call, and its recording, words and notes gather here.")
        await expect(b.panel.getByRole("region", { name: "Calls with this board" })).toHaveCount(0)
        await reviewShot(page, "board-calls-empty", theme)
      })

      test("says a refused read with Try again, which reads again", async ({ page }) => {
        let refuse = true
        const b = await open(page, () => (refuse ? status(403, { msg: "Not authorised" }) : listed([PAST])), [])
        await b.button.click()
        const alert = b.panel.getByRole("alert")
        await expect(alert).toContainText("Couldn't load this board's calls.")
        await reviewShot(page, "board-calls-error", theme)
        refuse = false
        await alert.getByRole("button", { name: "Try again" }).click()
        await expect(b.panel).toContainText("In a channel · shown by Maya Chen")
        // A refusal never signs anyone out.
        await expect(page).toHaveURL(new RegExp(`/app/board/${BOARD}$`))
      })

      test("draws a skeleton while the read is out, said as loading, and the list once it comes", async ({ page }) => {
        const b = await open(page, listed([PAST]), [])
        let release = () => {}
        const held = new Promise<void>((r) => (release = r))
        // The page's own route goes before the fake server's: it holds the read, then hands it on.
        await page.route(/\/board\/getBoardCalls\//, async (route) => {
          if (route.request().method() === "GET") await held
          await route.fallback()
        })
        await b.button.click()
        const busy = b.panel.locator('[aria-busy="true"][data-board-calls-loading]')
        await expect(busy).toBeVisible()
        await expect(busy).toContainText("Loading calls…")
        await expect(busy.locator(".animate-pulse")).toHaveCount(3)
        await reviewShot(page, "board-calls-loading", theme)
        release()
        await expect(b.panel).toContainText("In a channel · shown by Maya Chen")
        await expect(busy).toHaveCount(0)
      })

      test("says it is offline with Try again when it has no list yet, and reads once the app is back", async ({ page }) => {
        const log: string[] = []
        const b = await open(page, listed([PAST]), log)
        await page.context().setOffline(true)
        await b.button.click()
        const alert = b.panel.getByRole("alert")
        await expect(alert).toContainText("You're offline. This board's calls show once you're back.")
        await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible()
        // Offline, it asks nobody.
        expect(log.filter((l) => l === `GET /board/getBoardCalls/${BOARD}`)).toHaveLength(0)
        await reviewShot(page, "board-calls-offline", theme)
        await page.context().setOffline(false)
        await expect(b.panel).toContainText("In a channel · shown by Maya Chen")
        await expect(alert).toHaveCount(0)
      })

      test("keeps the last list when it is offline at a reopen, said to be the last, and reads again once the app is back", async ({ page }) => {
        const log: string[] = []
        const b = await open(page, listed([PAST]), log)
        await b.button.click()
        await expect(b.panel).toContainText("In a channel · shown by Maya Chen")
        if (phone) await b.panel.getByRole("button", { name: "Done" }).click()
        else await page.keyboard.press("Escape")
        await expect(b.panel).toBeHidden()
        await page.context().setOffline(true)
        await b.button.click()
        const kept = b.panel.getByRole("status").filter({ hasText: "You're offline: these are the calls as they were when you last looked." })
        await expect(kept).toBeVisible()
        await expect(b.panel.getByRole("region", { name: "Calls with this board" })).toContainText("In a channel · shown by Maya Chen")
        await expect(b.panel.getByRole("alert")).toHaveCount(0)
        await reviewShot(page, "board-calls-offline-kept", theme)
        await page.context().setOffline(false)
        await expect(kept).toHaveCount(0)
        await expect.poll(() => log.filter((l) => l === `GET /board/getBoardCalls/${BOARD}`).length).toBe(2)
        await expect(b.panel).toContainText("In a channel · shown by Maya Chen")
      })

      test("lists many past calls in one scroller, a call that kept nothing still offering its chat", async ({ page }) => {
        const b = await open(page, listed([0, 1, 2, 3, 4].map((d) => pastOn(d, d !== 2))), [])
        await b.button.click()
        const past = b.panel.getByRole("region", { name: "Calls with this board" })
        await expect(past.locator("[data-board-call-past]")).toHaveCount(5)
        const bare = past.locator('[data-board-call-past="s-past-2"]')
        await expect(bare.getByRole("link", { name: "Its chat" })).toHaveAttribute("href", `/app/channel/${CH}`)
        await expect(bare.getByRole("button", { name: "Play recording" })).toHaveCount(0)
        await expect(past.getByRole("button", { name: "Play recording" })).toHaveCount(4)
        const body = b.panel.locator("[data-overlay-body]")
        if (phone) {
          // The sheet scrolls: the footer's hairline is the cue while more is below (app/overlay.css), and only then.
          await expect(body).toHaveAttribute("data-more-below", "")
          await reviewShot(page, "board-calls-long", theme)
          await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
          await expect(body).not.toHaveAttribute("data-more-below")
          await reviewShot(page, "board-calls-long-end", theme)
        } else {
          await reviewShot(page, "board-calls-long", theme)
        }
      })
    })
  }
}
