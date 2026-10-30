import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// Polls and Q&A in every call (calls package A, "Ask the room": meet-10,
// zoom-02). At 1280 the dock's own button opens the panel beside the stage;
// on a phone it's under More, and the panel covers the dock, its ask box the
// screen's footer, as the call's chat does. Either way a vote and a question
// reach the server as the panel's two writes.
//
// The call's server never answers here (stubBackend accepts every socket and
// says nothing), so the call is still connecting: its stage and dock are up,
// which is all this needs. The member's read of the call (GET /calls/current)
// gives its session id, which is what the panel reads and writes under.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const CH = "c0ffee00-0000-4000-8000-0000000000c7"
const SID = "5e550000-0000-4000-8000-0000000000a7"
const POLL = "9011a000-0000-4000-8000-000000000001"
const THURSDAY = "9011a000-0000-4000-8000-0000000000a1"
const QUESTION = "Will the demo be recorded?"

const ACTIVITIES = {
  polls: [
    {
      id: POLL,
      question: "Which day for the launch?",
      multiple: false,
      options: [
        { id: THURSDAY, text: "Thursday", votes: 2 },
        { id: "9011a000-0000-4000-8000-0000000000a2", text: "Friday", votes: 1 },
      ],
      voters: 3,
      mine: [],
      closed: false,
      can_close: false,
    },
  ],
  questions: [{ id: "9011a000-0000-4000-8000-0000000000b1", text: "Is the beta open to guests?", asker: "Maya Chen", votes: 2, state: "open", at: "2026-10-26T06:00:00Z" }],
  qa: { open: true, shown: "all", anonymous: false },
  runs: false,
}

/** The call, its session and its activities; what the panel writes lands in the list returned. */
async function stubCall(page: Page, testInfo: TestInfo): Promise<unknown[]> {
  const sent: unknown[] = []
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    [`/calls/${SID}/activities`]: (_url: URL, request: Request) => {
      if (request.method() !== "POST") return { msg: "ok", data: ACTIVITIES }
      sent.push(request.postDataJSON())
      return { msg: "ok", data: { id: "9011a000-0000-4000-8000-0000000000b2" } }
    },
  })
  return sent
}

async function join(page: Page) {
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
}

/** What sits on top at the dock's middle: the dock itself, the panel, or something else. */
const topOfDock = (dock: Locator) =>
  dock.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (top && el.contains(top)) return "dock"
    return top?.closest("[data-call-activities]") ? "panel" : "other"
  })

/** Votes Thursday and asks the question, by mouse or by touch; the server gets both, in that order. */
async function voteAndAsk(panel: Locator, sent: unknown[], press: (l: Locator) => Promise<void>) {
  const poll = panel.getByRole("region", { name: "Poll: Which day for the launch?" })
  await press(poll.getByRole("button", { name: /^Thursday/ }))
  await expect.poll(() => sent.length).toBe(1)

  await press(panel.getByRole("tab", { name: /^Questions/ }))
  await panel.getByRole("textbox", { name: "Ask a question" }).fill(QUESTION)
  await press(panel.getByRole("button", { name: "Ask", exact: true }))
  await expect.poll(() => sent.length).toBe(2)
  expect(sent).toEqual([
    { op: "vote", id: POLL, options: [THURSDAY] },
    { op: "ask", text: QUESTION, anonymous: false },
  ])
  // Asked, the box is empty for the next one.
  await expect(panel.getByRole("textbox", { name: "Ask a question" })).toHaveValue("")
}

test.describe("at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("the dock's Polls and Q&A opens the panel beside the stage, and a vote and a question are sent", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const sent = await stubCall(page, testInfo)
    await join(page)

    const dock = page.getByRole("toolbar", { name: "Call controls" })
    const open = dock.getByRole("button", { name: "Polls and Q&A", exact: true })
    await expect(open).toBeVisible({ timeout: 30_000 })
    await expect(open).toHaveAttribute("aria-pressed", "false")
    await open.click()

    const panel = page.getByRole("complementary", { name: "Polls and Q&A" })
    await expect(panel).toBeVisible()
    await expect(open).toHaveAttribute("aria-pressed", "true")
    // An open poll comes first.
    await expect(panel.getByRole("tab", { name: /^Polls/ })).toHaveAttribute("aria-selected", "true")
    // Beside the stage, not over it: the dock is still what's under its middle.
    expect(await topOfDock(dock)).toBe("dock")

    await voteAndAsk(panel, sent, (l) => l.click())

    await panel.getByRole("button", { name: "Close polls and Q&A" }).click()
    await expect(panel).toHaveCount(0)
    await expect(open).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("on a phone, by touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("More's Polls and Q&A covers the dock with the ask box at its foot, and a vote and a question are sent", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const sent = await stubCall(page, testInfo)
    await join(page)

    const dock = page.getByRole("toolbar", { name: "Call controls" })
    // The dock has no room for its own button here: it's one of More's rows.
    await expect(dock.getByRole("button", { name: "More call options" })).toBeVisible({ timeout: 30_000 })
    await expect(dock.getByRole("button", { name: "Polls and Q&A", exact: true })).toBeHidden()
    await dock.getByRole("button", { name: "More call options" }).tap()
    await page.getByRole("menuitem", { name: /^Polls and Q&A/ }).tap()

    const panel = page.getByRole("complementary", { name: "Polls and Q&A" })
    await expect(panel).toBeVisible()
    expect(await topOfDock(dock)).toBe("panel")
    // Its ask box is the screen's footer: the panel's last thing, on screen.
    const ask = panel.locator("form").filter({ has: page.getByRole("textbox", { name: "Ask a question" }) })
    await panel.getByRole("tab", { name: /^Questions/ }).tap()
    await expect(ask).toBeInViewport({ ratio: 1 })
    const [p, a] = [await panel.boundingBox(), await ask.boundingBox()]
    expect(Math.abs(a!.y + a!.height - (p!.y + p!.height))).toBeLessThanOrEqual(1)
    await panel.getByRole("tab", { name: /^Polls/ }).tap()

    await voteAndAsk(panel, sent, (l) => l.tap())
  })
})
