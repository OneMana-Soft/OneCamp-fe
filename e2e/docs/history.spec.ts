import { expect, test, type Page } from "@playwright/test"

import { layersOverSheet, scrimOverLayerBelow } from "../sheetLayout"
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

async function openHistory(page: Page, timeout?: number) {
  await page.getByRole("button", { name: "More doc actions" }).click()
  await page.getByRole("menuitem", { name: "Version history" }).click()
  const sheet = page.locator("[data-history-sheet]")
  await expect(sheet).toBeVisible({ timeout })
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
  // A computer keeps the confirm a dialog in the middle of the screen; a
  // phone's is a sheet (below).
  await expect(ask).not.toHaveAttribute("data-v3-sheet", /.*/)
  const box = (await ask.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - tab.page.viewportSize()!.width / 2)).toBeLessThan(2)
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

// Owner, 18 Oct: on a phone every dialog is a sheet. Restore asks in a sheet
// of its own over the history sheet (components/ui/alert-dialog): on the
// bottom edge at the screen's width, its dim over the sheet under it, and
// Restore version over Cancel, each 44px tall and whole on the screen.
test("on a phone, Restore asks in a sheet of its own, its actions in a thumb's reach", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, answers(NEWER, OLDER), { width: 390, height: 844, isMobile: true, hasTouch: true })
  const sent = writes(tab.page)
  await tab.page.getByRole("button", { name: "Document options" }).tap()
  await tab.page.getByText("Version history", { exact: true }).tap()
  const sheet = tab.page.locator("[data-history-sheet]")
  await sheet.getByRole("option").nth(1).tap()
  await sheet.locator("[data-restore-version]").tap()

  const ask = tab.page.getByRole("alertdialog")
  await expect(ask).toHaveAttribute("data-v3-sheet", "")
  await expect
    .poll(async () => {
      const b = (await ask.boundingBox())!
      return [Math.round(b.x), Math.round(b.width), Math.round(b.y + b.height)]
    })
    .toEqual([0, 390, 844])
  expect(await layersOverSheet(tab.page)).toEqual({ modals: [], popovers: [] })
  expect(await scrimOverLayerBelow(tab.page), "the confirm's scrim dims the history sheet").toBe(true)
  const restore = (await ask.getByRole("button", { name: "Restore version" }).boundingBox())!
  const cancel = (await ask.getByRole("button", { name: "Cancel" }).boundingBox())!
  expect(Math.min(restore.height, cancel.height)).toBeGreaterThanOrEqual(44)
  expect(cancel.y).toBeGreaterThanOrEqual(restore.y + restore.height)
  expect(cancel.y + cancel.height).toBeLessThanOrEqual(844)

  await ask.getByRole("button", { name: "Restore version" }).tap()
  await expect.poll(() => sent.find((w) => w.path === "/doc/versions/v1/restore")?.body).toEqual({ doc_uuid: DOC })
  await tab.close()
})

test("reads a 5,000-block version, and compares it with the one before, without holding the page", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, answers(bigVersion(5000, true), bigVersion(5000, false)))
  // The page's long tasks, where they start and how long they run, and the
  // frames it paints (those for the numbers only).
  await tab.page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __tasks: Array<[number, number]> }
    w.__frames = []
    w.__tasks = []
    const paint = () => {
      w.__frames.push(performance.now())
      requestAnimationFrame(paint)
    }
    requestAnimationFrame(paint)
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__tasks.push([e.startTime, e.duration])
    }).observe({ type: "longtask" })
  })
  /**
   * From one of the page's marks to another: how long it took, the longest
   * task inside it and the share of the whole that task held, and the frames
   * painted meanwhile.
   */
  const between = (start: string, end: string) =>
    tab.page.evaluate(([s, e]) => {
      const a = performance.getEntriesByName(s).pop()?.startTime
      const b = performance.getEntriesByName(e).pop()?.startTime
      if (a === undefined || b === undefined) return null
      const w = window as unknown as { __frames: number[]; __tasks: Array<[number, number]> }
      let longest = 0
      for (const [at, ms] of w.__tasks) longest = Math.max(longest, Math.min(at + ms, b) - Math.max(at, a))
      return {
        ms: Math.round(b - a),
        longestTaskMs: Math.round(longest),
        held: Number((longest / Math.max(b - a, 1)).toFixed(3)),
        frames: w.__frames.filter((t) => t > a && t < b).length,
      }
    }, [start, end])

  const opened = Date.now()
  // How soon the sheet opens is not what this holds, and a busy machine has
  // taken more than the usual 5 s to open it (16 Oct).
  const sheet = await openHistory(tab.page, 30_000)
  await expect(sheet.locator(".history-preview > *").first()).toBeAttached({ timeout: 60_000 })
  const firstScreenMs = Date.now() - opened
  await expect.poll(() => between("history-render-start", "history-render-end"), { timeout: 120_000 }).not.toBeNull()
  const render = (await between("history-render-start", "history-render-end"))!

  await sheet.getByRole("switch", { name: "Show changes" }).click()
  await expect(sheet.locator("[data-diff-summary]")).toContainText("since the version before", { timeout: 120_000 })
  const diff = (await between("history-diff-start", "history-diff-end"))!
  const marked = await sheet.locator(".history-preview [data-history-change]").count()

  const numbers = { blocks: 5000, firstScreenMs, render, diff, marked }
  testInfo.annotations.push({ type: "history-5000", description: JSON.stringify(numbers) })
  console.log("history-5000", JSON.stringify(numbers))
  expect(marked).toBeGreaterThan(100)
  // Drawn and compared in slices, no one task holds the page for long.
  // Unsliced, either is one task from its start to its end. So this holds the
  // longest task as a share of the work, measured in the same run, never a
  // time or a count of its own: a busy machine stretched a slice past a
  // second-long bound (3 s at load 70, 16 Oct), and a quick draw painted 4
  // frames where 5 were asked for (load 38, 17 Oct), the page not held at
  // all. Sliced, the longest task held at most 22% of a draw, quick or
  // slow, six at once or one; unsliced, all of it, every time.
  expect(render.held, "the share of the drawing that one task held").toBeLessThanOrEqual(0.5)
  expect(diff.held, "the share of working out the changes that one task held").toBeLessThanOrEqual(0.5)
  await tab.close()
})
