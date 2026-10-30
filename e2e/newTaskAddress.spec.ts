import { expect, test, type Request } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// A new task's address, as Linear's linear.new: /app/create/task?title=…
// opens New task with what it names (lib/task/newTaskAddress), over My Tasks
// on a computer and as the page's own form on a phone, and Create sends it.

const P = "5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6e"
const project = {
  project_uuid: P,
  project_name: "Website relaunch",
  project_key: "WEB",
  project_is_admin: true,
  project_is_member: true,
  project_team: { team_name: "Product" },
  project_members: [SAM],
}
const ADDRESS = "/app/create/task?title=Ship+the+release+notes&project=web&status=In+review&priority=high&assignee=me&labels=launch&due=2026-11-20&estimate=2h"

for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 } }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ] as const) {
    test.describe(`a new task's address ${label}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      test("opens New task with what it names, and Create sends it", async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        const sent: Record<string, unknown>[] = []
        await stubBackend(page, testInfo, {
          "/project/projectListByAdminUID": { msg: "ok", data: [project] },
          [`/project/${P}/statuses`]: { msg: "ok", data: null },
          "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: [] } },
          "/task/createTask": (_url: URL, request: Request) => {
            sent.push(JSON.parse(request.postData() ?? "{}"))
            return { msg: "ok", task_uuid: "00000000-0000-4000-8000-000000000001" }
          },
          "/task/updateTaskEstimate": { msg: "ok", data: {} },
        })
        await page.goto(ADDRESS, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByLabel("Task title")).toHaveValue("Ship the release notes", { timeout: 60_000 })
        // On a computer the dialog opens over My Tasks, and the link's fields leave the address.
        if (label === "at 1280") {
          const where = () => {
            const u = new URL(page.url())
            return [u.pathname, ...["open", "title", "project", "status"].filter((k) => u.searchParams.has(k))].join(" ")
          }
          await expect.poll(where).toBe("/app/myTask")
        }
        await expect(page.getByRole("button", { name: /Website relaunch/ })).toBeVisible()
        await expect(page.getByRole("button", { name: "Status: In review" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Priority: High" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Estimate: 2h" })).toBeVisible()
        await reviewShot(page, "new-task-address", theme)
        await page.getByRole("button", { name: "Create task" }).click()
        await expect.poll(() => sent.length).toBe(1)
        expect(sent[0]).toMatchObject({
          task_name: "Ship the release notes",
          task_project_uuid: P,
          task_status: "inReview",
          task_priority: "high",
          task_assignee_uuid: SAM.user_uuid,
          task_label: "launch",
        })
      })
    })
  }
}
