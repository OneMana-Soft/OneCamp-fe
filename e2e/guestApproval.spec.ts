import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// A client's link says what waits for their yes (package 9 R2b): the card the
// team asked about, by when and who asked, with its answers, the "Needs your
// review" tab, and the opened task saying it whole above the verdict, in a
// real browser on the stubbed app, on a computer and a phone, light and dark.
// With SHOTS_DIR set, saved for review.

const TOKEN = "r2b-client-link"
const P = "7c4d2e1a-3b5f-4a6c-9d8e-0f1a2b3c4d5e"
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const ASKED = {
  id: "7a5c00e3-0000-4000-8000-0000000000b1", name: "Approve the homepage hero copy and the pricing table's footnotes", status: "inProgress",
  status_label: "In progress", due_date: inHours(72), assignee: "Maya Chen", comment_count: 2,
  waiting: {
    ask: "Is this the final wording? We'd like to send it to the printer on Friday morning, so a yes by Thursday keeps the date.",
    due_at: inHours(30), asked_by: "Maya Chen", asked_at: inHours(-3),
  },
}
const HELD = {
  id: "7a5c00e3-0000-4000-8000-0000000000b2", name: "Pick the hero photo", status: "inReview", status_label: "In review", comment_count: 0,
  waiting: { to_label: "Done", asked_by: "Jonas Weber", asked_at: inHours(-26) },
}
const view = {
  project: "Acme website relaunch",
  project_uuid: P,
  can_comment: true,
  columns: [
    { status: "todo", label: "To do", tasks: [{ id: "7a5c00e3-0000-4000-8000-0000000000b3", name: "Write the FAQ section", status: "todo", status_label: "To do", comment_count: 0 }] },
    { status: "inProgress", label: "In progress", tasks: [ASKED] },
    { status: "inReview", label: "In review", tasks: [HELD] },
    { status: "done", label: "Done", tasks: [] },
  ],
  total_tasks: 3,
  done_tasks: 0,
  generated_at: new Date().toISOString(),
  updates: [],
}

/** What the page asked for that this file didn't answer, named if a shot fails on it. */
const unanswered: string[] = []

async function openClient(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  await page.addInitScript(
    ([t, token]) => {
      localStorage.setItem("ui-theme", t)
      // The client has said who they are, so the card offers its answers
      // (kept under the link's first 12 characters, components/guest/guestUi).
      localStorage.setItem(`oc_guest_name_${token.slice(0, 12)}`, "Dana")
    },
    [theme, TOKEN] as const,
  )
  await stubBackend(page, testInfo, {
    [`/guest/project/${TOKEN}/task/${ASKED.id}`]: { msg: "ok", data: { ...ASKED, description: "The hero and the table, as on the staging site.", comments: [], can_comment: true } },
    [`/guest/project/${TOKEN}`]: { msg: "ok", data: view },
  })
  page.on("response", (r) => {
    if (r.status() === 404) unanswered.push(new URL(r.url()).pathname)
  })
  await page.goto(`/guest/p/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test"), `unanswered: ${unanswered.join(", ")}`).toHaveCount(0)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/** How many lines a piece of text takes on the screen. */
async function linesOf(text: Locator): Promise<number> {
  return text.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
  })
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
    test.describe(`a client's link ${label}, ${theme}`, () => {
      test.use(use)

      test("a card the team asked about says so, by when and who asked, and offers its answers", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openClient(page, testInfo, theme)
        const card = page.locator("[data-guest-card]").filter({ hasText: ASKED.name })
        const note = card.locator("[data-guest-ask]")
        await expect(note).toContainText("Waiting for your approval", { timeout: 60_000 })
        await expect(note).toContainText("Is this the final wording?")
        await expect(note).toContainText("Asked by Maya Chen")
        // By when, as one phrase that keeps to one line: two loose pieces split in a 1280 column.
        const by = note.locator("[data-ask-due]")
        await expect(by).toHaveText(/^by .+, \d{1,2}:\d{2}/)
        expect(await linesOf(by)).toBe(1)
        // Exact names: the card's own button is named for its task, and this one starts with "Approve".
        await expect(card.getByRole("button", { name: "Approve", exact: true })).toBeVisible()
        await expect(card.getByRole("button", { name: "Ask for changes", exact: true })).toBeVisible()
        // A held move asked without words says where approving takes it.
        await expect(page.locator("[data-guest-card]").filter({ hasText: HELD.name }).locator("[data-guest-ask]")).toContainText("Approving moves it to Done.")
        // The card keeps to its column: its long words take two lines, never the page's width.
        // A phone shows one column at a time, side by side, so the column, not the screen, is its edge.
        const box = (await card.boundingBox())!
        const column = (await page.getByRole("region", { name: ASKED.status_label, exact: true }).boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width)
        await noSideScroll(page)
        await card.scrollIntoViewIfNeeded()
        await shot(page, "client-asked", theme)
      })

      test("what is asked is on its own tab, and the opened task says it whole above the verdict", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openClient(page, testInfo, theme)
        const tab = page.getByRole("tab", { name: /Needs your review/ })
        await expect(tab).toContainText("2", { timeout: 60_000 })
        await tab.click()
        await expect(page.locator("[data-guest-card]")).toHaveCount(2)
        await shot(page, "client-review-tab", theme)
        await page.locator("[data-guest-card]").filter({ hasText: ASKED.name }).getByRole("button", { name: new RegExp(ASKED.name) }).click()
        const panel = page.getByRole("complementary", { name: "Task" })
        await expect(panel.locator("[data-guest-ask]")).toContainText(ASKED.waiting.ask)
        // The panel answers in the card's words.
        await expect(panel.getByRole("region", { name: "Your verdict" }).getByRole("button", { name: "Ask for changes", exact: true })).toBeVisible()
        await noSideScroll(page)
        await shot(page, "client-asked-task", theme)
      })
    })
  }
}
