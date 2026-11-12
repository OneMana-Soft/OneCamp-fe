import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { SAM, logFailures, stubBackend, tidy } from "./stubbedApp"
import { JONAS, LAUNCH, MAYA, ME, POST, channel } from "./channelPage"

// H1, "the shell holds still" (FLUIDITY-LEAD-11, 5 Nov 2026): the shell no
// longer draws on a move, the sidebar is the page's sibling, and the phone's
// bars hold still while the page scrolls. What a person does with them must be
// as it was: the sidebar's rows move the page and the current row follows, by
// pointer and by keys; a channel opens beside the page and closes; on a phone,
// the tab bar and the top bar move the page by tap, and the current tab follows.

const ANSWERS = {
  "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
  "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS] },
  "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: [channel] },
  [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
  [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [POST], has_more: false } },
  [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
  "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/ch/getFile": { msg: "ok", data: [] },
  "/ch/markSeen": { msg: "ok" },
  "/activity/seen": { msg: "ok" },
  "/ch/publishChannelTyping": { msg: "ok" },
  "/agent-card/channel": { msg: "ok", data: [] },
  "/later": { msg: "ok", data: { items: [] } },
}

async function openAt(page: Page, testInfo: TestInfo, path: string) {
  logFailures(page)
  await stubBackend(page, testInfo, ANSWERS)
  // The keys tip opens 6 s in, over the sidebar's foot: not in these tests.
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/** Whether a link is marked as the current place. */
const current = (l: Locator) => l.getAttribute("aria-current")

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" })
  const primary = (page: Page, name: string) => sidebar(page).getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`^${name}\\b`) })
  const launchRow = (page: Page) => sidebar(page).getByRole("link", { name: /^launch\b/ })

  test("the sidebar's rows move the page, and the current row follows", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "/app/home")
    await expect(primary(page, "Home")).toHaveAttribute("aria-current", "page", { timeout: 60_000 })
    await tidy(page)

    await primary(page, "Inbox").click()
    await expect(page).toHaveURL(/\/app\/inbox(\?|$)/)
    await expect(primary(page, "Inbox")).toHaveAttribute("aria-current", "page")
    expect(await current(primary(page, "Home"))).toBeNull()

    await launchRow(page).click()
    await expect(page).toHaveURL(new RegExp(`/app/channel/${LAUNCH}(\\?|$)`))
    await expect(page.getByText("Staging is green.").first()).toBeVisible({ timeout: 60_000 })
    await expect(launchRow(page)).toHaveAttribute("aria-current", "page")
    expect(await current(primary(page, "Inbox"))).toBeNull()

    await primary(page, "Home").click()
    await expect(page).toHaveURL(/\/app\/home(\?|$)/)
    await expect(primary(page, "Home")).toHaveAttribute("aria-current", "page")
    expect(await current(launchRow(page))).toBeNull()
  })

  test("Tab walks through the sidebar and Enter opens the row it reaches", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "/app/home")
    await expect(primary(page, "Home")).toHaveAttribute("aria-current", "page", { timeout: 60_000 })
    await expect(launchRow(page)).toBeVisible()
    await tidy(page)

    await primary(page, "Home").focus()
    const walked: string[] = []
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab")
      const at = await page.evaluate(() => {
        const el = document.activeElement
        return { inSidebar: !!el?.closest('aside[aria-label="Sidebar"]'), name: el?.getAttribute("aria-label") || el?.textContent?.trim() || el?.tagName || "" }
      })
      walked.push(at.name)
      expect(at.inSidebar, `Tab left the sidebar: ${walked.join(" > ")}`).toBe(true)
      reached = await launchRow(page).evaluate((el) => el === document.activeElement)
    }
    expect(reached, `Tab never reached the channel's row: ${walked.join(" > ")}`).toBe(true)

    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(new RegExp(`/app/channel/${LAUNCH}(\\?|$)`))
    await expect(launchRow(page)).toHaveAttribute("aria-current", "page")
    expect(await current(primary(page, "Home"))).toBeNull()
  })

  test("a channel opens beside the page and closes again, the page and its row as they were", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "/app/inbox")
    await expect(primary(page, "Inbox")).toHaveAttribute("aria-current", "page", { timeout: 60_000 })
    await tidy(page)

    await launchRow(page).hover()
    await sidebar(page).getByRole("button", { name: "Open launch side by side" }).click()
    const beside = page.locator(`[data-split-sheet="channel:${LAUNCH}"]`)
    await expect(beside).toBeVisible({ timeout: 60_000 })
    await expect(beside.getByText("Staging is green.")).toBeVisible({ timeout: 60_000 })
    // The page stays, and so does its row: the channel is beside it, not instead.
    await expect(page).toHaveURL(/\/app\/inbox(\?|$)/)
    await expect(primary(page, "Inbox")).toHaveAttribute("aria-current", "page")
    expect(await current(launchRow(page))).toBeNull()

    await beside.getByRole("button", { name: /^Close this / }).click()
    await expect(beside).toHaveCount(0)
    await expect(page.locator("[data-split-sheet]")).toHaveCount(1)
    await expect(page).toHaveURL(/\/app\/inbox(\?|$)/)
    await expect(primary(page, "Inbox")).toHaveAttribute("aria-current", "page")
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  const tabs = (page: Page) => page.getByRole("navigation", { name: "Primary" })
  const tab = (page: Page, name: string) => tabs(page).getByRole("link", { name, exact: true })

  test("the tab bar and the top bar move the page by tap, and the current tab follows", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "/app/home")
    await expect(tab(page, "Home")).toHaveAttribute("aria-current", "page", { timeout: 60_000 })
    await tidy(page)

    await tab(page, "Channels").tap()
    await expect(page).toHaveURL(/\/app\/channel(\?|$)/)
    await expect(tab(page, "Channels")).toHaveAttribute("aria-current", "page")
    expect(await current(tab(page, "Home"))).toBeNull()

    await tab(page, "Direct messages").tap()
    await expect(page).toHaveURL(/\/app\/chat(\?|$)/)
    await expect(tab(page, "Direct messages")).toHaveAttribute("aria-current", "page")
    expect(await current(tab(page, "Channels"))).toBeNull()

    // A channel's page owns the bottom edge; the top bar's Back goes up to its tab.
    await page.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.getByText("Staging is green.").first()).toBeVisible({ timeout: 60_000 })
    await page.locator("[data-phone-topbar]").getByRole("button", { name: "Back" }).tap()
    await expect(page).toHaveURL(/\/app\/channel(\?|$)/)
    await expect(tab(page, "Channels")).toHaveAttribute("aria-current", "page")

    await tab(page, "Home").tap()
    await expect(page).toHaveURL(/\/app\/home(\?|$)/)
    await expect(tab(page, "Home")).toHaveAttribute("aria-current", "page")
    expect(await current(tab(page, "Channels"))).toBeNull()
  })
})
