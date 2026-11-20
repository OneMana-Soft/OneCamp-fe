import { expect, test, type Page } from "@playwright/test"
import { openBoard } from "./boardOpen"
import { type Box } from "./boxes"
import { missed, settle } from "./touchTarget"
// THE BOARD ON A PHONE (design-22 to_win 4): "the tools in one bottom bar with
// undo, every board overlay a sheet, 44 px targets." Excalidraw's tools and its
// Undo and Redo share one bar at the board's foot (no tool row at the top), the
// board's own cluster stands clear of that bar and of the board's middle, and
// every control a finger meets there takes a 44 px finger: the cluster, Undo
// and Redo, the column of library, lock and hand, the tools, the notes bar and
// the vote chips on notes. The notes bar's More opens a sheet whose actions are
// pinned at its foot, and Version history is a sheet with its actions pinned
// too; Share, Templates and Viewed by take a finger on every control. On a computer the tool row draws a ring on the tool the keyboard takes
// (V-915), in both themes.
const PHONE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

/** Sam, an editor, opens a board with two notes and a box, its camera at the origin; `voting` starts a round of dot voting. */
const open = (page: Page, theme: "light" | "dark", voting = false) => openBoard(page, { theme, voting })

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** A tap on a note: the notes bar comes up beside it, low on a phone. */
async function selectNote(page: Page, canvas: Box) {
  await page.touchscreen.tap(canvas.x + 120, canvas.y + 200)
  const bar = page.locator("[data-notes-bar]")
  await expect(bar).toBeVisible()
  return bar
}

test.describe("on a phone", () => {
  test.use(PHONE)

  for (const height of [844, 664]) {
    test(`the tools and undo share one bottom bar, the cluster clear of it and of the middle, every control 44 px, at 390x${height} with touch`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height })
      const canvas = await open(page, "light")
      const bar = (await page.locator(".App-bottom-bar > .Island").boundingBox())!
      const tools = (await page.locator(".App-toolbar--mobile").boundingBox())!
      const undo = (await page.locator(".App-toolbar-content").getByRole("button", { name: "Undo" }).boundingBox())!
      const redo = (await page.locator(".App-toolbar-content").getByRole("button", { name: "Redo" }).boundingBox())!
      const said = JSON.stringify({ bar, tools, undo, redo })
      expect(bar.y + bar.height, `the bar stands at the board's foot: ${said}`).toBeGreaterThan(height - 80)
      expect(tools.y, `no tool row at the top: the tools are in the bar: ${said}`).toBeGreaterThanOrEqual(bar.y - 1)
      expect(tools.y + tools.height, `the tools end at the bar's foot: ${said}`).toBeLessThanOrEqual(bar.y + bar.height + 1)
      for (const b of [undo, redo]) expect(Math.abs(b.y + b.height / 2 - (tools.y + tools.height / 2)), `Undo and Redo on the tools' row: ${said}`).toBeLessThanOrEqual(2)
      expect(tools.x + tools.width, `the tools end before Undo: ${said}`).toBeLessThanOrEqual(undo.x + 1)

      const cluster = (await page.locator("[data-board-phone-actions]").getByRole("toolbar", { name: "Board tools" }).boundingBox())!
      expect(overlaps(cluster, bar), `the board's cluster clear of the bar: ${JSON.stringify({ cluster, bar })}`).toBe(false)
      const middle = { x: canvas.x + canvas.width / 2 - 40, y: canvas.y + canvas.height / 2 - 40, width: 80, height: 80 }
      expect(overlaps(cluster, middle), `the board's cluster clear of the middle: ${JSON.stringify({ cluster, middle })}`).toBe(false)

      expect(await missed(page.locator("[data-board-phone-actions]"), "button"), "the board's cluster").toEqual([])
      expect(await missed(page.locator(".App-toolbar-content"), "button"), "Undo and Redo").toEqual([])
      expect(await missed(page.locator(".mobile-misc-tools-container"), "label, button"), "library, lock and hand").toEqual([])
      expect(await missed(page.locator(".App-toolbar--mobile"), "label.ToolIcon, button"), "the tools").toEqual([])
    })
  }

  for (const theme of ["light", "dark"] as const) {
    test(`the notes bar and vote chips take a finger, and More opens a sheet with its actions pinned, at 390x844 with touch, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      const canvas = await open(page, theme, true)
      expect(await missed(page.locator("body"), 'button[aria-label^="Vote for"]'), "the vote chips").toEqual([])
      const bar = await selectNote(page, canvas)
      await settle(bar)
      expect(await missed(bar, "button"), "the notes bar").toEqual([])

      await bar.getByRole("button", { name: /^More/ }).tap()
      const sheet = page.locator(".App-bottom-bar > .Island").filter({ has: page.locator(".App-mobile-menu") })
      await expect(sheet, "More opens a sheet").toBeVisible()
      await sheet.evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished)))
      const at = (await sheet.boundingBox())!
      expect(Math.abs(at.y + at.height - 844), `the sheet stands on the screen's foot: ${JSON.stringify(at)}`).toBeLessThanOrEqual(1)
      expect(at.x, "it starts at the left edge").toBeLessThanOrEqual(0.5)
      expect(at.x + at.width, "it runs to the right edge").toBeGreaterThanOrEqual(389.5)
      const meets = await sheet.evaluate((node) => {
        const r = node.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !!hit && node.contains(hit)
      })
      expect(meets, "the sheet is what a finger meets at its middle").toBe(true)
      // The notes' vote chips stay on the canvas: none is drawn over the sheet,
      // where a finger on the sheet would cast a vote.
      const over = await sheet.evaluate((node) => {
        const r = node.getBoundingClientRect()
        return [...document.querySelectorAll<HTMLElement>('button[aria-label^="Vote for"]')].flatMap((chip) => {
          const c = chip.getBoundingClientRect()
          const x = c.left + c.width / 2
          const y = c.top + c.height / 2
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) return []
          const hit = document.elementFromPoint(x, y)
          return hit && node.contains(hit) ? [] : [`${chip.getAttribute("aria-label")} at ${Math.round(x)},${Math.round(y)}`]
        })
      })
      expect(over, "no vote chip is drawn over the sheet").toEqual([])
      const footer = sheet.locator("footer.App-toolbar")
      const foot = (await footer.boundingBox())!
      expect(Math.abs(foot.y + foot.height - (at.y + at.height)), "its actions are pinned at its foot").toBeLessThanOrEqual(1)
      await sheet.locator(".App-mobile-menu").evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "instant" }))
      expect((await footer.boundingBox())!.y, "and stay there as it scrolls").toBeCloseTo(foot.y, 0)
      expect(await missed(footer, "button"), "the sheet's actions").toEqual([])

      // Closed, the sheet gives the canvas back: the chips show and take a finger again.
      await footer.getByRole("button", { name: "Edit" }).tap()
      await expect(sheet, "Edit closes the sheet").toBeHidden()
      const chips = page.locator('button[aria-label^="Vote for"]')
      for (const chip of await chips.all()) await expect(chip, "a vote chip shows again").toBeVisible()
      const free = await chips.evaluateAll((all) =>
        all.findIndex((chip) => {
          const c = chip.getBoundingClientRect()
          const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)
          return !!hit && chip.contains(hit)
        }),
      )
      expect(free, "a vote chip is what a finger meets at its middle").toBeGreaterThanOrEqual(0)
      const chip = chips.nth(free)
      const name = (await chip.getAttribute("aria-label"))!.replace(/^Vote for /, "")
      const c = (await chip.boundingBox())!
      await page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2)
      await expect(page.getByRole("button", { name: `Take back your vote for ${name}` }), "and a tap on it casts the vote").toHaveAttribute("aria-pressed", "true")
    })
  }

  test("Version history is a sheet with its actions in a pinned footer, each taking a finger, at 390x844 with touch", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, "light")
    await page.locator("[data-board-phone-actions]").getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: /Version history/ }).tap()
    const sheet = page.getByRole("dialog", { name: /Version history/ })
    await expect(sheet.getByRole("button", { name: "Restore" }).first()).toBeVisible()
    await settle(sheet)
    const at = (await sheet.boundingBox())!
    expect(Math.abs(at.y + at.height - 844), "a sheet on the screen's foot").toBeLessThanOrEqual(1)
    const footer = sheet.locator("[data-dialog-footer]")
    await expect(footer, "a pinned footer").toBeVisible()
    const foot = (await footer.boundingBox())!
    expect(Math.abs(foot.y + foot.height - (at.y + at.height)), "the footer at the sheet's foot").toBeLessThanOrEqual(1)
    expect(await missed(sheet, "button"), "Version history's controls").toEqual([])
  })

  test("Share, Templates and Viewed by are sheets whose every control takes a finger, at 390x844 with touch", async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, "light")
    const actions = page.locator("[data-board-phone-actions]")
    const CONTROLS = "button, input, [role=switch], [role=combobox]"
    await actions.getByRole("button", { name: "Share board" }).tap()
    const share = page.getByRole("dialog", { name: /Share/ })
    await expect(share.getByLabel("Add people", { exact: true })).toBeVisible()
    await settle(share)
    expect.soft(await missed(share, CONTROLS), "Share's field, role and actions").toEqual([])
    await page.keyboard.press("Escape")
    await expect(share).toBeHidden()
    for (const [item, name] of [[/^Templates$/, /template/i], [/^Viewed by/, /Viewed by/]] as const) {
      await actions.getByRole("button", { name: "Board options" }).tap()
      await page.getByRole("menuitem", { name: item }).tap()
      const sheet = page.getByRole("dialog", { name })
      await expect(sheet).toBeVisible()
      await settle(sheet)
      expect.soft(await missed(sheet, CONTROLS), `${item.source}'s controls`).toEqual([])
      await page.keyboard.press("Escape")
      await expect(sheet).toBeHidden()
    }
  })
})

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const theme of ["light", "dark"] as const) {
    test(`a tool the keyboard takes draws a ring (V-915), ${theme}`, async ({ page }) => {
      await open(page, theme)
      const tool = page.locator(".App-toolbar .ToolIcon:has(input[data-testid='toolbar-rectangle'])")
      const icon = tool.locator(".ToolIcon__icon")
      const ring = () => icon.evaluate((el) => {
        const s = getComputedStyle(el)
        return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} | ${s.boxShadow}`
      })
      const before = await ring()
      await page.keyboard.press("Shift")
      await tool.locator("input").focus()
      await expect(tool.locator("input")).toBeFocused()
      const after = await ring()
      expect(after, `the focused tool draws a ring: ${before} -> ${after}`).not.toBe(before)
      expect(after, "a ring that shows").not.toMatch(/^none .* \| none$/)
    })
  }
})
