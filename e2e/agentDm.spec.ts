import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { holdChunk } from "./holdChunk"
import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// V-126: a DM with an agent (a bot, by class) says the agent's role where a person's presence would be, and offers
// no huddle or call with it, at both widths by one rule (lib/botCopy). At 390 the phone's bar said "Offline"
// and offered "Start a huddle" while 1280 showed the agent's line. A person's DM keeps presence and its huddle.
// The no-huddle checks run only once the bar says who the DM is with, so they never pass on a page still loading.

const AI = { user_uuid: "a1a1a1a1-0000-4000-8000-0000000000a1", user_name: "OneCamp AI", user_full_name: "OneCamp AI", user_email_id: "ai@example.com", is_bot: true }
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen", user_email_id: "maya@example.com", user_status: "online", user_device_connected: 1 }
const QUIET = {
  "/config/client": { msg: "ok", data: { features: { calls: true, ai: true } } },
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  [`/user/profile/${AI.user_uuid}`]: { msg: "ok", data: AI },
  [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
  [`/dm/latestChat/${AI.user_uuid}`]: { msg: "ok", data: { chats: [], has_more: false } },
  [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [], has_more: false } },
  "/dm/": { msg: "ok", data: [] },
  "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  // Asked by the AI shell once a person's DM is drawn (AI is on here); answered so a review frame has no stub toast.
  "/ai/pending-actions": { msg: "ok", data: [] },
}
const LINE = "Acts for you · can do only what you can"

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const
type View = (typeof views)[number]

/** Sam's DM with `peer` at a width (a phone with touch at 390). */
async function openDm(
  browser: Browser, testInfo: TestInfo, view: View, peer: { user_uuid: string },
  { theme, huddleCode }: { theme?: "light" | "dark"; huddleCode?: (page: Page) => Promise<void> } = {},
) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport,
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
    ...(theme ? { colorScheme: theme } : {}),
  })
  const page = await context.newPage()
  await stubBackend(page, testInfo, QUIET)
  await huddleCode?.(page)
  await page.goto(`/app/chat/${peer.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { context, page }
}

for (const view of views) {
  test(`at ${view.name}: an agent's DM says its role, never presence, and offers no huddle or call`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const { context, page } = await openDm(browser, testInfo, view, AI)
    if (view.phone) {
      const title = page.getByRole("button", { name: "OneCamp AI, profile" })
      await expect(title).toContainText("Acts for you", { timeout: 90_000 })
      await expect(title).not.toContainText(/Active|Away|Offline/)
    } else {
      await expect(page.locator("[data-header-meta]").first()).toHaveText(LINE, { timeout: 90_000 })
    }
    await expect(page.getByRole("link", { name: /huddle/i })).toHaveCount(0)
    if (view.phone) {
      // The options sheet's second call path (the phone's "Join call") is gone as well.
      await page.getByRole("button", { name: "Chat options" }).tap()
      await expect(page.getByRole("dialog").getByRole("button", { name: "Call recordings" })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole("button", { name: "Join call" })).toHaveCount(0)
    }
    await context.close()
  })

  test(`at ${view.name}: a person's DM keeps presence and offers a huddle`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const { context, page } = await openDm(browser, testInfo, view, MAYA)
    if (view.phone) {
      await expect(page.getByRole("button", { name: "Maya Chen, profile" })).toContainText(/Active|Away|Offline/, { timeout: 90_000 })
    } else {
      await expect(page.locator("[data-header-meta]").first()).not.toHaveText(LINE, { timeout: 90_000 })
    }
    await expect(page.getByRole("link", { name: "Start a huddle" }).first()).toBeVisible({ timeout: 60_000 })
    if (view.phone) {
      await page.getByRole("button", { name: "Chat options" }).tap()
      await expect(page.getByRole("dialog").getByRole("button", { name: "Join call" })).toBeVisible({ timeout: 30_000 })
    }
    await context.close()
  })
}

// UX-CHAT-H2: the phone bar's huddle link is a chunk of its own (components/navigationBar/mobile/phoneHuddleLink.tsx),
// fetched once a conversation's bar draws it, so the app layout carries none of it. Its 44px slot is held while the
// code comes, and left out when the code can't come. The chunk is the one script that draws data-phone-huddle.
const HUDDLE_CODE = "data-phone-huddle"

/**
 * Holds the huddle's chunk once it is asked for (e2e/holdChunk), until `pass()` lets it come or `fail()` drops it as a
 * lost connection does. `done()` lets it through and drops the route before the page closes.
 */
function huddleChunk() {
  let code: Awaited<ReturnType<typeof holdChunk>> | undefined
  const install = async (page: Page) => {
    code = await holdChunk(page, HUDDLE_CODE)
  }
  return { install, pass: () => code!.release(), fail: () => code!.fail(), seen: () => code?.asked() ?? false, done: () => code!.done() }
}

/** The 44px slot held for the huddle while its code comes (PhoneHuddleButton's placeholder). */
const SLOT = '[data-phone-bar-end] span[aria-hidden="true"].size-11:empty'
const phone = views.find((v) => v.phone)!
const box = async (page: Page, name: string) => (await page.getByRole("button", { name }).boundingBox())!

for (const theme of SHOT_THEMES) {
  test(`at 390, ${theme}: a person's bar holds the huddle's 44px slot while its code comes, then draws it before ⋯, to the DM's call, and it takes the keyboard's focus`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const chunk = huddleChunk()
    const { context, page } = await openDm(browser, testInfo, phone, MAYA, { theme, huddleCode: chunk.install })
    const title = page.getByRole("button", { name: "Maya Chen, profile" })
    await expect(title).toContainText(/Active|Away|Offline/, { timeout: 90_000 })
    // The code is asked for and held: the bar draws the slot, not the link.
    await expect.poll(chunk.seen, { timeout: 30_000 }).toBe(true)
    await expect(page.locator(SLOT)).toHaveCount(1)
    await expect(page.getByRole("link", { name: /huddle/i })).toHaveCount(0)
    const before = { title: await box(page, "Maya Chen, profile"), more: await box(page, "Chat options") }
    chunk.pass()
    const link = page.getByRole("link", { name: "Start a huddle" })
    await expect(link).toBeVisible({ timeout: 30_000 })
    await expect(link).toHaveAttribute("href", `/app/meet/chat/${MAYA.user_uuid}`)
    const at = (await link.boundingBox())!
    expect([at.width, at.height]).toEqual([44, 44])
    const after = { title: await box(page, "Maya Chen, profile"), more: await box(page, "Chat options") }
    expect(at.x + at.width).toBeLessThanOrEqual(after.more.x)
    // No jump when the link takes its slot.
    expect(after).toEqual(before)
    await reviewShot(page, "bar-huddle-on", theme)
    for (let i = 0; i < 40 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(link).toBeFocused()
    await reviewShot(page, "bar-huddle-focus", theme)
    await chunk.done()
    await context.close()
  })

  test(`at 390, ${theme}: an agent's bar says its role, with no huddle and no hole`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const { context, page } = await openDm(browser, testInfo, phone, AI, { theme })
    await expect(page.getByRole("button", { name: "OneCamp AI, profile" })).toContainText("Acts for you", { timeout: 90_000 })
    await expect(page.getByRole("link", { name: /huddle/i })).toHaveCount(0)
    // No slot is held for a huddle that won't come.
    await expect(page.locator(SLOT)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Chat options" })).toBeVisible()
    await reviewShot(page, "bar-agent", theme)
    await context.close()
  })

  test(`at 390, ${theme}: when the huddle's code can't come, the bar draws no link and no broken control, and the title stays put`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const chunk = huddleChunk()
    const { context, page } = await openDm(browser, testInfo, phone, MAYA, { theme, huddleCode: chunk.install })
    const title = page.getByRole("button", { name: "Maya Chen, profile" })
    await expect(title).toContainText(/Active|Away|Offline/, { timeout: 90_000 })
    await expect.poll(chunk.seen, { timeout: 30_000 }).toBe(true)
    await expect(page.locator(SLOT)).toHaveCount(1)
    const before = await box(page, "Maya Chen, profile")
    chunk.fail()
    // The slot is let go once the fetch has failed; nothing half-drawn, no "Try again" in a 44px bar.
    await expect(page.locator(SLOT)).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByRole("link", { name: /huddle/i })).toHaveCount(0)
    await expect(page.locator("[data-phone-bar-end]").getByRole("button", { name: /try again/i })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Chat options" })).toBeVisible()
    expect(await box(page, "Maya Chen, profile")).toEqual(before)
    await reviewShot(page, "bar-huddle-offline", theme)
    await chunk.done()
    await context.close()
  })
}
