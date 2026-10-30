import { expect, test, type Page } from "@playwright/test"

import { longerWait, stubBackend } from "./stubbedApp"

// A click on a link made just after My tasks opens, or just after its list
// changes, leaves for where it points (26 Oct 2026). The list writes its sort,
// filters and search into the address a moment after they change. Writing the
// address is a navigation, and Next keeps only the latest: a write landing
// while the click's page was still loading cancelled the click, and the person
// stayed on My tasks. The list wrote even when nothing had changed, 300 ms
// after it opened, so a quick click on the sidebar was lost.

test.use({ viewport: { width: 1280, height: 860 } })

/** Inbox answers 3 s late, so a click's navigation to it is still on its way when the list writes. */
async function slowInbox(page: Page) {
  await page.route((url) => url.pathname === "/app/inbox", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    await route.fallback()
  })
}

async function openMyTasks(page: Page, testInfo: Parameters<typeof stubBackend>[1]) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  // The list's 300 ms wait before it writes lasts 1.2 s here.
  await longerWait(page, 300, 1_200)
  await stubBackend(page, testInfo, {})
  await slowInbox(page)
  await page.goto("/app/myTask", { waitUntil: "domcontentloaded", timeout: 120_000 })
  // The list's toolbar: the list is in the page, and its wait has begun.
  await expect(page.getByRole("button", { name: "Search tasks" })).toBeVisible({ timeout: 60_000 })
}

/** The click's page shows, and the address stays on it. */
async function leftFor(page: Page, path: string) {
  await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 })
  await page.waitForTimeout(1_500)
  expect(new URL(page.url()).pathname, "the address went back to My tasks").toBe(path)
}

test("a click on the sidebar just after My tasks opens leaves for where it points", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await openMyTasks(page, testInfo)
  await page.waitForTimeout(100)
  await page.locator('a[href="/app/inbox"]').first().click()
  await leftFor(page, "/app/inbox")
})

test("a click on the sidebar just after a search in the list leaves, and Back finds the search", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await openMyTasks(page, testInfo)
  // Long after the list opened: only the search's own write is still to come.
  await page.waitForTimeout(2_000)
  await page.getByRole("button", { name: "Search tasks" }).click()
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("launch")
  await page.locator('a[href="/app/inbox"]').first().click()
  await leftFor(page, "/app/inbox")
  // The search was written before the click left, into My tasks' own entry.
  await page.goBack()
  await page.waitForURL((url) => url.pathname === "/app/myTask", { timeout: 15_000 })
  const back = new URL(page.url()).searchParams
  expect(back.get("search"), "the search in My tasks' address").toBe("launch")
  expect(back.get("tab"), "the layout's tab kept beside it").toBe("list")
})

/** Whether keys pressed now are text where focus is (lib/goKeys isTyping's rule), so no go key runs. */
function keysAreText(page: Page) {
  return page.evaluate(() => {
    const at = document.activeElement as HTMLElement | null
    return !!at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) || !!at.closest('[contenteditable="true"], .excalidraw, [data-no-go-keys]'))
  })
}

test("control: G then I with nothing waiting to be written leaves for the inbox", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await openMyTasks(page, testInfo)
  // Long after the list opened: nothing is waiting, so this passes on a build without the fix too.
  await page.waitForTimeout(2_000)
  expect(await keysAreText(page), "the keys would be typed").toBe(false)
  await page.keyboard.press("g")
  await page.keyboard.press("i")
  await leftFor(page, "/app/inbox")
})

test("a go key just after a search in the list leaves for where it goes, and Back finds the search", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await openMyTasks(page, testInfo)
  await page.waitForTimeout(2_000)
  await page.getByRole("button", { name: "Search tasks" }).click()
  const field = page.getByRole("searchbox", { name: "Search tasks" })
  await field.fill("launch")
  // Tab leaves the field with the search kept (the field's Escape clears it, and keys pressed in it are text).
  // Tab, G and I are plain keys, which the list's write waits through: the move the app makes for them has to
  // write it first, or the write cancels the move.
  await page.keyboard.press("Tab")
  expect(await keysAreText(page), "focus left the search field").toBe(false)
  await expect(field).toHaveValue("launch")
  await page.keyboard.press("g")
  await page.keyboard.press("i")
  await leftFor(page, "/app/inbox")
  await page.goBack()
  await page.waitForURL((url) => url.pathname === "/app/myTask", { timeout: 15_000 })
  const back = new URL(page.url()).searchParams
  expect(back.get("search"), "the search in My tasks' address").toBe("launch")
  expect(back.get("tab"), "the layout's tab kept beside it").toBe("list")
})
