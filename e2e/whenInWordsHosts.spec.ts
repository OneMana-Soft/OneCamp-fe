import { appendFileSync } from "node:fs"

import { expect, test, type Locator, type Page, type Request, type Route, type TestInfo } from "@playwright/test"

import { SAM, docInfo, expectEveryCallAnswered, expectHomeSettled, stubBackend } from "./stubbedApp"

// WHEN, IN WORDS, IN ITS OTHER TWO HOSTS (H3 fix; DB-115 F1 and F2). Remind
// me is remindInWords.spec's. Here, Send later's custom time and Pause's
// Custom…, each where its screen opens it, with the time typed in words:
// - Send later at 1280 (the composer's Send later, Custom time…) and at 390
//   under a finger (the scheduled message's Reschedule, a w-64 popover). Its
//   placeholder fits its box whole, the words are said back, and a time past
//   the server's 120 days is refused in its own words, in danger ink.
// - While WhenField loads, Send later holds its place (h-[218px] on a phone,
//   md:h-[182px]): the hold, measured with the script held back, is the
//   loaded field's height, so nothing in the popover jumps.
// - Pause at 1280 (its popover, Pause under the note) and at 390 (its sheet,
//   Pause pinned in the footer).
// One theme per width, the other across the pair. With SHOTS_DIR set, each
// state is saved for review, and each hold's measure is written to holds.txt.
//
// The clock is pinned: Thursday 15 Oct 2026, 10:00 in Asia/Kolkata.

const NOW = new Date("2026-10-15T04:30:00Z")
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const HOME = {
  "/user/getAllUserEmojiStatusList": { msg: "ok", data: [] },
  "/activity/unified": { msg: "ok", data: null },
  "/user/assignedTaskList": { msg: "ok", data: null },
  "/event/getEvents": { msg: "ok", data: null },
  "/project/overview": { msg: "ok", data: { projects: [] } },
  "/ch/suggested": { msg: "ok", data: [] },
  // Beta's "What needs me now" also asks for approvals waiting on Sam (C11): none here.
  "/approvals/waiting": { msg: "ok", data: { items: [] } },
}

/** A conversation with Maya, one message scheduled for tomorrow 9:00. */
function conversation() {
  const message = (i: number, text: string) => ({
    chat_uuid: `0c4a0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    chat_from: i % 2 ? SAM : MAYA,
    chat_to: i % 2 ? MAYA : SAM,
    chat_created_at: new Date(NOW.getTime() - (4 - i) * 3_600_000).toISOString(),
    chat_body_text: `<p>${text}</p>`,
    chat_attachments: [],
    chat_comment_count: 0,
  })
  return {
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [message(0, "Is the launch note ready?"), message(1, "Nearly, after lunch.")], has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
    "/message/scheduled": { msg: "ok", data: [{ id: "s1", kind: "dm", target: MAYA.user_uuid, send_at: "2026-10-16T03:30:00Z", status: "pending", preview: "The launch note, for Acme on Monday." }] },
  }
}

async function open(page: Page, testInfo: TestInfo, theme: "light" | "dark", stubs: Record<string, unknown>, path: string) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, stubs)
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 180_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/** Every script the page asks for from now on waits until let go, one at a time or all. */
async function holdScripts(page: Page) {
  const held: Route[] = []
  const pattern = "**/_next/static/chunks/**"
  await page.route(pattern, (route) => void held.push(route))
  return {
    held,
    async one() {
      await held.shift()?.continue()
    },
    async all() {
      await page.unroute(pattern)
      for (const r of held.splice(0)) await r.continue()
    },
  }
}

/**
 * Send later's custom time opened by `openIt` while its scripts are held: the
 * place it holds for WhenField, measured, then the field, measured, once its
 * scripts come. Scripts the custom time itself waits on are let go one at a
 * time until the hold shows.
 */
async function holdThenField(page: Page, openIt: () => Promise<void>) {
  const scripts = await holdScripts(page)
  await openIt()
  const custom = page.locator("[data-schedule-custom]").last()
  // WhenField sits in the custom time's body wrapper (its first child, beside the footer's: V-711), so the hold is
  // that wrapper's own div, never the wrappers themselves.
  const hold = custom.locator(":scope > div:first-child > div:not([data-slot='when-field'])")
  for (let i = 0; i < 60 && !(await hold.isVisible()); i++) {
    if (scripts.held.length) await scripts.one()
    await page.waitForTimeout(200)
  }
  await expect(hold, "Send later's hold, while WhenField loads").toBeVisible()
  const held = (await hold.boundingBox())!
  await scripts.all()
  const field = custom.locator("[data-slot='when-field']")
  await expect(field).toBeVisible({ timeout: 60_000 })
  await expect(hold).toHaveCount(0)
  const loaded = (await field.boundingBox())!
  const line = `send later hold at ${page.viewportSize()?.width}: held ${held.height} px, loaded ${loaded.height} px`
  console.log(line)
  if (process.env.SHOTS_DIR) appendFileSync(`${process.env.SHOTS_DIR}/holds.txt`, `${line}\n`)
  expect(loaded.height, line).toBeCloseTo(held.height, 0)
  return custom
}

/** The placeholder's width as drawn in the box's own font, and the room the box gives it. */
const placeholderFit = (box: Locator, text?: string) =>
  box.evaluate((el: HTMLInputElement, other) => {
    const s = getComputedStyle(el)
    const pen = document.createElement("canvas").getContext("2d")!
    pen.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    return { width: pen.measureText(other ?? el.placeholder).width, room: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) }
  }, text)

/** Words said back, a time past the server's 120 days refused in its own words, and a shot of each. */
async function sayAndRefuse(page: Page, custom: Locator, theme: string) {
  const box = custom.getByRole("textbox", { name: "When" })
  const schedule = custom.getByRole("button", { name: "Schedule", exact: true })
  // F1: the box is w-64's at its narrowest; the placeholder fits it whole, where
  // the one before ("…, Dec 3 14:00") ran past it.
  await expect(box).toHaveAttribute("placeholder", "tomorrow 9, in 2 hours")
  const fit = await placeholderFit(box)
  expect(fit.width, `the placeholder, ${fit.width} px in ${fit.room} px`).toBeLessThanOrEqual(fit.room)
  await shot(page, "sendlater-custom", theme)

  await box.fill("tomorrow 9")
  await expect(custom.getByText(/^tomorrow at 9:00\sAM$/)).toBeVisible()
  await expect(schedule).toBeEnabled()
  await shot(page, "sendlater-words", theme)

  await box.fill("in 5 months")
  const why = custom.getByText("Pick a time within the next 120 days.")
  await expect(why).toBeVisible()
  await expect(why).toHaveClass(/text-danger-ink/)
  await expect(box).toHaveAttribute("aria-invalid", "true")
  await expect(schedule).toBeDisabled()
  await shot(page, "sendlater-refused", theme)
  return fit
}

test.describe("Send later's custom time in words", () => {
  test("at 1280, light: the composer's Custom time holds its place, then says the words back and refuses past 120 days", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 }, colorScheme: "light", timezoneId: "Asia/Kolkata", locale: "en-US", serviceWorkers: "block" })
    const page = await context.newPage()
    await open(page, testInfo, "light", conversation(), `/app/chat/${MAYA.user_uuid}`)
    await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })
    await page.locator('.ProseMirror[contenteditable="true"]').last().click({ timeout: 60_000 })
    await page.keyboard.type("The launch note is attached.")
    await page.getByRole("button", { name: "Send later" }).click({ timeout: 30_000 })
    const custom = await holdThenField(page, () => page.getByRole("menuitem", { name: /Custom time/ }).click({ timeout: 30_000 }))
    await sayAndRefuse(page, custom, "light")
    await expectEveryCallAnswered(page)
    await context.close()
  })

  // Below 640 px Reschedule's popover is a bottom sheet (app/overlay.css 8), whose box is wide: the date and the
  // time stand in one row, and the placeholder before would fit it too. Its w-64 popover, where that one ran past
  // the box (F1), is a tablet's under a finger: there the date and the time stack at 44 px.
  for (const s of [
    { way: "at 390 under a finger, dark: Reschedule's sheet", width: 390, height: 844, theme: "dark", w64: false },
    { way: "at 768 under a finger, light: Reschedule's w-64 popover", width: 768, height: 1024, theme: "light", w64: true },
  ] as const) {
    test(`${s.way} holds its place, fits its placeholder, and refuses past 120 days`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: s.width, height: s.height }, isMobile: true, hasTouch: true, colorScheme: s.theme, timezoneId: "Asia/Kolkata", locale: "en-US", serviceWorkers: "block" })
      const page = await context.newPage()
      await open(page, testInfo, s.theme, conversation(), `/app/chat/${MAYA.user_uuid}`)
      await expect(page.getByText("Nearly, after lunch.").first()).toBeVisible({ timeout: 120_000 })
      await page.getByText(/1 message scheduled for/).first().click({ timeout: 60_000 })
      const custom = await holdThenField(page, () => page.getByRole("button", { name: "Reschedule" }).click({ timeout: 30_000 }))
      const fit = await sayAndRefuse(page, custom, s.theme)
      if (s.w64) {
        // The placeholder before would not have fitted this box.
        const before = await placeholderFit(custom.getByRole("textbox", { name: "When" }), "tomorrow 9, in 2 hours, Dec 3 14:00")
        expect(before.width, "the placeholder before, in this box").toBeGreaterThan(fit.room)
      }
      await expectEveryCallAnswered(page)
      await context.close()
    })
  }
})

/** Pause notifications' Custom…, opened as each screen opens it. */
async function pauseCustom(page: Page, upright: boolean) {
  if (upright) {
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    await page.getByText(/^Pause notifications/).first().click({ timeout: 60_000 })
  } else {
    await page.getByRole("button", { name: "Profile and settings" }).click({ timeout: 120_000 })
    await page.getByRole("menuitem", { name: /Pause notifications/ }).click()
    await page.getByRole("menuitem", { name: "Custom…" }).click()
  }
  await expect(page.locator("[data-pause-menu]").last()).toBeVisible({ timeout: 60_000 })
  await page.getByRole("button", { name: "Custom…" }).last().click()
}

for (const s of [
  { way: "at 1280, dark: its popover, Pause under the note", width: 1280, height: 860, touch: false, theme: "dark" },
  { way: "at 390 under a finger, light: its sheet, Pause pinned in the footer", width: 390, height: 844, touch: true, theme: "light" },
] as const) {
  test(`Pause's Custom… in words ${s.way}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: s.width, height: s.height }, isMobile: s.touch, hasTouch: s.touch, colorScheme: s.theme, timezoneId: "Asia/Kolkata", locale: "en-US", serviceWorkers: "block" })
    const page = await context.newPage()
    await open(page, testInfo, s.theme, HOME, "/app/home")
    await expectHomeSettled(page)
    await pauseCustom(page, s.touch)
    const custom = page.locator("[data-pause-menu] [data-schedule-custom]").last()
    const box = custom.getByRole("textbox", { name: "When" })
    await expect(box).toBeVisible({ timeout: 60_000 })
    const pause = page.getByRole("button", { name: "Pause", exact: true })
    if (s.touch) {
      // The sheet keeps the focus, so no keyboard is thrown over it; Pause is in its footer.
      await expect(page.locator("[data-vaul-drawer][data-state='open']")).toHaveCount(1)
      await expect(pause.locator("xpath=ancestor::*[@data-sheet-footer]")).toHaveCount(1)
      await expect(box).not.toBeFocused()
      await box.tap()
    } else {
      await expect(box).toBeFocused()
    }
    const fit = await placeholderFit(box)
    expect(fit.width, `the placeholder, ${fit.width} px in ${fit.room} px`).toBeLessThanOrEqual(fit.room)
    await box.fill("tomorrow 9")
    await expect(custom.getByText(/^tomorrow at 9:00\sAM$/)).toBeVisible()
    await expect(pause).toBeEnabled()
    await shot(page, "pause-words", s.theme)
    await expectEveryCallAnswered(page)
    await context.close()
  })
}

// REMIND ME FROM A DOC OR A PROJECT ITSELF (CR-B9 G1; linear-45 #1: "reminds
// you about a task, doc or project, with the time in words"). The doc's More
// (the phone's Document options sheet) and the project's Project actions
// offer Remind me…: Later's one picker, loaded on the click, a dialog at 1280
// and a sheet with Set reminder pinned in its footer at 390. The pick is the
// member's own Later entry: POST /later/save with the thing's kind.

const DOC = "7d2c9a4e-3b1f-4e8a-9c6d-5f0a1b2c3d4e"
const P = "9e0a0000-0000-4000-8000-0000000000b6"
const ACCESS = { role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: false, manage_people: false, archive: false }
const PROJECT = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 0, project_is_member: 1, project_members: [SAM], project_access: ACCESS }
/** Tomorrow 9:00 in Asia/Kolkata, as the server is sent it. */
const TOMORROW_9 = "2026-10-16T03:30:00.000Z"
/** What beta's doc page reads beside the doc: the live editor's token, Sam's access (read and comment, as docInfo's), and no label. */
const DOC_READS = {
  "/auth/token": { data: { token: "e2e-sam" } },
  [`/doc/access/${DOC}`]: { data: { doc_uuid: DOC, level: "comment", owner: false, lock: "", locked: false, can_share: false, can_lock_soft: false, can_lock_hard: false } },
  [`/labels/items/doc/${DOC}`]: { msg: "ok", data: null },
}

/** The member's Later saves, as the server is asked them. */
function laterSaves(saves: Record<string, unknown>[]) {
  return {
    "/later/save": (_url: URL, request: Request) => {
      const body = request.postDataJSON() as Record<string, unknown>
      saves.push(body)
      return { msg: "ok", data: { id: `l${saves.length}`, ...body, created_at: NOW.toISOString() } }
    },
  }
}

function projectStubs() {
  return {
    "/task/views": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...PROJECT, project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...PROJECT, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: 0, inProgress: 0, inReview: 0, done: 0, canceled: 0 } },
    },
    [`/project/${P}/glance`]: { msg: "ok", data: { open: 0, done: 0, overdue: 0, due_this_week: 0 } },
    [`/project/info/${P}`]: { msg: "ok", data: PROJECT },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: PROJECT },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    [`/project/${P}/links`]: { msg: "ok", data: { links: [], can_manage: false } },
  }
}

/** Later's picker, opened: the time in words said back, then set; on a phone a sheet with Set reminder in its footer. */
async function remindAt(page: Page, touch: boolean, name: string, theme: string) {
  const dialog = page.getByRole("dialog", { name: "Remind me" })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  const box = dialog.getByRole("textbox", { name: "When" })
  const set = dialog.getByRole("button", { name: "Set reminder" })
  if (touch) {
    await expect(set.locator("xpath=ancestor::*[@data-sheet-footer]")).toHaveCount(1)
    await box.tap()
  }
  await box.fill("tomorrow 9")
  await expect(dialog.getByText(/^tomorrow at 9:00\sAM$/)).toBeVisible()
  await shot(page, name, theme)
  if (touch) await set.tap()
  else await set.click()
  await expect(dialog).toHaveCount(0)
}

for (const s of [
  { way: "at 1280, light: More's Remind me…, a dialog", width: 1280, height: 860, touch: false, theme: "light" },
  { way: "at 390 under a finger, dark: Document options' Remind me…, a sheet", width: 390, height: 844, touch: true, theme: "dark" },
] as const) {
  test(`a doc is reminded about from the doc itself ${s.way}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: s.width, height: s.height }, isMobile: s.touch, hasTouch: s.touch, colorScheme: s.theme, timezoneId: "Asia/Kolkata", locale: "en-US", serviceWorkers: "block" })
    const page = await context.newPage()
    const saves: Record<string, unknown>[] = []
    await open(page, testInfo, s.theme, { [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch notes" }), ...DOC_READS, ...laterSaves(saves) }, `/app/doc/${DOC}`)
    if (s.touch) {
      await page.getByRole("button", { name: "Document options" }).tap({ timeout: 120_000 })
      await page.getByRole("button", { name: /^Remind me/ }).tap({ timeout: 30_000 })
    } else {
      await page.getByRole("button", { name: "More doc actions" }).click({ timeout: 120_000 })
      await page.getByRole("menuitem", { name: /^Remind me/ }).click({ timeout: 30_000 })
    }
    await remindAt(page, s.touch, "doc-remindme", s.theme)
    await expect.poll(() => saves).toEqual([{ item_type: "doc", item_id: DOC, link: `/app/doc/${DOC}`, title: "Launch notes", remind_at: TOMORROW_9 }])
    await expectEveryCallAnswered(page)
    await context.close()
  })
}

for (const s of [
  { way: "at 1280, dark: Project actions", width: 1280, height: 860, touch: false, theme: "dark" },
  { way: "at 390 under a finger, light: the phone's Project actions", width: 390, height: 844, touch: true, theme: "light" },
] as const) {
  test(`a project is saved for Later, and reminded about, ${s.way}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: s.width, height: s.height }, isMobile: s.touch, hasTouch: s.touch, colorScheme: s.theme, timezoneId: "Asia/Kolkata", locale: "en-US", serviceWorkers: "block" })
    const page = await context.newPage()
    const saves: Record<string, unknown>[] = []
    await open(page, testInfo, s.theme, { ...projectStubs(), ...laterSaves(saves) }, `/app/project/${P}?tab=list`)
    const actions = page.getByRole("button", { name: "Project actions" }).first()
    await expect(actions).toBeVisible({ timeout: 120_000 })
    const press = (l: Locator) => (s.touch ? l.tap() : l.click())
    await press(actions)
    await shot(page, "project-later-menu", s.theme)
    await press(page.getByRole("menuitem", { name: "Save for later" }))
    await expect.poll(() => saves).toEqual([{ item_type: "project", item_id: P, link: `/app/project/${P}`, title: "Q4 launch", remind_at: null }])
    // The closed menu stays mounted for its 180 ms exit, and a press outside it
    // still dismisses; reopened within that, the new menu shuts at once. A person
    // isn't that quick: wait for it to go, as people do (h3diag trace, 1280).
    await expect(page.getByRole("menu")).toHaveCount(0)
    await press(actions)
    await press(page.getByRole("menuitem", { name: /^Remind me/ }))
    await remindAt(page, s.touch, "project-remindme", s.theme)
    await expect.poll(() => saves.length).toBe(2)
    expect(saves[1]).toEqual({ item_type: "project", item_id: P, link: `/app/project/${P}`, title: "Q4 launch", remind_at: TOMORROW_9 })
    await expectEveryCallAnswered(page)
    await context.close()
  })
}
