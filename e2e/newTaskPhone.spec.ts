import { expect, test, type Request } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// A phone's New task page (/app/create/task, from My Tasks' options) takes
// taps: from 21 Oct it was dim and gave every tap to the scrim of a float
// that wasn't up (the GitHub link's popover, mounted while shut).

const P = "5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6e"
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: true, project_is_member: true, project_team: { team_name: "Product" }, project_members: [SAM] }

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test("a phone's New task page takes taps, and Create sends the task", async ({ page }, testInfo) => {
  const sent: Record<string, unknown>[] = []
  await stubBackend(page, testInfo, {
    "/project/projectListByAdminUID": { msg: "ok", data: [project] },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    "/task/createTask": (_url: URL, request: Request) => {
      sent.push(JSON.parse(request.postData() ?? "{}"))
      return { msg: "ok", task_uuid: "00000000-0000-4000-8000-000000000001" }
    },
  })
  await page.goto("/app/create/task", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const title = page.getByLabel("Task title")
  await expect(title).toBeVisible({ timeout: 60_000 })
  await expect(page.locator("html")).not.toHaveAttribute("data-float", /.*/)
  await title.tap()
  await title.fill("Ship the release notes")
  await page.getByRole("button", { name: "Create task" }).tap()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ task_name: "Ship the release notes", task_project_uuid: P })
})
