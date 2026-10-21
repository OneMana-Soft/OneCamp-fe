import { expect, test, type Locator, type Page } from "@playwright/test"

import { openBoard, P } from "./projectBoard"
import { SAM, stubBackend } from "./stubbedApp"

// The app's light labels (data-tip) are read whole, wherever their control
// sits (18 Oct 2026). Each was its control's CSS ::after, so whatever clipped
// the control cut it: a board column's status label lost its top to the
// board's scroller, a card's priority its start to the card, the list's top
// check its start to the list, the composer's first tool its start to the
// conversation, in Chromium, Firefox and WebKit alike (the UI-REGRESS-2
// hover pass). One chip at the page's end draws them now
// (components/ui/tipLayer.tsx), which no clip reaches.

test.use({ viewport: { width: 1280, height: 860 } })
const ok = (data: unknown) => ({ msg: "ok", data })

/** Hovering the control shows its label in the page's chip, whole: in the window, and inside nothing that clips it. */
async function expectWholeLabel(page: Page, control: Locator, text: string) {
  await page.mouse.move(2, 430)
  await control.hover()
  const chip = page.locator("[data-tip-layer]")
  await expect(chip).toHaveText(text)
  await expect(chip).toBeInViewport({ ratio: 1 })
  const cut = await chip.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const out: string[] = []
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (!(s.overflowX !== "visible" || s.overflowY !== "visible" || s.clipPath !== "none" || /paint|strict|content/.test(s.contain))) continue
      const b = a.getBoundingClientRect()
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) out.push(`<${a.tagName.toLowerCase()} class="${String(a.className).slice(0, 60)}">`)
    }
    if (el.scrollWidth > el.clientWidth + 1) out.push("its own text overflows it")
    return out
  })
  expect(cut, `boxes that cut "${text}"`).toEqual([])
  // Its control keeps no label of its own drawn by CSS.
  expect(await control.evaluate((el) => getComputedStyle(el, "::after").content)).toMatch(/^(none|normal)$/)
  // Away from the control, the chip goes.
  await page.mouse.move(2, 430)
  await expect(chip).toHaveCount(0)
}

test("a board column's status and a card's priority read whole", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await openBoard(page, testInfo, "light")
  await expectWholeLabel(page, page.locator('[data-board] [data-column="todo"] [data-tip="To do"]').first(), "To do")
  await expectWholeLabel(page, page.locator('[data-board] [data-column="inProgress"] [data-tip="In progress"]').first(), "In progress")
  await expectWholeLabel(page, page.locator('[data-board] [data-column="todo"] [data-task-id] [data-tip="Medium"]').first(), "Medium")
})

test("the list's top check reads whole", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const NONE = "0001-01-01T00:00:00Z"
  const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
  const task = (i: number) => ({
    task_uuid: `00000000-0000-4000-8000-9${String(i).padStart(11, "0")}`,
    task_name: ["Draft launch email", "Fix login redirect on Safari"][i],
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
  })
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: ok({ ...project, project_tasks: [0, 1].map(task) }),
    [`/project/info/${P}`]: ok(project),
    [`/project/${P}/statuses`]: ok(null),
    [`/project/${P}/fields`]: ok({ fields: [], can_edit: true }),
    [`/project/${P}/tags`]: ok([]),
    [`/project/${P}/updates`]: ok({ updates: [], can_post: false }),
    [`/project/${P}/goals`]: ok({ goals: [] }),
    [`/project/${P}/cycles`]: ok({ cycles: [], can_edit: false }),
    [`/project/membersInfo/${P}`]: ok(project),
    "/notices": ok({ notices: [] }),
  })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const check = page.getByRole("button", { name: "Mark Draft launch email complete" })
  await expect(check).toBeVisible({ timeout: 60_000 })
  await expectWholeLabel(page, check, "To do · click to complete")
})

test("the composer's first tool reads whole, and a message's tools say theirs", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const CH = "c4a70000-0000-4000-8000-000000000003"
  const MAYA = { user_uuid: "5a7a1c11-0000-4000-8000-000000000101", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.test" }
  const channel = { ch_uuid: CH, ch_name: "engineering", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false, unread_post_count: 0, ch_created_at: "2026-09-01T09:00:00Z", ch_is_member: true, ch_posts: [], ch_created_by: SAM, ch_member_count: 2, ch_recording: [], notification_type: "all" }
  const post = { post_uuid: "c4a70000-0000-4000-8000-100000000010", post_text: "<p>We ship on Thursday.</p>", post_by: MAYA, post_created_at: "2026-10-17T09:00:00Z", post_comment_count: 0, post_comments: [], post_reactions: [], post_attachments: [] }
  await stubBackend(page, testInfo, {
    "/user/sidebarNav": ok({ ...SAM, user_channels: [channel], user_dms: [], user_projects: [] }),
    [`/ch/channelBasicInfo/${CH}`]: { msg: "ok", channel_info: channel },
    "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: [channel] },
    [`/po/latestPosts/${CH}`]: ok({ posts: [post], has_more: false }),
    "/agent-card/channel": ok([]),
    "/command/catalog": ok({ commands: [] }),
    "/message/scheduled": ok([]),
    "/ch/markSeen": ok({}),
    "/later": ok({ items: [] }),
  })
  await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("We ship on Thursday.").first()).toBeVisible({ timeout: 60_000 })
  await expectWholeLabel(page, page.locator('[data-tip="Add to the message"]').first(), "Add to the message")
  // A message's toolbar: its tools' labels come from the same chip.
  const row = page.locator("[data-message-row]").first()
  await row.hover({ position: { x: 300, y: 10 } })
  const reply = page.locator("[data-message-toolbar]").getByRole("button", { name: "Reply in thread" })
  await expect(reply).toBeVisible()
  await reply.hover()
  await expect(page.locator("[data-tip-layer]")).toHaveText("Reply in thread")
})
