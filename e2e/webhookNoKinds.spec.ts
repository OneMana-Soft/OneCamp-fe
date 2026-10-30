import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"

// V-112: an outgoing webhook is sent only the kinds of event it names, so one
// that names none is sent nothing. New and Edit wait until a kind is ticked
// and say why, and the list marks a webhook kept from before with none
// ("Sends nothing") with Edit; its on/off switch waits too, since the server
// refuses any change to it until one is ticked, and says why as Create does.
// V-113: Edit keeps a webhook's scope. The dialog shows what the webhook is
// sent events from, and Save names a scope only when the admin chose another.

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const TICK = "Choose at least one event to send: a webhook with none is sent nothing."
const KINDS = ["post.created", "post.updated", "task.created", "doc.created", "doc.updated", "table.rows.changed", "call.started", "call.ended"]
const CHANNEL = { ch_uuid: "c4a10000-0000-4000-8000-0000000000a1", ch_name: "launch-room" }
/** Kept from before V-112: outgoing, on one channel, naming no kinds. */
const OLD_FEED = {
  id: "5a7e0000-0000-4000-8000-0000000000d1",
  name: "Old feed",
  type: "outgoing",
  target_url: "https://feed.example.com/hook",
  is_active: true,
  created_by: SAM.user_uuid,
  bot_name: "Old feed",
  failure_count: 0,
  scope_type: "channel",
  scope_entity_id: CHANNEL.ch_uuid,
  created_at: "2026-10-30T09:00:00Z",
  updated_at: "2026-10-30T09:00:00Z",
}
/** On the same channel, sent its new posts. */
const LAUNCH_LOG = {
  ...OLD_FEED,
  id: "5a7e0000-0000-4000-8000-0000000000d2",
  name: "Launch log",
  bot_name: "Launch log",
  target_url: "https://launch.example.com/hook",
  events: '["post.created"]',
}

type Sent = { method: string; path: string; body: Record<string, unknown> }

/** The admin's webhooks. Every write the page sends is kept, for the test to read. */
async function webhooksPage(browser: Browser, testInfo: TestInfo, use: BrowserContextOptions) {
  const context = await browser.newContext({ ...use })
  const page = await context.newPage()
  const sent: Sent[] = []
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
    "/admin/webhooks/event-types": { event_types: KINDS },
    "/admin/webhooks": (url: URL, request: Request) => {
      if (request.method() === "GET") return { webhooks: [OLD_FEED, LAUNCH_LOG] }
      const body = request.postDataJSON() as Record<string, unknown>
      sent.push({ method: request.method(), path: url.pathname, body })
      return { msg: "ok", webhook: { ...LAUNCH_LOG, ...body } }
    },
    "/ch/allActiveChannels": { msg: "ok", channels_list: [CHANNEL] },
  })
  // The keys tip would sit over the shots (onboarding/KeyboardTip).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto("/app/admin?tab=webhooks", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("list", { name: "Webhooks" })).toBeVisible({ timeout: 60_000 })
  return { context, page, sent }
}

/**
 * The dialog's Create or Save while no event is ticked: it waits, the events'
 * live line says why, and so does its tip when the keyboard reaches it (Tab
 * from Cancel). Its tip opens at once only for keyboard focus, so a focus()
 * after a click would not show it.
 */
async function expectWaitsForAnEvent(page: Page, name: string) {
  const dialog = page.getByRole("dialog")
  const button = dialog.getByRole("button", { name })
  await expect(button).toHaveAttribute("aria-disabled", "true")
  await expect(dialog.getByText(TICK, { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).focus()
  await page.keyboard.press("Tab")
  await expect(button).toBeFocused()
  await expect(page.getByRole("tooltip")).toHaveText(TICK)
  return button
}

/**
 * The line under the events, which says why with no focus needed: scrolled to
 * the end of "Events to send", in view, and on top at its middle, so a phone's
 * pinned footer doesn't cover it. Measured again until the scroll has settled.
 */
async function expectWhyInView(page: Page) {
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("checkbox", { name: "call.ended" }).evaluate((el) => el.scrollIntoView({ block: "nearest" }))
  const line = dialog.getByText(TICK, { exact: true })
  await line.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await expect(line).toBeInViewport()
  const onTop = () =>
    line.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!top && el.contains(top)
    })
  await expect.poll(onTop, { message: "the footer covers the line under the events" }).toBe(true)
}

/**
 * The no-kinds row's switch waits as Create does: the keyboard reaches it (Tab
 * from the notice's Edit), and its tip says why in the same words. A press, by
 * key or by finger, leaves it on and sends nothing: the test's one write comes
 * later, from Save.
 */
async function expectSwitchSaysWhy(page: Page, device: string) {
  const toggle = page.getByRole("switch", { name: "Old feed is on" })
  await expect(toggle).toHaveAttribute("aria-disabled", "true")
  await page.getByRole("button", { name: "Edit Old feed" }).focus()
  await page.keyboard.press("Tab")
  await expect(toggle).toBeFocused()
  await expect(page.getByRole("tooltip")).toHaveText(TICK)
  await shotInThemes(page, `webhook-list-switch-why-${device}`)
  await page.keyboard.press("Space")
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  if (device === "phone") {
    // Forced: Playwright won't tap an aria-disabled control, which is the point here.
    await toggle.tap({ force: true })
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await shotInThemes(page, "webhook-list-switch-tapped-phone")
  }
}

/** A finger's reach on the notice's Edit (app/phone.css F3): its ::before, around the 24px word, with nothing moved. */
const editReach = (page: Page) =>
  page.getByRole("button", { name: "Edit Old feed" }).evaluate((el) => {
    const reach = getComputedStyle(el, "::before")
    return { drawn: Math.round(el.getBoundingClientRect().height), width: parseFloat(reach.width), height: parseFloat(reach.height) }
  })

/** The Edit dialog shows the webhook's own scope: one channel, by its name. */
async function expectChannelScope(dialog: Locator) {
  await expect(dialog.getByRole("combobox").filter({ hasText: "One channel" })).toBeVisible()
  await expect(dialog.getByRole("combobox").filter({ hasText: CHANNEL.ch_name })).toBeVisible()
}

async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const [device, use] of Object.entries(DEVICES)) {
  test.describe(`on a ${device}`, () => {
    test("a new outgoing webhook waits for an event, says why, and is made with the one ticked", async ({ browser }, testInfo) => {
      const { context, page, sent } = await webhooksPage(browser, testInfo, use)
      try {
        await page.getByRole("button", { name: "New webhook" }).first().click()
        const dialog = page.getByRole("dialog")
        await dialog.getByRole("radio", { name: /Outgoing/ }).click()
        await dialog.getByLabel(/^Name/).fill("Release notes")
        await dialog.getByLabel("Address to send to").fill("https://notes.example.com/hook")
        await expectWhyInView(page)
        await shotInThemes(page, `webhook-new-why-in-view-${device}`)
        const create = await expectWaitsForAnEvent(page, "Create webhook")
        await shotInThemes(page, `webhook-new-waits-${device}`)
        // Pressed while it waits, it sends nothing: the one write below is the only one.
        await create.click({ force: true })
        await dialog.getByRole("checkbox", { name: "post.created" }).click()
        await expect(create).not.toHaveAttribute("aria-disabled")
        await expect(dialog.getByText("1 event chosen.", { exact: true })).toBeVisible()
        await create.click()
        await expect.poll(() => sent.length).toBe(1)
        expect(sent[0]).toMatchObject({ method: "POST", path: "/admin/webhooks", body: { type: "outgoing", events: ["post.created"] } })
      } finally {
        await context.close()
      }
    })

    test("a webhook kept with no kinds is listed as sending nothing, and Edit puts it right on its own channel", async ({ browser }, testInfo) => {
      const { context, page, sent } = await webhooksPage(browser, testInfo, use)
      try {
        const notice = page.locator('[data-webhook-notice="nokinds"]')
        await expect(notice).toHaveCount(1)
        await expect(notice).toContainText("Sends nothing: no kinds ticked.")
        // No chip claims it gets every event.
        await expect(page.getByText("Every event", { exact: true })).toHaveCount(0)
        // Its switch waits (the server refuses any change until a kind is ticked); a webhook with kinds keeps its own.
        await expect(page.getByRole("switch", { name: "Old feed is on" })).toBeDisabled()
        await expect(page.getByRole("switch", { name: "Launch log is on" })).toBeEnabled()
        await shotInThemes(page, `webhook-list-sends-nothing-${device}`)
        await expectSwitchSaysWhy(page, device)
        if (device === "phone") {
          const reach = await editReach(page)
          testInfo.annotations.push({ type: "edit-reach", description: JSON.stringify(reach) })
          expect(reach.height, JSON.stringify(reach)).toBeGreaterThanOrEqual(44)
        }

        await notice.getByRole("button", { name: "Edit Old feed" }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByRole("heading", { name: "Edit webhook" })).toBeVisible()
        await expectChannelScope(dialog)
        const save = await expectWaitsForAnEvent(page, "Save changes")
        await shotInThemes(page, `webhook-edit-waits-${device}`)
        await save.click({ force: true })
        await dialog.getByRole("checkbox", { name: "post.created" }).click()
        await expect(save).not.toHaveAttribute("aria-disabled")
        await save.click()
        await expect.poll(() => sent.length).toBe(1)
        expect(sent[0]).toMatchObject({ method: "PUT", path: `/admin/webhooks/${OLD_FEED.id}`, body: { events: ["post.created"] } })
        // Its scope is its own: Save names none, so the server keeps the channel.
        expect(sent[0].body).not.toHaveProperty("scope_type")
        expect(sent[0].body).not.toHaveProperty("scope_entity_id")
      } finally {
        await context.close()
      }
    })

    test("a webhook on one channel renamed from the list's menu keeps its channel", async ({ browser }, testInfo) => {
      const { context, page, sent } = await webhooksPage(browser, testInfo, use)
      try {
        await page.getByRole("button", { name: "More for Launch log" }).click()
        await page.getByRole("menuitem", { name: "Edit" }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByRole("heading", { name: "Edit webhook" })).toBeVisible()
        await expectChannelScope(dialog)
        await shotInThemes(page, `webhook-edit-channel-scope-${device}`)
        await dialog.getByLabel(/^Name/).fill("Launch log, team")
        await dialog.getByRole("button", { name: "Save changes" }).click()
        await expect.poll(() => sent.length).toBe(1)
        expect(sent[0]).toMatchObject({
          method: "PUT",
          path: `/admin/webhooks/${LAUNCH_LOG.id}`,
          body: { name: "Launch log, team", events: ["post.created"] },
        })
        expect(sent[0].body).not.toHaveProperty("scope_type")
        expect(sent[0].body).not.toHaveProperty("scope_entity_id")
      } finally {
        await context.close()
      }
    })
  })
}
