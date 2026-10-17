import { readFileSync } from "node:fs"
import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// The demo's free offer on Home's first screen (15 Oct 2026): the median demo
// visit lasted 55 seconds, and the offer used to wait ninety. In the demo build
// it is on the first screen, whole, at 1280 x 800 and on a 390 x 664 phone (an
// iPhone 13's page), clear of the phone's tab bar; in any other build, a
// customer's, it is nowhere, and neither is the guide it sits with.
//
// Which build this is: NEXT_PUBLIC_DEMO_MODE as the suite's environment sets
// it, else as the repository's .env.production does, which next build reads.
// A customer's repository has no such line, so this checks the absence there.
function demoBuild(): boolean {
  const set = process.env.NEXT_PUBLIC_DEMO_MODE
  if (set !== undefined) return set === "true"
  try {
    return /^NEXT_PUBLIC_DEMO_MODE=true\s*$/m.test(readFileSync(".env.production", "utf8"))
  } catch {
    return false
  }
}

const SIZES = [
  { name: "on a 1280 x 800 screen", viewport: { width: 1280, height: 800 }, isMobile: false },
  { name: "on a 390 x 664 phone", viewport: { width: 390, height: 664 }, isMobile: true },
]

/** A first visit: no guide progress, nothing turned down. */
async function firstVisit(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear()
    } catch {
      /* storage blocked: still a first visit */
    }
  })
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.isMobile })

    test(demoBuild() ? "Home's first screen offers OneCamp free" : "Home offers nothing of the demo's", async ({ page }, testInfo) => {
      await firstVisit(page)
      await stubBackend(page, testInfo)
      await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator("[data-home]").first()).toBeVisible({ timeout: 30_000 })

      const offer = page.locator("[data-demo-free-offer]")
      if (demoBuild()) {
        await expect(offer).toHaveCount(1, { timeout: 15_000 })
        await expect(offer).toBeInViewport({ ratio: 1 })
        const way = offer.getByRole("link", { name: /^Get it free/ })
        await expect(way).toBeInViewport({ ratio: 1 })
        expect(new URL((await way.getAttribute("href")) ?? "").pathname).toBe("/free")
        expect(await way.getAttribute("target")).toBe("_blank")
        // In the viewport is not on the screen where a bar sits over its foot.
        const tabs = page.getByRole("navigation", { name: "Primary" })
        if (size.isMobile && (await tabs.isVisible())) {
          const [o, t] = [await offer.boundingBox(), await tabs.boundingBox()]
          expect(o!.y + o!.height, "the offer runs under the tab bar").toBeLessThanOrEqual(t!.y)
        }
      } else {
        // Home has drawn; give its client effects a moment, then look.
        await page.waitForTimeout(1500)
        await expect(offer).toHaveCount(0)
        await expect(page.locator("[data-demo-guide], [data-demo-guide-offer]")).toHaveCount(0)
      }
    })
  })
}

// The way in keeps the marketing site's visit id, so the free plan's own steps
// on the site ("opened the free plan", "took the install command on the spot")
// count the click against the visit that led to it; and a browser that asked
// not to be tracked carries nothing on and sends nothing. Every request leaves
// for the stub, never the funnel's real endpoint, and nothing here opens the
// link (its new tab would reach the real site).
test.describe("the free offer's visit id", () => {
  test.skip(!demoBuild(), "the demo build's funnel only")
  test.use({ viewport: { width: 1280, height: 800 } })

  /** Home, arrived at from a marketing-site demo link; the funnel's beacons, as they go out. */
  async function arrive(page: Page, testInfo: TestInfo): Promise<string[]> {
    const beacons: string[] = []
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.endsWith("/onecamp/track")) beacons.push(r.postData() ?? "")
    })
    await firstVisit(page)
    await stubBackend(page, testInfo)
    await page.goto("/app/home?vid=e2e-visit-1", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-demo-free-offer]")).toHaveCount(1, { timeout: 30_000 })
    // Taken off the address bar either way: a copied link mustn't carry it.
    await expect.poll(() => new URL(page.url()).searchParams.get("vid")).toBeNull()
    return beacons
  }
  const visitIn = async (page: Page) =>
    new URL((await page.locator("[data-free-offer-action]").getAttribute("href")) ?? "").searchParams.get("vid")

  test("rides the link to the free plan", async ({ page }, testInfo) => {
    const beacons = await arrive(page, testInfo)
    expect(await visitIn(page)).toBe("e2e-visit-1")
    // The funnel is on in this build: the arrival went out, with the id.
    await expect.poll(() => beacons.some((b) => b.includes('"visitor_id":"e2e-visit-1"'))).toBe(true)
  })

  for (const [name, prop, value] of [
    ["Global Privacy Control", "globalPrivacyControl", true],
    ["Do Not Track", "doNotTrack", "1"],
  ] as const) {
    test(`carries no visit id with ${name} on, and nothing is sent`, async ({ page }, testInfo) => {
      await page.addInitScript(([p, v]) => Object.defineProperty(navigator, p, { get: () => v, configurable: true }), [prop, value] as const)
      const beacons = await arrive(page, testInfo)
      expect(await visitIn(page)).toBeNull()
      // Long enough for the arrival and Home's step to have gone, were they going.
      await page.waitForTimeout(1500)
      expect(beacons).toEqual([])
    })
  }
})
