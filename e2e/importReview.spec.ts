import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { importPage } from "./adminImport"
import { SHOT_THEMES, reviewShot, withStatus, type Answers } from "./stubbedApp"

// Admin > Import and export: the people earlier imports added to projects. An
// admin opens a project's people, takes one off, and keeps everyone left, or
// takes everyone left off once asked; with nothing to review there is no
// section, and a list that can't load says so. At 1280 by the pointer and at
// 390 by touch, where the people open in a sheet with its actions pinned at
// its foot; dark too when SHOTS_DIR wants the review shots.

const LAUNCH = "11111111-1111-4111-8111-111111111111"
const CLEANUP = "22222222-2222-4222-8222-222222222222"
const PEOPLE = [
  { id: "a1111111-1111-4111-8111-111111111111", provider: "todoist", user_uuid: "a9111111-1111-4111-8111-111111111111", user_name: "Ann Lee" },
  { id: "b2222222-2222-4222-8222-222222222222", provider: "todoist", user_uuid: "b9222222-2222-4222-8222-222222222222", user_name: "Ben Ortiz" },
  { id: "c3333333-3333-4333-8333-333333333333", provider: "todoist", user_uuid: "c9333333-3333-4333-8333-333333333333", user_name: "Cal Diaz" },
]

/**
 * A server holding Launch's three undecided people and Cleanup, already
 * reviewed; what the page decides, it keeps. Taking everyone left off takes
 * at most batch people a call, as the real one takes a batch.
 */
function reviewServer(batch = PEOPLE.length) {
  const outcome = new Map<string, "removed" | "kept">()
  const launch = () => {
    const undecided = PEOPLE.filter((p) => !outcome.has(p.id)).length
    const removed = PEOPLE.filter((p) => outcome.get(p.id) === "removed").length
    return { project_uuid: LAUNCH, project_name: "Launch", providers: ["todoist"], undecided, removed, kept: PEOPLE.length - undecided - removed }
  }
  const cleanup = { project_uuid: CLEANUP, project_name: "Cleanup", providers: ["notion"], undecided: 0, removed: 1, kept: 1 }
  return {
    "/admin/import-reviews": (url: URL, r: Request) => {
      const path = url.pathname.replace(/.*\/admin\/import-reviews/, "")
      if (r.method() === "GET" && path === "") return { projects: [launch(), cleanup], pending: launch().undecided }
      if (r.method() === "GET" && path === `/projects/${LAUNCH}`) return { people: PEOPLE.map((p) => ({ ...p, outcome: outcome.get(p.id) })), more: false }
      const one = path.match(/^\/([0-9a-f-]+)\/remove$/)
      if (r.method() === "POST" && one) {
        if (outcome.has(one[1])) return withStatus(409, { msg: "An admin has already decided that one." })
        outcome.set(one[1], "removed")
        return { msg: "Taken off the project." }
      }
      const all = path.match(/^\/projects\/[0-9a-f-]+\/(remove-all|keep)$/)
      if (r.method() === "POST" && all) {
        const left = PEOPLE.filter((p) => !outcome.has(p.id))
        if (all[1] === "keep") {
          left.forEach((p) => outcome.set(p.id, "kept"))
          return { msg: "Kept in the project.", kept: left.length }
        }
        const taken = left.slice(0, batch)
        taken.forEach((p) => outcome.set(p.id, "removed"))
        return { msg: "Taken off the project.", removed: taken.length, left: left.length - taken.length }
      }
      return withStatus(404, { msg: "Not in this test" })
    },
  }
}

/** Launch with sixty people, fifty a page as the server pages them, for the list's foot. */
function longServer() {
  const people = Array.from({ length: 60 }, (_, i) => ({
    id: `d${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`,
    provider: "todoist",
    user_uuid: `e${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`,
    user_name: `Person ${String(i + 1).padStart(2, "0")}`,
  }))
  return {
    "/admin/import-reviews": (url: URL) => {
      const path = url.pathname.replace(/.*\/admin\/import-reviews/, "")
      if (path === "") return { projects: [{ project_uuid: LAUNCH, project_name: "Launch", providers: ["todoist"], undecided: 60, removed: 0, kept: 0 }], pending: 60 }
      const after = url.searchParams.get("after")
      const from = after ? people.findIndex((p) => p.id === after) + 1 : 0
      return { people: people.slice(from, from + 50), more: from + 50 < people.length }
    },
  }
}

const section = (page: Page) => page.getByRole("region", { name: "People earlier imports added" })

async function openLaunch(page: Page, testInfo: TestInfo, press: (l: Locator) => Promise<void>, server: Answers = reviewServer()) {
  await importPage(page, testInfo, true, "", server)
  await expect(section(page)).toBeVisible({ timeout: 90_000 })
  await expect(section(page).getByText("From Todoist · 3 to review")).toBeVisible()
  await press(section(page).getByRole("button", { name: "Review Launch's people" }))
  const people = page.getByRole("dialog", { name: "Launch" })
  await expect(people.getByRole("list", { name: "People added to Launch" })).toBeVisible()
  return people
}

for (const theme of SHOT_THEMES) {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    test.describe(`The import review at ${viewport.width}, ${theme}`, () => {
      // A finger on a phone, the pointer at a desk.
      const phone = viewport.width < 640
      test.use({ viewport, colorScheme: theme, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
      const press = (l: Locator) => (phone ? l.tap() : l.click())

      test("an admin takes one person off, then keeps everyone left", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", reviewServer())
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        await reviewShot(page, "import-review-card", theme)
        await press(section(page).getByRole("button", { name: "Review Launch's people" }))
        const people = page.getByRole("dialog", { name: "Launch" })
        await expect(people.getByRole("list", { name: "People added to Launch" })).toBeVisible()
        const keep = people.getByRole("button", { name: "Keep everyone left" })
        if (phone) {
          // The sheet's actions are pinned at its foot, inside the screen.
          const box = await keep.boundingBox()
          expect(box && box.y + box.height).toBeLessThanOrEqual(viewport.height)
        }
        await reviewShot(page, "import-review-people", theme)
        await press(people.getByRole("button", { name: "Take Ann Lee off Launch" }))
        const ann = people.getByRole("listitem").filter({ hasText: "Ann Lee" })
        await expect(ann.getByText("Taken off")).toBeVisible()
        await expect(ann.getByRole("button")).toHaveCount(0)
        await press(keep)
        await expect(people.getByRole("listitem").filter({ hasText: "Cal Diaz" }).getByText("Kept")).toBeVisible()
        await expect(people.getByRole("button", { name: "Done" })).toBeVisible()
        await reviewShot(page, "import-review-decided", theme)
        await press(people.getByRole("button", { name: "Done" }))
        await expect(section(page).getByText("All reviewed. Each project shows who was kept and who was taken off.")).toBeVisible()
        await expect(section(page).getByText("Reviewed · 2 kept, 1 taken off")).toBeVisible()
      })

      test("taking everyone left off asks first", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const people = await openLaunch(page, testInfo, press)
        await press(people.getByRole("button", { name: "Take everyone left off" }))
        const ask = page.getByRole("alertdialog", { name: "Take everyone left off Launch?" })
        await expect(ask).toBeVisible()
        await reviewShot(page, "import-review-take-all", theme)
        await press(ask.getByRole("button", { name: "Take them off" }))
        await expect(ask).toBeHidden()
        for (const name of ["Ann Lee", "Ben Ortiz", "Cal Diaz"]) {
          await expect(people.getByRole("listitem").filter({ hasText: name }).getByText("Taken off")).toBeVisible()
        }
      })

      test("taking everyone left off goes a batch a call, saying how many are left", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        // One person a call, and the second call's answer held, so the count
        // is on screen while a batch is out.
        const server = reviewServer(1)
        let release: () => void = () => {}
        const held = new Promise<void>((resolve) => (release = resolve))
        let calls = 0
        const people = await openLaunch(page, testInfo, press, {
          "/admin/import-reviews": async (url: URL, r: Request) => {
            if (r.method() === "POST" && url.pathname.endsWith("/remove-all") && ++calls === 2) await held
            return server["/admin/import-reviews"](url, r)
          },
        })
        await press(people.getByRole("button", { name: "Take everyone left off" }))
        const ask = page.getByRole("alertdialog", { name: "Take everyone left off Launch?" })
        await press(ask.getByRole("button", { name: "Take them off" }))
        await expect(ask).toBeHidden()
        await expect(people.getByRole("status")).toHaveText("Taking people off… 2 people left")
        await reviewShot(page, "import-review-taking", theme)
        release()
        for (const name of ["Ann Lee", "Ben Ortiz", "Cal Diaz"]) {
          await expect(people.getByRole("listitem").filter({ hasText: name }).getByText("Taken off")).toBeVisible()
        }
        await expect(people.getByRole("status")).toHaveCount(0)
        expect(calls, "one call a person, as the server takes them").toBe(3)
      })

      test("with nothing to review there is no section", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true)
        await expect(page.getByRole("radiogroup", { name: "Tool to import from" })).toBeVisible({ timeout: 90_000 })
        await expect(section(page)).toHaveCount(0)
      })

      test("a project of more than a page shows its next page from the list's foot, above the pinned actions", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", longServer())
        await press(section(page).getByRole("button", { name: "Review Launch's people" }))
        const people = page.getByRole("dialog", { name: "Launch" })
        const rows = people.getByRole("list", { name: "People added to Launch" }).getByRole("listitem")
        await expect(rows).toHaveCount(50)
        const more = people.getByRole("button", { name: "Show more" })
        // The body scrolled to its end: Show more is what a press at its middle
        // meets, and it ends above the pinned footer and the fade over its top.
        await people.evaluate((root) => {
          const body = [root, ...Array.from(root.querySelectorAll("*"))].find(
            (el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1,
          )
          if (body) body.scrollTop = body.scrollHeight
        })
        const foot = await more.evaluate((button) => {
          const r = button.getBoundingClientRect()
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          const footer = button.closest("[role=dialog]")?.querySelector("[data-sheet-footer], [data-overlay-footer], [data-dialog-footer]")
          const fade = footer ? parseFloat(getComputedStyle(footer, "::before").height) || 0 : 0
          return { met: !!at && (at === button || button.contains(at)), room: footer ? Math.round(footer.getBoundingClientRect().top - fade - r.bottom) : null }
        })
        // Shot before the checks, so the design review sees the foot either way.
        await reviewShot(page, "import-review-more", theme)
        expect(foot.met, "a press at Show more's middle meets Show more").toBe(true)
        expect(foot.room, "px between Show more and the footer's fade").toBeGreaterThanOrEqual(0)
        await press(more)
        await expect(rows).toHaveCount(60)
        await expect(more).toHaveCount(0)
      })

      test("the tab draws once: nothing under the review moves when its answer comes late", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const server = reviewServer()
        let answer: () => void = () => {}
        const late = new Promise<void>((resolve) => (answer = resolve))
        await importPage(page, testInfo, true, "", {
          "/admin/import-reviews": async (url: URL, r: Request) => {
            await late
            return server["/admin/import-reviews"](url, r)
          },
        })
        // The page is drawn and the tab held while the answer is out.
        await expect(page.getByRole("heading", { name: "Import and export" }).first()).toBeAttached({ timeout: 90_000 })
        await expect(page.getByRole("radiogroup", { name: "Tool to import from" })).toHaveCount(0)
        answer()
        const newImport = page.getByRole("button", { name: "New import" })
        await expect(newImport).toBeVisible({ timeout: 90_000 })
        const before = await newImport.boundingBox()
        await expect(section(page)).toBeVisible()
        await expect(page.getByRole("radiogroup", { name: "Tool to import from" })).toBeVisible()
        // Under a pixel is layout settling onto whole pixels (423.06, 423.02,
        // then 423.00 on one build); the review drawn above it would move it by
        // its rows' height.
        const after = await newImport.boundingBox()
        for (const side of ["x", "y", "width", "height"] as const) {
          expect(Math.abs(after![side] - before![side]), `New import's ${side} moved when the review drew`).toBeLessThan(1)
        }
      })

      test("once everyone is decided, the review sits at the tab's end", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "", {
          "/admin/import-reviews": { projects: [{ project_uuid: CLEANUP, project_name: "Cleanup", providers: ["notion"], undecided: 0, removed: 1, kept: 1 }], pending: 0 },
        })
        await expect(section(page)).toBeVisible({ timeout: 90_000 })
        const exports = page.getByRole("region", { name: "Export the workspace's docs" })
        await expect(exports).toBeVisible()
        const [review, last] = [await section(page).boundingBox(), await exports.boundingBox()]
        expect(review!.y, "the review is drawn after the export").toBeGreaterThan(last!.y)
      })

      test("a list that can't load says so, with Try again", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        let fail = true
        await importPage(page, testInfo, true, "", {
          "/admin/import-reviews": () => (fail ? withStatus(503, { msg: "Couldn't load who old imports added. Try again." }) : { projects: [], pending: 0 }),
        })
        await expect(section(page).getByRole("alert")).toContainText("Couldn't load who earlier imports added.", { timeout: 90_000 })
        await reviewShot(page, "import-review-error", theme)
        fail = false
        await press(section(page).getByRole("button", { name: "Try again" }))
        await expect(section(page)).toHaveCount(0)
      })
    })
  }
}
