import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SHOT_THEMES, expectHomeSettled, reviewShot, stubBackend, type Answers } from "./stubbedApp"

// linear-28 (P3): Space previews ⌘K's highlighted search hit, as Linear peeks
// its results. DESIGN-BUILD-62's two MUSTs on that preview: it printed
// "[object Object]" where the hit's context belongs, and under 1400 px it sat
// over the palette, hiding the hit's project tag and the footer's "Esc close".
// A preview sits beside the palette or inside it, never over it: beside where
// the window has a gutter for it, inside, under the list, under 1200 px.

// V-db63-1 S2: the preview shows what the row can't, as Linear's peek opens an
// issue's properties and body: the hit's status, priority, assignee and the
// first line of its description at once, then its due date from the task's
// one read (GET /task/info, the task panel's).
const TASK_HIT = {
  type: "task",
  task: {
    task_id: "e2e-peek-task", task_name: "Book the launch room", task_project_name: "Q4 launch", task_status: "inProgress", task_priority: "high",
    task_assignee_user_full_name: "Maya Chen", task_desc: "<p>Ask facilities for the big room.</p><p>Then book the screens.</p>",
  },
}

/** A day `days` from today at 5 PM, as a due date: the preview says it as the task's row does ("Tomorrow"). */
function dayAtFive(days: number): string {
  const due = new Date()
  due.setDate(due.getDate() + days)
  due.setHours(17, 0, 0, 0)
  return due.toISOString()
}

/** Home with no projects yet: its strip offers the templates, which is how expectHomeSettled knows Home drew. */
const NO_PROJECTS: Answers = { "/project/overview": { msg: "ok", data: { projects: [] } } }
const SEARCH: Answers = {
  "/search/unifiedSearch": () => ({ msg: "ok", data: { page: [TASK_HIT] } }),
  "/task/info": () => ({
    msg: "ok",
    data: { task_uuid: "e2e-peek-task", task_name: "Book the launch room", task_status: "inProgress", task_priority: "high", task_assignee: { user_name: "Maya Chen" }, task_due_date: dayAtFive(1) },
  }),
}

// DESIGN-BUILD-66's MUST 2: the states the richer peek adds. A late task with
// labels (its due date in the danger tone, each label a LabelChip), and a doc,
// whose preview is the first line its body says, with no properties.
const LATE_HIT = {
  type: "task",
  task: {
    task_id: "e2e-peek-late", task_name: "Send the vendor contract", task_project_name: "Q4 launch", task_status: "todo", task_priority: "urgent",
    task_assignee_user_full_name: "Ana Diaz", task_label: "Legal, Launch", task_desc: "<p>Legal signed off on Friday.</p>",
  },
}
const DOC_HIT = {
  type: "doc",
  doc: { doc_uuid: "e2e-peek-doc", doc_title: "Vendor shortlist", doc_snippet: "Three vendors made the cut after the second round.\nPricing and dates below.", doc_created_by_user_full_name: "Ana Diaz" },
}
const VENDORS: Answers = {
  "/search/unifiedSearch": () => ({ msg: "ok", data: { page: [LATE_HIT, DOC_HIT] } }),
  "/task/info": () => ({
    msg: "ok",
    data: { task_uuid: "e2e-peek-late", task_name: "Send the vendor contract", task_status: "todo", task_priority: "urgent", task_assignee: { user_name: "Ana Diaz" }, task_due_date: dayAtFive(-2), task_label: "Legal, Launch" },
  }),
}

/** A search: the backend's answers, the words typed, and the title of the hit they find first. */
interface Find {
  answers: Answers
  words: string
  title: string
}
const ROOM: Find = { answers: SEARCH, words: "launch room", title: "Book the launch room" }
const VENDOR: Find = { answers: VENDORS, words: "vendor", title: "Send the vendor contract" }

const hitRow = (palette: Locator, title = ROOM.title) => palette.locator("[cmdk-item]").filter({ hasText: title })

async function boxOf(l: Locator) {
  const b = await l.boundingBox()
  expect(b, "drawn").not.toBeNull()
  return b!
}

/** The palette's, the preview's and the footer's boxes, read together in one frame. */
const boxes = (page: Page) =>
  page.evaluate(() => {
    const box = (s: string) => {
      const r = document.querySelector(s)?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null
    }
    return { palette: box(".palette"), peek: box(".palette-peek"), footer: box(".palette-footer") }
  })

/** Home, ⌘K, and the words that find the task: the palette with the hit listed. */
async function paletteOnTheHit(page: Page, testInfo: TestInfo, theme: string, find: Find = ROOM) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, { ...NO_PROJECTS, ...find.answers })
  // Home's orbit turns for minutes on a computer, and a shot waits for what moves: it keeps still for one who asks for less.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expectHomeSettled(page)
  await page.keyboard.press("ControlOrMeta+k")
  const palette = page.getByRole("dialog", { name: "Search, jump, or ask" })
  await expect(palette).toBeVisible({ timeout: 30_000 })
  await palette.locator("[cmdk-input]").pressSequentially(find.words)
  await expect(hitRow(palette, find.title)).toBeVisible({ timeout: 30_000 })
  return palette
}

/** Onto the hit with the arrows, then Space: its preview. */
async function peekTheHit(page: Page, palette: Locator, title = ROOM.title) {
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowUp")
  await expect(palette.locator("[cmdk-item][data-selected=true]")).toContainText(title)
  await page.keyboard.press(" ")
  const peek = page.locator(".palette-peek")
  await expect(peek).toBeVisible()
  return peek
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone, by touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["at 1280", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
  ] as const) {
    test.describe(`${where}, ${theme}`, () => {
      test.use(use)

      test("a search hit says where it is from in words, on its row and in its Space preview (DESIGN-BUILD-62 MUST 1)", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const palette = await paletteOnTheHit(page, testInfo, theme)
        await expect(hitRow(palette)).toContainText("Q4 launch")
        // A phone has no Space to press: its palette has no preview.
        if (use.viewport.width < 500) return
        const peek = await peekTheHit(page, palette)
        await expect(peek).toContainText("Book the launch room")
        await expect(peek).toContainText("Q4 launch")
        await expect(peek).not.toContainText("[object Object]")
        // What the row can't show (V-db63-1 S2): the hit's properties and its description's first line, then the read's due date.
        await expect(peek.locator('[data-peek-fact="status"]')).toHaveText("Status: In progress")
        await expect(peek.locator('[data-peek-fact="priority"]')).toHaveText("Priority: High")
        await expect(peek.locator('[data-peek-fact="assignee"]')).toHaveText("Assignee: Maya Chen")
        await expect(peek.locator('[data-peek-fact="due"]')).toHaveText("Due date: Tomorrow", { timeout: 10_000 })
        await expect(peek.locator("[data-peek-body]")).toHaveText("Ask facilities for the big room.")
        await reviewShot(page, "palette-peek", theme)
      })
    })
  }

  test.describe(`on a computer, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("the preview sits beside the palette at 1280 and inside it, under the list, at 1024: never over it (DESIGN-BUILD-62 MUST 2)", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const palette = await paletteOnTheHit(page, testInfo, theme)
      const peek = await peekTheHit(page, palette)

      // Beside: clear of the palette's right edge by 8 px or more, and inside the window.
      const p = await boxOf(palette)
      const k = await boxOf(peek)
      expect(k.x, "the preview starts past the palette's right edge + 8").toBeGreaterThanOrEqual(p.x + p.width + 8)
      expect(k.x + k.width, "the preview ends inside the window").toBeLessThanOrEqual(1280)
      await reviewShot(page, "palette-peek-beside", theme)

      // A narrower window has no gutter for it: inside the palette, under the list, above the footer's keys.
      await page.setViewportSize({ width: 1024, height: 768 })
      await expect(palette.locator(".palette-peek")).toBeVisible()
      await expect(palette.locator(".palette-footer")).toContainText("close")
      // The layout settles after the resize: the boxes are read together, until it holds.
      await expect
        .poll(async () => {
          const { palette: p, peek: k, footer: f } = await boxes(page)
          if (!p || !k || !f) return "not drawn"
          return { left: k.x >= p.x, right: k.right <= p.right, top: k.y >= p.y, aboveTheKeys: k.bottom <= f.y + 0.5 }
        })
        .toEqual({ left: true, right: true, top: true, aboveTheKeys: true })
      await reviewShot(page, "palette-peek-inside", theme)

      // Space again closes it.
      await page.keyboard.press(" ")
      await expect(page.locator(".palette-peek")).toHaveCount(0)
    })

    test("a late task's preview has its due date in the danger tone and each label as a chip; a doc's has its first line alone (DESIGN-BUILD-66 MUST 2)", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const palette = await paletteOnTheHit(page, testInfo, theme, VENDOR)
      const peek = await peekTheHit(page, palette, VENDOR.title)
      const due = peek.locator('[data-peek-fact="due"]')
      await expect(due).toHaveAttribute("data-due", "overdue", { timeout: 10_000 })
      await expect(due.locator("[data-chip]")).toHaveClass(/text-danger-ink/)
      await expect(peek.locator('[data-peek-fact="label"]')).toHaveText(["Label: Legal", "Label: Launch"])
      await expect(peek.locator('[data-peek-fact="label"] [data-chip-dot]')).toHaveCount(2)
      await expect(peek.locator("[data-peek-body]")).toHaveText("Legal signed off on Friday.")
      await reviewShot(page, "palette-peek-late", theme)

      // Down to the doc: the preview follows, with the first line its body says and no properties.
      await page.keyboard.press("ArrowDown")
      await expect(peek).toContainText("Vendor shortlist")
      await expect(peek.locator("[data-peek-body]")).toHaveText("Three vendors made the cut after the second round.")
      await expect(peek.locator('[aria-label="Properties"]')).toHaveCount(0)
      await reviewShot(page, "palette-peek-doc", theme)
    })
  })
}
