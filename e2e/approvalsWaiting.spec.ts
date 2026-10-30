import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { scrollsInItsBody } from "./sheetLayout"
import { stubBackend } from "./stubbedApp"

// Requests waiting for my answer (package 9 R2b) where I meet them: Home's
// Approvals group, and My tasks' "2 to approve" with the list it opens, in a
// real browser on the stubbed app, on a computer and a phone, light and dark.
// Each row opens its item, whose card takes the answer (e2e/taskApproval).
// With SHOTS_DIR set, saved for review.

const P = "7c4d2e1a-3b5f-4a6c-9d8e-0f1a2b3c4d5e"
/** A project whose name is longer than a phone's line has room for beside an ask. */
const P2 = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"
const CY = { user_uuid: "8a1b2c3d-4e5f-4061-8a7b-9c0d1e2f3a4b", user_name: "Cy Park" }
const CAPTAIN = { user_uuid: "9b2c3d4e-5f60-4172-9b8c-0d1e2f3a4b5c", user_name: "Release Captain", is_bot: true }
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const task = (n: number) => `7a5c00e3-0000-4000-8000-0000000000a${n}`
const WAITING = [
  {
    approval_id: "a1", kind: "task", id: task(1), title: "Publish the pricing page for the Business tier", path: `/app/task/${task(1)}`,
    ask: "Are the new numbers final? Legal signed off on the wording yesterday, and the plans page links here.", due_at: inHours(5),
    requested_by: CY.user_uuid, created_at: inHours(-2), project_id: P, project_name: "Q4 launch", asker: CY,
  },
  {
    approval_id: "a2", kind: "task", id: task(2), title: "Ship the onboarding emails", path: `/app/task/${task(2)}`, to_name: "Done",
    due_at: inHours(-20), requested_by: CAPTAIN.user_uuid, created_at: inHours(-30), project_id: P2, project_name: "Customer onboarding revamp", asker: CAPTAIN,
  },
]

/** What the page asked for that this file didn't answer, named if a shot fails on it. */
const unanswered: string[] = []

async function open(page: Page, testInfo: TestInfo, theme: "light" | "dark", path: string, items = WAITING) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/approvals/waiting": { msg: "ok", data: { items } },
    // Home's other sources and My tasks' list: answered empty, so what
    // waits for an answer is the whole of it.
    "/activity/unified": { msg: "ok", data: { activities: [] } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/getEvents": { msg: "ok", data: [] },
    "/project/overview": { msg: "ok", data: { projects: [] } },
  })
  page.on("response", (r) => {
    if (r.status() === 404) unanswered.push(new URL(r.url()).pathname)
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test"), `unanswered: ${unanswered.join(", ")}`).toHaveCount(0)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/**
 * The project on each row's second line shows whole or not at all: its name was
 * cut to a glyph ("Q4 launch" read "Q"), and a project that yields must not
 * show a sliver from the line its row clips. A screen reader reads it either
 * way. Returns what each row shows of its project.
 */
async function projectWholeOrGone(rows: Locator) {
  const shown: string[] = []
  for (const row of await rows.all()) {
    const line = row.locator("[data-hub-second]")
    const seen = await line.evaluate((l, names) => {
      const s = [...l.querySelectorAll("span")].find((x) => names.includes(x.textContent ?? ""))!
      // The project: its tile and its name. What shows of it is its box cut by
      // each box that clips, up to the line.
      const unit = s.parentElement!
      let { left, top, right, bottom } = unit.getBoundingClientRect()
      for (let a = unit.parentElement; a; a = a.parentElement) {
        const style = getComputedStyle(a)
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const c = a.getBoundingClientRect()
          ;[left, top, right, bottom] = [Math.max(left, c.left), Math.max(top, c.top), Math.min(right, c.right), Math.min(bottom, c.bottom)]
        }
        if (a === l) break
      }
      const box = unit.getBoundingClientRect()
      const shown = Math.max(0, right - left) * Math.max(0, bottom - top)
      const whole = shown >= box.width * box.height - 0.5 && s.scrollWidth <= s.clientWidth
      return { name: s.textContent!, seen: shown < 0.5 ? "gone" : whole ? "whole" : "cut", line: Math.round(l.getBoundingClientRect().width) }
    }, WAITING.map((w) => w.project_name))
    expect(["whole", "gone"], `${seen.name} on a ${seen.line}px line`).toContain(seen.seen)
    expect(await line.ariaSnapshot(), "a screen reader reads the project").toContain(seen.name)
    shown.push(seen.seen)
  }
  return shown
}

/**
 * Each row's second line keeps what it says inside the row, and a long ask gives
 * way with "…", keeping a couple of words: the line's pieces once ran past the
 * row's edge, cut mid-letter. Its project shows whole or not at all, and whole
 * on a computer's row, a long name included.
 */
async function keepToTheirLines(rows: Locator) {
  for (const row of await rows.all()) {
    const over = await row.locator("[data-hub-second]").evaluate((line) => line.firstElementChild!.getBoundingClientRect().right - line.getBoundingClientRect().right)
    expect(over).toBeLessThanOrEqual(0.5)
  }
  const shown = await projectWholeOrGone(rows)
  if (rows.page().viewportSize()!.width >= 1280) expect(shown, "a project on a computer's row").toEqual(shown.map(() => "whole"))
  const ask = await rows.first().locator("[data-hub-second]").evaluate((line, words) => {
    const s = [...line.querySelectorAll("span")].find((x) => x.textContent === words)!
    const twoWords = Math.min(s.scrollWidth, 6 * parseFloat(getComputedStyle(s).fontSize))
    return { cut: s.scrollWidth > s.clientWidth, overflow: getComputedStyle(s).textOverflow, words: s.clientWidth >= twoWords - 0.5 }
  }, WAITING[0].ask)
  expect(ask).toEqual({ cut: true, overflow: "ellipsis", words: true })
}

/** Runs `check` with the page's text at 200% (the root font doubled, as a reader's text size does), then puts it back. */
async function atDoubleText(page: Page, check: () => Promise<unknown>) {
  await page.evaluate(() => {
    const root = document.documentElement
    root.style.fontSize = `${2 * parseFloat(getComputedStyle(root).fontSize)}px`
  })
  await check()
  await page.evaluate(() => document.documentElement.style.removeProperty("font-size"))
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`requests waiting for my answer ${label}, ${theme}`, () => {
      test.use(use)

      test("Home lists them, each to its item, with what is asked or where it moves, by when and who asked", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await open(page, testInfo, theme, "/app/home")
        const rows = page.locator('[data-needs-me] [data-needs-kind="approval"]')
        await expect(rows).toHaveCount(2, { timeout: 60_000 })
        await expect(rows.first().getByRole("link", { name: WAITING[0].title })).toHaveAttribute("href", WAITING[0].path)
        await expect(rows.first()).toContainText("Are the new numbers final?")
        await expect(rows.first()).toContainText("Q4 launch")
        await expect(rows.nth(1)).toContainText("Move to Done")
        // A passed due date reads as late.
        await expect(rows.nth(1)).toContainText("Was due")
        // R2b's design review: what is asked ran past the row's edge, cut mid-letter.
        await keepToTheirLines(rows)
        await atDoubleText(page, () => projectWholeOrGone(rows))
        await noSideScroll(page)
        // On a phone, a row in the window may still sit under the tab bar: the rows go above it.
        const tabs = page.getByRole("navigation", { name: "Primary" })
        if (await tabs.isVisible()) {
          await rows.last().evaluate((el) => el.scrollIntoView({ block: "center" }))
          await expect
            .poll(async () => {
              const [row, bar] = [await rows.last().boundingBox(), await tabs.boundingBox()]
              return row && bar ? row.y + row.height - bar.y : Infinity
            }, { message: "the rows sit under the tab bar", timeout: 10_000 })
            .toBeLessThanOrEqual(0)
        } else await rows.first().scrollIntoViewIfNeeded()
        await shot(page, "home-approvals", theme)
      })

      // A phone's first sheet is a chunk of its own (components/ui/responsive-dialog). While it is on its way the
      // sheet's frame stands in at once, titled and busy; it showed nothing before (sheetFrame).
      test("on a phone, the first sheet shows its frame while it loads", async ({ page }, testInfo) => {
        test.skip(label !== "on a phone", "the sheet is a phone's")
        test.setTimeout(180_000)
        await open(page, testInfo, theme, "/app/myTask")
        const count = page.getByRole("button", { name: /2 to approve/ })
        await expect(count).toBeVisible({ timeout: 60_000 })
        // Only the sheet's own chunk is held (responsive-sheet's data-responsive-sheet marks it): the list opening
        // it is a chunk too, and the frame draws the sheet's classes, so they can't mark it.
        let release: () => void = () => {}
        const held = new Promise<void>((r) => (release = r))
        await page.route("**/_next/static/chunks/**", async (route) => {
          const response = await route.fetch()
          const body = await response.text()
          if (body.includes("data-responsive-sheet")) await held
          await route.fulfill({ response, body })
        })
        await count.click()
        const frame = page.getByRole("dialog", { name: "Waiting for my approval" })
        await expect(frame).toHaveAttribute("aria-busy", "true")
        await shot(page, "sheet-frame-loading", theme)
        release()
        await expect(frame.locator('[data-needs-kind="approval"]')).toHaveCount(2, { timeout: 30_000 })
        await expect(frame).not.toHaveAttribute("aria-busy", "true")
        // The sheet takes the frame's place without rising again (app/phone.css C5f): it read as opening twice.
        expect(await page.locator("[data-v3-sheet]").evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
        expect(await page.locator("[data-vaul-overlay][data-v3-scrim]").last().evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
        // Chunks still on their way through the route above (a phone fetches a task's panel ahead) end with the test.
        await page.unrouteAll({ behavior: "ignoreErrors" })
      })

      test("My tasks says how many wait, and opens them over the page, each to its item", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await open(page, testInfo, theme, "/app/myTask")
        const count = page.getByRole("button", { name: /2 to approve/ })
        await expect(count).toBeVisible({ timeout: 60_000 })
        // Nothing is assigned, which stays true beside requests to approve; "You're all caught up" did not.
        await expect(page.getByText("Nothing assigned to you")).toBeVisible()
        await expect(page.getByText(/caught up/)).toHaveCount(0)
        await noSideScroll(page)
        await shot(page, "mytasks-to-approve", theme)
        await count.click()
        const list = page.getByRole("dialog", { name: "Waiting for my approval" })
        await expect(list.locator('[data-needs-kind="approval"]')).toHaveCount(2)
        await keepToTheirLines(list.locator('[data-needs-kind="approval"]'))
        await atDoubleText(page, () => projectWholeOrGone(list.locator('[data-needs-kind="approval"]')))
        await expect(list.getByRole("link", { name: WAITING[0].title })).toHaveAttribute("href", WAITING[0].path)
        await expect(list).toContainText("Move to Done")
        // The sheet's footer is in the window, whole, once it has settled.
        const close = list.getByRole("button", { name: "Close" }).last()
        await expect
          .poll(async () => {
            const box = await close.boundingBox()
            return box ? box.y + box.height : Infinity
          }, { timeout: 10_000 })
          .toBeLessThanOrEqual(page.viewportSize()!.height + 0.5)
        await noSideScroll(page)
        await shot(page, "mytasks-approvals-list", theme)
        // Following a row leaves the list for its item.
        await list.getByRole("link", { name: WAITING[1].title }).click()
        await expect(page).toHaveURL(new RegExp(`${WAITING[1].path}$`))
        await expect(page.getByRole("dialog", { name: "Waiting for my approval" })).toHaveCount(0)
      })

      // More than the room (a dialog on a computer, the shared drawer on a phone): the list scrolls under a header
      // that draws a hairline once there is more above and keeps its description clear of it, and its last row ends
      // above the footer and its fade. On a phone the rows scrolled up to 2px under the description, and the last
      // row ended in the fade (the remediation card's long list, 25 Oct 2026).
      test("a long list scrolls in its body, between a header and a footer that stay", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const many = Array.from({ length: 24 }, (_, i) => {
          const id = `7a5c00e3-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
          return { ...WAITING[i % 2], approval_id: `m${i + 1}`, id, path: `/app/task/${id}`, title: `${WAITING[i % 2].title}, part ${i + 1}` }
        })
        await open(page, testInfo, theme, "/app/myTask", many)
        await page.getByRole("button", { name: /24 to approve/ }).click({ timeout: 60_000 })
        const list = page.getByRole("dialog", { name: "Waiting for my approval" })
        await expect(list.locator('[data-needs-kind="approval"]')).toHaveCount(24)
        await shot(page, "approvals-long-top", theme)
        await scrollsInItsBody(page, list)
        await shot(page, "approvals-long-end", theme)
      })
    })
  }
}
