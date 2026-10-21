import { expect, test, type Locator, type Page } from "@playwright/test"

import { openBoard, P } from "./projectBoard"
import { SAM, stubBackend } from "./stubbedApp"

// A disabled control's reason is read whole, wherever the control sits (18 Oct
// 2026). The reason was a CSS ::after centred above its control
// (bbe10852e, the interaction layer), so any clip around the control cut it:
// in the new-task dialog, the Attach tip read "a project first", "Pick" cut
// off by the dialog's own edge (its overflow-y-auto), in all three browsers.
// It is now the app's portalled tooltip (Button's disabledReason and
// TaskCheck's, through components/ui/disabledTip.tsx), which no clip reaches
// and which keeps itself on screen.

test.use({ viewport: { width: 1280, height: 860 } })

/**
 * The tip a control names (aria-describedby) is open, says `text`, and all of
 * it can be read: inside the window, and inside every box around it that
 * clips (overflow, clip-path, paint containment), with no line cut short.
 */
async function expectWholeTip(page: Page, control: Locator, text: string) {
  await expect(page.getByRole("tooltip")).toHaveText(text)
  const chip = page.locator("[data-radix-popper-content-wrapper] > [data-side]").filter({ hasText: text })
  await expect(chip).toBeVisible()
  await expect(chip).toBeInViewport({ ratio: 1 })
  const cut = await chip.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const out: string[] = []
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push("its own text overflows it")
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none" || /paint|strict|content/.test(cs.contain)
      if (!clips) continue
      const b = a.getBoundingClientRect()
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) out.push(`<${a.tagName.toLowerCase()} class="${String(a.className).slice(0, 60)}">`)
    }
    return out
  })
  expect(cut, "boxes that cut the tip").toEqual([])
  const described = await control.getAttribute("aria-describedby")
  expect(described, "the control names its tip").toBeTruthy()
}

test("the new-task dialog's Attach says, whole, why it waits", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await openBoard(page, testInfo, "light")
  await page.getByLabel("New task", { exact: true }).click()
  const dlg = page.getByRole("dialog").last()
  await expect(dlg).toBeVisible()
  const attach = dlg.getByRole("button", { name: "Attach a file" })
  await expect(attach).toHaveAttribute("aria-disabled", "true")

  // By pointer.
  await attach.hover()
  await expectWholeTip(page, attach, "Pick a project first")
  // Pressing it does nothing, and the dialog stays (forced: Playwright won't press an aria-disabled control).
  await attach.click({ force: true })
  await expect(dlg).toBeVisible()

  // By keyboard: it keeps its focus, and the tip comes with it.
  await page.mouse.move(2, 2)
  await expect(page.getByRole("tooltip")).toHaveCount(0)
  await dlg.getByRole("textbox").first().focus()
  for (let i = 0; i < 40 && !(await attach.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(attach).toBeFocused()
  await expectWholeTip(page, attach, "Pick a project first")
})

test("a read-only list's check says, whole, why it can't be ticked, on the top row too", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const NONE = "0001-01-01T00:00:00Z"
  const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 0, project_is_member: 0, project_members: [SAM] }
  const task = (i: number) => ({
    task_uuid: `00000000-0000-4000-8000-9${String(i).padStart(11, "0")}`,
    task_name: ["Draft launch email", "Fix login redirect on Safari", "Review pricing page copy"][i],
    task_status: "todo",
    task_priority: "medium",
    task_label: "",
    task_due_date: NONE,
    task_start_date: NONE,
    task_created_at: "2026-10-01T09:00:00Z",
    task_deleted_at: NONE,
    task_sub_task_count: 0,
    task_comment_count: 0,
    task_assignee: SAM,
    task_project: { project_uuid: P, project_name: "Website relaunch" },
    task_access: { edit: false, delete: false, comment: true, log_time: false },
  })
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_tasks: [0, 1, 2].map(task) } },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    "/notices": { msg: "ok", data: { notices: [] } },
  })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const check = page.getByRole("button", { name: "Mark Draft launch email complete" })
  await expect(check).toBeVisible({ timeout: 60_000 })
  await expect(check).toHaveAttribute("aria-disabled", "true")
  await check.hover()
  await expectWholeTip(page, check, "Only this project's members can change it")
})
