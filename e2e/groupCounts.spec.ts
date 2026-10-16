import { expect, test, type Page } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// PROJ-BUG-2 (stop-gap). A list groups the tasks it has loaded, and the server
// gives no count per group yet: "Urgent 100" with 400 urgent tasks read as the
// whole, and on a phone the counts grew as the list scrolled. While pages are
// still to load a group says what it holds so far with a "+"; once every page
// is in, its count is exact.

const P = "9e0a0000-0000-4000-8000-0000000000c2"
const project = { project_uuid: P, project_name: "Billing", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = (i: number, status: string) => ({
  task_uuid: `7a5c00c2-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: `Task ${i + 1}`,
  task_status: status,
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Billing" },
})

/** The project's list read: `tasks`, a page at a time by pageIndex and pageSize; `sizes` gets each page size asked for. */
function listAnswers(tasks: ReturnType<typeof task>[], sizes: number[] = []) {
  return {
    [`/project/taskList/${P}`]: (url: URL) => {
      const size = Number(url.searchParams.get("pageSize") || 10)
      sizes.push(size)
      const index = Number(url.searchParams.get("pageIndex") || 0)
      const page = tasks.slice(index * size, index * size + size)
      return {
        msg: "ok",
        // The server leaves an empty page's list out (a phone asks once past the end).
        data: { ...project, project_task_count: tasks.length, ...(page.length ? { project_tasks: page } : {}) },
        pageCount: Math.max(1, Math.ceil(tasks.length / size)),
      }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    "/task/views": { msg: "ok", data: [] },
  }
}

/** Every group header the list draws from its top to its foot, sorted: a long
 * group puts the next one out of a virtual list's sight. */
async function everyHeader(page: Page, header: string) {
  const seen = new Set<string>()
  await page.mouse.wheel(0, -100_000)
  for (let i = 0; i < 40; i++) {
    for (const h of await counts(page, header)) seen.add(h)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(100)
  }
  return [...seen].sort()
}

/** Each group header as "<name> <count>". */
const counts = (page: Page, header: string) =>
  page.locator(header).evaluateAll((els) =>
    els.map((e) => {
      const text = e.textContent?.trim() ?? ""
      const count = e.querySelector("[data-group-count]")?.textContent?.trim() ?? text.match(/\d+\+?$/)?.[0]
      return `${text.replace(/\d+\+?$/, "").trim()} ${count}`
    }),
  )

// The groups' order is the board's, and the lists' own tests hold it; these
// read the counts, sorted, whatever the order.
test.describe("on a computer", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("a group says N+ while the list has more to load, and its count once it has all", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    // 600 tasks, so the first page of 500 leaves more: 100 in progress, 500 to do.
    const tasks = Array.from({ length: 600 }, (_, i) => task(i, i % 6 === 0 ? "inProgress" : "todo"))
    await stubBackend(page, testInfo, listAnswers(tasks))
    await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const header = "[data-grouped-list] [data-group-header]"
    await expect.poll(async () => (await counts(page, header)).sort(), { timeout: 60_000 }).toEqual(["In progress 84+", "To do 416+"])
    await page.getByRole("button", { name: "Show more tasks" }).click()
    await expect.poll(async () => (await counts(page, header)).sort(), { timeout: 30_000 }).toEqual(["In progress 100", "To do 500"])
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("a group says N+ until the last page is in, then its count", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    // Past two of the list's pages, whatever their size (PHONE_PAGE_SIZE):
    // three tasks in progress on the first, the rest to do.
    const sizes: number[] = []
    const tasks = Array.from({ length: 120 }, (_, i) => task(i, i < 3 ? "inProgress" : "todo"))
    await stubBackend(page, testInfo, listAnswers(tasks, sizes))
    await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const header = "[data-phone-group]"
    await expect.poll(() => sizes.length, { timeout: 60_000 }).toBeGreaterThan(0)
    // The first page's groups, those in sight: each says what it has so far.
    const firstPage = new Map([["In progress", "3+"], ["To do", `${sizes[0] - 3}+`]])
    await expect
      .poll(
        async () => {
          const shown = await counts(page, header)
          return shown.length > 0 && shown.every((h) => firstPage.get(h.replace(/ \S+$/, "")) === h.split(" ").pop())
        },
        { timeout: 60_000 },
      )
      .toBe(true)
    // Down to the list's foot until the last page has come.
    await page.mouse.move(195, 640)
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, 4000)
          return page.getByText(/^Task 120$/).count()
        },
        { timeout: 60_000, intervals: [600] },
      )
      .toBe(1)
    // Every group says its whole count, wherever it sits in the list.
    await expect.poll(() => everyHeader(page, header), { timeout: 45_000 }).toEqual(["In progress 3", "To do 117"])
  })
})
