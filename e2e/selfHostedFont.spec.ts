import { expect, test, type BrowserContextOptions, type Response } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// Inter is served from the app itself (app/inter.css, 22 Oct). Home asks the
// app's own /fonts for it, cached for good, and nothing else: no Google, and
// none of next/font's media files. The page draws in Inter, with the
// metrics-matched fallback behind it, on a computer and on a phone.

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }

for (const [name, options] of [
  ["computer", DESKTOP],
  ["phone", PHONE],
] as const) {
  test(`a ${name} draws Inter from the app's own /fonts, cached for good`, async ({ browser }, testInfo) => {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    await stubBackend(page, testInfo)
    const fonts: Response[] = []
    page.on("response", (r) => {
      if (r.request().resourceType() === "font") fonts.push(r)
    })
    await page.goto("/app/home", { waitUntil: "load" })

    // The face a 14px label asks for resolves to a loaded file.
    expect(await page.evaluate(() => document.fonts.load('14px "Inter"').then((faces) => faces.map((f) => f.status)))).toEqual(["loaded"])
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Inter"?, "?Inter Fallback"?/)
    const paths = fonts.map((r) => new URL(r.url()).pathname)
    expect(paths).toContainEqual(expect.stringMatching(/^\/fonts\/inter\/inter-latin\.[0-9a-f]{8}\.woff2$/))
    expect(paths.filter((p) => !p.startsWith("/fonts/inter/"))).toEqual([])
    for (const r of fonts) {
      expect(r.status()).toBe(200)
      expect(r.headers()["cache-control"]).toContain("immutable")
    }
    await context.close()
  })
}
