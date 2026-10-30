import { expect, test, type Locator } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A table's URL cell reads its text as people type a web address (lib/links/webURL's typedWebURL):
// https:// may be left off and a port is kept, and another kind of address is shown as typed, with no link.
// Only a cell that links looks like one (DB-25, 28 Oct): the brand colour, underlined under the pointer;
// one that doesn't is ink, with the grid's invalid mark.

const COL = { name: "c0000000-0000-4000-8000-000000000001", site: "c0000000-0000-4000-8000-000000000002" }
const colour = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color)
const underline = (l: Locator) => l.evaluate((el) => getComputedStyle(el).textDecorationLine)

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const phone = viewport.width < 600
  test(`at ${viewport.width}, a URL cell links what's typed as a web address, and looks like a link only then`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const server = new TableServer(
      [
        { id: COL.name, name: "Vendor", type: "text" },
        { id: COL.site, name: "Site", type: "url" },
      ],
      [
        { [COL.name]: "Acme", [COL.site]: "example.com:8080/board" },
        { [COL.name]: "Mail", [COL.site]: "mailto:team@example.com" },
        { [COL.name]: "Full", [COL.site]: "https://www.example.org/a" },
      ],
    )
    server.name = "Vendors"
    const sam = await server.open(browser, testInfo, SAM, { viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
    const { page } = sam
    const row = (name: string) => page.locator("tbody tr[data-row]").filter({ hasText: name })
    await expect(row("Acme")).toBeVisible({ timeout: 30_000 })
    await expect(row("Acme")).toContainText("example.com:8080")
    // The cell's face at rest is aria-hidden (its box holds the value for a screen reader), so its link is read by its label.
    const open = (name: string, host: string) => row(name).locator(`a[aria-label="Open ${host}"]`)
    await expect(open("Acme", "example.com:8080")).toHaveAttribute("href", "https://example.com:8080/board")
    await expect(open("Full", "example.org")).toHaveAttribute("href", "https://www.example.org/a")
    await expect(row("Mail")).toContainText("mailto:team@example.com")
    await expect(row("Mail").locator('a[aria-label^="Open "]')).toHaveCount(0)

    const typed = row("Acme").getByText("example.com:8080", { exact: true })
    const full = row("Full").getByText("example.org", { exact: true })
    const mail = row("Mail").getByText("mailto:team@example.com", { exact: true })
    const link = await colour(typed)
    expect(await colour(full)).toBe(link)
    expect(await colour(mail)).not.toBe(link)
    if (!phone) {
      // The face lets the pointer through to its cell, whose hover draws the underline.
      await mail.hover({ force: true })
      expect(await underline(mail)).toBe("none")
      await typed.hover({ force: true })
      expect(await underline(typed)).toBe("underline")
    }
    for (const theme of SHOT_THEMES) {
      await page.emulateMedia({ colorScheme: theme })
      await reviewShot(page, "urlCells", theme)
    }
    await sam.close()
  })
}
