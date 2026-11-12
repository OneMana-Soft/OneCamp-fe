import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { boxOf, overlap, type Box } from "./boxes"
import { takesAFinger } from "./menuReach"
import { animationsSettled } from "./settled"
import { SHOT_THEMES, mqttConfig, reviewShot } from "./stubbedApp"

// Polls on a slide (miro-28 to_win 4, Miro's Slides with polls): Sam, presenting, puts a poll on the Q4 numbers slide
// from the slide bar (a popover at 1280, a drawer at 390); Vic, following, votes on the slide's card, and the tally
// moves for both as Ann votes elsewhere (the server's MESSAGE_POLL_UPDATE on the board's topic, no reload); Sam
// closes it and Vic's card says so, with no Close of Vic's own; a share link's guest reads the question and the tally
// (asked every 5 s, no MQTT) and never gets a vote control. At 1280 the card sits in a strip the slide's fit leaves on
// the right; at 390 it folds into a bar above the slide bar that opens it in a drawer; neither covers the slide. A
// keyboard's focus lands on the new card's Close poll after Start poll, and on Add a poll after Close poll. A read that
// fails and a start the server refuses say so in words. At 1280 and at 390 with touch, light and dark.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f9"
const NAME = boardDocName(BOARD)
const TOPIC = `onecamp/board/${BOARD}`
const GUEST_TOKEN = "guest-link-poll-board"
const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES
type Who = "sam" | "vic" | "ann" | "guest"

function shareBoard() {
  const elements: unknown[] = []
  ;[["f-intro", "Intro", "Welcome"], ["f-q4", "Q4 numbers", "Revenue up 12%"]].forEach(([id, name, text], i) => {
    const [card, label] = note(`n-${id}`, 100 + i * 600, 100, text)
    elements.push(frame(id, name, [card, label]), card, label)
  })
  const levels: Record<string, string> = { sam: "edit", vic: "view", ann: "edit", guest: "view" }
  const board = { uuid: BOARD, title: "Q4 review", levels, topic: TOPIC, update: boardDoc(ordered(elements)) }
  const q4 = elements.find((e) => (e as { id: string }).id === "f-q4") as { x: number; y: number; width: number; height: number }
  return { board, q4, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

/** The polls' server: one poll list for the board, each reader's own choice in `mine`, Close for its editors. */
function pollsServer() {
  type Kept = { id: string; frame_id: string; question: string; multiple: boolean; options: { id: string; text: string }[]; votes: Map<Who, string[]>; closed: boolean }
  const polls: Kept[] = []
  const sent: string[] = []
  const view = (p: Kept, who: Who) => ({
    id: p.id, channel_uuid: "", question: p.question, multiple: p.multiple, closed: p.closed, board_uuid: BOARD, frame_id: p.frame_id,
    options: p.options.map((o) => ({ ...o, votes: [...p.votes.values()].filter((m) => m.includes(o.id)).length })),
    voters: [...p.votes.values()].filter((m) => m.length > 0).length,
    mine: who === "guest" ? [] : p.votes.get(who) ?? [], can_close: who === "sam" || who === "ann", created_by: who === "guest" ? "" : USERS.sam.user_uuid,
  })
  const fixtures = (who: Who): [RegExp, unknown][] => [
    [new RegExp(`/guest/board-polls/${GUEST_TOKEN}$`), () => ({ msg: "ok", data: { polls: polls.map((p) => view(p, "guest")), workspace_name: "Acme" } })],
    [new RegExp(`/board/polls/${BOARD}$`), () => ({ msg: "ok", data: polls.map((p) => view(p, who)) })],
    [/\/board\/polls$/, (_p: string, _u: URL, req: { postDataJSON(): Record<string, unknown> }) => {
      const b = req.postDataJSON() as { frame_id: string; question: string; options: string[]; multiple: boolean }
      sent.push(`${who} start ${b.frame_id}`)
      if (who !== "sam" && who !== "ann") return status(403, { msg: "Only people who can edit this board start or close its polls." })
      const p: Kept = { id: `p${polls.length + 1}`, frame_id: b.frame_id, question: b.question, multiple: b.multiple, options: b.options.map((text, i) => ({ id: `o${i}`, text })), votes: new Map(), closed: false }
      polls.push(p)
      return { msg: "ok", data: view(p, who) }
    }],
    [/\/poll\/[^/]+\/vote$/, (path: string, _u: URL, req: { postDataJSON(): { option_ids: string[] } }) => {
      const p = polls.find((x) => path.includes(`/poll/${x.id}/`))!
      sent.push(`${who} vote ${req.postDataJSON().option_ids.join(",")}`)
      p.votes.set(who, req.postDataJSON().option_ids)
      return { msg: "ok", data: view(p, who) }
    }],
    [/\/poll\/[^/]+\/close$/, (path: string) => {
      const p = polls.find((x) => path.includes(`/poll/${x.id}/`))!
      sent.push(`${who} close`)
      p.closed = true
      return { msg: "ok", data: view(p, who) }
    }],
  ]
  return { polls, sent, fixtures, voteAs: (who: Who, p: number, ids: string[]) => polls[p].votes.set(who, ids) }
}

type Server = { fixtures: (who: Who) => [RegExp, unknown][] }

async function open(browser: Browser, device: Device, on: ReturnType<typeof shareBoard>, who: "sam" | "vic", theme: string, server: Server) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark" })
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the camera starts elsewhere */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  const user = USERS[who]
  // The realtime broker answers (fakeBroker.mjs): the test says on the board's topic what the server would. The app
  // asks /config/mqttConfig where it is (as scripts/fluidity/surfaces/realtime.mjs answers it): an onecamp-emqx
  // address, the socket fakeApp hands its broker.
  const live = mqttConfig([`user/${user.user_uuid}`])
  live.data.ws_url = "ws://onecamp-emqx.e2e.test/mqtt"
  const options = { app: String(test.info().project.use.baseURL), user, docs: [], collab: on.collab, broker: true, fixtures: [[/\/config\/mqttConfig$/, live] as [RegExp, unknown], ...server.fixtures(who), ...boardFixtures([on.board], user, USERS.sam)] }
  const { broker } = await fakeApp(context, options)
  if (!broker) throw new Error("no broker")
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page, broker }
}

async function openGuest(browser: Browser, device: Device, on: ReturnType<typeof shareBoard>, theme: string, server: Server) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark" })
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Q4 review", workspace_name: "Acme" }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: on.collab, fixtures: [...server.fixtures("guest"), [new RegExp(`/guest/collab/${GUEST_TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${GUEST_TOKEN}`)
  await expect(page.locator("[data-guest-board]")).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

/** What the server says on the board's topic when a poll starts (0) or is voted in or closed (1). */
const pollMessage = (type: 0 | 1, poll: string) => ({ type: 30, data: { type, poll_uuid: poll, channel_uuid: "", board_uuid: BOARD, frame_id: "f-q4" } })
const card = (page: Page) => page.getByRole("region", { name: "Poll on this slide" })
/** A phone's poll at rest: a bar above the slide bar, the question and how it stands, which opens the card in a drawer. */
const pollBar = (page: Page) => page.getByRole("button", { name: /^Poll on this slide: / })
/**
 * A bar at 390 at rest is 44 px tall and takes a finger. Read once its float-in is over (content-float's scale(0.98)
 * to 1 over 180 ms, e2e/settled): read before, Sam's bar just after Start poll measured 43.45 and 43.83 px.
 */
async function expectBarAtRest(bar: Locator, whose: string, tap = true) {
  await animationsSettled(bar)
  expect((await bar.boundingBox())?.height, `${whose} bar is 44 px`).toBe(44)
  if (tap) expect(await takesAFinger(bar), `${whose} bar takes a finger`).toBe(true)
}
/** The card: on a computer it's beside the slide; on a phone its bar opens it in a drawer. */
async function openCard(page: Page, device: Device) {
  if (device === "phone" && !(await card(page).isVisible())) await pollBar(page).tap()
  await expect(card(page)).toBeVisible()
  // A drawer is read once it has risen: until then its pinned foot (Close poll) is below the screen.
  if (device === "phone") await animationsSettled(card(page))
  return card(page)
}
/** A phone's drawer put away, back to the bar at rest. */
async function putAway(page: Page, device: Device) {
  if (device !== "phone") return
  await page.keyboard.press("Escape")
  await expect(card(page)).toHaveCount(0)
}

/** The Q4 numbers frame's box on this screen, by the camera the board keeps (saved ~400 ms after it moves). */
function slideBox(page: Page, q4: ReturnType<typeof shareBoard>["q4"]): Promise<Box | null> {
  return page.evaluate(
    ({ key, f }) => {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as { scrollX: number; scrollY: number; zoom: number } | null
      const canvas = document.querySelector(".excalidraw")?.getBoundingClientRect()
      if (!v || !canvas) return null
      return { x: canvas.left + (f.x + v.scrollX) * v.zoom, y: canvas.top + (f.y + v.scrollY) * v.zoom, width: f.width * v.zoom, height: f.height * v.zoom }
    },
    { key: `onecamp:board:viewport:${BOARD}`, f: q4 },
  )
}
/** Nothing of the slide sits under the poll (its card on a computer, its bar on a phone) once the fit has left its strip. */
const expectClearOfSlide = (page: Page, q4: ReturnType<typeof shareBoard>["q4"], poll: Locator, who: string) =>
  expect
    .poll(
      async () => {
        const [slide, over] = [await slideBox(page, q4), await poll.boundingBox()]
        return slide && over ? overlap(slide, over) : "not drawn"
      },
      { message: `nothing of the slide sits under the poll on ${who}'s screen`, timeout: 10_000 },
    )
    .toBeNull()

/** Tabs to `to` (at most 8 presses) and checks its ring shows, as it does when a keyboard reaches it. */
async function tabTo(page: Page, to: Locator, what: string) {
  for (let i = 0; i < 8 && !(await to.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(to, `Tab reaches ${what}`).toBeFocused()
}
const ringShows = (l: Locator) => l.evaluate((e) => e.matches(":focus-visible"))

for (const device of ["computer", "phone"] as const) {
  for (const theme of SHOT_THEMES) {
    test(`A poll on a slide: the presenter starts it, a follower votes and the tally moves live, the presenter closes it, a guest only reads (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const on = shareBoard()
      const server = pollsServer()
      const press = device === "phone" ? "tap" : "click"
      const sam = await open(browser, device, on, "sam", theme, server)
      const vic = await open(browser, device, on, "vic", theme, server)
      const guest = await openGuest(browser, device, on, theme, server)

      // Sam presents and moves to Q4 numbers; nobody has a poll yet, so no card loads anywhere.
      await sam.page.getByRole("toolbar", { name: "Facilitation" }).getByRole("button", { name: "Present", exact: true })[press]()
      const slides = sam.page.locator("[data-board-slides]").getByRole("group", { name: "Slides" })
      await slides.getByRole("button", { name: "Next slide" })[press]()
      await expect(slides.getByRole("button", { name: /^2 of 2 · Q4 numbers/ })).toBeVisible()
      await expect(vic.page.getByRole("button", { name: /^Slide 2 of 2, .*: open the outline$/ })).toBeVisible({ timeout: 10_000 })
      await expect(card(vic.page)).toHaveCount(0)
      await expect(pollBar(vic.page)).toHaveCount(0)
      // A follower is offered no Add a poll.
      await expect(vic.page.getByRole("button", { name: "Add a poll" })).toHaveCount(0)

      // Sam's Add a poll, in the slide bar: a popover at 1280, a drawer at 390 with Cancel and Start poll pinned at its foot.
      const controls = sam.page.getByRole("toolbar", { name: "Slide controls" })
      await controls.getByRole("button", { name: "Add a poll" })[press]()
      const form = sam.page.getByRole("form", { name: "New poll" })
      await expect(sam.page.getByText("New poll on Q4 numbers")).toBeVisible()
      await form.getByRole("textbox", { name: "Question" }).fill("Which day do we ship?")
      await form.getByRole("textbox", { name: "Option 1" }).fill("Friday")
      await form.getByRole("textbox", { name: "Option 2" }).fill("Monday")
      const start = sam.page.getByRole("button", { name: "Start poll" })
      if (device === "phone") {
        const foot = sam.page.locator("[data-sheet-footer]").last()
        await expect(foot.getByRole("button")).toHaveText(["Cancel", "Start poll"])
        // Read once the drawer has risen: mid-rise its fractional offset read 44.00006 px.
        await animationsSettled(foot)
        expect((await foot.getByRole("button", { name: "Start poll" }).boundingBox())?.height, "the foot's buttons are 44 px").toBe(44)
        expect(await takesAFinger(form.getByRole("button", { name: "Add option" })), "Add option takes a finger").toBe(true)
      }
      await reviewShot(sam.page, "board-poll-composer", theme)
      // At 1280 by the keyboard: Start poll by Enter, and the focus lands on the new card's Close poll, its ring showing.
      if (device === "computer") {
        await tabTo(sam.page, start, "Start poll")
        await sam.page.keyboard.press("Enter")
        const close = card(sam.page).getByRole("button", { name: "Close poll" })
        await expect(close, "Start poll hands the focus to the new card's Close poll").toBeFocused()
        expect(await ringShows(close), "Close poll's ring shows").toBe(true)
        await reviewShot(sam.page, "board-poll-keys", theme)
      } else await start.tap()
      // At rest: the card beside the slide at 1280, a bar above the slide bar at 390 (No votes yet), clear of the slide.
      const samPoll = device === "phone" ? pollBar(sam.page) : card(sam.page)
      await expect(device === "phone" ? pollBar(sam.page) : card(sam.page).getByText("Which day do we ship?")).toBeVisible()
      await expect(device === "phone" ? pollBar(sam.page) : card(sam.page).getByText("No votes yet")).toHaveText(/No votes yet/)
      if (device === "phone") await expectBarAtRest(pollBar(sam.page), "Sam's")
      await expectClearOfSlide(sam.page, on.q4, samPoll, "Sam")
      expect(server.sent).toEqual(["sam start f-q4"])
      // The slide's name stays whole in the bar beside Add a poll, at 390 with touch too.
      const name = slides.getByRole("button", { name: /^2 of 2 · Q4 numbers/ })
      expect(await name.locator("span").evaluate((e) => e.scrollWidth <= e.clientWidth), "the slide's name is whole").toBe(true)
      await reviewShot(sam.page, "board-poll-presenter", theme)
      if (device === "phone") {
        // The bar opens the card in a drawer, Close poll in its pinned foot, a finger's size.
        const drawn = await openCard(sam.page, device)
        await expect(drawn.getByText("No votes yet")).toBeVisible()
        const close = sam.page.locator("[data-sheet-footer]").last().getByRole("button", { name: "Close poll" })
        expect(await takesAFinger(close), "Close poll takes a finger").toBe(true)
        await reviewShot(sam.page, "board-poll-presenter-drawer", theme)
        await putAway(sam.page, device)
      }

      // The server tells the board's topic; Vic's slide shows the card without a reload, and Vic votes Friday.
      await expect.poll(() => vic.broker.subscriptions(), { timeout: 30_000 }).toContain(TOPIC)
      vic.broker.publish(TOPIC, pollMessage(0, "p1"))
      await expect(device === "phone" ? pollBar(vic.page) : card(vic.page)).toBeVisible({ timeout: 10_000 })
      await expectClearOfSlide(vic.page, on.q4, device === "phone" ? pollBar(vic.page) : card(vic.page), "Vic")
      if (device === "phone") await expectBarAtRest(pollBar(vic.page), "Vic's")
      const vicCard = await openCard(vic.page, device)
      const friday = vicCard.getByRole("button", { name: /^Friday/ })
      await expect(friday).toBeVisible()
      await expect(vic.page.getByRole("button", { name: "Close poll" })).toHaveCount(0)
      if (device === "phone") expect((await friday.boundingBox())!.height, "an option is a 44 px row under touch").toBeGreaterThanOrEqual(44)
      await friday[press]()
      await expect(friday).toHaveAttribute("aria-pressed", "true")
      await expect(vicCard.getByText(/^1 person voted/)).toBeVisible()

      // Ann votes Monday from her own screen: the tally moves for Vic and for Sam, live.
      server.voteAs("ann", 0, ["o1"])
      for (const t of [sam, vic]) {
        await expect.poll(() => t.broker.subscriptions(), { timeout: 30_000 }).toContain(TOPIC)
        t.broker.publish(TOPIC, pollMessage(1, "p1"))
      }
      await expect(vicCard.getByText(/^2 people voted/)).toBeVisible({ timeout: 10_000 })
      if (device === "computer") await expect(card(sam.page).getByText(/^2 people voted/)).toBeVisible({ timeout: 10_000 })
      else await expect(pollBar(sam.page)).toHaveAccessibleName(/2 voted$/, { timeout: 10_000 })
      if (device === "phone") await reviewShot(vic.page, "board-poll-follower-drawer", theme)
      await putAway(vic.page, device)
      if (device === "phone") await expect(pollBar(vic.page)).toHaveAccessibleName(/2 voted$/)
      await reviewShot(vic.page, "board-poll-follower", theme)

      // The guest, taken along to the slide, reads the question and the tally (its own list, every 5 s): no vote control.
      await expect(guest.page.getByRole("button", { name: /^Slide 2 of 2, .*: open the outline$/ })).toBeVisible({ timeout: 10_000 })
      if (device === "phone") {
        await expect(pollBar(guest.page)).toHaveAccessibleName(/^Poll on this slide: Which day do we ship\?/, { timeout: 12_000 })
        await expectBarAtRest(pollBar(guest.page), "the guest's")
        await reviewShot(guest.page, "board-poll-guest", theme)
      }
      const guestCard = await openCard(guest.page, device)
      await expect(guestCard.getByText("Which day do we ship?")).toBeVisible({ timeout: 12_000 })
      await expect(guestCard.getByText("1 · 50%").first()).toBeVisible({ timeout: 12_000 })
      await expect(guestCard.getByRole("button")).toHaveCount(0)
      if (device === "computer") await reviewShot(guest.page, "board-poll-guest", theme)
      else await putAway(guest.page, device)

      // Sam closes it: at 1280 by the keyboard, and the focus goes to the Add a poll that comes back; Vic's card says closed.
      if (device === "computer") {
        const close = card(sam.page).getByRole("button", { name: "Close poll" })
        await expect(close).toBeFocused()
        await sam.page.keyboard.press("Enter")
        await expect(card(sam.page).getByText("Closed", { exact: true })).toBeVisible()
        const add = controls.getByRole("button", { name: "Add a poll" })
        await expect(add, "Close poll hands the focus to the Add a poll that comes back").toBeFocused()
        expect(await ringShows(add), "Add a poll's ring shows").toBe(true)
      } else {
        await openCard(sam.page, device)
        await sam.page.locator("[data-sheet-footer]").last().getByRole("button", { name: "Close poll" }).tap()
        await expect(card(sam.page).getByText("Closed", { exact: true })).toBeVisible()
        await putAway(sam.page, device)
        await expect(controls.getByRole("button", { name: "Add a poll" })).toBeVisible()
      }
      vic.broker.publish(TOPIC, pollMessage(1, "p1"))
      if (device === "phone") {
        await expect(pollBar(vic.page)).toHaveAccessibleName(/Closed · 2 voted$/, { timeout: 10_000 })
        await expectClearOfSlide(vic.page, on.q4, pollBar(vic.page), "Vic")
        await reviewShot(vic.page, "board-poll-closed", theme)
      }
      const closed = await openCard(vic.page, device)
      await expect(closed.getByText("Closed", { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(closed.getByRole("button", { name: /^Friday/ })).toBeDisabled()
      await reviewShot(vic.page, device === "phone" ? "board-poll-closed-drawer" : "board-poll-closed", theme)
      expect(server.sent).toEqual(["sam start f-q4", "vic vote o0", "sam close"])
      await Promise.all([sam.context.close(), vic.context.close(), guest.context.close()])
    })

    test(`A slide's poll that can't be read, and a start the server refuses, say so in words (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(120_000)
      const on = shareBoard()
      const press = device === "phone" ? "tap" : "click"
      const REFUSED = "That frame isn't on this board yet. A frame drawn just now is saved within half a minute: try again then."
      const reads = { fail: true }
      const sent: string[] = []
      const server: Server = {
        fixtures: () => [
          [new RegExp(`/board/polls/${BOARD}$`), () => (reads.fail ? status(500, { msg: "Internal error" }) : { msg: "ok", data: [] })],
          [/\/board\/polls$/, () => (sent.push("start"), status(409, { msg: REFUSED, code: "frame_not_on_board" }))],
        ],
      }
      const sam = await open(browser, device, on, "sam", theme, server)
      await sam.page.getByRole("toolbar", { name: "Facilitation" }).getByRole("button", { name: "Present", exact: true })[press]()
      const slides = sam.page.locator("[data-board-slides]").getByRole("group", { name: "Slides" })
      await slides.getByRole("button", { name: "Next slide" })[press]()
      await expect(slides.getByRole("button", { name: /^2 of 2 · Q4 numbers/ })).toBeVisible()

      // The board's polls can't be read: the slide's card says so, with Try again, clear of the slide.
      const failed = card(sam.page)
      await expect(failed.getByText("Couldn't load this slide's poll")).toBeVisible({ timeout: 10_000 })
      const again = failed.getByRole("button", { name: "Try again" })
      await expect(again).toBeVisible()
      if (device === "phone") {
        await expectBarAtRest(failed, "the failed read's", false)
        expect(await takesAFinger(again), "Try again takes a finger").toBe(true)
      }
      await expectClearOfSlide(sam.page, on.q4, failed, "Sam")
      await reviewShot(sam.page, "board-poll-read-failed", theme)
      reads.fail = false
      await again[press]()
      await expect(failed).toHaveCount(0)

      // The server refuses the start (a frame drawn in the last half minute): its words in the composer, the draft kept,
      // at 390 inside the drawer above its pinned foot.
      await sam.page.getByRole("toolbar", { name: "Slide controls" }).getByRole("button", { name: "Add a poll" })[press]()
      const form = sam.page.getByRole("form", { name: "New poll" })
      await form.getByRole("textbox", { name: "Question" }).fill("Which day do we ship?")
      await form.getByRole("textbox", { name: "Option 1" }).fill("Friday")
      await form.getByRole("textbox", { name: "Option 2" }).fill("Monday")
      await sam.page.getByRole("button", { name: "Start poll" })[press]()
      const alert = form.getByRole("alert")
      await expect(alert).toHaveText(REFUSED)
      await expect(form.getByRole("textbox", { name: "Question" })).toHaveValue("Which day do we ship?")
      if (device === "phone") {
        const [said, foot] = [await boxOf(alert), await boxOf(sam.page.locator("[data-sheet-footer]").last())]
        expect(said.y + said.height, "the refusal sits above the drawer's pinned foot").toBeLessThanOrEqual(foot.y + 0.5)
      }
      await reviewShot(sam.page, "board-poll-start-refused", theme)
      expect(sent).toEqual(["start"])
      await sam.context.close()
    })
  }
}
