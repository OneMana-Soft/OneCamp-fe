import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { scrollsInItsBody } from "./sheetLayout"
import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// A CSV of tasks brought in from Admin › Import (asana-16, jira-16), on a
// production build with no backend. The file goes straight to storage (a
// presigned PUT, then finalised) while Start waits on it, and the plan opens
// on it: what each column becomes, a column's kind changed and the file
// planned again, and who each person is, placeholders first. Start runs the
// import with the columns as the plan shows them. At 1280, and at 390 with
// touch; with SHOTS_DIR set, the panel and the plan's Columns and People are
// saved for review, light and dark.

const ADMIN = { ...SAM, user_is_admin: true }
const JOB = "c5a00000-0000-4000-8000-0000000000c5"
const FILE = "Launch plan.csv"
const CSV = `Task ID,Name,Section/Column,Assignee,Assignee Email,Due Date,Parent task,Budget (USD),Points,Team
1201,Book the venue,To do,Ana Lima,,2026-11-02,,1200,3,Ops
1202,Sign the contract,Doing,Bo Ray,,2026-11-04,Book the venue,,2,Ops
1203,Brief the speakers,To do,Cyrus Webb,cyrus@acme.test,,,300,5,Talks
1204,Print the badges,Done,Dee Park,,after the fair,,80,1,Ops
`
/** Where the presigned PUT goes: the storage server, which the stubs answer as they answer the API. */
const UPLOAD = `/imports/${JOB}/raw.csv`

const tool = (name: string, sources: string[]) => ({
  name,
  sources,
  capabilities: ["teams", "projects", "tasks", "subtasks"],
  default_status_map: {},
  default_priority_map: {},
})
const PROVIDERS = [tool("asana", ["api"]), tool("jira", ["api"]), tool("csv", ["backup_csv"])]

const job = (status: string) => ({
  id: JOB,
  provider: "csv",
  source_workspace_name: "Launch plan",
  source: "backup_csv",
  status,
  options: {},
  created_at: "2026-10-24T03:30:00Z",
  updated_at: "2026-10-24T03:30:00Z",
  chunks_total: 0,
  chunks_done: 0,
  chunks_failed: 0,
  items_imported: 0,
  errors_total: 0,
})

const COLUMNS = (points = "number") => [
  { name: "Task ID", property: "id", values: 4 },
  { name: "Name", property: "title", values: 4 },
  { name: "Section/Column", property: "status", values: 4 },
  { name: "Assignee", property: "assignee", values: 4 },
  { name: "Assignee Email", property: "email", values: 1 },
  { name: "Due Date", property: "due", values: 3 },
  { name: "Parent task", property: "parent", values: 1 },
  { name: "Budget (USD)", kind: "money", guess: "money", currency: "USD", values: 3 },
  { name: "Points", kind: points, guess: "number", values: 4 },
  { name: "Team", kind: "select", guess: "select", values: 4 },
]
const plan = (points?: string) => ({
  user_count: 4,
  user_new: 0,
  user_merge: 0,
  team_count: 1,
  project_count: 1,
  task_count: 3,
  subtask_count: 1,
  comment_count: 0,
  file_count: 0,
  file_bytes: 0,
  warnings: ["Print the badges: its due date \"after the fair\" isn't a date, so it is kept in the description."],
  status_values: ["To do", "Doing", "Done"],
  status_proposals: { "to do": "todo", doing: "inProgress", done: "done" },
  columns: COLUMNS(points),
  people: [
    { source_id: `${JOB}:ana lima`, name: "Ana Lima", rows: 1, matched_by: "name", member: "Ana Lima" },
    { source_id: `${JOB}:bo ray`, name: "Bo Ray", rows: 1, same_name: 2 },
    { source_id: `${JOB}:cyrus@acme.test`, name: "Cyrus Webb", email: "cyrus@acme.test", rows: 1, matched_by: "email", member: "Cyrus Webb" },
    { source_id: `${JOB}:dee park`, name: "Dee Park", rows: 1 },
  ],
})

/**
 * The import screen with the CSV tool's stubs: what each write sent, and the
 * PUT held until `upload.release()`, so the panel can be seen uploading.
 */
async function openImports(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  const sent = { presigns: [] as unknown[], puts: [] as Array<{ body: string; type?: string }>, finalized: 0, plans: [] as unknown[], runs: [] as unknown[] }
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = () => r()))
  let state: "none" | "validating" | "running" = "none"
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: ADMIN },
    "/notices": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/admin/import/slack/jobs": { jobs: [] },
    "/admin/import/outcomes": { outcomes: [] },
    "/admin/import/providers": { providers: PROVIDERS },
    "/admin/import/connections": { connections: [] },
    "/admin/import/jobs": () => ({ jobs: state === "none" ? [] : [job(state)] }),
    "/admin/import/csv/presign": (_url: URL, req: Request) => {
      sent.presigns.push(req.postDataJSON())
      return {
        job_id: JOB,
        provider: "csv",
        source_workspace_name: "Launch plan",
        raw_object_key: UPLOAD.slice(1),
        upload_url: `https://onecamp-files.example.test${UPLOAD}?X-Amz-Signature=e2e`,
        expires_in: 900,
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
      }
    },
    [UPLOAD]: async (_url: URL, req: Request) => {
      sent.puts.push({ body: req.postDataBuffer()?.toString("utf8") ?? "", type: req.headers()["content-type"] })
      await held
      return {}
    },
    [`/admin/import/csv/finalize/${JOB}`]: () => {
      sent.finalized++
      state = "validating"
      return { msg: "ok" }
    },
    [`/admin/import/jobs/${JOB}/plan`]: (_url: URL, req: Request) => {
      const body = req.postDataJSON() as { options?: { columns?: Record<string, string> } }
      sent.plans.push(body)
      return plan(body.options?.columns?.Points)
    },
    [`/admin/import/jobs/${JOB}/run`]: (_url: URL, req: Request) => {
      sent.runs.push(req.postDataJSON())
      state = "running"
      return { job_id: JOB }
    },
  })
  await page.goto("/app/admin?tab=import", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("radiogroup", { name: "Tool to import from" })).toBeVisible({ timeout: 60_000 })
  return { sent, upload: { release } }
}

for (const theme of ["light", "dark"] as const) {
  for (const view of [
    { name: "1280", use: { viewport: { width: 1280, height: 860 } }, phone: false },
    { name: "390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, phone: true },
  ]) {
    test.describe(`a CSV import at ${view.name} (${theme})`, () => {
      test.use({ ...view.use, colorScheme: theme })
      test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))
      const press = (target: Locator) => (view.phone ? target.tap() : target.click())

      test("a file is uploaded once, planned with a column changed, and started with the columns as shown", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { sent, upload } = await openImports(page, testInfo, theme)
        await press(page.getByRole("radio", { name: "CSV file" }))
        const panel = page.getByRole("region", { name: "New import from a CSV file" })
        await expect(panel).toBeVisible()

        // The file field is the imports' drop zone: its button is the field's, described by its help.
        const choose = panel.getByRole("button", { name: "Choose a CSV file" })
        await expect(choose).toHaveAccessibleDescription("Its first row names the columns.")
        const file = panel.locator("[data-import-input]")

        // Only a CSV is taken, said under the field.
        await file.setInputFiles({ name: "Launch plan.xlsx", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") })
        await expect(panel.getByText("Launch plan.xlsx isn't a CSV file. Export the list as CSV, then choose that file.")).toBeVisible()

        // The project is named from the file.
        await file.setInputFiles({ name: FILE, mimeType: "text/csv", buffer: Buffer.from(CSV) })
        await expect(panel.getByLabel("Project name")).toHaveValue("Launch plan")
        await expect(panel.getByText(`${FILE}, `)).toBeVisible()
        await panel.scrollIntoViewIfNeeded()
        if (!view.phone) await page.mouse.move(0, 0)
        await reviewShot(page, "csv-import-panel", theme)

        // While the file goes up, Start is busy and takes no second press.
        await press(panel.getByRole("button", { name: "Start import" }))
        const busy = panel.getByRole("button", { name: "Uploading…" })
        await expect(busy).toHaveAttribute("aria-busy", "true")
        await expect(panel.getByRole("progressbar", { name: "Upload progress" })).toBeVisible()
        await expect.poll(() => sent.puts.length).toBe(1)
        upload.release()

        const dialog = page.getByRole("dialog", { name: "Plan the import of Launch plan" })
        const columns = dialog.getByRole("region", { name: "Columns", exact: true })
        await expect(columns).toBeVisible({ timeout: 30_000 })
        expect(sent.presigns).toEqual([{ source_workspace_name: "Launch plan", file_size: Buffer.byteLength(CSV), source: "backup_csv" }])
        expect(sent.puts).toEqual([{ body: CSV, type: "text/csv" }])
        expect(sent.finalized).toBe(1)

        // Each column: a task's own property named, a field's kind offered with the one its values suggest.
        await expect(columns.getByText("Their addresses")).toBeVisible()
        const budget = columns.getByRole("combobox", { name: "What Budget (USD) becomes" })
        const points = columns.getByRole("combobox", { name: "What Points becomes" })
        await expect(points).toHaveText("Number")
        // Closed, the value reads whole, never cut to a fragment; open, the list says which kind its values suggest.
        await expect(budget).toHaveText("Money, USD")
        expect(await budget.locator("span").first().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        await press(budget)
        await expect(page.getByRole("option", { name: "Money, USD (suggested)" })).toBeVisible()
        await reviewShot(page, "csv-import-picker", theme)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("option", { name: "Money, USD (suggested)" })).toHaveCount(0)
        if (view.phone) {
          // A touch target, and Start pinned in the sheet's footer while the columns are read.
          // The select lays out a hair under 44 (43.99994 in the sheet), so it is read to the pixel.
          const box = await points.boundingBox()
          expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44)
          await points.scrollIntoViewIfNeeded()
          await expect(dialog.getByRole("button", { name: "Start import" })).toBeInViewport()
        }
        await columns.scrollIntoViewIfNeeded()
        await reviewShot(page, "csv-import-columns", theme)

        // The people the file names, the placeholders first.
        const people = dialog.getByRole("list", { name: "People in the file" })
        // The last row clear of the pinned footer: scrollIntoViewIfNeeded counts a row under it as seen.
        const last = people.getByRole("listitem").last()
        await last.evaluate((el) => el.scrollIntoView({ block: "center" }))
        const [row, start] = await Promise.all([last.boundingBox(), dialog.getByRole("button", { name: "Start import" }).boundingBox()])
        expect((row?.y ?? 0) + (row?.height ?? 0)).toBeLessThanOrEqual(start?.y ?? 0)
        await expect(people.getByRole("listitem")).toHaveText([
          /^Bo Ray\s*Comes as a placeholder: 2 members share this name$/,
          /^Dee Park\s*Comes as a placeholder$/,
          /^Ana Lima\s*Ana Lima, by their name$/,
          /^Cyrus Webb · cyrus@acme\.test\s*Cyrus Webb, by their address$/,
        ])
        await reviewShot(page, "csv-import-people", theme)

        // A column left out: the file is planned again with every field's kind, and the plan shows it.
        await press(points)
        await press(page.getByRole("option", { name: "Don't import" }))
        const chosen = { "Budget (USD)": "money", Points: "skip", Team: "select" }
        await expect.poll(() => sent.plans).toEqual([{}, { options: { columns: chosen } }])
        await expect(dialog.getByText("Reading the file again…")).toHaveCount(0)
        await expect(points).toHaveText("Don't import")

        await press(dialog.getByRole("button", { name: "Start import" }))
        await expect(dialog).toBeHidden()
        await expect(page.getByText("Import started", { exact: true })).toBeVisible()
        expect(sent.runs).toEqual([
          { options: { columns: chosen }, status_mappings: { "to do": "todo", doing: "inProgress", done: "done" }, priority_mappings: {} },
        ])
        await expect(page.getByRole("list", { name: "Recent imports" }).getByText("Launch plan")).toBeVisible()
      })

      // A short screen: the plan scrolls in its body, and its title, its close and Start import stay put.
      test("the plan scrolls in its body on a short screen, its title, close and actions in place", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { upload } = await openImports(page, testInfo, theme)
        await press(page.getByRole("radio", { name: "CSV file" }))
        const panel = page.getByRole("region", { name: "New import from a CSV file" })
        await panel.locator("[data-import-input]").setInputFiles({ name: FILE, mimeType: "text/csv", buffer: Buffer.from(CSV) })
        await press(panel.getByRole("button", { name: "Start import" }))
        upload.release()
        const dialog = page.getByRole("dialog", { name: "Plan the import of Launch plan" })
        await expect(dialog.getByRole("region", { name: "Columns", exact: true })).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "c5d-plan-open", theme)
        await scrollsInItsBody(page, dialog)
        await reviewShot(page, "c5d-plan-end", theme)
      })
    })
  }
}
