import { expect, test, type Locator, type Page, type Request } from "@playwright/test"

import { importPage } from "./adminImport"
import { settled } from "./sheetLayout"
import { SHOT_THEMES, reviewShot, withStatus, type Answers } from "./stubbedApp"

// Admin > Import and export: earlier imports' access, re-checked against each
// import's tool. An admin opens an import that waits for them and keeps it as
// it is once asked; a re-check the server refuses says why in the sheet; a
// re-checked import shows what changed, links its listed tasks by id and
// offers its undo; an import kept to its projects' admins says so and offers
// its re-check and its undo; with nothing re-checked there is no section. Each
// project says where it stands, the rows' states share one column, and every
// choice is whole in its sheet and takes a press. At 1280 by the pointer and
// at 390 by touch, where an import opens in a sheet with its choices pinned at
// its foot; dark too when SHOTS_DIR wants the review shots.

const WAITING = "99999999-9999-4999-8999-999999999999"
const CHECKED = "88888888-8888-4888-8888-888888888888"
const CONTAINED = "77777777-7777-4777-8777-777777777777"
const GONE = "a1111111-1111-4111-8111-111111111111"

/**
 * Each of the sheet's choices is whole inside the sheet and the screen, and a
 * press at its centre lands on it (DESIGN-BUILD-19, 26 Oct: at 1280 the
 * needs-admin dialog, 400px wide, cut "Keep to admins" at its left edge).
 */
async function choicesWhole(sheet: Locator, names: string[], viewport: { width: number; height: number }) {
  await settled(sheet)
  const frame = await sheet.boundingBox()
  expect(frame, "the sheet's box").not.toBeNull()
  for (const name of names) {
    const button = sheet.getByRole("button", { name, exact: true })
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    expect(box, `${name}'s box`).not.toBeNull()
    if (!frame || !box) return
    const where = `${name} at x ${box.x.toFixed(1)}-${(box.x + box.width).toFixed(1)}, y ${box.y.toFixed(1)}-${(box.y + box.height).toFixed(1)}; the sheet at x ${frame.x.toFixed(1)}-${(frame.x + frame.width).toFixed(1)}, y ${frame.y.toFixed(1)}-${(frame.y + frame.height).toFixed(1)}`
    expect(box.x, where).toBeGreaterThanOrEqual(frame.x - 0.5)
    expect(box.x + box.width, where).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
    expect(box.y, where).toBeGreaterThanOrEqual(frame.y - 0.5)
    expect(box.y + box.height, where).toBeLessThanOrEqual(Math.min(frame.y + frame.height, viewport.height) + 0.5)
    const lands = await button.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return Boolean(top && el.contains(top))
    })
    expect(lands, `a press at ${name}'s centre lands on it`).toBe(true)
  }
}
const project = (uuid: string, name: string, extra: Record<string, unknown> = {}) => ({
  project_uuid: uuid,
  name,
  archived: false,
  state: "rechecked",
  restricted: 0,
  unassigned: 0,
  already_restricted: 0,
  opened_since: 0,
  opened: 0,
  creator_outside: 0,
  assignee_outside: 0,
  comments_hidden: 0,
  gone_or_hidden: 0,
  ...extra,
})

/**
 * A server holding an import that waits for an admin, over a live project and
 * an archived one, a re-checked one with a task it lists, and an older one
 * kept to its project's admins. What the page keeps, it keeps; a re-check is
 * refused, as for an admin with no connection of their own.
 */
function accessServer(): Answers {
  let kept = false
  const waiting = () => ({
    import_id: WAITING,
    provider: "jira",
    site: "acme.atlassian.net",
    ran_at: "2026-05-03T10:00:00Z",
    ran_by: "Ada Park",
    state: kept ? "kept" : "needs_admin",
    ...(kept ? { decided_by: "Sam Rivera", decided_at: "2026-10-25T18:00:00Z" } : { reason: "no_connection" }),
    projects: [
      project("11111111-1111-4111-8111-111111111111", "Launch", { state: kept ? "kept" : "needs_admin" }),
      project("22222222-2222-4222-8222-222222222222", "Old roadmap", { archived: true, state: kept ? "kept" : "needs_admin" }),
    ],
  })
  const checked = {
    import_id: CHECKED,
    provider: "jira",
    site: "acme.atlassian.net",
    ran_at: "2026-04-12T09:00:00Z",
    ran_by: "Ada Park",
    state: "rechecked",
    projects: [project("33333333-3333-4333-8333-333333333333", "Support", { restricted: 4, comments_hidden: 2, gone_or_hidden: 1, gone_or_hidden_tasks: [GONE] })],
  }
  // An older import of the same site, its tasks kept to its project's admins by an admin until it is re-checked.
  const contained = {
    import_id: CONTAINED,
    provider: "jira",
    site: "acme.atlassian.net",
    ran_at: "2026-03-02T09:00:00Z",
    ran_by: "Ada Park",
    state: "contained",
    decided_by: "Sam Rivera",
    decided_at: "2026-10-24T09:00:00Z",
    projects: [project("44444444-4444-4444-8444-444444444444", "Billing", { state: "contained" })],
  }
  return {
    "/admin/import-access": (url: URL, r: Request) => {
      if (r.method() === "GET") return { imports: [waiting(), checked, contained] }
      if (url.pathname.endsWith(`/${WAITING}/keep`)) {
        kept = true
        return { msg: "Kept as it is." }
      }
      if (url.pathname.endsWith("/recheck")) return withStatus(409, { msg: "Connect the import's tool as yourself first." })
      return withStatus(404, { msg: "Not in this test" })
    },
  }
}

const section = (page: Page) => page.getByRole("region", { name: "Earlier imports re-checked" })

for (const theme of SHOT_THEMES) {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    test.describe(`Earlier imports re-checked at ${viewport.width}, ${theme}`, () => {
      // A finger on a phone, the pointer at a desk.
      const phone = viewport.width < 640
      test.use({ viewport, colorScheme: theme, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
      const press = (l: Locator) => (phone ? l.tap() : l.click())

      test("an admin keeps an import that waits for them as it is, once asked", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", accessServer())
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        await expect(section(page).getByText("1 needs you", { exact: false })).toBeVisible()
        await section(page).scrollIntoViewIfNeeded()
        await reviewShot(page, "import-access-card", theme)
        await press(section(page).getByRole("button", { name: "Review Jira · acme.atlassian.net" }))
        const sheet = page.getByRole("dialog", { name: "Jira · acme.atlassian.net" })
        await expect(sheet.getByText("Whoever ran it has no Jira connection here, so it couldn't be re-checked.")).toBeVisible()
        await expect(sheet.getByText("Archived")).toBeVisible()
        const keep = sheet.getByRole("button", { name: "Keep as it is" })
        // Every choice is whole in the sheet (on a phone, pinned at its foot inside the screen) and takes a press.
        await choicesWhole(sheet, ["Keep to admins", "Keep as it is", "Re-check with my connection"], viewport)
        // Neither project was re-checked: each says so, not that nothing needed changing.
        await expect(sheet.getByText("Not re-checked yet.")).toHaveCount(2)
        await expect(sheet.getByText("Nothing here needed changing.")).toHaveCount(0)
        await reviewShot(page, "import-access-sheet", theme)
        await press(keep)
        const ask = page.getByRole("alertdialog", { name: "Keep it as it is?" })
        await expect(ask).toBeVisible()
        await press(ask.getByRole("button", { name: "Keep as it is" }))
        await expect(sheet).toBeHidden()
        const row = section(page).getByRole("listitem").filter({ hasText: "Imported by Ada Park on 3 May" })
        await expect(row.getByText("Kept as it is")).toBeVisible()
        await reviewShot(page, "import-access-kept", theme)
        await press(row.getByRole("button", { name: "See Jira · acme.atlassian.net" }))
        await expect(sheet.getByText("Not re-checked, kept as it is.")).toHaveCount(2)
        await choicesWhole(sheet, ["Done"], viewport)
        await reviewShot(page, "import-access-kept-sheet", theme)
      })

      test("each import's state sits in one column", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", accessServer())
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        const dots = section(page).locator("[data-dot-word] .people-dot")
        await expect(dots).toHaveCount(3)
        const xs = await dots.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x))
        expect(Math.max(...xs) - Math.min(...xs), `the state dots' x: ${xs.map((x) => x.toFixed(1)).join(", ")}`).toBeLessThanOrEqual(0.5)
      })

      test("an import kept to its projects' admins says so for each project, and offers its re-check and its undo", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", accessServer())
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        const rows = section(page).getByRole("listitem")
        await press(rows.filter({ hasText: "Imported by Ada Park on 2 Mar" }).getByRole("button", { name: "See Jira · acme.atlassian.net" }))
        const sheet = page.getByRole("dialog", { name: "Jira · acme.atlassian.net" })
        await expect(sheet.getByText("Its tasks are kept to the project's admins.")).toBeVisible()
        await expect(sheet.getByText("Nothing here needed changing.")).toHaveCount(0)
        await choicesWhole(sheet, ["Undo changes", "Re-check with my connection"], viewport)
        await reviewShot(page, "import-access-contained", theme)
      })

      test("the admins' notice lands on the section, even when its read answers after the page stopped looking", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const read = accessServer()["/admin/import-access"] as (url: URL, r: Request) => unknown
        // The notice links to /app/admin?tab=import#import-access. The page looks for a linked card for about 3 s
        // (useJumpFlash); this read answers later, so the section draws after that look ended.
        await importPage(page, testInfo, true, "#import-access", {
          "/admin/import-access": async (url: URL, r: Request) => {
            if (r.method() === "GET") await new Promise((done) => setTimeout(done, 4_500))
            return read(url, r)
          },
        })
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        await expect(section(page)).toBeInViewport({ timeout: 5_000 })
      })

      test("a re-check the server refuses says why in the sheet, which stays open", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", accessServer())
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        await press(section(page).getByRole("button", { name: "Review Jira · acme.atlassian.net" }))
        const sheet = page.getByRole("dialog", { name: "Jira · acme.atlassian.net" })
        await press(sheet.getByRole("button", { name: "Re-check with my connection" }))
        await expect(sheet.getByRole("alert")).toHaveText("Connect the import's tool as yourself first.")
        await expect(sheet.getByRole("button", { name: "Re-check with my connection" })).toBeEnabled()
      })

      test("a re-checked import shows what changed, links its listed task and offers its undo", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", accessServer())
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        const rows = section(page).getByRole("listitem")
        await press(rows.filter({ hasText: "Imported by Ada Park on 12 Apr" }).getByRole("button", { name: "See Jira · acme.atlassian.net" }))
        const sheet = page.getByRole("dialog", { name: "Jira · acme.atlassian.net" })
        await expect(sheet.getByText("4 tasks kept to the people Jira lets in")).toBeVisible()
        await expect(sheet.getByRole("link", { name: "Task 1" })).toHaveAttribute("href", `/app/task/${GONE}`)
        await expect(sheet.getByRole("button", { name: "Undo changes" })).toBeVisible()
        await expect(sheet.getByRole("button", { name: "Keep as it is" })).toHaveCount(0)
        await choicesWhole(sheet, ["Undo changes", "Done"], viewport)
        await reviewShot(page, "import-access-rechecked", theme)
      })

      test("with no earlier import re-checked there is no section", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true)
        await expect(page.getByRole("radiogroup", { name: "Tool to import from" })).toBeVisible({ timeout: 90_000 })
        await expect(section(page)).toHaveCount(0)
      })
    })
  }
}
