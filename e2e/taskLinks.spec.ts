import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, TASK_PANEL_READS, expectEveryCallAnswered, reviewShot, stubBackend, untilStill, withStatus } from "./stubbedApp"

// jira-01 J-H web: a task's place in its project's work hierarchy, on its
// page. A task in an epic names it in its Epic row, and an editor moves it to
// another of the project's epics; an epic lists its tasks with their statuses;
// every task reads its links in the server's words, each other task with its
// key, name and status, and an editor links one more (how, which task, then
// Link in the picker's footer: a sheet on a phone, its Link in view) or takes
// one off. A member who may not change the task reads the same, with no way
// to change it. Every call the page makes is answered; with SHOTS_DIR set,
// each view is saved for review at the viewport and theme it ran in.

const P = "9e0a0000-0000-4000-8000-0000000000e2"
const NONE = "0001-01-01T00:00:00Z"
const id = (i: number) => `7a5c00e2-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const EPIC_TYPE = { id: "", builtin: "epic", name: "Epic", icon: "epic" }
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const member = { ...admin, role: "member", create_tasks: false, edit_tasks: "assigned", delete_tasks: "own", manage: false, manage_people: false, archive: false }

type Reader = "editor" | "member"
type Row = { i: number; name: string; key: string; status: string; epic?: boolean; parent?: number }
const ROWS: Row[] = [
  { i: 0, name: "Spring launch", key: "Q4-1", status: "inProgress", epic: true },
  { i: 1, name: "Write the launch post", key: "Q4-2", status: "inProgress", parent: 0 },
  { i: 2, name: "Book the venue", key: "Q4-3", status: "todo", parent: 0 },
  { i: 3, name: "Venue booking", key: "Q4-4", status: "done" },
  { i: 4, name: "Print the flyers", key: "Q4-5", status: "todo" },
  { i: 5, name: "Rebrand", key: "Q4-6", status: "todo", epic: true },
  { i: 6, name: "Draft the press note", key: "Q4-7", status: "todo" },
]
const row = (i: number) => ROWS[i]
const listed = (r: Row) => ({
  task_uuid: id(r.i),
  task_name: r.name,
  task_status: r.status,
  task_priority: "medium",
  task_key: r.key,
  task_created_at: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_assignee: SAM,
  ...(r.epic ? { task_work_type: EPIC_TYPE } : {}),
})
const linked = (kind: string, direction: string, label: string, r: Row) => ({ kind, direction, label, task: { uuid: id(r.i), name: r.name, key: r.key, status: r.status, project_uuid: P } })

type Server = { parent: Map<number, number | undefined>; links: ReturnType<typeof linked>[]; writes: { path: string; body: unknown }[] }

/**
 * timeline.fails: the project's tasks can't be read while it holds (the picker's error state). timeline.held: they are
 * answered only once it settles, so they reach a picker already open, as they do over a network.
 */
async function openTask(page: Page, testInfo: TestInfo, reader: Reader, i: number, timeline: { fails?: boolean; held?: Promise<void> } = {}): Promise<Server> {
  const server: Server = {
    parent: new Map(ROWS.map((r) => [r.i, r.parent])),
    links: [linked("relates", "out", "relates to", row(2)), linked("duplicates", "in", "is duplicated by", row(3))],
    writes: [],
  }
  const access = reader === "editor" ? admin : member
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: reader === "editor" ? 1 : 0, project_is_member: 1, project_members: [SAM], project_access: access }
  const info = (r: Row) => {
    const parent = server.parent.get(r.i)
    return {
      msg: "ok",
      data: {
        ...listed(r),
        task_label: "",
        task_description: "<p>What it needs.</p>",
        task_project: { ...project },
        task_access: { view: true, edit: reader === "editor", delete: reader === "editor", comment: true, log_time: true },
        task_parent_task: parent === undefined ? undefined : { task_uuid: id(parent), task_name: row(parent).name, task_key: row(parent).key, ...(row(parent).epic ? { task_work_type: EPIC_TYPE } : {}) },
        task_sub_tasks: ROWS.filter((c) => server.parent.get(c.i) === r.i).map(listed),
        task_comments: [],
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_created_by: SAM,
      },
    }
  }
  const write = (path: string) => (_url: URL, request: Request) => {
    const body = request.postDataJSON() as { task_uuid: string; other_task_uuid?: string; kind?: string; direction?: string; parent_task_uuid?: string }
    server.writes.push({ path, body })
    if (path === "/task/parent") server.parent.set(1, ROWS.find((r) => id(r.i) === body.parent_task_uuid)?.i)
    if (path === "/task/link") {
      const other = ROWS.find((r) => id(r.i) === body.other_task_uuid)!
      // The server's words for it from this side (domain/Task LinkLabel).
      const label = body.kind === "relates" ? "relates to" : body.direction === "in" ? `is ${body.kind === "clones" ? "cloned" : "duplicated"} by` : body.kind!
      server.links.push(linked(body.kind!, body.direction!, label, other))
    }
    if (path === "/task/link/delete") server.links = server.links.filter((l) => !(l.task.uuid === body.other_task_uuid && l.kind === body.kind))
    return { msg: "Saved." }
  }
  const answers: Record<string, unknown> = {
    ...TASK_PANEL_READS,
    [`/project/${P}/timeline`]: async () => {
      await timeline.held
      return timeline.fails
        ? withStatus(500, { msg: "The project's tasks couldn't be read." })
        : { msg: "ok", data: { tasks: ROWS.filter((r) => r.epic || server.parent.get(r.i) === undefined || row(server.parent.get(r.i)!).epic).map(listed), total: ROWS.length, can_edit: reader === "editor", project_access: access } }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: false } },
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: reader === "editor" } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: reader === "editor" } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: reader === "editor" } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/milestone/": { msg: "ok", data: null },
    "/entities": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/restriction": { msg: "ok", data: { restricted: false, people: [], can_change: false } },
    "/task/link/delete": write("/task/link/delete"),
    "/task/link": write("/task/link"),
    "/task/parent": write("/task/parent"),
  }
  for (const r of ROWS) {
    answers[`/task/info/${id(r.i)}`] = () => info(r)
    // Only the task opened has links here; the server reads them as the reader.
    answers[`/task/${id(r.i)}/links`] = () => (r.i === 1 ? { links: server.links, count: server.links.length } : { links: [], count: 0 })
  }
  await stubBackend(page, testInfo, answers)
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem("onecamp:demo-lead-dismissed", "1")
  })
  await page.goto(`/app/task/${id(i)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-panel]")).toBeVisible({ timeout: 60_000 })
  return server
}

/** Saved for review when SHOTS_DIR is set (links-<name>-<width>-<theme>.png). */
const shot = (page: Page, name: string, theme: string) => reviewShot(page, `links-${name}`, theme)
const links = (page: Page) => page.locator("[data-task-links]")

for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`a task's epic and links at ${phone ? 390 : 1280}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("an editor reads the links and the epic, links one more from the shared picker, and takes one off", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const server = await openTask(page, testInfo, "editor", 1)
        const epic = page.locator('[data-property="epic"]').getByRole("combobox", { name: "Epic" })
        await expect(epic).toHaveText(/Q4-1\s*Spring launch/)
        if (phone) {
          // The Epic row closed, beside Type, at a phone's width.
          await epic.scrollIntoViewIfNeeded()
          await shot(page, "epic-row", theme)
        }
        const list = links(page)
        await expect(list.locator('[data-link-group="relates to"]')).toContainText("Q4-3")
        await expect(list.locator('[data-link-group="relates to"]')).toContainText("Book the venue")
        await expect(list.locator('[data-link-group="is duplicated by"]')).toContainText("Venue booking")
        await list.scrollIntoViewIfNeeded()
        await shot(page, "links", theme)

        const add = list.getByRole("button", { name: "Link a task" })
        if (phone) await add.tap()
        else await add.click()
        // The shared task picker (ProjectTaskPick), a sheet on the phone: how it links over the filter, and the pick links.
        const picker = page.locator("[data-combobox-content]")
        await expect(picker).toBeVisible()
        const clones = picker.getByRole("radio", { name: "clones", exact: true })
        const flyers = picker.getByRole("option", { name: /Q4-5\s*Print the flyers/ })
        // How it links is one row of chips (ChipChoice), never a radio's circle: 40px to a finger, two even rows to a mouse.
        const ways = picker.getByRole("radiogroup", { name: "How it links" }).getByRole("radio")
        await expect(ways).toHaveCount(5)
        // Measured once the sheet stands still: under load its opening slide still drew a chip 39.99997px tall.
        await untilStill(page)
        const boxes = await ways.evaluateAll((els) => els.map((e) => ({ top: Math.round(e.getBoundingClientRect().top), h: e.getBoundingClientRect().height, chip: e.hasAttribute("data-chip") })))
        for (const b of boxes) expect(b.chip).toBe(true)
        if (phone) for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(40)
        else expect(new Set(boxes.map((b) => b.top)).size).toBe(2)
        if (phone) await clones.tap()
        else await clones.click()
        await expect(clones).toHaveAttribute("aria-checked", "true")
        await expect(flyers).toBeVisible()
        await shot(page, "picker", theme)
        if (phone) {
          // The sheet's list goes on below its edge: the shared fade says so at its end, and scrolled there the last row stands whole.
          const body = page.locator("[data-v3-sheet] [data-sheet-body]")
          const end = picker.locator("[data-sheet-end]")
          const fade = () => end.evaluate((e) => getComputedStyle(e, "::before").content)
          await expect(body).toHaveAttribute("data-more-below", "")
          expect(await fade()).not.toBe("none")
          // And it can be seen: it reaches the middle of the last row's text in view, so that row's ink fades. A 12px fade lay
          // under a whole row's text, and the list read as one that ends.
          // Measured once the sheet stands still: under load its opening slide still carried the rows past the window's edge (817 against 800).
          await untilStill(page)
          const cut = await end.evaluate((e) => {
            const edge = Math.min(e.closest("[data-sheet-body]")!.getBoundingClientRect().bottom, innerHeight)
            const middles = [...e.closest("[data-combobox-content]")!.querySelectorAll('[role="option"]')].map((o) => {
              const walk = document.createTreeWalker(o, NodeFilter.SHOW_TEXT)
              const boxes: DOMRect[] = []
              for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                const r = document.createRange()
                r.selectNodeContents(n)
                if (r.getBoundingClientRect().height) boxes.push(r.getBoundingClientRect())
              }
              return (Math.min(...boxes.map((b) => b.top)) + Math.max(...boxes.map((b) => b.bottom))) / 2
            })
            const bottom = e.getBoundingClientRect().top
            return { fadeTop: bottom - parseFloat(getComputedStyle(e, "::before").height), fadeBottom: bottom, textMiddle: middles.filter((m) => m < edge).at(-1)! }
          })
          expect(cut.fadeTop).toBeLessThanOrEqual(cut.textMiddle)
          expect(cut.fadeBottom).toBeGreaterThan(cut.textMiddle)
          await body.evaluate((e) => e.scrollTo({ top: e.scrollHeight }))
          await expect(body).not.toHaveAttribute("data-more-below")
          expect(await fade()).toBe("none")
          const last = picker.getByRole("option", { name: /Q4-7\s*Draft the press note/ })
          const box = (await last.boundingBox())!
          const edge = await body.evaluate((e) => e.getBoundingClientRect().bottom)
          expect(box.y + box.height).toBeLessThanOrEqual(Math.min(edge, page.viewportSize()!.height))
          await shot(page, "picker-end", theme)
        }
        if (phone) await flyers.tap()
        else await flyers.click()
        await expect.poll(() => server.writes.at(-1)).toEqual({ path: "/task/link", body: { task_uuid: id(1), other_task_uuid: id(4), kind: "clones", direction: "out" } })
        await expect(picker).toHaveCount(0)
        await expect(list.locator('[data-link-group="clones"]')).toContainText("Print the flyers")

        const off = list.getByRole("button", { name: 'Take off "relates to Book the venue"' })
        if (phone) await off.tap()
        else {
          // A row's remove shows on hover (rowRemove), as it does for a pointer.
          await list.locator("[data-task-link]", { hasText: "Book the venue" }).hover()
          await expect(off).toBeVisible()
          await shot(page, "hover-x", theme)
          await off.click()
        }
        await expect.poll(() => server.writes.at(-1)).toEqual({ path: "/task/link/delete", body: { task_uuid: id(1), other_task_uuid: id(2), kind: "relates", direction: "out" } })
        await expect(list.locator('[data-link-group="relates to"]')).toHaveCount(0)
        await expectEveryCallAnswered(page)
      })

      test("an editor moves the task to another epic of the project", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const server = await openTask(page, testInfo, "editor", 1)
        const epic = page.locator('[data-property="epic"]').getByRole("combobox", { name: "Epic" })
        await expect(epic).toHaveText(/Spring launch/)
        if (phone) await epic.tap()
        else await epic.click()
        const rebrand = page.getByRole("option", { name: /Q4-6\s*Rebrand/ })
        await expect(rebrand).toBeVisible()
        // Only the project's epics, and none first.
        await expect(page.getByRole("option").first()).toHaveText("No epic")
        await expect(page.getByRole("option", { name: /Print the flyers/ })).toHaveCount(0)
        await shot(page, "epic-field", theme)
        if (phone) await rebrand.tap()
        else await rebrand.click()
        await expect.poll(() => server.writes.at(-1)).toEqual({ path: "/task/parent", body: { task_uuid: id(1), parent_task_uuid: id(5) } })
        await expect(epic).toHaveText(/Rebrand/)
        await expectEveryCallAnswered(page)
      })

      test("an epic lists its tasks with their statuses and has no Epic row; a task with neither says so", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openTask(page, testInfo, "editor", 0)
        const children = page.locator("[data-subtasks]")
        await expect(children.getByRole("heading", { name: "Tasks in this epic" })).toBeVisible()
        await expect(children.locator("[data-subtask]")).toHaveCount(2)
        await expect(children).toContainText("Q4-2")
        await expect(children).toContainText("0 of 2")
        await expect(page.locator('[data-property="epic"]')).toHaveCount(0)
        await children.scrollIntoViewIfNeeded()
        await shot(page, "epic-children", theme)
        await expectEveryCallAnswered(page)

        await page.goto(`/app/task/${id(6)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.locator('[data-property="epic"]').getByRole("combobox", { name: "Epic" })).toHaveText("No epic", { timeout: 60_000 })
        await expect(links(page).getByRole("button", { name: "Link a task" })).toBeVisible()
        await expect(links(page).locator("[data-task-link]")).toHaveCount(0)
        await links(page).scrollIntoViewIfNeeded()
        await shot(page, "empty", theme)
        await expectEveryCallAnswered(page)
      })

      test("a failed read of the project's tasks says so in the picker, and Try again reads them", async ({ page }, testInfo) => {
        test.skip(!phone, "the error frame is the phone sheet's (the picker's ErrorState is the same at 1280)")
        test.setTimeout(180_000)
        const timeline = { fails: true }
        const server = await openTask(page, testInfo, "editor", 1, timeline)
        const list = links(page)
        await list.scrollIntoViewIfNeeded()
        await list.getByRole("button", { name: "Link a task" }).tap()
        const picker = page.locator("[data-combobox-content]")
        await expect(picker).toContainText("Couldn't load this project's tasks")
        const retry = picker.getByRole("button", { name: /Try again/ })
        await expect(retry).toBeVisible()
        await expect(picker.getByRole("option")).toHaveCount(0)
        await shot(page, "error", theme)
        timeline.fails = false
        await retry.tap()
        await expect(picker.getByRole("option", { name: /Q4-5\s*Print the flyers/ })).toBeVisible()
        expect(server.writes).toEqual([])
      })

      test("the keyboard links a task: Tab to Link a task, Enter, the arrows across how it links and down the list, Escape", async ({ page }, testInfo) => {
        test.skip(phone, "a keyboard's pass, at 1280")
        test.setTimeout(180_000)
        let answer!: () => void
        await openTask(page, testInfo, "editor", 1, { held: new Promise<void>((done) => (answer = done)) })
        const list = links(page)
        const add = list.getByRole("button", { name: "Link a task" })
        await list.scrollIntoViewIfNeeded()
        // From the control before it, Tab reaches Link a task.
        await list.locator("[data-task-link]").last().getByRole("button").first().focus()
        for (let n = 0; n < 4 && !(await add.evaluate((e) => e === document.activeElement)); n++) await page.keyboard.press("Tab")
        await expect(add).toBeFocused()
        await page.keyboard.press("Enter")
        const picker = page.locator("[data-combobox-content]")
        const filter = picker.getByRole("combobox")
        await expect(filter).toBeFocused()
        // The project's tasks reach the menu once it is open and placed, as over a network.
        await expect(picker.getByText("Loading…")).toBeVisible()
        answer()
        // Link a task sits low on the page here: the menu shows five rows or more on its side, or opens above it where there is
        // room (Radix's flip). Placed for its loading row and then held to the room below, it showed three of the project's
        // tasks, cut clean at a row.
        const room = () =>
          picker.evaluate((menu) => {
            const list = menu.querySelector("[cmdk-list]")!.getBoundingClientRect()
            const rows = [...menu.querySelectorAll('[role="option"]')].map((o) => o.getBoundingClientRect())
            const whole = rows.filter((r) => r.top >= list.top - 0.5 && r.bottom <= list.bottom + 0.5).length
            const side = menu.getAttribute("data-side")
            return { side, whole, rows: rows.length, fits: rows.length > 5 && (side === "top" || whole >= 5) }
          })
        await expect.poll(room).toEqual(expect.objectContaining({ fits: true }))
        // Back into how it links: the pick has the focus, and the arrows move it.
        // Once the menu stands still, the focus is still in its filter (under load the keys came while it moved: 3 of 72).
        await untilStill(page)
        await expect(filter).toBeFocused()
        await page.keyboard.press("Shift+Tab")
        const relates = picker.getByRole("radio", { name: "relates to" })
        await expect(relates).toBeFocused()
        // Two at a keyboard's speed, back to back: two chips on, the pick with the focus.
        await page.keyboard.press("ArrowRight")
        await page.keyboard.press("ArrowRight")
        const dupBy = picker.getByRole("radio", { name: "is duplicated by" })
        await expect(dupBy).toBeFocused()
        await expect(dupBy).toHaveAttribute("aria-checked", "true")
        await expect(relates).toHaveAttribute("aria-checked", "false")
        // Every way by the arrows, round at both ends: Right and Down on, Left and Up back; one chip in the tab order, the pick.
        for (const [key, name] of [["ArrowRight", "clones"], ["ArrowDown", "is cloned by"], ["ArrowRight", "relates to"], ["ArrowLeft", "is cloned by"], ["ArrowUp", "clones"], ["ArrowLeft", "is duplicated by"]] as const) {
          await page.keyboard.press(key)
          const way = picker.getByRole("radio", { name, exact: true })
          await expect(way).toBeFocused()
          await expect(way).toHaveAttribute("aria-checked", "true")
          await expect(picker.locator('[role="radio"][tabindex="0"]')).toHaveText([name])
        }
        await shot(page, "keys-head", theme)
        // Down the list from the filter: a lit row, the head's pick kept.
        await page.keyboard.press("Tab")
        await expect(filter).toBeFocused()
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        await expect(picker.locator('[cmdk-item][data-selected="true"]')).toHaveCount(1)
        await expect(dupBy).toHaveAttribute("aria-checked", "true")
        await shot(page, "keys-list", theme)
        // Escape from the head closes the picker, the focus back on Link a task.
        await page.keyboard.press("Shift+Tab")
        await expect(dupBy).toBeFocused()
        await page.keyboard.press("Escape")
        await expect(picker).toHaveCount(0)
        await expect(add).toBeFocused()
        await expectEveryCallAnswered(page)
      })

      test("a member who may not change the task reads its epic and links, with no way to change them", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const server = await openTask(page, testInfo, "member", 1)
        const list = links(page)
        await expect(list.locator("[data-task-link]")).toHaveCount(2)
        await expect(list.getByRole("button", { name: "Link a task" })).toHaveCount(0)
        await expect(list.getByRole("button", { name: /^Take off/ })).toHaveCount(0)
        await expect(page.locator('[data-property="epic"]').getByRole("combobox", { name: "Epic" })).toBeDisabled()
        await list.scrollIntoViewIfNeeded()
        await shot(page, "member", theme)
        expect(server.writes).toEqual([])
        await expectEveryCallAnswered(page)
      })
    })
  }
}
