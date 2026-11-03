import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, expectEveryCallAnswered, stubBackend } from "./stubbedApp"

// New task's chip menus reach their last row (linear-09's LIVE walk, 3 Nov):
// at 1280 the Type chip's menu showed one row, Task, and a click on Request
// fell on the dialog's overlay. Every chip's menu is drawn in its chip row,
// which fades its edges with a mask, and a mask cuts whatever is drawn inside
// the row to the row's box, its hit area too: Status, Priority, Assignee, Due
// date, Labels and Estimate the same. Each menu here must show and take its
// last row, by mouse at 1280 and by touch on a phone.

const P = "7c3e1a2b-4d5f-4e6a-9b8c-0d1e2f3a4b5c"
const MAYA = { user_uuid: "8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com", user_is_admin: false }
const JONAS = { user_uuid: "9b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d5e", user_name: "jonas", user_full_name: "Jonas Weber", user_email_id: "jonas@example.com", user_is_admin: false }
const project = {
  project_uuid: P,
  project_name: "Q4 launch",
  project_key: "Q4",
  project_is_admin: true,
  project_is_member: true,
  project_team: { team_name: "Product" },
  project_members: [SAM, MAYA, JONAS],
}
const type = (builtin: string, name: string) => ({ id: `type-${builtin}`, builtin, name, icon: builtin })

async function stub(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/project/projectListByAdminUID": { msg: "ok", data: [project] },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: {
      msg: "ok",
      data: [type("task", "Task"), type("bug", "Bug"), type("feature", "Feature"), type("milestone", "Milestone"), type("approval", "Approval"), type("request", "Request")],
      icons: [],
    },
    [`/project/${P}/task-templates`]: { msg: "ok", data: { templates: [], defaults: {}, can_manage: true } },
    "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: [] } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/approvals/waiting": { msg: "ok", data: { items: [] } },
  })
}

/** Whether a press at the middle of `loc` lands on it: nothing drawn over it, and nothing cuts it off. */
const reachable = (loc: Locator, at: "middle" | "foot" = "middle") =>
  loc.evaluate((el, at) => {
    const box = el.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, at === "foot" ? box.bottom - 6 : box.top + box.height / 2)
    return !!hit && el.contains(hit)
  }, at)

for (const [label, use] of [
  ["at 1280", { viewport: { width: 1280, height: 860 } }],
  ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`New task's chip menus ${label}`, () => {
    test.use(use)

    test("every chip's menu shows its whole self, and its last row is the one picked", async ({ page }, testInfo) => {
      const phone = label === "on a phone"
      const press = (loc: Locator) => (phone ? loc.tap() : loc.click())
      await stub(page, testInfo)
      await page.goto(`/app/create/task?project=${P}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const chips = page.locator("[data-create-chips]")
      await expect(chips.getByRole("button", { name: /^Type: / })).toBeVisible({ timeout: 60_000 })

      // Every chip's menu, down to its foot: a press there lands in the menu.
      for (const name of [/^Type: /, /^Status: /, /^Priority: /, /^(Assignee: |Pick someone)/, /^Due date/, /^Labels/, /^Estimate/]) {
        await press(chips.getByRole("button", { name }).first())
        // The menu is a dialog of its own, drawn once its chunk is here; on a computer New task is one too.
        await expect(page.getByRole("dialog")).toHaveCount(phone ? 1 : 2)
        const menu = page.getByRole("dialog").last()
        await expect(menu).toBeVisible()
        await expect.poll(() => reachable(menu, "foot"), { message: `${name}'s menu, at its foot`, timeout: 5_000 }).toBe(true)
        // Escape puts the menu away, and New task stays.
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(phone ? 0 : 1)
        await expect(chips.getByRole("button", { name }).first()).toBeVisible()
      }

      // Each list's last row, picked by the pointer the device has (Assignee's foot is checked above).
      for (const [name, row, after] of [
        [/^Type: /, /^Request/, "Type: Request"],
        [/^Status: /, /^Cancelled/, "Status: Cancelled"],
        [/^Priority: /, /^Urgent/, "Priority: Urgent"],
      ] as const) {
        await press(chips.getByRole("button", { name }).first())
        const option = page.getByRole("option", { name: row }).last()
        await expect(option).toBeVisible()
        await expect.poll(() => reachable(option), { message: `${row} in ${name}'s menu`, timeout: 5_000 }).toBe(true)
        await press(option)
        await expect(chips.getByRole("button", { name: after })).toBeVisible()
      }
      await expectEveryCallAnswered(page)
    })
  })
}
