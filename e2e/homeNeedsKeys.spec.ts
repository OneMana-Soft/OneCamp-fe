import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { AI_ON, AI_READS, SAM, SHOT_THEMES, expectEveryCallAnswered, mqttConfig, reviewShot, stubBackend, tidy } from "./stubbedApp"

// V-912 (11 Nov): on Home's "What needs me now" a keyboard user finishes a row
// with E (done), A (approve) or D (dismiss), and the row leaves. Focus fell to
// the page with it, so the next row needed a Tab back into the list. Now it
// goes on to the next row, across the groups as J walks them, to the one
// before once the last has gone, and to the all-clear line when none is left.
// Undo (⌥T and Enter, or a tap) brings the row back holding the focus.
// On a phone, a tap on a row's own button finishes it as before, and no ring
// is drawn. An agent's row gives its words the whole width there, and Dismiss
// and Approve a line of their own (V-939); a computer keeps them beside the
// words. With SHOTS_DIR set, the row Undo returned and the next row after E
// are saved at 1280, the list after a tap at 390, and the list with its agent
// rows cropped at 1280 and 390, light and dark.

const NOW = new Date()
const daysAgo = (n: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, 9)
const T1 = { id: "7a5c00e3-0000-4000-8000-0000000009a1", title: "Write the launch announcement" }
const T2 = { id: "7a5c00e3-0000-4000-8000-0000000009a2", title: "Book the venue walkthrough" }
const A1 = { id: "pa-0000-0912-a1", title: "Release Captain wants to create 6 tasks" }
const A2 = { id: "pa-0000-0912-a2", title: "Ledger wants to file 2 expenses" }

/** "What needs me now" as the server answers it: two agents' requests, two overdue tasks. */
const ATTENTION = {
  enabled: true,
  counts: {},
  items: [
    { source: "approval", kind: "Approval", title: A1.title, subtitle: "in Q4 launch", priority: 0, ref_id: A1.id },
    { source: "approval", kind: "Approval", title: A2.title, subtitle: "in Finance", priority: 0, ref_id: A2.id },
    { source: "task", kind: "Overdue task", title: T1.title, context: "Q4 launch", due_time: daysAgo(2).toISOString(), url: `/app/task/${T1.id}`, priority: 1, ref_id: T1.id },
    { source: "task", kind: "Overdue task", title: T2.title, context: "Q4 launch", due_time: daysAgo(1).toISOString(), url: `/app/task/${T2.id}`, priority: 1, ref_id: T2.id },
  ],
}

async function openHome(page: Page, testInfo: TestInfo) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {
    ...AI_ON,
    ...AI_READS,
    "/config/mqttConfig": mqttConfig([`user/${SAM.user_uuid}`]),
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/activity/unified": { msg: "ok", data: { has_more: false, activities: [] } },
    "/user/sidebarNav": { msg: "ok", data: { user_total_unread_activity_count: 0 } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/approvals/waiting": { msg: "ok", data: { items: [] } },
    "/event/getEvents": { msg: "ok", data: [] },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/work/changes": { msg: "ok", data: { entries: [], cursor: "" } },
    "/ai/attention": { msg: "ok", data: ATTENTION },
    // The rows' writes: a task done, a request approved or (after its Undo's while) dismissed.
    "/task/updateTaskStatus": { msg: "ok", data: {} },
    "/ai/pending-actions/": { msg: "ok", data: { status: "executed" } },
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await tidy(page)
}

/**
 * The greeting's orbits turn for six minutes on a computer, and a review shot
 * waits for a still page. Here the rows keep their real motion (the check's
 * hold and the slide out, which reduced motion skips), so only the orbits are
 * finished before a shot: a whole number of turns, drawn as they started.
 */
const stillOrbits = (page: Page) =>
  page.evaluate(() => document.getAnimations().forEach((a) => a instanceof CSSAnimation && a.animationName.startsWith("hub-orbit") && a.finish()))

const rowOf = (page: Page, title: string) => page.locator("[data-needs-me] [data-needs-kind]").filter({ hasText: title })

/** With SHOTS_DIR set, "What needs me now" alone, cropped to the section, at this width. */
async function sectionShot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  const section = page.locator("[data-needs-me]")
  await section.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await section.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of SHOT_THEMES) {
  test.describe(`what needs me, keyboard at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test.setTimeout(180_000)

    test("E, D and A hand focus to the next row, the one before after the last, then the all-clear line", async ({ page }, testInfo) => {
      await openHome(page, testInfo)
      await expect(rowOf(page, T2.title)).toBeVisible({ timeout: 60_000 })
      // Into the list with Tab, as a keyboard user arrives: a click on the
      // heading puts focus in the page's main region, and Tab walks on from there.
      await page.locator("#needs-me-title").click()
      const first = rowOf(page, A1.title)
      for (let i = 0; i < 40 && !(await first.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
      await expect(first).toBeFocused()
      await page.keyboard.press("j")
      await page.keyboard.press("j")
      await expect(rowOf(page, T1.title)).toBeFocused()
      await page.keyboard.press("e")
      await expect(rowOf(page, T1.title)).toHaveCount(0)
      await expect(rowOf(page, T2.title)).toBeFocused()
      // Undo from the keyboard: ⌥T into the toasts, Enter on Done's Undo. The
      // row comes back holding the focus, its ring drawn, not left in the toasts.
      await page.keyboard.press("Alt+t")
      const undo = page.locator(".toast-viewport").getByRole("button", { name: "Undo" })
      for (let i = 0; i < 4 && !(await undo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
      await expect(undo).toBeFocused()
      await page.keyboard.press("Enter")
      await expect(rowOf(page, T1.title)).toBeFocused()
      expect(await rowOf(page, T1.title).evaluate((el) => el === document.activeElement && el.matches(":focus-visible")), "the returned row is document.activeElement, ring drawn").toBe(true)
      await stillOrbits(page)
      await reviewShot(page, "needs-keys-undo", theme)
      // E again: it leaves, and the next row takes the focus.
      await page.keyboard.press("e")
      await expect(rowOf(page, T1.title)).toHaveCount(0)
      await expect(rowOf(page, T2.title)).toBeFocused()
      expect(await rowOf(page, T2.title).evaluate((el) => el.matches(":focus-visible")), "the next row draws its ring").toBe(true)
      await stillOrbits(page)
      await reviewShot(page, "needs-keys-next", theme)
      // D on an agent's row: on to the next row, in the next group.
      await page.keyboard.press("k")
      await expect(rowOf(page, A2.title)).toBeFocused()
      await page.keyboard.press("d")
      await expect(rowOf(page, A2.title)).toHaveCount(0)
      await expect(rowOf(page, T2.title)).toBeFocused()
      // E on the last row: back to the one before it.
      await page.keyboard.press("e")
      await expect(rowOf(page, T2.title)).toHaveCount(0)
      await expect(rowOf(page, A1.title)).toBeFocused()
      // A on the only row: the all-clear line, never the page.
      await page.keyboard.press("a")
      const clear = page.locator("[data-needs-me] [data-needs-empty]")
      await expect(clear).toContainText("All clear. Nice work.")
      await expect(clear).toBeFocused()
      await stillOrbits(page)
      await reviewShot(page, "needs-keys-clear", theme)
      await expectEveryCallAnswered(page)
    })
  })

  test.describe(`what needs me, an agent's row at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test.setTimeout(180_000)

    // V-939 changed the phone only: a computer keeps Dismiss and Approve beside the words.
    test("keeps an agent's Dismiss and Approve beside its words", async ({ page }, testInfo) => {
      await openHome(page, testInfo)
      await expect(rowOf(page, A2.title)).toBeVisible({ timeout: 60_000 })
      await sectionShot(page, "needs-agent-rows", theme)
      for (const title of [A1.title, A2.title]) {
        const row = rowOf(page, title)
        const second = (await row.locator("[data-hub-second]").boundingBox())!
        const approve = (await row.getByRole("button", { name: "Approve" }).boundingBox())!
        expect(approve.y, `${title}: Approve beside the words`).toBeLessThan(second.y + second.height)
        expect(approve.x, `${title}: Approve right of the words`).toBeGreaterThan(second.x + second.width)
      }
      await expectEveryCallAnswered(page)
    })
  })

  test.describe(`what needs me, touch at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.setTimeout(180_000)

    test("a tap on a row's Done finishes it as before, with no ring drawn", async ({ page }, testInfo) => {
      await openHome(page, testInfo)
      const row = rowOf(page, T1.title)
      await expect(row).toBeVisible({ timeout: 60_000 })
      await row.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await row.getByRole("button", { name: "Done" }).tap()
      await expect(row).toHaveCount(0)
      await expect(rowOf(page, T2.title)).toBeVisible()
      expect(await page.evaluate(() => document.querySelector(":focus-visible")?.outerHTML.slice(0, 80) ?? null), "no ring after a tap").toBeNull()
      // A tap on Undo: the row comes back with the focus, and still no ring. Done again for the frame.
      await page.locator(".toast-viewport").getByRole("button", { name: "Undo" }).tap()
      await expect(row).toBeFocused()
      expect(await page.evaluate(() => document.querySelector(":focus-visible")?.outerHTML.slice(0, 80) ?? null), "no ring after Undo's tap").toBeNull()
      await row.getByRole("button", { name: "Done" }).tap()
      await expect(row).toHaveCount(0)
      await reviewShot(page, "needs-keys-touch", theme)
      await expectEveryCallAnswered(page)
    })

    // V-939: Dismiss and Approve beside an agent's words left them ~170px:
    // the title cut early and "in Q4 launch · acts for you" broke into stacks.
    test("an agent's row gives its words the whole width, and its actions a line of their own", async ({ page }, testInfo) => {
      await openHome(page, testInfo)
      await expect(rowOf(page, A2.title)).toBeVisible({ timeout: 60_000 })
      await sectionShot(page, "needs-agent-rows", theme)
      for (const title of [A1.title, A2.title]) {
        const row = rowOf(page, title)
        const box = (await row.boundingBox())!
        const words = (await row.locator("[data-hub-title]").boundingBox())!
        const second = (await row.locator("[data-hub-second]").boundingBox())!
        const lineHeight = await row.locator("[data-hub-second]").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
        const dismiss = (await row.getByRole("button", { name: "Dismiss" }).boundingBox())!
        const approve = (await row.getByRole("button", { name: "Approve" }).boundingBox())!
        const right = box.x + box.width
        expect(right - (words.x + words.width), `${title}: the title runs to the row's edge`).toBeLessThanOrEqual(20)
        expect(right - (second.x + second.width), `${title}: the meta runs to the row's edge`).toBeLessThanOrEqual(20)
        expect(second.height, `${title}: the meta is one line`).toBeLessThan(lineHeight * 1.5)
        expect(dismiss.y, `${title}: Dismiss under the meta`).toBeGreaterThanOrEqual(second.y + second.height - 0.5)
        expect(approve.y, `${title}: Approve under the meta`).toBeGreaterThanOrEqual(second.y + second.height - 0.5)
        expect(right - (approve.x + approve.width), `${title}: the actions sit at the right`).toBeLessThanOrEqual(20)
        // Their 44px reaches meet and never cover each other (app/phone.css F3b).
        expect(approve.x - (dismiss.x + dismiss.width), `${title}: a touch apart`).toBeGreaterThanOrEqual(44 - dismiss.height - 0.5)
      }
      // The actions still act from their own line: Approve, and the row leaves.
      await rowOf(page, A1.title).getByRole("button", { name: "Approve" }).tap()
      await expect(rowOf(page, A1.title)).toHaveCount(0)
      await expect(rowOf(page, A2.title)).toBeVisible()
      await expectEveryCallAnswered(page)
    })
  })
}
