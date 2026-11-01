import { expect, test, type Locator, type Page } from "@playwright/test"

import { SHOT_THEMES, expectHomeSettled, reviewShot, stubBackend, type Answers } from "./stubbedApp"

// linear-28 to_win 2: Linear narrows its palette with a letter and Space (i, p,
// u, d …), and peeks the highlighted result. A letter and a space typed into
// ⌘K's empty field set a scope chip (lib/search/scopePrefix): the search asks
// the server for that kind only, through the one grammar's type:, only that
// kind lists, and the highlighted row previews. Backspace on the empty field,
// or a tap on the chip, searches everything again.

const TASK_HIT = { type: "task", task: { task_id: "e2e-scope-task", task_name: "Book the launch room", task_project_name: "Q4 launch" } }
const DOC_HIT = { type: "doc", doc: { doc_uuid: "e2e-scope-doc", doc_title: "Launch room booking notes" } }

/** Home with no projects yet: its strip offers the templates, which is how expectHomeSettled knows Home drew. */
const NO_PROJECTS: Answers = { "/project/overview": { msg: "ok", data: { projects: [] } } }

/** The workspace's search, as the server reads its text: a type: lists only that kind (business/SearchQuery). */
function searchAnswers(asked: string[]): Answers {
  return {
    "/search/unifiedSearch": (url: URL) => {
      const text = decodeURIComponent(url.pathname.split("/search/unifiedSearch/")[1] ?? "")
      asked.push(text)
      return { msg: "ok", data: { page: text.includes("type:task") ? [TASK_HIT] : [TASK_HIT, DOC_HIT] } }
    },
  }
}

const row = (palette: Locator, text: string) => palette.locator("[cmdk-item]").filter({ hasText: text })
const group = (palette: Locator, heading: string) =>
  palette.locator("[cmdk-group]").filter({ has: palette.page().locator("[cmdk-group-heading]", { hasText: new RegExp(`^${heading}$`) }) })

async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k")
  const palette = page.getByRole("dialog", { name: "Search, jump, or ask" })
  await expect(palette).toBeVisible({ timeout: 30_000 })
  return { palette, field: palette.locator("[cmdk-input]") }
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone, by touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["at 1280", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
  ] as const) {
    test.describe(`${where}, ${theme}`, () => {
      test.use(use)

      test("t and a space narrow ⌘K to tasks: a chip, a request for tasks only, only tasks listed and previewed; the chip or Backspace searches everything again (linear-28)", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const phone = use.viewport.width < 500
        const asked: string[] = []
        await page.addInitScript((t) => {
          localStorage.setItem("ui-theme", t)
          localStorage.setItem("oc_keys_tip_seen", "1")
        }, theme)
        await stubBackend(page, testInfo, { ...NO_PROJECTS, ...searchAnswers(asked) })
        // Home's orbit turns for minutes on a computer, and a shot waits for what moves: it keeps still for one who asks for less.
        await page.emulateMedia({ reducedMotion: "reduce" })
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expectHomeSettled(page)
        const { palette, field } = await openPalette(page)

        // Everything, first: the task and the doc both list.
        await field.pressSequentially("launch room")
        await expect(row(palette, "Launch room booking notes")).toBeVisible({ timeout: 30_000 })
        await expect(row(palette, "Book the launch room")).toBeVisible()
        await field.fill("")

        // t and a space: the chip where a page's crumb sits, the field empty again, the scope's placeholder.
        await field.pressSequentially("t ")
        const chip = palette.locator('[data-palette-scope="tasks"]')
        await expect(chip).toHaveText("Tasks")
        await expect(field).toHaveValue("")
        await expect(field).toHaveAttribute("placeholder", "Search tasks…")
        await expect(palette.getByText("Type to search tasks")).toBeVisible()
        await reviewShot(page, "palette-scope-empty", theme)

        // The words ask the server for tasks only, and only tasks list, under the scope's name.
        await field.pressSequentially("launch room")
        await expect.poll(() => asked, { timeout: 30_000 }).toContain("type:task launch room")
        await expect(row(group(palette, "Tasks"), "Book the launch room")).toBeVisible()
        await expect(row(palette, "Launch room booking notes")).toHaveCount(0)
        await expect(row(palette, "Search all tasks for “launch room”")).toBeVisible()
        await reviewShot(page, "palette-scope-tasks", theme)

        if (!phone) {
          // The highlighted result previews: onto it with the arrows, then Space; Space again closes it.
          await page.keyboard.press("ArrowDown")
          await page.keyboard.press("ArrowUp")
          await page.keyboard.press(" ")
          await expect(page.locator(".palette-peek")).toContainText("Book the launch room")
          await reviewShot(page, "palette-scope-peek", theme)
          await page.keyboard.press(" ")
          await expect(page.locator(".palette-peek")).toHaveCount(0)
        }

        if (phone) {
          // A tap on the chip: a phone's Backspace on an empty field may send no key.
          await chip.tap()
          await expect(chip).toHaveCount(0)
          // The words stay, and search everything again.
          await expect(field).toHaveValue("launch room")
          await expect(row(palette, "Launch room booking notes")).toBeVisible({ timeout: 30_000 })
        } else {
          // Backspace on the empty field takes the scope off.
          await field.fill("")
          await page.keyboard.press("Backspace")
          await expect(chip).toHaveCount(0)
          await expect(field).not.toHaveAttribute("placeholder", "Search tasks…")
          // The scope's full search opens the search page on its chip.
          await field.pressSequentially("t ")
          await field.pressSequentially("launch room")
          await expect(row(palette, "Search all tasks for “launch room”")).toBeVisible({ timeout: 30_000 })
          await row(palette, "Search all tasks for “launch room”").click()
          await page.waitForURL(/\/app\/search\?query=launch%20room&in=tasks$/, { timeout: 30_000 })
        }
      })
    })
  }
}
