import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { bigVersion } from "./bigVersions"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"
import { PRIYA } from "./twoPeople"

// Version history (B8, collaboration.md P1-B): opened from More, or the
// phone's doc sheet; a version read in the doc's own type, its changes marked
// against the version before, named, and restored live after asking. And a
// 5,000-block version read, and compared, without holding the page.
// The versions API (A4) is answered here; nothing reaches a real server.

const DOC = "c4d2e6f8-1a3b-4c5d-9e7f-0a1b2c3d4e5f"
const AGENT = "a6e1b2c3-d4e5-4f60-8a9b-0c1d2e3f4a5b"
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const V2 = { id: "v2", kind: "doc", pinned: false, reason: "interval", created_at: ago(12), contributors: [{ user_uuid: SAM.user_uuid }, { agent_uuid: AGENT, asker_uuid: SAM.user_uuid }] }
const V1 = { id: "v1", kind: "doc", pinned: true, name: "Sent to Acme", reason: "saved", created_at: ago(180), contributors: [{ user_uuid: PRIYA.user_uuid }] }
const people = { [SAM.user_uuid]: { name: "Sam Rivera" }, [PRIYA.user_uuid]: { name: "Priya Shah" }, [AGENT]: { name: "Release Captain" } }

const list = (items: Array<[string, string]>) =>
  `<ul data-block-id="l">${items.map(([id, t]) => `<li data-block-id="li-${id}"><p data-block-id="p-${id}">${t}</p></li>`).join("")}</ul>`
const NEWER = `<p data-block-id="a">We ship on Friday</p>${list([["1", "Book the room"], ["2", "Send the invite to Acme"]])}`
const OLDER = `<p data-block-id="a">We ship on Thursday</p>${list([["1", "Book the room"], ["2", "Send the invite"]])}`

const answers = (newer: string, older: string) => ({
  "/doc/versions/v2": { msg: "Success", data: { html: newer } },
  "/doc/versions/v1": { msg: "Success", data: { html: older } },
  "/doc/versions": { msg: "Success", data: { versions: [V2, V1], people } },
})

/** The versions API's writes, as the page sent them. */
function writes(page: Page) {
  const out: Array<{ path: string; body: unknown }> = []
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/doc/versions")) out.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() })
  })
  return out
}

async function openHistory(page: Page) {
  await page.getByRole("button", { name: "More doc actions" }).click()
  await page.getByRole("menuitem", { name: "Version history" }).click()
  const sheet = page.locator("[data-history-sheet]")
  await expect(sheet).toBeVisible()
  return sheet
}

test.describe.configure({ mode: "serial" })

test("reads a version, marks its changes, names it, and restores it live after asking", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, answers(NEWER, OLDER))
  const sent = writes(tab.page)
  const sheet = await openHistory(tab.page)

  const rows = sheet.getByRole("listbox", { name: "Versions" }).getByRole("option")
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toHaveAttribute("aria-selected", "true")
  await expect(rows.first()).toContainText("Sam Rivera and Release Captain for Sam Rivera")
  await expect(rows.nth(1)).toContainText("Sent to Acme")
  const preview = sheet.locator(".history-preview")
  await expect(preview).toContainText("We ship on Friday")

  await sheet.getByRole("switch", { name: "Show changes" }).click()
  await expect(preview.locator("del.history-del")).toHaveText("Thursday")
  await expect(preview.locator("ins.history-ins")).toHaveText(["Friday", "to Acme"])
  await expect(sheet.locator("[data-diff-summary]")).toHaveText("3 words added and 1 removed since the version before")
  // Only the item that changed is marked, not its list.
  await expect(preview.locator("ul")).not.toHaveAttribute("data-history-change", /.*/)
  await sheet.getByRole("button", { name: "Next change" }).click()
  await expect(sheet.locator("[data-change-stepper]")).toContainText("1 of 2")

  // ↓ in the list shows the older version.
  await rows.first().focus()
  await tab.page.keyboard.press("ArrowDown")
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true")
  await expect(preview).toContainText("We ship on Thursday")
  await expect(sheet.locator("[data-diff-summary]")).toHaveText("This is the oldest version kept, so nothing comes before it")
  await tab.page.keyboard.press("ArrowUp")

  await sheet.getByRole("button", { name: "Name" }).click()
  await tab.page.keyboard.type("Before the review")
  await tab.page.keyboard.press("Enter")
  await expect.poll(() => sent.find((w) => w.path === "/doc/versions/v2/name")?.body).toEqual({ doc_uuid: DOC, name: "Before the review", pinned: false })

  await sheet.locator("[data-restore-version]").click()
  const ask = tab.page.getByRole("alertdialog")
  await expect(ask).toContainText("for everyone, at once")
  await ask.getByRole("button", { name: "Restore version" }).click()
  await expect.poll(() => sent.find((w) => w.path === "/doc/versions/v2/restore")?.body).toEqual({ doc_uuid: DOC })
  await expect(tab.page.locator("[data-history-sheet]")).toHaveCount(0)

  await tab.close()
})

test("on a phone, opens from the doc's sheet as a sheet: the list, then a version with Restore at its foot", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, answers(NEWER, OLDER), { width: 390, height: 844 })
  await tab.page.getByRole("button", { name: "Document options" }).click()
  await tab.page.getByText("Version history", { exact: true }).click()
  const sheet = tab.page.locator("[data-history-sheet]")
  await expect(sheet.getByRole("listbox", { name: "Versions" })).toBeVisible()
  await sheet.getByRole("option").nth(1).click()
  await expect(sheet.locator(".history-preview")).toContainText("We ship on Thursday")
  await expect(sheet.locator("[data-restore-version]")).toBeVisible()
  await sheet.getByRole("button", { name: "Versions" }).click()
  await expect(sheet.getByRole("listbox", { name: "Versions" })).toBeVisible()
  await tab.close()
})

test("reads a 5,000-block version, and compares it with the one before, without holding the page", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, answers(bigVersion(5000, true), bigVersion(5000, false)))
  await tab.page.evaluate(() => {
    const w = window as unknown as { __long: number[] }
    w.__long = []
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__long.push(Math.round(e.duration))
    }).observe({ type: "longtask" })
  })
  const longTasks = () => tab.page.evaluate(() => (window as unknown as { __long: number[] }).__long.splice(0))
  const span = (start: string, end: string) =>
    tab.page.evaluate(([s, e]) => {
      const a = performance.getEntriesByName(s).pop()
      const b = performance.getEntriesByName(e).pop()
      return a && b ? Math.round(b.startTime - a.startTime) : -1
    }, [start, end])

  const opened = Date.now()
  const sheet = await openHistory(tab.page)
  await expect(sheet.locator(".history-preview > *").first()).toBeAttached({ timeout: 60_000 })
  const firstScreenMs = Date.now() - opened
  await expect.poll(() => span("history-render-start", "history-render-end"), { timeout: 120_000 }).toBeGreaterThan(0)
  const renderMs = await span("history-render-start", "history-render-end")
  const renderLong = await longTasks()

  await sheet.getByRole("switch", { name: "Show changes" }).click()
  await expect(sheet.locator("[data-diff-summary]")).toContainText("since the version before", { timeout: 120_000 })
  const diffMs = await span("history-diff-start", "history-diff-end")
  const diffLong = await longTasks()
  const marked = await sheet.locator(".history-preview [data-history-change]").count()

  const numbers = { blocks: 5000, firstScreenMs, renderMs, renderLongTasks: renderLong, diffMs, diffLongTasks: diffLong, marked }
  testInfo.annotations.push({ type: "history-5000", description: JSON.stringify(numbers) })
  console.log("history-5000", JSON.stringify(numbers))
  expect(marked).toBeGreaterThan(100)
  // These hold the page in slices, not a stopwatch: unsliced, either is one
  // task of seconds. A shared machine at three times its cores stretched a
  // sliced frame to 543 ms (13 Oct), so the bound is a second.
  expect(Math.max(0, ...renderLong)).toBeLessThan(1000)
  expect(Math.max(0, ...diffLong)).toBeLessThan(1000)
  await tab.close()
})
