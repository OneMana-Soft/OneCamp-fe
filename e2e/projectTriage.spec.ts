import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SCHEMES, SCREENS, screenUse, type Screen } from "./screens"
import { SAM, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"

/**
 * A project's Triage tab (linear-21 H3) on H1's queue: a form's task waits in triage; the tab
 * shows what waits; it is declined with a reason, the next row is lit, accepting it is refused
 * until it has a priority (the server's words), P gives it one, 1 accepts it and the queue is
 * empty. The tab is drawn from the project's info (project_triage), so a project with triage off
 * asks nothing about triage on its first load.
 */
const P = "9e0a0000-0000-4000-8000-0000000052a3"
type Who = "admin" | "member"
const project = (who: Who, triage?: { on: boolean; waiting: number }) => ({
  project_uuid: P,
  project_name: "Support desk",
  project_key: "SUP",
  project_is_admin: who === "admin",
  project_is_member: true,
  project_members: [SAM],
  ...(triage ? { project_triage: triage } : {}),
})
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()
const FORM_TASK = { task_uuid: "9e0a0000-0000-4000-8000-00000000a001", project_uuid: P, source: "form", requester_name: "Asha Rao", requester_email: "asha@example.com", arrived_at: hoursAgo(5), name: "Printer on 3 is jammed", status: "todo" }
const API_TASK = { task_uuid: "9e0a0000-0000-4000-8000-00000000a002", project_uuid: P, source: "api", requester_name: "", requester_email: "", arrived_at: hoursAgo(2), name: "VPN drops at noon", status: "todo" }

/** A task already on the board: the original a waiting task duplicates. */
const ORIGINAL = { task_uuid: "9e0a0000-0000-4000-8000-00000000a003", task_name: "Printer on 2 is jammed", task_status: "todo" }

async function open(page: Page, testInfo: TestInfo, who: Who, { on = true, tab = "list", canDecide = true, readFails = "", onDuty = false } = {}) {
  // The queue's read answers 503 with these words until readAnswers() (the error and offline frames).
  let refusal = readFails
  let waiting = on ? [FORM_TASK, API_TASK] : []
  let triageOn = on
  let prioritised = false
  const decisions: { task: string; body: Record<string, unknown> }[] = []
  const priorities: Record<string, unknown>[] = []
  let queueReads = 0
  // linear-21 H4: the rota (business/Triage RotaView: an empty one may come with people null) and the
  // project's rules, kept as the server keeps them, so each read after a write carries it.
  let rota: Record<string, unknown> = onDuty
    ? { people: [SAM.user_uuid], weeks: 1, start: new Date().toISOString().slice(0, 10), on_duty: SAM.user_uuid, next_change: "" }
    : { people: null, weeks: 1, start: "", on_duty: "", next_change: "" }
  const rotaPuts: Record<string, unknown>[] = []
  // Reads of the rota after a save: the queue's line hears the save without one (V-1227).
  let rotaReadsAfterSave = 0
  let rules: Record<string, unknown>[] | null = null
  const ruleSaves: Record<string, unknown>[] = []
  const snoozed: (typeof FORM_TASK)[] = []
  const info = () => project(who, triageOn ? { on: true, waiting: waiting.length } : who === "admin" ? { on: false, waiting: 0 } : undefined)
  await stubBackend(page, testInfo, {
    [`/project/${P}/triage`]: () => {
      queueReads++
      if (refusal) return withStatus(503, { msg: refusal })
      return { msg: "ok", data: { on: triageOn, requests: waiting, can_decide: canDecide } }
    },
    "/task/triage/": (url: URL, request: Request) => {
      const task = url.pathname.split("/").at(-2)!
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>
      decisions.push({ task, body })
      if (body.decision === "accept" && task === API_TASK.task_uuid && !prioritised) return withStatus(409, { msg: "Give it a priority before accepting it." })
      // A snoozed task leaves the server's queue until its time (H, business/Triage Snooze).
      if (body.decision === "snooze") snoozed.push(...waiting.filter((r) => r.task_uuid === task))
      waiting = waiting.filter((r) => r.task_uuid !== task)
      return { msg: "Decided." }
    },
    "/task/updateTaskPriority": (_url: URL, request: Request) => {
      priorities.push(JSON.parse(request.postData() || "{}"))
      prioritised = true
      return { msg: "ok" }
    },
    [`/project/${P}/triage/rota`]: (_url: URL, request: Request) => {
      if (request.method() === "GET") {
        if (rotaPuts.length) rotaReadsAfterSave++
        return { msg: "ok", data: { rota, can_manage: who === "admin" } }
      }
      const body = JSON.parse(request.postData() || "{}") as { people: string[]; weeks: number; start: string }
      rotaPuts.push(body)
      rota = { ...body, on_duty: body.people[0] ?? "", next_change: body.people.length > 1 ? new Date(Date.now() + 7 * 86_400_000).toISOString() : "" }
      return { msg: "Saved.", data: { rota } }
    },
    [`/project/${P}/rules/runs`]: { msg: "ok", data: null },
    [`/project/${P}/rules`]: (_url: URL, request: Request) => {
      if (request.method() === "GET") return { msg: "ok", data: { rules, can_manage: who === "admin", templates: null, max: 50 } }
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>
      ruleSaves.push(body)
      const saved = { ...body, id: "9e0a0000-0000-4000-8000-00000000b001", created_by: SAM.user_uuid, run_count: 0, last_run_at: null, updated_at: new Date().toISOString() }
      rules = [...(rules ?? []), saved]
      return { msg: "ok", data: saved }
    },
    [`/project/${P}/policies`]: (url: URL, request: Request) => {
      const pol = (key: string, value: boolean) => ({ key, kind: "bool", label: key, help: "", value, default: false, is_set: value })
      if (request.method() === "GET") return { msg: "ok", data: [pol("projects.triage", triageOn), pol("projects.triage.priority", false)] }
      const value = !!(JSON.parse(request.postData() || "{}") as { value?: boolean }).value
      if (url.pathname.endsWith("/projects.triage")) {
        triageOn = value
        if (value && waiting.length === 0) waiting = [FORM_TASK, API_TASK]
      }
      return { msg: "ok", data: pol(url.pathname.split("/").at(-1)!, value) }
    },
    [`/project/${P}?`]: () => ({ msg: "ok", data: { ...info(), project_task_count: 0, project_tasks: [] }, pageCount: 1 }),
    [`/project/taskList/${P}`]: () => ({ msg: "ok", data: { ...info(), project_task_count: 0, project_tasks: [] }, pageCount: 1 }),
    [`/project/taskListForKanban/${P}`]: () => ({ msg: "ok", data: { ...info(), project_tasks_todo: [], project_tasks_done_count: 0 } }),
    [`/project/info/${P}`]: () => ({ msg: "ok", data: info() }),
    [`/project/membersInfo/${P}`]: () => ({ msg: "ok", data: info() }),
    [`/project/memberWithAdminFlag/${P}`]: () => ({ msg: "ok", data: info() }),
    [`/project/${P}/forms`]: { msg: "ok", data: { forms: null, can_edit: true } },
    "/user/dm-ai-targets": { msg: "ok", data: null },
    [`/project/${P}/timeline`]: { msg: "ok", data: { tasks: [ORIGINAL, { task_uuid: "9e0a0000-0000-4000-8000-00000000a004", task_name: "Badge reader at the side door", task_status: "in_progress" }], milestones: [], dependencies: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/${P}/releases`]: { msg: "ok", data: { releases: [], can_edit: false } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    "/notices": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "edit", data: { project_name: "Support desk" }, topic: `project/${P}` }] },
  })
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return {
    decisions, priorities, rotaPuts, ruleSaves,
    queueReads: () => queueReads,
    rotaReadsAfterSave: () => rotaReadsAfterSave,
    readAnswers: () => void (refusal = ""),
    // A snoozed task's time has come: the server's queue has it again.
    wake: () => void (waiting = [...snoozed.splice(0), ...waiting]),
  }
}

const triageTab = (page: Page) => page.getByRole("tab", { name: /Triage/ })
const rowOf = (page: Page, name: string) => page.locator("[data-task-id]", { hasText: name })
const lit = (page: Page) => page.locator("[data-task-id][data-highlighted]")
const footer = (page: Page) => page.locator("[data-triage-actions]")
const press = (screen: Screen, el: ReturnType<Page["locator"]>) => (screen.hasTouch ? el.tap() : el.click())
/** A pick (the house select): open it, then choose. */
async function choose(page: Page, screen: Screen, scope: ReturnType<Page["locator"]>, label: string, option: string) {
  await press(screen, scope.getByRole("combobox", { name: label }))
  await press(screen, page.getByRole("option", { name: option, exact: true }))
}
/** The page is shown again: the queue and the rota read again (lib/lazy/useKeptRead). */
const shownAgain = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")))

/** A decision: its key on a computer, its button in the pinned footer on a phone. */
async function decide(page: Page, screen: Screen, key: string, button: RegExp) {
  if (screen.hasTouch) await footer(page).getByRole("button", { name: button }).tap()
  else await page.keyboard.press(key)
}

/** Copy and values show whole at every width: nothing in `box` (or the box itself) cuts its text off. */
async function expectNotClipped(box: Locator, what: string) {
  const cut = await box.evaluate((root) =>
    [root, ...root.querySelectorAll("*")]
      .filter((el) => !(el instanceof SVGElement) && getComputedStyle(el).overflowX !== "visible" && el.scrollWidth > el.clientWidth)
      .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth} "${(el.textContent ?? "").slice(0, 40)}"`),
  )
  expect(cut, `${what} is cut off`).toEqual([])
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`Triage, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
      })

      test("a form's task is declined with a reason, the next is refused until it has a priority, then accepted", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { decisions, priorities } = await open(page, testInfo, "admin")
        const tab = triageTab(page)
        await expect(tab).toBeVisible({ timeout: 60_000 })
        await expect(tab).toContainText("2")
        await (screen.hasTouch ? tab.tap() : tab.click())
        await expect(rowOf(page, "Printer on 3 is jammed")).toBeVisible({ timeout: 30_000 })
        await expect(rowOf(page, "Printer on 3 is jammed")).toContainText("Asha Rao")
        await expect(lit(page)).toContainText("Printer on 3 is jammed")
        await reviewShot(page, "triage-rows", scheme)

        // 2: a reason first.
        await decide(page, screen, "2", /^Decline/)
        const dialog = page.getByRole("dialog", { name: /Decline/ })
        await expect(dialog).toBeVisible()
        await dialog.getByRole("textbox", { name: /Why/ }).fill("Facilities handles printers")
        await reviewShot(page, "triage-decline", scheme)
        await dialog.getByRole("button", { name: "Decline" }).click()
        await expect(rowOf(page, "Printer on 3 is jammed")).toHaveCount(0)
        expect(decisions[0]).toEqual({ task: FORM_TASK.task_uuid, body: { decision: "decline", reason: "Facilities handles printers" } })
        // The next row is lit.
        await expect(lit(page)).toContainText("VPN drops at noon")

        // 1: refused, in the server's words; the row stays.
        await decide(page, screen, "1", /^Accept/)
        await expect(page.getByRole("alert").filter({ hasText: "Give it a priority before accepting it." })).toBeVisible()
        await expect(rowOf(page, "VPN drops at noon")).toBeVisible()

        // P: the house priority list.
        await decide(page, screen, "p", /^Priority/)
        await page.getByRole("option", { name: /High/ }).click()
        await expect.poll(() => priorities.length).toBe(1)
        expect(priorities[0]).toMatchObject({ task_uuid: API_TASK.task_uuid, task_priority: "high" })

        // 1: accepted; the queue is empty and says what arrives here.
        await decide(page, screen, "1", /^Accept/)
        await expect(rowOf(page, "VPN drops at noon")).toHaveCount(0)
        await expect(page.getByText(/Nothing waits in triage/)).toBeVisible()
        await reviewShot(page, "triage-empty", scheme)
        await expectEveryCallAnswered(page)
      })

      test("a waiting task is marked a duplicate of the original, picked with the house task picker", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { decisions } = await open(page, testInfo, "admin")
        const tab = triageTab(page)
        await expect(tab).toBeVisible({ timeout: 60_000 })
        await (screen.hasTouch ? tab.tap() : tab.click())
        await expect(lit(page)).toContainText("Printer on 3 is jammed", { timeout: 30_000 })

        // 3: the project's own tasks, less those waiting.
        await decide(page, screen, "3", /^Duplicate/)
        // The picker's own list: on a computer the queue (a listbox of its own) stays readable beside it.
        const picker = page.getByRole("listbox").filter({ has: page.getByRole("option", { name: /Printer on 2 is jammed/ }) })
        const original = picker.getByRole("option", { name: /Printer on 2 is jammed/ })
        await expect(original).toBeVisible({ timeout: 30_000 })
        await expect(picker.getByRole("option", { name: /VPN drops at noon/ })).toHaveCount(0)
        await reviewShot(page, "triage-duplicate", scheme)
        await (screen.hasTouch ? original.tap() : original.click())
        await expect(rowOf(page, "Printer on 3 is jammed")).toHaveCount(0)
        expect(decisions[0]).toEqual({ task: FORM_TASK.task_uuid, body: { decision: "duplicate", duplicate_of: ORIGINAL.task_uuid } })
        await expect(lit(page)).toContainText("VPN drops at noon")
        await expectEveryCallAnswered(page)
      })

      test("a project with triage off draws no tab and asks nothing about triage; its admin turns it on from the tools", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { queueReads } = await open(page, testInfo, "admin", { on: false })
        const actions = page.getByRole("button", { name: "Project actions" })
        await expect(actions).toBeVisible({ timeout: 60_000 })
        await expect(triageTab(page)).toHaveCount(0)
        expect(queueReads()).toBe(0)
        await (screen.hasTouch ? actions.tap() : actions.click())
        const entry = page.getByRole("menuitem", { name: "Triage" }).or(page.getByRole("button", { name: "Triage", exact: true }))
        await (screen.hasTouch ? entry.first().tap() : entry.first().click())
        const sheet = page.getByRole("dialog", { name: /Triage/ })
        await expect(sheet).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "triage-settings", scheme)
        await sheet.getByRole("switch", { name: "Triage on" }).click()
        await expect(sheet.getByRole("switch", { name: "Triage on" })).toBeChecked()
        // The sheet is modal: the page behind it is drawn but hidden from reading until it closes.
        await page.keyboard.press("Escape")
        await expect(sheet).toHaveCount(0)
        await expect(triageTab(page)).toBeVisible({ timeout: 30_000 })
        await expectEveryCallAnswered(page)
      })

      test("a queue the server can't read says its words; offline it waits for the network; back online, a retry brings the rows", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const words = "Triage is moving to a new home. Try again in a minute."
        const { readAnswers } = await open(page, testInfo, "admin", { tab: "triage", readFails: words })
        await expect(page.getByRole("alert").filter({ hasText: words })).toBeVisible({ timeout: 60_000 })
        await reviewShot(page, "triage-error", scheme)
        await page.context().setOffline(true)
        await expect(page.getByText(/Triage shows when you.re back online/)).toBeVisible({ timeout: 15_000 })
        await reviewShot(page, "triage-offline", scheme)
        await page.context().setOffline(false)
        const retry = page.getByRole("button", { name: "Try again" })
        await expect(retry).toBeVisible({ timeout: 15_000 })
        readAnswers()
        await (screen.hasTouch ? retry.tap() : retry.click())
        await expect(rowOf(page, "Printer on 3 is jammed")).toBeVisible({ timeout: 30_000 })
        await expect(page.getByRole("alert").filter({ hasText: words })).toHaveCount(0)
        await expectEveryCallAnswered(page)
      })

      // linear-21 H4: from the triage settings, an admin sets who is on duty and a rule on arriving work.
      test("an admin sets the on-duty rota and a rule on arriving work from the triage settings; the queue says who is on duty", async ({ page }, testInfo) => {
        test.setTimeout(300_000)
        const { rotaPuts, ruleSaves, rotaReadsAfterSave } = await open(page, testInfo, "admin", { tab: "triage" })
        await expect(rowOf(page, "Printer on 3 is jammed")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByTestId("triage-on-duty")).toContainText("Nobody is on triage duty")
        await press(screen, page.getByRole("button", { name: /Triage settings/ }))
        const sheet = page.getByRole("dialog", { name: /Triage/ })
        const rotaBox = sheet.getByTestId("triage-rota")
        await expect(rotaBox).toContainText("Nobody is on triage duty", { timeout: 30_000 })
        await reviewShot(page, "triage-rota-empty", scheme)
        await press(screen, rotaBox.getByRole("button", { name: "sam", exact: true }))
        await choose(page, screen, rotaBox, "Turn length", "2 weeks")
        await reviewShot(page, "triage-rota-edit", scheme)
        await expectNotClipped(rotaBox.getByRole("button", { name: /^First turn starts/ }), "the first turn's date")
        await press(screen, sheet.getByRole("button", { name: "Save rota" }))
        await expect(rotaBox).toContainText("sam is on duty")
        // The queue's own line hears the save at once, the sheet still open: no reload, no refocus, and no read of the
        // rota after the PUT (V-1227: a kept write reaches every mounted reader of its path).
        await expect(page.getByTestId("triage-on-duty")).toContainText("On duty: sam")
        expect(rotaReadsAfterSave()).toBe(0)
        await reviewShot(page, "triage-rota-saved-on-duty", scheme)
        expect(rotaPuts).toHaveLength(1)
        expect(rotaPuts[0]).toMatchObject({ people: [SAM.user_uuid], weeks: 2 })
        expect(String(rotaPuts[0].start)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        // Nothing scrolls sideways on a phone.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

        // The rules on arrival: the sheet gives way to the project's one rules dialog, on those rules.
        await press(screen, sheet.getByRole("button", { name: /Set rules on arrival/ }))
        const rulesBox = page.getByRole("dialog", { name: "Rules on arrival" })
        await expect(rulesBox).toContainText("No rules on arrival yet")
        await press(screen, rulesBox.getByRole("button", { name: /New rule/ }))
        const builder = page.locator("[data-rule-builder]")
        await expect(builder.getByRole("combobox", { name: "Trigger" })).toContainText("Work arrives in triage")
        await choose(page, screen, builder, "Door", "API")
        await choose(page, screen, builder, "Into status", "In progress")
        await reviewShot(page, "triage-arrival-rule", scheme)
        // The rule's pool to share work among: the same people chips the rota uses (PeopleChips), tapped on a phone too.
        await press(screen, builder.getByRole("button", { name: /Add an action/ }))
        await press(screen, builder.getByRole("combobox", { name: "Action" }).nth(1))
        await press(screen, page.getByRole("option", { name: "Assign it", exact: true }))
        await press(screen, builder.getByRole("group", { name: "Among" }).getByRole("button", { name: "sam", exact: true }))
        await press(screen, page.getByRole("button", { name: "Make rule" }))
        await expect(page.getByRole("dialog", { name: "Rules on arrival" })).toContainText("came in by API")
        expect(ruleSaves).toHaveLength(1)
        expect(ruleSaves[0]).toMatchObject({ trigger_type: "task_arrived", conditions: { items: [{ field: "source", op: "is", value: "api" }] }, actions: [{ type: "triage", decision: "accept", status: "inProgress" }, { type: "assign", assign: "round_robin", user_ids: [SAM.user_uuid] }] })
        // Closed, the sheet comes back; closed too, the queue says who is on duty.
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog", { name: /Triage/ })).toBeVisible()
        await page.keyboard.press("Escape")
        // Still without a refocus. (The sheet read the rota again when it came back from the rules dialog: its own read.)
        await expect(page.getByTestId("triage-on-duty")).toContainText("On duty: sam")
        await expectEveryCallAnswered(page)
      })

      test("H snoozes a task: it leaves the queue, and comes back when the server has it again", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { decisions, wake } = await open(page, testInfo, "admin", { tab: "triage" })
        await expect(rowOf(page, "Printer on 3 is jammed")).toBeVisible({ timeout: 60_000 })
        await expect(lit(page)).toContainText("Printer on 3 is jammed")
        if (screen.hasTouch) await footer(page).getByRole("button", { name: /^Snooze/ }).tap()
        else await page.keyboard.press("h")
        await press(screen, page.getByRole("menuitem", { name: /In 1 hour/ }))
        await expect(rowOf(page, "Printer on 3 is jammed")).toContainText("Snoozed until")
        await reviewShot(page, "triage-snoozed", scheme)
        expect(decisions[0]).toMatchObject({ task: FORM_TASK.task_uuid, body: { decision: "snooze" } })
        await shownAgain(page)
        await expect(rowOf(page, "Printer on 3 is jammed")).toHaveCount(0)
        wake()
        await shownAgain(page)
        await expect(rowOf(page, "Printer on 3 is jammed")).toBeVisible()
        await expect(rowOf(page, "Printer on 3 is jammed")).not.toContainText("Snoozed")
        await expectEveryCallAnswered(page)
      })

      test("a member who may not decide reads the queue with no decisions offered", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { decisions } = await open(page, testInfo, "member", { tab: "triage", canDecide: false, onDuty: true })
        await expect(rowOf(page, "Printer on 3 is jammed")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: /Triage settings/ })).toHaveCount(0)
        // The member reads who is on duty, with nothing to change it.
        const duty = page.getByTestId("triage-on-duty")
        await expect(duty).toContainText("On duty: sam")
        await expect(duty.getByRole("button")).toHaveCount(0)
        await reviewShot(page, "triage-rota-member", scheme)
        await expectNotClipped(page.getByText(/^You can read what waits here/), "the member's read-only sentence")
        await expect(footer(page).getByRole("button", { name: /^Accept/ })).toHaveCount(0)
        if (!screen.hasTouch) await page.keyboard.press("1")
        expect(decisions).toEqual([])
        await reviewShot(page, "triage-member", scheme)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
