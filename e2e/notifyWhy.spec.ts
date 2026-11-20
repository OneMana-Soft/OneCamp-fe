import { expect, test, type Page } from "@playwright/test"

import { showsFocusRing, tabOnto } from "./focusRing"
import { SAM, SHOT_THEMES, reviewShot, stubBackend, withHeaders, withStatus } from "./stubbedApp"
import { settled } from "./sheetLayout"

// "Why did or didn't I get this?" (A4 H3), as Sam meets it, at 1280 and at 390
// with touch, in both themes: Settings > Notifications' Send me a test, and an
// Inbox row's Why am I seeing this?. Both open one lazy panel: a popover beside
// its door on a computer, a bottom sheet with its actions pinned at its foot on
// a phone. Each answer is said in words, and so is each refusal: one test a
// minute (with when), the server's failure, the shared demo, offline, and "no
// record" for an item the router has no record of. Each panel shows while its
// answer is on its way, and at 1280 the keyboard reaches each door and action
// with its ring.

const AKASH = { user_uuid: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b", user_name: "Akash", user_full_name: "Akash" }
const CHANNEL = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a"
const POST = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b"
const MESSAGE = "3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c"
const TASK = "8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"

const prefs = {
  email_supported: true,
  email_enabled: true,
  email_mentions: true,
  email_dms: true,
  email_task_assigned: true,
  email_task_status: true,
  email_comments: true,
  email_calls: true,
  email_calendar_invites: true,
  email_calendar_changes: true,
  email_calendar_answers: true,
  email_only_when_offline: false,
  email_digest_frequency: "off",
  quiet_hours_enabled: false,
  read_receipts: true,
  read_receipts_allowed: true,
}

const SETTINGS = {
  "/me/keywords": { msg: "ok", data: [] },
  "/me/vips": { msg: "ok", data: [] },
  "/user/notificationPreferences": (_: URL, request: { method: () => string }) => (request.method() === "GET" ? { msg: "ok", data: prefs } : { msg: "ok" }),
}

const testAnswer = {
  user_id: SAM.user_uuid,
  event_id: `test:${SAM.user_uuid}:202611080631`,
  steps: [
    { step: "audience", verdict: "site", causes: ["notify.test"] },
    { step: "hold", verdict: "not_held" },
  ],
  decision: { user_id: SAM.user_uuid, cause: "notify.test", to: ["push", "desktop"] },
  devices: { push_devices: 2, push_known: true, apps_open: 1, apps_known: true },
  told: ["push", "desktop"],
}

/** The panel: a popover at 1280, a bottom sheet at 390 with its footer in view. */
async function expectPanelShape(page: Page, phone: boolean) {
  const panel = page.locator("[data-notify-why]")
  await expect(panel).toBeVisible()
  // Measured once it stands still: a sheet rises for 300 ms, and a popover may move as its answer fills it.
  await settled(panel)
  const box = (await panel.boundingBox())!
  const view = page.viewportSize()!
  if (phone) {
    expect(box.width, "a sheet spans the phone").toBeGreaterThan(view.width - 2)
    expect(Math.abs(box.y + box.height - view.height), "a sheet stands on the screen's foot").toBeLessThan(2)
  } else {
    expect(box.width, "a popover beside its door").toBeLessThan(400)
  }
  const foot = (await panel.locator("[data-overlay-footer]").boundingBox())!
  expect(foot.y + foot.height, "its actions in view").toBeLessThanOrEqual(view.height + 1)
}

/** A row's tool: on a touch screen, a row of the drawer the row's Actions opens. */
async function rowTool(page: Page, row: ReturnType<Page["locator"]>, phone: boolean, name: string) {
  if (phone) {
    await row.getByRole("button", { name: "Actions" }).tap()
    await page.getByRole("menuitem", { name, exact: true }).tap()
    return
  }
  const tool = row.getByRole("button", { name })
  await row.hover()
  await expect(tool).toBeVisible()
  await tool.click()
}

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("Send me a test says each step, then one a minute, the server's failure, the demo and offline, each in its words", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: string[] = []
        // The first answer waits, so the panel is seen while it is on its way.
        let answer = () => {}
        const answered = new Promise<void>((resolve) => (answer = resolve))
        let next: () => unknown = async () => {
          await answered
          return testAnswer
        }
        await stubBackend(page, testInfo, {
          ...SETTINGS,
          "/notify/test": () => (sent.push("POST"), next()),
        })
        await page.goto("/app/settings/notifications", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const door = page.getByRole("button", { name: "Send me a test" })
        await expect(door).toBeVisible({ timeout: 60_000 })
        await door.scrollIntoViewIfNeeded()
        if (phone) await door.tap()
        else {
          // The keyboard: Tab onto the door, which draws its ring, and Enter opens it.
          await tabOnto(page, door)
          await showsFocusRing(page, door, "Send me a test")
          await reviewShot(page, "notify-test-door-focus", theme)
          await page.keyboard.press("Enter")
        }
        const panel = page.locator("[data-notify-why='test']")
        await expect(panel.getByText("Sending a test…")).toBeVisible({ timeout: 30_000 })
        await expect(panel.locator("[aria-busy='true']")).toHaveCount(1)
        await reviewShot(page, "notify-test-loading", theme)
        answer()
        await expect(panel.getByRole("heading", { name: "Test sent" })).toBeVisible({ timeout: 30_000 })
        await expect(panel.locator("[aria-busy='true']")).toHaveCount(0)
        await expect(panel.getByText("It was for you alone, as a test.")).toBeVisible()
        await expect(panel.getByText("Nothing held it back.")).toBeVisible()
        await expect(panel.getByText("Push is on for 2 devices.")).toBeVisible()
        await expect(panel.locator('[data-delivery="desktop"]')).toHaveText(/Desktop notice\s*Sent/)
        expect(sent).toHaveLength(1)
        await expectPanelShape(page, phone)
        await reviewShot(page, "notify-test-sent", theme)
        if (!phone) {
          await showsFocusRing(page, panel.getByRole("button", { name: "Close" }), "The test panel's Close")
          await reviewShot(page, "notify-test-close-focus", theme)
        }

        // A second within the minute: refused until a time, and Send again waits for it.
        const retryAt = new Date(Date.now() + 8_000).toISOString()
        next = () => withHeaders({ "retry-after": "8" }, { code: "too_soon", retry_at: retryAt, msg: "One test a minute. Try again in a moment." }, 429)
        const again = panel.getByRole("button", { name: "Send again" })
        await again.click()
        await expect(panel.getByRole("heading", { name: "One test a minute" })).toBeVisible()
        await expect(panel.getByText(/^You can send the next one at /)).toBeVisible()
        await expect(again).toBeDisabled()
        await reviewShot(page, "notify-test-too-soon", theme)
        await expect(again).toBeEnabled({ timeout: 20_000 })

        next = () => withStatus(503, { msg: "Couldn't send a test. Try again." })
        await again.click()
        await expect(panel.getByRole("heading", { name: "Something went wrong" })).toBeVisible()
        await expect(panel.getByText("Couldn't send a test. Try again.")).toBeVisible()
        await expectPanelShape(page, phone)
        await reviewShot(page, "notify-test-error", theme)

        next = () => withStatus(403, { code: "demo", msg: "Not in the demo." })
        await again.click()
        await expect(panel.getByRole("heading", { name: "Not in the demo" })).toBeVisible()
        await expect(panel.getByRole("button", { name: "Send again" })).toHaveCount(0)
        await reviewShot(page, "notify-test-demo", theme)

        // Offline: the browser has no network, and the panel says so. (One request with no answer while the
        // browser has a network is no proof of that: lib/connectivity waits for two.)
        await panel.getByRole("button", { name: "Close" }).click()
        await expect(panel).toHaveCount(0)
        // The stub answers before the browser's network does, so it has no answer to give either.
        next = () => withStatus(0, null)
        await page.context().setOffline(true)
        await door.click()
        await expect(page.locator("[data-notify-why='test']").getByText("Connect, then try again.")).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "notify-test-offline", theme)
        await page.context().setOffline(false)
      })

      test("Why am I seeing this? says the cause and each step for a chat message, no record for a 404, and the error and offline states", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const now = Date.now()
        const at = (s: number) => new Date(now - s * 1000).toISOString()
        const holdTill = new Date(now + 30 * 60_000).toISOString()
        let reaction: () => unknown = () => withStatus(503, { msg: "Couldn't look that up. Try again." })
        // The record's first answer waits, so the panel is seen while it is on its way.
        let found = () => {}
        const looked = new Promise<void>((resolve) => (found = resolve))
        const trace = (deliveries: unknown[]) => ({
          events: [
            {
              user_id: SAM.user_uuid,
              event_id: `chat:post:${POST}`,
              steps: [
                { step: "audience", verdict: "in", causes: ["chat.mention"] },
                { step: "access", verdict: "in_place" },
                { step: "cause", verdict: "chosen", causes: ["chat.mention"] },
                { step: "preference", verdict: "kept" },
                { step: "hold", verdict: "held" },
              ],
              decision: { user_id: SAM.user_uuid, cause: "chat.mention", to: ["inbox"], held: ["push"], hold_till: holdTill },
              deliveries,
            },
          ],
        })
        let record: () => unknown = async () => {
          await looked
          return trace([
            { delivery: "inbox", state: "sent", at: at(10) },
            { delivery: "push", state: "held", hold_until: holdTill, at: at(10) },
          ])
        }
        await stubBackend(page, testInfo, {
          "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
          "/activity/seen": { msg: "ok" },
          "/activity/unified": {
            msg: "ok",
            data: {
              has_more: false,
              activities: [
                {
                  activity_type: "MENTION",
                  time: at(10),
                  actor_kind: "person",
                  mention: {
                    uid: "0x1",
                    mention_created_at: at(10),
                    mention_post_uuid: POST,
                    mention_post: { post_uuid: POST, post_text: "Can you check the rollback steps?", post_channel: { ch_uuid: CHANNEL, ch_name: "launch" }, post_by: AKASH },
                  },
                },
                {
                  activity_type: "REACTION",
                  time: at(20),
                  actor_kind: "person",
                  reaction: { reaction_emoji_id: "+1", reaction_added_by: AKASH, chat: { chat_uuid: MESSAGE, chat_body_text: "Shipping at noon", chat_from: SAM, chat_grouping_id: `${AKASH.user_uuid} ${SAM.user_uuid}` } },
                },
                {
                  activity_type: "MENTION",
                  time: at(30),
                  actor_kind: "person",
                  mention: { uid: "0x2", mention_created_at: at(30), mention_task: { task_uuid: TASK, task_name: "Launch plan", task_created_by: AKASH } },
                },
              ],
            },
          },
          [`/notify/why/${POST}`]: () => record(),
          [`/notify/why/${MESSAGE}`]: () => reaction(),
        })
        await page.goto("/app/inbox?tab=all", { waitUntil: "domcontentloaded", timeout: 120_000 })
        // By the channel's own name: a text filter ignores case, and the task's row ("Launch plan") would match too.
        const mention = page.locator("[data-feed-row]").filter({ hasText: "mentioned you in" }).filter({ hasText: /launch/ })
        await expect(mention).toHaveCount(1, { timeout: 60_000 })
        const task = page.locator("[data-feed-row]").filter({ hasText: "Launch plan" })
        await expect(task).toHaveCount(1)
        // A task's row has no such question: it isn't about a chat message.
        await expect(task.getByRole("button", { name: "Why am I seeing this?", includeHidden: true })).toHaveCount(0)

        const whyDoor = mention.getByRole("button", { name: "Why am I seeing this?" })
        if (phone) await rowTool(page, mention, phone, "Why am I seeing this?")
        else {
          // The keyboard: from the row's link, Tab shows the row's tools and reaches Why, which draws its ring.
          await showsFocusRing(page, whyDoor, "An Inbox row's Why am I seeing this?", mention.locator("[data-row-link]"))
          await expect(mention.locator(".hub-row-tools")).toHaveCSS("opacity", "1")
          await reviewShot(page, "notify-why-door-focus", theme)
          await page.keyboard.press("Enter")
        }
        const panel = page.locator("[data-notify-why='why']")
        await expect(panel.getByText("Looking it up…")).toBeVisible({ timeout: 30_000 })
        await expect(panel.locator("[aria-busy='true']")).toHaveCount(1)
        await reviewShot(page, "notify-why-loading", theme)
        found()
        await expect(panel.getByText("Because you were mentioned.")).toBeVisible({ timeout: 30_000 })
        await expect(panel.locator("[aria-busy='true']")).toHaveCount(0)
        await expect(panel.getByText("You're in #launch.")).toBeVisible()
        await expect(panel.getByText("Your notification settings let it through.")).toBeVisible()
        await expect(panel.getByText(/^Held by your schedule until /)).toBeVisible()
        await expect(panel.locator('[data-delivery="push"]')).toHaveText(/Push\s*Held until/)
        await expectPanelShape(page, phone)
        await reviewShot(page, "notify-why-record", theme)
        if (!phone) {
          await showsFocusRing(page, panel.getByRole("button", { name: "Close" }), "The why panel's Close")
          await reviewShot(page, "notify-why-close-focus", theme)
        }
        await page.keyboard.press("Escape")
        await expect(panel).toHaveCount(0)

        // The message was deleted since: the held push was never sent, and the Inbox's notice was taken back.
        // The longest state lines, each beside its channel's name, wrap inside their row.
        let gone = () => {}
        const deleted = new Promise<void>((resolve) => (gone = resolve))
        record = async () => {
          await deleted
          return trace([
            { delivery: "inbox", state: "retracted", at: at(10) },
            { delivery: "push", state: "dropped", hold_until: holdTill, at: at(10) },
          ])
        }
        // Opened again at once: it asks again, and shows nothing of the last answer while it does.
        await rowTool(page, mention, phone, "Why am I seeing this?")
        await expect(panel.getByText("Looking it up…")).toBeVisible({ timeout: 30_000 })
        await expect(panel.locator("[data-delivery]")).toHaveCount(0)
        gone()
        await expect(panel.locator('[data-delivery="push"]')).toHaveText(/Push\s*Not sent: the message was deleted while it was held/, { timeout: 30_000 })
        await expect(panel.locator('[data-delivery="inbox"]')).toHaveText(/Inbox\s*Taken back: the message was deleted/)
        for (const row of await panel.locator("[data-delivery]").all())
          expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "a delivery's line wraps inside its row").toBe(true)
        await expectPanelShape(page, phone)
        await reviewShot(page, "notify-why-deleted", theme)
        await page.keyboard.press("Escape")
        await expect(panel).toHaveCount(0)

        // The reaction's message: the server fails, then Try again finds no record.
        const reacted = page.locator("[data-feed-row]").filter({ hasText: "reacted to your message" })
        await rowTool(page, reacted, phone, "Why am I seeing this?")
        await expect(panel.getByText("Couldn't look that up. Try again.")).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "notify-why-error", theme)
        if (!phone) {
          await showsFocusRing(page, panel.getByRole("button", { name: "Try again" }), "The why panel's Try again")
          await reviewShot(page, "notify-why-try-again-focus", theme)
        }
        reaction = () => withStatus(404, { code: "no_record", msg: "There's no record of how this reached you." })
        await panel.getByRole("button", { name: "Try again" }).click()
        await expect(panel.getByRole("heading", { name: "No record" })).toBeVisible()
        await expect(panel.getByText("There's no record of how this reached you.")).toBeVisible()
        await expectPanelShape(page, phone)
        await reviewShot(page, "notify-why-no-record", theme)
        await panel.getByRole("button", { name: "Close" }).click()
        await expect(panel).toHaveCount(0)

        // Offline: the browser has no network, and the panel says so. (The stub has no answer either.)
        reaction = () => withStatus(0, null)
        await page.context().setOffline(true)
        await rowTool(page, reacted, phone, "Why am I seeing this?")
        await expect(panel.getByText("Connect, then try again.")).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "notify-why-offline", theme)
        await page.context().setOffline(false)
      })
    })
  }
}
