import { expect, test, type Locator, type Page, type Request } from "@playwright/test"

import { SAM, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { takesAFinger } from "./menuReach"
import { SCHEMES, SCREENS, press, screenUse } from "./screens"

/**
 * Settings > Permissions (linear-15): a workspace admin keeps the statuses and labels every project picks from. A
 * status is added to its category, renamed (Enter saves; a refusal shows the server's words under it and puts the
 * name back), moved within its category and deleted with Undo; a label is added and deleted with Undo. On a
 * computer and on a phone by touch, where every control in a row takes a finger and no row spills sideways, light
 * and dark.
 */
const ADMIN = { ...SAM, user_is_admin: true }
const CATEGORIES = [
  { key: "planned", name: "Planned", color: "slate" },
  { key: "in_progress", name: "In progress", color: "amber" },
  { key: "paused", name: "Paused", color: "orange" },
  { key: "done", name: "Done", color: "green" },
  { key: "cancelled", name: "Cancelled", color: "red" },
]
type Row = { id: string; name: string; color: string; category?: string; position?: number }
type Write = { path: string; body: Record<string, unknown> }

/** One workspace's registry as the server keeps it: a status's place is one number across the workspace. */
function workspace() {
  const statuses: Row[] = [
    { id: "s1", name: "Scoping", color: "slate", category: "planned", position: 1 },
    { id: "s2", name: "Building", color: "amber", category: "in_progress", position: 2 },
    { id: "s3", name: "Beta", color: "violet", category: "in_progress", position: 3 },
  ]
  const labels: Row[] = [{ id: "l1", name: "Revenue", color: "green" }]
  const gone = new Map<string, { list: Row[]; row: Row; at: number }>()
  const writes: Write[] = []
  const restored: string[] = []
  let next = 10
  const plan = (url: URL, request: Request) => {
    const path = url.pathname.slice(url.pathname.indexOf("/project/plan/"))
    if (request.method() === "GET") {
      const byPlace = [...statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      return { msg: "ok", data: { categories: CATEGORIES, statuses: byPlace, labels, colors: CATEGORIES.map((c) => c.color) } }
    }
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    writes.push({ path, body })
    const [, , , kind, id, what] = path.split("/")
    const list = kind === "statuses" ? statuses : labels
    if (!id) {
      const place = kind === "statuses" ? { position: Math.max(0, ...statuses.map((s) => s.position ?? 0)) + 1 } : {}
      const row = { id: `${kind[0]}${next++}`, ...(body as Omit<Row, "id">), ...place }
      list.push(row)
      return { msg: "ok", data: row }
    }
    const row = list.find((r) => r.id === id)
    if (!row) return withStatus(404, { msg: "It was deleted a moment ago." })
    if (what === "delete") {
      gone.set(id, { list, row, at: list.indexOf(row) })
      list.splice(list.indexOf(row), 1)
      return { msg: "ok" }
    }
    const name = typeof body.name === "string" ? body.name.toLowerCase() : null
    if (name && list.some((r) => r !== row && r.name.toLowerCase() === name)) {
      return withStatus(400, { msg: `There's a ${kind === "statuses" ? "status" : "label"} with that name already.` })
    }
    Object.assign(row, body)
    return { msg: "ok", data: row }
  }
  const restore = (url: URL) => {
    const [kind, id] = url.pathname.split("/restore/")[1].split("/").map(decodeURIComponent)
    restored.push(`${kind} ${id}`)
    const was = gone.get(id)
    if (!was) return withStatus(404, { msg: "It can't be brought back." })
    was.list.splice(was.at, 0, was.row)
    gone.delete(id)
    return { msg: "ok" }
  }
  return { plan, restore, writes, restored }
}

/** The add row a new name's field sits in, which holds its Add and Cancel. */
const addRowOf = (field: Locator) => field.locator("xpath=ancestor::div[.//button[normalize-space()='Cancel']][1]")

const names = (page: Page, list: string) =>
  page.getByRole("list", { name: list }).getByRole("listitem").evaluateAll((items) => items.map((i) => i.getAttribute("aria-label")))

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("an admin adds, renames, orders and deletes the workspace's project statuses and labels, with Undo", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const phone = screen.hasTouch
        const ws = workspace()
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/project/plan/": ws.plan,
          "/restore/project_": ws.restore,
        })
        await page.goto("/app/admin?tab=permissions", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const inProgress = page.getByRole("group", { name: "In progress" })
        await expect(page.getByRole("list", { name: "In progress statuses" }).getByRole("listitem")).toHaveCount(2, { timeout: 60_000 })
        expect(await names(page, "In progress statuses")).toEqual(["Building", "Beta"])
        const row = (name: string) => page.getByRole("listitem", { name, exact: true })
        const nameField = (name: string, what = "Status name") => row(name).getByRole("textbox", { name: what })

        // Every control of a row takes a finger across 44 px, the colour's swatch included.
        if (phone) {
          await row("Beta").scrollIntoViewIfNeeded()
          for (const control of [
            row("Beta").getByRole("button", { name: /^Colour of Beta: \w+$/ }),
            row("Beta").getByRole("button", { name: "Move up" }),
            row("Beta").getByRole("button", { name: "Delete Beta" }),
            inProgress.getByRole("button", { name: "Add a status to In progress" }),
          ]) {
            expect(await takesAFinger(control), await control.getAttribute("aria-label") ?? "").toBe(true)
          }
        }

        // A new status joins its category, in the category's colour, last in its order.
        await press(screen, inProgress.getByRole("button", { name: "Add a status to In progress" }))
        const newName = inProgress.getByRole("textbox", { name: "New status name" })
        await expect(newName).toBeFocused()
        await newName.fill("Review")
        if (phone) await press(screen, addRowOf(newName).getByRole("button", { name: "Add", exact: true }))
        else await newName.press("Enter")
        await expect.poll(() => names(page, "In progress statuses")).toEqual(["Building", "Beta", "Review"])
        expect(ws.writes.at(-1)).toEqual({ path: "/project/plan/statuses", body: { name: "Review", category: "in_progress", color: expect.any(String) } })
        await expect(newName).toHaveValue("")
        await press(screen, addRowOf(newName).getByRole("button", { name: "Cancel" }))
        await expect(newName).toHaveCount(0)

        // Enter saves a new name.
        await press(screen, nameField("Beta"))
        await nameField("Beta").fill("Public beta")
        await nameField("Beta").press("Enter")
        await expect.poll(() => names(page, "In progress statuses")).toEqual(["Building", "Public beta", "Review"])
        expect(ws.writes.at(-1)).toEqual({ path: "/project/plan/statuses/s3/edit", body: { name: "Public beta" } })

        // A name the server refuses: its words under the row, and the name as it was.
        await press(screen, nameField("Review"))
        await nameField("Review").fill("building")
        await nameField("Review").press("Enter")
        await expect(row("Review").getByRole("alert")).toHaveText("There's a status with that name already.")
        await expect(nameField("Review")).toHaveValue("Review")

        // Up one within its category: the two trade places, and only they are sent.
        const sent = ws.writes.length
        await press(screen, row("Public beta").getByRole("button", { name: "Move up" }))
        await expect.poll(() => names(page, "In progress statuses")).toEqual(["Public beta", "Building", "Review"])
        expect(ws.writes.slice(sent)).toEqual([
          { path: "/project/plan/statuses/s3/edit", body: { position: 2 } },
          { path: "/project/plan/statuses/s2/edit", body: { position: 3 } },
        ])
        await row("Scoping").scrollIntoViewIfNeeded()
        await reviewShot(page, "project-plan-statuses", scheme)

        // Deleted, then back with Undo, in its place.
        await press(screen, row("Building").getByRole("button", { name: "Delete Building" }))
        await expect.poll(() => names(page, "In progress statuses")).toEqual(["Public beta", "Review"])
        const statusGone = page.locator(".toast-card").filter({ hasText: "Deleted status “Building”" })
        await press(screen, statusGone.getByRole("button", { name: "Undo" }))
        await expect.poll(() => names(page, "In progress statuses")).toEqual(["Public beta", "Building", "Review"])
        expect(ws.restored).toEqual(["project_status s2"])

        // A label the same way.
        await press(screen, page.getByRole("button", { name: "Add a label" }))
        const newLabel = page.getByRole("textbox", { name: "New label name" })
        await expect(newLabel).toBeFocused()
        await newLabel.fill("Ops")
        if (phone) await press(screen, addRowOf(newLabel).getByRole("button", { name: "Add", exact: true }))
        else await newLabel.press("Enter")
        await expect.poll(() => names(page, "Project labels")).toEqual(["Revenue", "Ops"])
        expect(ws.writes.at(-1)).toEqual({ path: "/project/plan/labels", body: { name: "Ops", color: expect.any(String) } })
        // Escape closes the add row on a computer (its field owns the press); a finger taps Cancel.
        if (phone) await press(screen, addRowOf(newLabel).getByRole("button", { name: "Cancel" }))
        else await newLabel.press("Escape")
        await expect(newLabel).toHaveCount(0)
        await press(screen, row("Revenue").getByRole("button", { name: "Delete Revenue" }))
        await expect.poll(() => names(page, "Project labels")).toEqual(["Ops"])
        const labelGone = page.locator(".toast-card").filter({ hasText: "Deleted label “Revenue”" })
        await press(screen, labelGone.getByRole("button", { name: "Undo" }))
        await expect.poll(() => names(page, "Project labels")).toEqual(["Revenue", "Ops"])
        expect(ws.restored).toEqual(["project_status s2", "project_label l1"])

        // No row spills past the screen's edge or clips its own controls.
        const spilt = await page.locator("[data-plan-category] li, [aria-label='Project labels'] li").evaluateAll((rows) =>
          rows.filter((r) => r.getBoundingClientRect().right > window.innerWidth + 1 || r.scrollWidth > r.clientWidth + 1).map((r) => r.getAttribute("aria-label")),
        )
        expect(spilt).toEqual([])
        await row("Revenue").scrollIntoViewIfNeeded()
        await reviewShot(page, "project-plan-labels", scheme)
      })
    })
  }
}
