import { expect, test } from "@playwright/test"

import { inboxWithANotice } from "./inboxNotice"
import { coveredControls } from "./menuReach"
import { openBoard } from "./projectBoard"
import { openFiles } from "./projectFiles"
import { SAM } from "./stubbedApp"
import { TableServer } from "./tables/tableServer"

// On the pages people use, every control takes the pointer where it is drawn,
// at rest and when a hover shows it (the reach scan, e2e/menuReach.ts).
//
// Why (REGRESSION-AUDIT, 23 Oct 2026): for 12 days a project's file cards
// drew the name's stretched click area over their ⋯ and Download (web
// 8a1c0b024), so a click opened the lightbox and Delete could not be reached
// on a computer. The tab's unit test mocked every hook and never put a
// pointer on a card. A stretched click area is how rows across the app open
// (hub rows, activity, cards), and each new control on one must rise above
// it; this scan finds one that doesn't, on any page it walks.

const deals = () =>
  new TableServer(
    [
      { id: "item", name: "Item", type: "text" },
      { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
    ],
    [
      { item: "Booth", stage: "To do" },
      { item: "Banner", stage: "Done" },
    ],
  )

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("a project's files, as cards and as rows", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openFiles(page, testInfo)
    expect(await coveredControls(page, { hover: true }), "as cards").toEqual([])
    await page.getByRole("radio", { name: "List" }).click()
    await expect(page.locator("[data-file-row]").first()).toBeVisible()
    expect(await coveredControls(page, { hover: true }), "as rows").toEqual([])
  })

  test("a project's board", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openBoard(page, testInfo, "light")
    expect(await coveredControls(page, { hover: true })).toEqual([])
  })

  test("the inbox, whose rows every hub list draws", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await inboxWithANotice(page, testInfo)
    expect(await coveredControls(page, { hover: true })).toEqual([])
  })

  test("a table", async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const sam = await deals().open(browser, testInfo, SAM, { viewport: { width: 1280, height: 800 } })
    await expect(sam.page.locator('[data-cell="0:0"]')).toBeAttached({ timeout: 30_000 })
    expect(await coveredControls(sam.page, { hover: true })).toEqual([])
    await sam.close()
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("a project's files", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openFiles(page, testInfo)
    expect(await coveredControls(page, { hover: false })).toEqual([])
  })

  test("the inbox", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await inboxWithANotice(page, testInfo)
    expect(await coveredControls(page, { hover: false })).toEqual([])
  })
})
