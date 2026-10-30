import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// design-23 (DESIGN-BUILD-4's review of the task list and page against
// Linear), on a production build at a computer's width and a phone's: every
// value says its words whole (an empty estimate's "Add estimate", More
// fields' names ending on a whole one with "+N"), a later due date is said
// once, and a phone reads the title, then what the task is, then its
// properties two to a row. The status menu opens from the keyboard. With
// SHOTS_DIR set, each state is photographed.

const P = "9e0a0000-0000-4000-8000-0000000000d3"
const TASK = "7a5c00d3-0000-4000-8000-000000000001"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const FIELDS = ["Channel", "Budget", "Reviewer", "Region", "Launch tier", "Owner team"]

/** A day from today at 17:00, as the server sends a date. */
const day = (offset: number) => {
  const d = new Date()
  d.setHours(17, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

async function openTask(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.removeItem("oc_task_more_fields")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/task/info/${TASK}`]: {
      msg: "ok",
      data: {
        task_uuid: TASK,
        task_name: "Book the launch retro",
        task_status: "backlog",
        task_priority: "low",
        task_label: "",
        task_start_date: day(7),
        task_due_date: day(9),
        task_created_at: "2026-10-01T09:00:00Z",
        task_status_since: "2026-10-01T09:00:00Z",
        task_deleted_at: "0001-01-01T00:00:00Z",
        task_sub_task_count: 0,
        task_comment_count: 0,
        task_assignee: SAM,
        task_description: "<p>Thirty minutes the week after launch. Invite everyone who shipped something.</p>",
        task_project: project,
        task_sub_tasks: [],
        task_comments: [],
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_blocked_by: [],
        task_blocks: [],
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    // The project's own fields, all empty on this task: More fields folds them away and names them.
    [`/project/${P}/fields`]: {
      msg: "ok",
      data: {
        fields: FIELDS.map((name, i) => ({ id: `f${i}`, project_id: P, name, type: "text", options: [], on_card: false, position: i, filter_id: `field:f${i}` })),
        can_edit: true,
      },
    },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
  })
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-header]")).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-property="estimate"]')).toBeVisible({ timeout: 30_000 })
}

/** Saved for review when SHOTS_DIR is set, as task-<name>-<width>-<theme>.png. */
const shot = (page: Page, name: string, theme: string) => reviewShot(page, `task-${name}`, theme)

for (const theme of SHOT_THEMES) {
  for (const phone of [false, true]) {
    test.describe(`the task page, ${phone ? "on a phone" : "on a computer"} (${theme})`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } })

      test("opens the status menu from the keyboard: the property focused, then Enter; a phone shows no key hints", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openTask(page, testInfo, theme)
        const status = page.locator('[data-property="status"] button')
        await status.focus()
        await page.keyboard.press("Enter")
        await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 })
        await expect(page.getByPlaceholder("Change status…")).toBeFocused()
        // A key hint means a keyboard: a computer shows S and each status's number, a touch screen none.
        await expect(page.locator("[cmdk-root] .kbd:visible")).toHaveCount(phone ? 0 : 7)
        await shot(page, "key-menu", theme)
      })

      test("says each value whole: the estimate's words, More fields' names then +N, and a later due date once", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openTask(page, testInfo, theme)
        // "Add estim…" with room to spare: the words fit their box.
        const estimate = page.locator('[data-property="estimate"] [data-inline-edit] .truncate')
        await expect(estimate).toHaveText("Add estimate")
        expect(await estimate.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "the estimate's words aren't cut").toBe(true)
        // A due date nine days on is said once, by the date itself.
        await expect(page.locator('[data-property="dates"] [data-due]')).toHaveCount(0)
        // More fields: whole names on its one line, the rest counted.
        const names = page.locator("[data-more-name]")
        await expect(names.first()).toBeAttached({ timeout: 15_000 })
        const cut = await page.locator("[data-more-name]").evaluateAll((els) => {
          const list = els[0].parentElement!.getBoundingClientRect()
          const top = els[0].getBoundingClientRect().top
          const shown = els.filter((e) => e.getBoundingClientRect().top === top)
          return { hidden: els.length - shown.length, overflowing: shown.filter((e) => e.getBoundingClientRect().right > list.right + 0.5).length }
        })
        expect(cut.overflowing, "no name on the line is cut").toBe(0)
        if (cut.hidden > 0) await expect(page.locator("[data-more-rest]")).toHaveText(`+${cut.hidden}`)
        else await expect(page.locator("[data-more-rest]")).toHaveCount(0)
        await shot(page, "words", theme)
      })

      test("sets each property's name on its value's baseline, and the assignee's name in the values' ink", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openTask(page, testInfo, theme)
        // Each property row (the grid with the name column), its name's baseline and its value's:
        // a zero-height inline box set before the first words, whose top is their line's baseline.
        // The words are wrapped in a span for the measure: words straight inside a flex button
        // (Dates, Labels, Time) would make the box a flex item of its own, centred, not on the line.
        // An avatar's initials (under 12px) are not the value's words.
        const rows = await page.locator("[data-task-properties]").evaluate((box) => {
          const words = (cell: Element) => {
            const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
              acceptNode: (n) => (n.textContent?.trim() && parseFloat(getComputedStyle(n.parentElement!).fontSize) >= 12 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
            })
            return walk.nextNode()
          }
          const baseline = (text: Node) => {
            const wrap = document.createElement("span")
            const probe = document.createElement("span")
            probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"
            text.parentNode!.insertBefore(wrap, text)
            wrap.append(probe, text)
            const y = probe.getBoundingClientRect().top
            wrap.replaceWith(text)
            return y
          }
          return [...box.querySelectorAll("*")]
            .filter((el) => getComputedStyle(el).display === "grid" && /^(96|104)px /.test(getComputedStyle(el).gridTemplateColumns) && el.children.length === 2)
            .flatMap((row) => {
              const name = words(row.children[0])
              const value = words(row.children[1])
              return name && value ? [{ name: name.textContent!.trim(), off: Math.abs(baseline(name) - baseline(value)), ink: getComputedStyle(value.parentElement!).color }] : []
            })
        })
        expect(rows.length, "the properties are measured").toBeGreaterThanOrEqual(6)
        expect(rows.filter((r) => r.off > 1), "a name sits off its value's baseline").toEqual([])
        // The assignee's name in the ink of the status's value, not a step lighter.
        const ink = (name: string) => rows.find((r) => r.name === name)?.ink
        expect(ink("Assignee")).toBe(ink("Status"))
      })

      if (phone) {
        test("reads the title, then what the task is, then its properties two to a row", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          await openTask(page, testInfo, theme)
          const top = (sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top)
          const title = await top("[data-task-body] textarea, [data-task-body] [contenteditable], [data-task-body] input")
          const description = await page.getByText("Thirty minutes the week after launch.").evaluate((el) => el.getBoundingClientRect().top)
          const properties = await top("[data-task-properties]")
          expect(title).toBeLessThan(description)
          expect(description).toBeLessThan(properties)
          // A row's label and its value share a line.
          const row = page.locator('[data-property="dates"]')
          const [label, value] = await Promise.all([row.locator("span").first().boundingBox(), row.locator("button").first().boundingBox()])
          expect(Math.abs(label!.y + label!.height / 2 - (value!.y + value!.height / 2))).toBeLessThan(6)
          expect(value!.x).toBeGreaterThan(label!.x + label!.width)
          await shot(page, "phone-order", theme)
          await page.locator('[data-property="estimate"]').scrollIntoViewIfNeeded()
          await shot(page, "phone-lower", theme)
        })
      } else {
        test("keeps the computer's layout, the properties in their rail beside the work", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          await openTask(page, testInfo, theme)
          const description = (await page.getByText("Thirty minutes the week after launch.").boundingBox())!
          const rail = (await page.locator("[data-task-properties]").boundingBox())!
          expect(rail.x).toBeGreaterThan(description.x + description.width)
          await shot(page, "rail", theme)
        })
      }
    })
  }
}
