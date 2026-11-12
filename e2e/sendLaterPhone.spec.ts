import { expect, test, type Page, type Request } from "@playwright/test"
import { SAM, expectEveryCallAnswered, stubBackend, withStatus } from "./stubbedApp"
import { finger } from "./finger"
import { animationsSettled } from "./settled"

// V-711: on a phone (390, touch) the message box had no Send later at all,
// where a computer's Send offers it. The phone's is the computer's: a
// long-press on Send or "+ › Send later" opens its choices as a sheet, with
// Custom time's Schedule pinned at the sheet's foot. A tap on Send still
// sends. Each case schedules one, finds it in the scheduled list, and deletes
// it, leaving nothing behind; a refused schedule and one with no network say
// so and keep the words. Deleted, its chip goes and one toast says so
// (DESIGN-BUILD-125 F2, F3). Each runs light and dark (F1), its shots named
// -dark in dark.
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const WORDS = "The launch note is attached."
// The server's own words for a time it won't take.
const REFUSED = "Pick a time at least 30 seconds from now."

type Scheduled = { id: string; kind: string; target: string; send_at: string; status: string; preview: string }

function conversation() {
  const list: Scheduled[] = []
  // What the next schedule meets: the server, a refusal, or no network.
  const next: { answer: "ok" | "refused" | "offline" } = { answer: "ok" }
  const message = (i: number, text: string) => ({
    chat_uuid: `0c4a0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    chat_from: i % 2 ? SAM : MAYA,
    chat_to: i % 2 ? MAYA : SAM,
    chat_created_at: new Date(Date.now() - (4 - i) * 3_600_000).toISOString(),
    chat_body_text: `<p>${text}</p>`,
    chat_attachments: [],
    chat_comment_count: 0,
  })
  const answers = {
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [message(0, "Is the launch note ready?"), message(1, "Nearly, after lunch.")], has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
    "/message/scheduled/cancel": (_url: URL, request: Request) => {
      const { id } = request.postDataJSON() as { id: string }
      const i = list.findIndex((m) => m.id === id)
      if (i >= 0) list.splice(i, 1)
      return { msg: "ok", data: null }
    },
    "/message/scheduled": () => ({ msg: "ok", data: list }),
    "/message/schedule": (_url: URL, request: Request) => {
      const answer = next.answer
      next.answer = "ok"
      if (answer === "offline") return withStatus(0, null)
      if (answer === "refused") return withStatus(400, { msg: REFUSED })
      const sent = request.postDataJSON() as { kind: string; body: Record<string, unknown>; send_at: string }
      const m = { id: `s${list.length + 1}`, kind: sent.kind, target: MAYA.user_uuid, send_at: sent.send_at, status: "pending", preview: WORDS }
      list.push(m)
      return { msg: "ok", data: m }
    },
  }
  return { answers, list, next }
}

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR
  if (dir) await page.screenshot({ path: `${dir}/v711-${name}.png` })
}

const box = (page: Page) => page.locator('.ProseMirror[contenteditable="true"]').last()
const sheet = (page: Page) => page.getByRole("menu", { name: "Send later" })
const chip = (page: Page) => page.locator("[data-scheduled-chip]")
/** The toasts on screen that say `words`. */
const toasts = (page: Page, words: string | RegExp) => page.locator('.toast-viewport li[data-state="open"]').filter({ hasText: words })
// Before an end frame: no toast still leaving, no sheet or menu still open, and nothing on the page still moving, so
// the frame shows the state the person is left with, not an animation's middle (DESIGN-BUILD-126's F1 on V-711).
async function stillForShot(page: Page) {
  await expect(page.locator('.toast-viewport li[data-state="closed"]')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 })
  await expect(sheet(page)).toHaveCount(0, { timeout: 15_000 })
  await animationsSettled(page.locator("body"), { subtree: true, timeout: 15_000 })
}

/** Holds a finger on Send for `ms`, in its middle. */
async function holdSend(page: Page, ms: number) {
  const send = page.getByRole("button", { name: "Send", exact: true })
  const r = (await send.boundingBox())!
  const f = await finger(page)
  await f.down(r.x + r.width / 2, r.y + r.height / 2)
  await page.waitForTimeout(ms)
  await f.up()
}

/** The scheduled list: one message, then deleted. */
async function findAndDelete(page: Page, list: Scheduled[], tag: string, dark: string) {
  await page.getByText(/1 message scheduled for/).first().click({ timeout: 30_000 })
  const dialog = page.getByRole("dialog", { name: "Scheduled messages" })
  await expect(dialog.getByText(WORDS)).toBeVisible({ timeout: 30_000 })
  await animationsSettled(dialog, { subtree: true, timeout: 15_000 })
  await shot(page, `${tag}-scheduled${dark}`)
  await dialog.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByText(/message scheduled for/)).toHaveCount(0, { timeout: 30_000 })
  expect(list).toHaveLength(0)
  // The chip goes with its message, and the Delete is one toast in its own words.
  await expect(chip(page), "no chip for a deleted message").toHaveCount(0, { timeout: 5_000 })
  await expect(toasts(page, "Scheduled message deleted")).toHaveCount(1, { timeout: 30_000 })
  await expect(toasts(page, /^\s*Done\b/)).toHaveCount(0)
  // The sheet leaves by itself with its last message, and the person is left with the toast that says what happened
  // (the Escape the spec used to press here was the toaster's own: it dismissed that toast).
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  await expect(toasts(page, "Scheduled message deleted"), "the deleted toast stays").toHaveCount(1)
  await stillForShot(page)
  await shot(page, `${tag}-cancelled${dark}`)
}

/**
 * After its last message was deleted, another is scheduled in the same conversation: the list stays shut until the
 * bar's own tap opens it (V-774: it used to come back by itself, over the row just tapped).
 */
async function scheduleAgain(page: Page, list: Scheduled[], frame: string, schedule: () => Promise<void>) {
  await schedule()
  await expect(page.getByText(/1 message scheduled for/).first()).toBeVisible({ timeout: 30_000 })
  expect(list).toHaveLength(1)
  await expect(sheet(page)).toHaveCount(0, { timeout: 15_000 })
  const dialog = page.getByRole("dialog", { name: "Scheduled messages" })
  await expect(dialog, "the list stays shut until the bar is tapped").toHaveCount(0)
  // The focus is back in the box, as after the first time: never on the page, nor on a Send or chevron that hid
  // with the words (DB-128 F1b; the chevron kept it at 1280).
  await expect(box(page), "the focus is back in the box").toBeFocused()
  await stillForShot(page)
  await shot(page, frame)
  await page.getByText(/1 message scheduled for/).first().click()
  await expect(dialog.getByText(WORDS)).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden({ timeout: 10_000 })
}

for (const scheme of ["light", "dark"] as const) {
  const dark = scheme === "dark" ? "-dark" : ""

  test(`a phone's Send later: a long-press on Send or +, as a sheet; schedules one and deletes it (${scheme})`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: scheme })
    const page = await context.newPage()
    const { answers, list, next } = conversation()
    await stubBackend(page, testInfo, answers)
    await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })

    // Empty, Send later is off in +, as Send is.
    await box(page).tap({ timeout: 60_000 })
    await page.getByRole("button", { name: "Add to the message" }).tap()
    await expect(page.getByRole("menuitem", { name: "Send later" })).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Escape")

    // With words, the field focused (the keyboard up): a hold on Send opens the sheet, and its release sends nothing.
    await box(page).tap()
    await page.keyboard.type(WORDS)
    await holdSend(page, 900)
    await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
    await animationsSettled(sheet(page), { subtree: true, timeout: 15_000 })
    await expect(box(page)).toContainText(WORDS)
    const rect = (await sheet(page).boundingBox())!
    expect(rect.width, "a sheet the screen's width").toBeGreaterThan(380)
    expect(rect.y + rect.height, "standing on the screen's foot").toBeGreaterThan(844 - 4)
    for (const name of [/^In 1 hour/, /^Tomorrow morning/, /Custom time/]) await expect(sheet(page).getByRole("menuitem", { name })).toBeVisible()
    await shot(page, `390-sheet${dark}`)

    // Custom time…: the app's date and time fields, Schedule pinned at the sheet's foot.
    await sheet(page).getByRole("menuitem", { name: /Custom time/ }).tap()
    await expect(page.getByRole("group", { name: "Pick a date and time" })).toBeVisible({ timeout: 30_000 })
    const schedule = page.getByRole("button", { name: "Schedule", exact: true })
    await expect(schedule).toBeEnabled()
    await expect(sheet(page).locator("[data-overlay-footer]")).toContainText("Schedule")
    const foot = (await schedule.boundingBox())!
    expect(foot.y + foot.height, "Schedule in view at the foot").toBeLessThanOrEqual(844)
    await shot(page, `390-custom${dark}`)
    await page.keyboard.press("Escape")
    await expect(sheet(page)).toHaveCount(0)
    // Its anchor takes no focus: the sheet gives it back to Send (CR-B44).
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeFocused()

    // Refused, then no network: each says so, and the words stay in the box.
    next.answer = "refused"
    await holdSend(page, 900)
    await sheet(page).getByRole("menuitem", { name: /^In 1 hour/ }).tap()
    await expect(toasts(page, REFUSED)).toHaveCount(1, { timeout: 30_000 })
    await expect(box(page)).toContainText(WORDS)
    await expect(chip(page)).toHaveCount(0)
    next.answer = "offline"
    await page.getByRole("button", { name: "Add to the message" }).tap()
    await page.getByRole("menuitem", { name: "Send later" }).tap()
    await sheet(page).getByRole("menuitem", { name: /^In 1 hour/ }).tap()
    await expect(toasts(page, /The server could not be reached/)).toHaveCount(1, { timeout: 30_000 })
    await expect(box(page)).toContainText(WORDS)
    await expect(chip(page)).toHaveCount(0)
    expect(list).toHaveLength(0)
    await stillForShot(page)
    await expect(box(page)).toContainText(WORDS)
    await shot(page, `390-failed${dark}`)

    // From +: Tomorrow morning goes, the box empties, and the chip says when.
    await page.getByRole("button", { name: "Add to the message" }).tap()
    await page.getByRole("menuitem", { name: "Send later" }).tap()
    await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
    await sheet(page).getByRole("menuitem", { name: /^Tomorrow morning/ }).tap()
    await expect(chip(page)).toContainText(/Scheduled for tomorrow/i, { timeout: 30_000 })
    await expect(box(page)).not.toContainText(WORDS)
    // One toast says when it goes, and the focus is back in the box.
    await expect(toasts(page, /Scheduled for tomorrow/i)).toHaveCount(1)
    await expect(toasts(page, /^\s*Done\b/)).toHaveCount(0)
    await expect(box(page)).toBeFocused()
    expect(list).toHaveLength(1)
    await findAndDelete(page, list, "390", dark)
    // Scheduled again, by a long-press on Send this time: the list stays shut (V-774).
    await scheduleAgain(page, list, `390-rescheduled${dark}`, async () => {
      await box(page).tap()
      await page.keyboard.type(WORDS)
      await holdSend(page, 900)
      await sheet(page).getByRole("menuitem", { name: /^Tomorrow morning/ }).tap()
    })

    // A tap on Send still sends, and opens nothing.
    await box(page).tap()
    await page.keyboard.type("Sent now.")
    const send = page.getByRole("button", { name: "Send", exact: true })
    await send.tap()
    await expect(box(page)).not.toContainText("Sent now.", { timeout: 30_000 })
    await expect(sheet(page)).toHaveCount(0)
    await expectEveryCallAnswered(page)
    await context.close()
  })

  test(`a computer's Send later is as it was: the chevron's menu schedules one, and it is deleted (${scheme})`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 800 }, colorScheme: scheme })
    const page = await context.newPage()
    const { answers, list } = conversation()
    await stubBackend(page, testInfo, answers)
    await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })
    await box(page).click({ timeout: 60_000 })
    await page.keyboard.type(WORDS)
    // + has no Send later here: the chevron beside Send is the computer's.
    await page.getByRole("button", { name: "Add to the message" }).click()
    await expect(page.getByRole("menuitem", { name: /Create a poll/ })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Send later" })).toHaveCount(0)
    await page.keyboard.press("Escape")
    // By keys: Tab from Send to its chevron; Enter opens the menu on its first choice, ArrowDown moves on.
    const chevron = page.getByRole("button", { name: "Send later" })
    await page.getByRole("button", { name: "Send", exact: true }).focus()
    await page.keyboard.press("Tab")
    await expect(chevron).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press("ArrowDown")
    await expect(sheet(page).getByRole("menuitem").nth(1)).toBeFocused()
    await animationsSettled(sheet(page), { subtree: true, timeout: 15_000 })
    await shot(page, `1280-focus${dark}`)
    await page.keyboard.press("Escape")
    await expect(sheet(page)).toHaveCount(0)
    await expect(chevron).toBeFocused()
    await chevron.click()
    await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
    await animationsSettled(sheet(page), { subtree: true, timeout: 15_000 })
    await shot(page, `1280-menu${dark}`)
    await sheet(page).getByRole("menuitem", { name: /^Tomorrow morning/ }).click()
    await expect(chip(page)).toContainText(/Scheduled for tomorrow/i, { timeout: 30_000 })
    await expect(toasts(page, /Scheduled for tomorrow/i)).toHaveCount(1)
    await expect(toasts(page, /^\s*Done\b/)).toHaveCount(0)
    expect(list).toHaveLength(1)
    await findAndDelete(page, list, "1280", dark)
    // Scheduled again from the chevron: the list stays shut (V-774).
    await scheduleAgain(page, list, `1280-rescheduled${dark}`, async () => {
      await box(page).click()
      await page.keyboard.type(WORDS)
      await chevron.click()
      await sheet(page).getByRole("menuitem", { name: /^Tomorrow morning/ }).click()
    })
    await expectEveryCallAnswered(page)
    await context.close()
  })
}

// V-872: a hold's release sends a click too, which a slow phone sends late; it must not act wherever it lands (Send,
// the sheet's scrim or one of its choices). On a CPU slowed six times (CDP), as that phone, a hold on Send opens the
// sheet, and it stays open, nothing sent or scheduled, the words still in the box.
test("on a slow phone (CPU 6x) a hold on Send opens Send later, and its release does nothing", async ({ browser }, testInfo) => {
  test.setTimeout(300_000)
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })
  const page = await context.newPage()
  const { answers, list } = conversation()
  await stubBackend(page, testInfo, answers)
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })
  await box(page).tap({ timeout: 60_000 })
  await page.keyboard.type(WORDS)
  await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 6 })
  await holdSend(page, 900)
  await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
  for (let t = 200; t <= 4000; t += 200) {
    await page.waitForTimeout(200)
    expect(await sheet(page).count(), `the sheet ${t} ms after it opened`).toBe(1)
  }
  await expect(box(page), "the release sent nothing").toContainText(WORDS)
  expect(list, "the release scheduled nothing").toHaveLength(0)
  await context.close()
})
