import { expect, test, type Locator, type Page } from "@playwright/test"

import { JONAS, LAUNCH, POST, VIEWS, openChannel } from "./channelPage"

// A message's poll draws the shared PollChoices that the call's polls draw
// (calls package A; CODE-REVIEWER-53's MF2, 26 Oct): an option is a 36 px row,
// 44 px under touch; its words keep their place as it's chosen, because the
// shared check holds its slot; a long option wraps rather than being cut. On a
// production build, at 1280 by the pointer and at 390 by touch: vote, take the
// vote back, and read the long option whole.

const POLL = "0c4a0000-0000-4000-8000-0000000007a1"
const LONG = "Move the launch to Monday, so support has the whole weekend to read the new billing notes"
const WITH_POLL = {
  ...POST,
  post_uuid: "0c4a0000-0000-4000-8000-000000000503",
  post_by: JONAS,
  post_created_at: "2026-10-19T09:32:00Z",
  post_text: `<p>Which day do we ship?</p><div data-type="poll" data-id="${POLL}"></div>`,
}

/** The poll as the server holds it once mine is your vote. */
function pollOf(mine: string[]) {
  return {
    id: POLL, channel_uuid: LAUNCH, post_uuid: WITH_POLL.post_uuid, question: "Which day do we ship?", multiple: false,
    options: [
      { id: "fri", text: "Friday", votes: 2 + Number(mine.includes("fri")) },
      { id: "mon", text: LONG, votes: 1 + Number(mine.includes("mon")) },
    ],
    voters: 3 + Number(mine.length > 0), mine, closed: false, can_close: false,
  }
}

/** Answers the poll's read, and each vote with the poll it leaves; answers the votes sent, in order. */
async function pollServer(tab: Page, sent: string[][]) {
  let mine: string[] = []
  await tab.route(`**/poll/${POLL}/vote`, async (route) => {
    mine = (route.request().postDataJSON() as { option_ids: string[] }).option_ids
    sent.push(mine)
    await route.fulfill({ json: { msg: "ok", data: pollOf(mine) } })
  })
  await tab.route(`**/poll/${POLL}`, (route) => route.fulfill({ json: { msg: "ok", data: pollOf(mine) } }))
}

const press = (option: Locator, phone: boolean) => (phone ? option.tap() : option.click())

for (const view of VIEWS) {
  test(`a message's poll at ${view.name}: a vote, its words staying put, taking it back, and a long option read whole`, async ({ browser }, testInfo) => {
    const sent: string[][] = []
    const tab = await openChannel(
      browser, testInfo, view, "light",
      () => ({ [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [POST, WITH_POLL], has_more: false } } }),
      (t) => pollServer(t, sent),
    )
    const friday = tab.getByRole("button", { name: /^Friday/ })
    await expect(friday).toBeVisible({ timeout: 30_000 })
    const words = friday.getByText("Friday", { exact: true })
    const before = (await words.boundingBox())!
    const row = (await friday.boundingBox())!
    expect(row.height, "an option's row").toBeGreaterThanOrEqual(view.phone ? 44 : 36)

    await press(friday, view.phone)
    await expect(friday).toHaveAttribute("aria-pressed", "true")
    await expect.poll(() => sent).toEqual([["fri"]])
    const chosen = (await words.boundingBox())!
    expect(Math.abs(chosen.x - before.x), "the words keep their place as the option is chosen").toBeLessThanOrEqual(0.5)

    await press(friday, view.phone)
    await expect(friday).toHaveAttribute("aria-pressed", "false")
    await expect.poll(() => sent).toEqual([["fri"], []])

    // The long option is read whole: never cut, and on a phone it wraps.
    const long = tab.getByRole("button", { name: new RegExp(`^${LONG}`) }).getByText(LONG, { exact: true })
    await expect(long).toBeVisible()
    const cut = await long.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(cut, "the long option is cut").toBe(false)
    if (view.phone) {
      const lineHeight = await long.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
      expect((await long.boundingBox())!.height, "the long option wraps at 390").toBeGreaterThan(lineHeight * 1.5)
    }
    await tab.context().close()
  })
}
