import { expect, test, type Page } from "@playwright/test"

import { AI_ON, AI_READS, SAM } from "../stubbedApp"
import { toastRegion } from "../toasts"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// A doc's comment pages on a phone (V-1105): the comments list and a thread
// own the screen's foot with their composer's bar, and no tab bar is drawn,
// so a phone toast (components/ui/toast.tsx, 12px over --phone-floor) has to
// sit above that bar. The daily note from OneCamp AI is the toast every fresh
// session sees; it used to land on "Comment on the page" and take its tap.

const DOC = "d0c11050-0000-4000-8000-000000001105"
const THREAD = "00000000-0000-4000-8000-000000001105"
const NOTE = "OneCamp AI left you a note"
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true }
const now = new Date().toISOString()

const thread = {
  id: THREAD,
  resource_kind: "doc",
  resource_uuid: DOC,
  anchor: { kind: "none" },
  status: "open",
  created_by: SAM.user_uuid,
  created_at: now,
  updated_at: now,
  comments: [{ comment_uuid: `${THREAD}-c1`, thread_id: THREAD, comment_text: "<p>Can we say Friday in the headline?</p>", comment_by: SAM, comment_created_at: now }],
  participants: [],
  unread: false,
  can_reply: true,
  can_resolve: true,
  can_moderate: true,
}

const answers = {
  ...AI_READS,
  ...AI_ON,
  // Today's note is left: four things need Sam (components/ai/AgentNoteOnOpen).
  "/ai/agent-note": { msg: "ok", data: { posted: true, bot_uuid: "b0a4d000-0000-4000-8000-0000000000a1", items: 4 } },
  "/threads": (url: URL, request: { method(): string }) => {
    if (request.method() !== "GET") return { msg: "ok", data: {} }
    return url.pathname === "/threads" ? { msg: "ok", data: { threads: [thread] } } : { msg: "ok", data: thread }
  },
}

/** The note's toast, at rest: its box once it has stopped moving. */
async function noteAtRest(page: Page) {
  const note = toastRegion(page).locator("[data-news]")
  await expect(note.getByText(NOTE, { exact: true })).toBeVisible({ timeout: 30_000 })
  let last = ""
  await expect
    .poll(async () => {
      const b = await note.boundingBox()
      const at = JSON.stringify(b && [Math.round(b.y), Math.round(b.height)])
      const still = at === last
      last = at
      return still
    }, { intervals: [250], timeout: 10_000 })
    .toBe(true)
  return (await note.boundingBox())!
}

/** The bar at the page's foot that holds the composer: the page's own child around the box. */
async function footBar(page: Page, root: string, box: string) {
  return page.evaluate(
    ([root, box]) => {
      const own = document.querySelector(root)
      const field = own?.querySelector(`[role="textbox"][aria-label="${box}"]`)
      const bar = own && field ? [...own.children].find((c) => c.contains(field)) : null
      const r = bar?.getBoundingClientRect()
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), floor: getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h").trim() } : null
    },
    [root, box] as const,
  )
}

/**
 * Opens a comment page with today's note coming as a toast, and checks the
 * toast sits clear of the composer's bar and the composer takes a first tap.
 */
async function checkPage(page: Page, path: string, root: string, box: string, shot: string, theme: string) {
  // The note is asked once a session (sessionStorage): a fresh ask on this page.
  await page.evaluate(() => sessionStorage.clear())
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const field = page.getByRole("textbox", { name: box })
  await expect(field).toBeVisible({ timeout: 60_000 })
  const note = await noteAtRest(page)
  const bar = await footBar(page, root, box)
  expect(bar, `${shot}: the composer's bar`).not.toBeNull()
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/390-${shot}-toast-${theme}.png`, clip: { x: 0, y: 422, width: 390, height: 422 } })
  const toastBottom = Math.round(note.y + note.height)
  expect.soft(toastBottom, `${shot}: the toast (bottom ${toastBottom}) sits 8px or more over the composer's bar (top ${bar!.top}, floor "${bar!.floor}")`).toBeLessThanOrEqual(bar!.top - 8)
  // A first tap on the composer, while the toast is still up, reaches it.
  await expect(page.locator("[data-news]").getByText(NOTE, { exact: true })).toBeVisible()
  const f = (await field.boundingBox())!
  await page.touchscreen.tap(f.x + f.width / 2, f.y + f.height / 2)
  await expect.soft(field, `${shot}: the composer takes a first tap`).toBeFocused({ timeout: 2_000 })
}

for (const theme of ["light", "dark"] as const) {
  test(`a phone's comment pages keep their composer clear of a toast (${theme})`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000)
    const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Press kit notes", body: "<p>Launch on Friday</p>" }, answers, PHONE)
    await tab.page.emulateMedia({ colorScheme: theme })
    await checkPage(tab.page, `/app/doc/${DOC}/comment`, "[data-doc-comments]", "Comment on the page", "doc-comments", theme)
    await checkPage(tab.page, `/app/doc/${DOC}/comment/${THREAD}`, "[data-doc-thread-page]", "Reply in this thread", "doc-thread", theme)
    await tab.close()
  })
}

test("a wide screen's comments are a panel: no foot is published", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, body: "<p>Launch on Friday</p>" }, answers, { width: 1280, height: 900 })
  await tab.page.goto(`/app/doc/${DOC}/comment`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.page.getByRole("textbox", { name: "Comment on the page" })).toBeVisible({ timeout: 60_000 })
  // The panel's own composer (components/rightPanel/docCommentList) is no phone foot.
  await expect(tab.page.locator("[data-phone-foot]")).toHaveCount(0)
  expect(await tab.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h").trim())).toBe("")
  await tab.close()
})
