import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"
import { FORM_ID, VENDORS, bugForm, launchForm, submissions, tables, vendorColumns, vendorForm } from "./demoForm"

// A project's intake forms (package 9 R4) in a real browser on the stubbed
// app: the list, the builder with a question that shows on an earlier answer
// and one whose answer sets the priority, the form as visitors see it beside
// them, and what came in; a question that takes files, and a form that adds
// rows to a table (R4b). On a computer and a phone, light and dark; on a
// phone the bottom sheet, its actions pinned in view. With SHOTS_DIR set,
// each state is saved for review.

const P = "7c4d2e1a-3b5f-4a6c-9d8e-0f1a2b3c4d5e"
const MAYA = { user_uuid: "8a1b2c3d-4e5f-4061-8a7b-9c0d1e2f3a4b", user_name: "maya", user_full_name: "Maya Chen" }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, MAYA] }
const fields = [
  { id: "6b1d2c3e-4f50-4617-8829-3a4b5c6d7e01", project_id: P, name: "Launch stage", type: "select", options: [{ id: "o1", label: "Draft", color: "sky" }, { id: "o2", label: "Review", color: "sun" }, { id: "o3", label: "Live", color: "moss" }], on_card: true, position: 0, filter_id: "f1" },
  { id: "6b1d2c3e-4f50-4617-8829-3a4b5c6d7e02", project_id: P, name: "Budget", type: "money", options: [], currency: "USD", on_card: false, position: 1, filter_id: "f2" },
]

async function openForms(page: Page, testInfo: TestInfo, theme: "light" | "dark", saved: unknown[] = []) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0 },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields, can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/forms/${FORM_ID}/submissions`]: { msg: "ok", data: { submissions, total: 12 } },
    [`/project/${P}/forms`]: (_url: URL, request: { method(): string; postDataJSON(): unknown }) => {
      if (request.method() !== "POST") return { msg: "ok", data: { forms: [launchForm, vendorForm, bugForm], can_edit: true } }
      saved.push(request.postDataJSON())
      return { msg: "ok", data: { ...(request.postDataJSON() as object), token: launchForm.token } }
    },
    [`/tables/${VENDORS}/fields`]: { msg: "ok", data: vendorColumns },
    "/tables": { msg: "ok", data: tables },
    "/notices": { msg: "ok", data: { notices: [] } },
  })
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  // The header's menu on a computer, the tabs' on a phone: the one in view.
  await page.locator('button[aria-label="Project actions"]:visible').first().click({ timeout: 60_000 })
  await page.getByRole("menuitem", { name: "Intake forms" }).click()
  await expect(page.locator("[data-project-forms]")).toBeVisible({ timeout: 60_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/** At rest for a shot: no pointer over a control and no focus ring. */
async function atRest(page: Page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

/** The button is in the window, whole, once the sheet has settled: a pinned footer's action is never under the fold. */
async function inView(page: Page, name: RegExp | string) {
  const vp = page.viewportSize()!
  const button = page.getByRole("button", { name }).last()
  await expect
    .poll(async () => {
      const box = await button.boundingBox()
      return box ? box.y + box.height : Infinity
    }, { timeout: 10_000 })
    .toBeLessThanOrEqual(vp.height + 0.5)
  expect((await button.boundingBox())!.y).toBeGreaterThanOrEqual(0)
}

/**
 * Nothing scrolls sideways: not the page, and not a scroller inside an open
 * dialog or sheet (a sheet's body once ran 16px past the screen at 390, its
 * gutters gone, whenever the form held a file question). A failure names the
 * innermost elements that run past their scroller's edge.
 */
async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => {
    const out: string[] = []
    const page = document.documentElement.scrollWidth - document.documentElement.clientWidth
    if (page > 0) out.push(`the page by ${page}px`)
    for (const box of document.querySelectorAll<HTMLElement>('[role="dialog"], [role="dialog"] *')) {
      // A scroller either way: a body that scrolls up and down but hides its
      // sides still clips what runs past them, and a scrollIntoView or a
      // focus moves it sideways.
      const { overflowX: x, overflowY: y } = getComputedStyle(box)
      if (![x, y].some((o) => o === "auto" || o === "scroll") || box.scrollWidth <= box.clientWidth + 1) continue
      // What makes it wide: the chain of elements down to the deepest one
      // whose absence ends the overflow (each hidden for a moment, then put back).
      const wide = () => box.scrollWidth > box.clientWidth + 1
      const chain: string[] = []
      let node: Element = box
      for (let found = true; found; ) {
        found = false
        for (const child of node.children) {
          const el = child as HTMLElement
          const was = el.style.display
          el.style.display = "none"
          const cause = !wide()
          el.style.display = was
          if (!cause) continue
          chain.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 80)}">${(el.textContent ?? "").trim().slice(0, 30)}`)
          node = el
          found = true
          break
        }
      }
      out.push(`${box.tagName.toLowerCase()}.${(box.getAttribute("class") ?? "").slice(0, 60)} by ${box.scrollWidth - box.clientWidth}px, through ${chain.slice(-3).join(" > ")}`)
    }
    return out
  })
  expect(over).toEqual([])
}

/** Opens an item's card in the builder and brings it into view. */
async function openCard(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).click()
  const card = page.getByRole("group", { name })
  await expect(card).toBeVisible()
  await card.evaluate((el) => el.scrollIntoView({ block: "start" }))
  return card
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    const phone = label === "on a phone"
    test.describe(`a project's forms ${label}, ${theme}`, () => {
      test.use(use)

      test("the list says what each form asks and how many answered, its actions in view", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openForms(page, testInfo, theme)
        const row = page.locator(`[data-form-row='${FORM_ID}']`)
        await expect(row.getByText("9 questions")).toBeVisible()
        await expect(row.getByText("2 pages")).toBeVisible()
        await expect(row.getByRole("button", { name: "12 answers" })).toBeVisible()
        await expect(page.locator(`[data-form-row='${bugForm.id}']`).getByText("Off")).toBeVisible()
        // A form that adds rows says which table, and the list says a form can do either.
        await expect(page.locator(`[data-form-row='${vendorForm.id}']`).getByText("Adds rows to Vendors")).toBeVisible()
        await expect(page.getByText(/each answer becomes a task here, or a row in a table/)).toBeVisible()
        await inView(page, /New form/)
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-list", theme)
      })

      test("the builder shows when a question shows and what its answer fills, beside the form as visitors see it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openForms(page, testInfo, theme)
        await page.getByRole("button", { name: "Edit Launch requests" }).click()
        // A question that shows on an earlier answer, said back on its card.
        const steps = await openCard(page, /^Question 4: How do we see the bug\?/)
        await expect(steps.getByText("Shows when ‘What kind of request is it?’ is A bug")).toBeVisible()
        await expect(steps.getByRole("combobox", { name: "Choice it shows on" })).toHaveText("A bug")
        await inView(page, "Save")
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-branch", theme)
        // A choice that sets the priority, a pick beside each choice.
        const soon = await openCard(page, /^Question 6: How soon do you need it\?/)
        await expect(soon.getByRole("combobox", { name: "Fills" })).toHaveText("The priority")
        await expect(soon.getByRole("combobox", { name: "Priority for This week" })).toHaveText("High")
        await soon.getByRole("combobox", { name: "Fills" }).click()
        // The project's own fields of a fitting kind: a choice can fill Launch stage, never Budget.
        await expect(page.getByRole("option", { name: "Launch stage" })).toBeVisible()
        await expect(page.getByRole("option", { name: "Budget" })).toHaveCount(0)
        await page.keyboard.press("Escape")
        await atRest(page)
        await shot(page, "forms-fills", theme)
        // The section that makes a page.
        const about = await openCard(page, /^Section: About you/)
        await expect(about.getByLabel("Section title")).toHaveValue("About you")
        await atRest(page)
        await shot(page, "forms-section", theme)
        // The form as a visitor answers it: a bug opens its steps, and Next turns the page.
        if (phone) await page.getByRole("radio", { name: "Preview" }).click()
        const preview = page.getByRole("complementary", { name: "Preview" })
        await preview.evaluate((el) => el.scrollIntoView({ block: "start" }))
        await expect(preview.getByText("Page 1 of 2")).toBeVisible()
        await preview.getByRole("combobox", { name: /What kind of request is it/ }).click()
        await page.getByRole("option", { name: "A bug" }).click()
        await expect(preview.getByLabel(/How do we see the bug/)).toBeVisible()
        await atRest(page)
        await shot(page, "forms-preview", theme)
        await preview.getByRole("button", { name: "Next" }).click()
        await expect(preview.getByText("So we know who to follow up with.")).toBeVisible()
        await preview.evaluate((el) => el.scrollIntoView({ block: "start" }))
        await inView(page, "Save")
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-preview-page2", theme)
      })

      test("what came in: each answer by question with its task, or every question at a glance", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openForms(page, testInfo, theme)
        await page.getByRole("button", { name: "12 answers" }).click()
        const list = page.getByRole("list", { name: "Answers" })
        await expect(list.getByText("A banner for the pricing page")).toBeVisible()
        await expect(list.getByRole("link", { name: /Open its task/ }).first()).toHaveAttribute("href", "/app/task/a1111111-1111-4111-8111-111111111111")
        // One sent before questions had ids, read by its labels.
        await expect(list.getByText("Screenshots for the press kit")).toBeVisible()
        await expect(page.getByText("12 answers · the latest 5 here")).toBeVisible()
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-answers", theme)
        await page.getByRole("radio", { name: "By question" }).click()
        const kind = page.getByRole("group", { name: "What kind of request is it?" })
        await expect(kind.getByRole("progressbar", { name: "A bug: 2 of 4" })).toBeVisible()
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-answers-questions", theme)
      })

      test("a question takes files: its card says where they go, and an answer lists them", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openForms(page, testInfo, theme)
        await page.getByRole("button", { name: "Edit Launch requests" }).click()
        const shot_ = await openCard(page, /^Question 5: A screenshot/)
        await expect(shot_.getByText(/Its files go on the task/)).toBeVisible()
        await expect(shot_.getByRole("combobox", { name: "Fills" })).toHaveCount(0)
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-file-question", theme)
        await page.getByRole("button", { name: "Back" }).click()
        await page.getByRole("button", { name: "12 answers" }).click()
        // A sent file is shown as a file, which opens in the viewer.
        await expect(page.getByRole("list", { name: "A screenshot" }).getByRole("button", { name: /^Open signup-safari\.png/ })).toBeVisible()
        await page.getByRole("list", { name: "A screenshot" }).evaluate((el) => el.scrollIntoView({ block: "center" }))
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-answers-files", theme)
      })

      test("a form that adds table rows: a question for each column, and what every row needs", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const saved: { target_table?: string; fields: { label: string; type: string; required: boolean; maps_to?: string; options?: string[] }[] }[] = []
        await openForms(page, testInfo, theme, saved)
        await page.getByRole("button", { name: /New form/ }).click()
        await page.getByLabel("Title").fill("Vendor sign-up")
        await page.getByRole("radio", { name: "A table row" }).click()
        const target = page.locator("[data-form-target]")
        await target.getByRole("combobox", { name: "Table" }).click()
        await page.getByRole("option", { name: "Vendors" }).click()
        await expect(target.getByRole("listitem", { name: "Vendor" })).toBeVisible()
        await atRest(page)
        await shot(page, "forms-table-needs", theme)
        await target.getByRole("button", { name: /Ask for every column/ }).click()
        await expect(target.getByRole("listitem", { name: "Contact" })).toHaveAttribute("data-filled", "yes")
        await expect(page.getByRole("button", { name: /^Question 3: Tier/ })).toBeVisible()
        await noSideScroll(page)
        await atRest(page)
        await shot(page, "forms-table", theme)
        const tier = await openCard(page, /^Question 3: Tier/)
        await expect(tier.getByRole("combobox", { name: "Fills" })).toHaveText("Tier")
        await expect(tier.getByText("Its choices are Tier's options, so what's picked is always one of them.")).toBeVisible()
        await atRest(page)
        await shot(page, "forms-table-column", theme)
        await inView(page, "Create form")
        await page.getByRole("button", { name: "Create form" }).click()
        await expect.poll(() => saved.length).toBe(1)
        expect(saved[0].target_table).toBe(VENDORS)
        expect(saved[0].fields.map((f) => [f.label, f.type, f.required, f.maps_to])).toEqual([
          ["Vendor", "short_text", true, `column:${vendorColumns[0].id}`],
          ["Contact", "email", true, `column:${vendorColumns[1].id}`],
          ["Tier", "select", false, `column:${vendorColumns[2].id}`],
        ])
        expect(saved[0].fields[2].options).toEqual(["Gold", "Silver", "Bronze"])
      })
    })
  }
}
