import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, SAM, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"

// zoom-15: an admin's outgoing webhook may be sent a call's beginning and end
// (call.started, call.ended). The webhook dialog lists them under "call" with a
// note on what is sent and what never is, in New and in Edit, and keeps them
// when the server's list of kinds doesn't load, so a webhook already on them
// still shows them ticked and can be unticked.

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const NOTE =
  "Sent only for calls in channels and meetings whoever sets up the webhook can open. Ids, times and how many joined, never a name or anything said. A call in a DM or a group chat is never sent."
const KINDS = ["post.created", "post.updated", "task.created", "doc.created", "doc.updated", "table.rows.changed", "call.started", "call.ended"]
const CALL_LOG = {
  id: "5a7e0000-0000-4000-8000-0000000000c1",
  name: "Call log",
  type: "outgoing",
  target_url: "https://calls.example.com/hook",
  events: '["call.started","call.ended"]',
  is_active: true,
  created_by: SAM.user_uuid,
  bot_name: "Call log",
  failure_count: 0,
  scope_type: "org",
  created_at: "2026-10-30T09:00:00Z",
  updated_at: "2026-10-30T09:00:00Z",
}

/** The admin's webhooks, on a server that lists the kinds of event, or whose list fails. */
async function webhooksPage(browser: Browser, testInfo: TestInfo, use: BrowserContextOptions, listLoads: boolean) {
  const context = await browser.newContext({ ...use })
  const page = await context.newPage()
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
    "/admin/webhooks/event-types": listLoads ? { event_types: KINDS } : withStatus(500, { msg: "The server couldn't answer just now." }),
    "/admin/webhooks": { webhooks: [CALL_LOG] },
  })
  // The keys tip would sit over the shots (onboarding/KeyboardTip).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto("/app/admin?tab=webhooks", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("list", { name: "Webhooks" })).toBeVisible({ timeout: 60_000 })
  return { context, page }
}

/**
 * The call group, with its note, and its last box scrolled to the middle of
 * the events box and the dialog (or the phone's sheet). Call is the last
 * group, the one a pinned footer would hide, so the point at that box's
 * centre must be the box itself, not the footer.
 */
async function expectCallGroup(page: Page) {
  const group = page.getByRole("dialog").getByRole("group", { name: "call" })
  const last = group.getByRole("checkbox", { name: "call.ended" })
  await last.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await expect(group).toBeVisible()
  const note = await group.getAttribute("aria-describedby")
  expect(note).toBeTruthy()
  await expect(page.locator(`[id="${note}"]`)).toHaveText(NOTE)
  await expect(page.locator(`[id="${note}"]`)).toBeInViewport()
  const id = await last.getAttribute("id")
  // Measured again until the sheet's scroll has settled.
  const hit = async () => {
    const at = await last.boundingBox()
    if (!at) return null
    return page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("[role=checkbox]")?.id ?? null,
      [at.x + at.width / 2, at.y + at.height / 2],
    )
  }
  await expect.poll(hit, { message: "the footer covers call.ended" }).toBe(id)
  return group
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
    test("a new outgoing webhook offers a call's beginning and end, and says what is sent", async ({ browser }, testInfo) => {
      const { context, page } = await webhooksPage(browser, testInfo, use, true)
      await page.getByRole("button", { name: "New webhook" }).first().click()
      await page.getByRole("dialog").getByRole("radio", { name: /Outgoing/ }).click()
      const group = await expectCallGroup(page)
      for (const name of ["call.started", "call.ended"]) await expect(group.getByRole("checkbox", { name })).not.toBeChecked()
      await shotInThemes(page, "webhook-new-call")
      await context.close()
    })

    test("a webhook on calls shows them ticked when it's edited, also when the server's list doesn't load", async ({ browser }, testInfo) => {
      for (const listLoads of [true, false]) {
        const { context, page } = await webhooksPage(browser, testInfo, use, listLoads)
        await page.getByRole("button", { name: "More for Call log" }).click()
        await page.getByRole("menuitem", { name: "Edit" }).click()
        await expect(page.getByRole("heading", { name: "Edit webhook" })).toBeVisible()
        const group = await expectCallGroup(page)
        for (const name of ["call.started", "call.ended"]) await expect(group.getByRole("checkbox", { name })).toBeChecked()
        await shotInThemes(page, listLoads ? "webhook-edit-call" : "webhook-edit-call-fallback")
        await context.close()
      }
    })

    test("with the server's list failing, a new webhook still offers the call group", async ({ browser }, testInfo) => {
      const { context, page } = await webhooksPage(browser, testInfo, use, false)
      await page.getByRole("button", { name: "New webhook" }).first().click()
      await page.getByRole("dialog").getByRole("radio", { name: /Outgoing/ }).click()
      await expectCallGroup(page)
      await shotInThemes(page, "webhook-new-call-fallback")
      await context.close()
    })

    // Each other group alone, for a pixel compare against beta's build.
    test("the other groups are as they were", async ({ browser }, testInfo) => {
      const { context, page } = await webhooksPage(browser, testInfo, use, true)
      await page.getByRole("button", { name: "New webhook" }).first().click()
      await page.getByRole("dialog").getByRole("radio", { name: /Outgoing/ }).click()
      for (const name of ["post", "task", "doc", "table"]) {
        const group = page.getByRole("dialog").getByRole("group", { name })
        await group.scrollIntoViewIfNeeded()
        await expect(group).toBeVisible()
        if (process.env.SHOTS_DIR) await group.screenshot({ path: `${process.env.SHOTS_DIR}/group-${name}-${page.viewportSize()?.width}.png` })
      }
      await context.close()
    })
  })
}
