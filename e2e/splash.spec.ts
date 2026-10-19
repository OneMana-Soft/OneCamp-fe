import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"

import { stubBackend } from "./stubbedApp"
import { GROUND } from "../lib/pwa/grounds"

// The splash (17 Oct 2026; the owner: "make the initial splash screen for
// mobile and desktop look better", with a motion graphic). Checked where only
// a browser can: the first paint's real pixels before any of the app's code
// has run, the motion the browser actually runs, and the way into the app.

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 } }
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/**
 * An address opened with the app's code held back (its chunks are never
 * answered): what the first paint shows, and all it shows, for as long as
 * the code takes.
 */
async function firstPaint(browser: Browser, device: BrowserContextOptions, scheme: "light" | "dark", path: string, storage: Record<string, string> = {}, reduced = false) {
  const context = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference" })
  await context.addInitScript((kept) => {
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v)
  }, storage)
  await context.route(/\/_next\/static\/chunks\/.*\.js/, () => {})
  const page = await context.newPage()
  await page.goto(path, { waitUntil: "commit" })
  await page.locator("[data-app-boot-screen]").waitFor({ state: "visible", timeout: 60_000 })
  return { context, page }
}

/** The screenshot's share of near-white pixels, and the mean colour of a corner far from the glow and the scene. */
async function pixels(page: Page) {
  const png = await page.screenshot()
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.width
    canvas.height = img.height
    const g = canvas.getContext("2d")!
    g.drawImage(img, 0, 0)
    const { data, width, height } = g.getImageData(0, 0, img.width, img.height)
    let bright = 0
    for (let i = 0; i < data.length; i += 4) {
      if ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 > 0.9) bright++
    }
    const sum = [0, 0, 0]
    let n = 0
    for (let y = height - 48; y < height - 16; y++) {
      for (let x = width - 48; x < width - 16; x++) {
        const i = (y * width + x) * 4
        sum[0] += data[i]
        sum[1] += data[i + 1]
        sum[2] += data[i + 2]
        n++
      }
    }
    return { bright: bright / (width * height), corner: sum.map((v) => Math.round(v / n)) }
  }, png.toString("base64"))
}

const near = (got: number[], want: number[], within: number) => got.every((v, i) => Math.abs(v - want[i]) <= within)

for (const [name, device, ground] of [
  ["phone", PHONE, "phone"],
  ["desktop", DESKTOP, "wide"],
] as const) {
  // A dark app that started on white (or the browser's bar a light band over
  // it) was the flash this guards. The phone's ground has no grain; the
  // frame's 3.5% grain moves a corner a few levels.
  test(`a dark app's first paint is dark, the browser's bar too (${name})`, async ({ browser }) => {
    const { context, page } = await firstPaint(browser, device, "dark", "/app/home")
    const { bright, corner } = await pixels(page)
    expect(bright, "near-white share of the first paint").toBeLessThan(0.01)
    expect(near(corner, rgb(GROUND.dark[ground]), 8), `corner ${corner} on ${GROUND.dark[ground]}`).toBe(true)
    const bars = await page.$$eval('meta[name="theme-color"]', (ms) => [...new Set(ms.map((m) => m.getAttribute("content")))])
    expect(bars).toEqual([GROUND.dark[ground]])
    await context.close()
  })

  test(`a light app's first paint is its light ground (${name})`, async ({ browser }) => {
    const { context, page } = await firstPaint(browser, device, "light", "/app/home")
    const { corner } = await pixels(page)
    expect(near(corner, rgb(GROUND.light[ground]), 8), `corner ${corner} on ${GROUND.light[ground]}`).toBe(true)
    await context.close()
  })
}

// The mode chosen in the app, not the system's: next-themes has set it on
// <html> before the splash is parsed, and the boot script gives the bar the
// same ground.
test("dark chosen in the app starts dark on a light system", async ({ browser }) => {
  const { context, page } = await firstPaint(browser, PHONE, "light", "/app/home", { "ui-theme": "dark" })
  const { bright, corner } = await pixels(page)
  expect(bright).toBeLessThan(0.01)
  expect(near(corner, rgb(GROUND.dark.phone), 3), `corner ${corner}`).toBe(true)
  const bars = await page.$$eval('meta[name="theme-color"]', (ms) => [...new Set(ms.map((m) => m.getAttribute("content")))])
  expect(bars).toEqual([GROUND.dark.phone])
  await context.close()
})

// The installed app and the desktop app open the start page: in a browser a
// member has used, it is the splash from its first paint too.
test("a member's start page paints the splash first", async ({ browser }) => {
  const { context, page } = await firstPaint(browser, DESKTOP, "dark", "/", { "onecamp:member": "1" })
  await expect(page.locator("[data-app-boot-screen]")).toBeVisible()
  await context.close()
})

test("under reduced motion the first paint is the whole scene, still", async ({ browser }) => {
  const { context, page } = await firstPaint(browser, DESKTOP, "light", "/app/home", {}, true)
  const scene = await page.evaluate(() => {
    const boot = document.querySelector("[data-app-boot-screen]")!
    const shown = (sel: string) => getComputedStyle(boot.querySelector(sel)!).display !== "none"
    return {
      moving: document.getAnimations().filter((a) => boot.contains((a.effect as KeyframeEffect | null)?.target as Node)).length,
      ring: shown(".ss-ring"),
      arcs: shown(".ss-arc"),
      spark: Number(getComputedStyle(boot.querySelector(".ss-spark")!).opacity),
    }
  })
  expect(scene).toEqual({ moving: 0, ring: true, arcs: false, spark: 1 })
  await context.close()
})

// Every moving part is moved by transform and opacity, which the compositor
// runs by itself while the app's code loads and parses.
test("the motion graphic runs on transform and opacity alone", async ({ browser }) => {
  const { context, page } = await firstPaint(browser, DESKTOP, "light", "/app/home")
  const found = await page.evaluate(() => {
    const boot = document.querySelector("[data-app-boot-screen]")!
    const mine = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target as Element | null
      return !!target && (boot === target || boot.contains(target))
    })
    const props = new Set<string>()
    for (const a of mine) {
      for (const frame of (a.effect as KeyframeEffect).getKeyframes()) {
        for (const key of Object.keys(frame)) if (!["offset", "computedOffset", "easing", "composite"].includes(key)) props.add(key)
      }
    }
    return { count: mine.length, props: [...props].sort() }
  })
  expect(found.count, "the scene's animations").toBeGreaterThanOrEqual(8)
  expect(found.props).toEqual(["opacity", "transform"])
  await context.close()
})

/**
 * What was on screen, frame by frame, from the page's first paint (a frame
 * before it is never presented, so it is not logged).
 */
const WATCH = () => {
  const log: string[] = []
  ;(window as unknown as { __splashLog: string[] }).__splashLog = log
  const tick = () => {
    if (performance.getEntriesByType("paint").length === 0) {
      requestAnimationFrame(tick)
      return
    }
    const boot = document.documentElement.getAttribute("data-app-boot")
    const shown = (sel: string) => {
      const el = document.querySelector(sel)
      return !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    }
    const state = `${boot ?? "-"}|${shown("[data-app-viewport]") ? "shell" : ""}|${shown("[data-trust-line]") ? "signin" : ""}`
    if (log[log.length - 1] !== state) log.push(state)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

test("a member's start page goes straight into the app on the splash, never through the sign-in page", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("onecamp:member", "1"))
  await page.addInitScript(WATCH)
  await stubBackend(page, testInfo)
  await page.goto("/", { waitUntil: "commit", timeout: 120_000 })
  await page.waitForURL(/\/app\//, { timeout: 60_000 })
  await expect(page.locator("[data-app-viewport]")).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-app-boot")), { timeout: 10_000 }).toBe(false)
  const log = await page.evaluate(() => (window as unknown as { __splashLog: string[] }).__splashLog)
  // The sign-in page's placeholder is drawn under the splash while it asks,
  // and the splash covers the screen: it is seen only with no splash over it,
  // or one fading.
  expect(log.filter((s) => s.endsWith("|signin") && /^(-|leaving)\|/.test(s)), log.join(" > ")).toEqual([])
  // On the splash from the first frame the page drew ("-" is no splash).
  expect(log[0].startsWith("-|"), log.join(" > ")).toBe(false)
})

test("the splash fades over the app, which is drawn before it starts to go", async ({ page }, testInfo) => {
  await page.addInitScript(WATCH)
  await stubBackend(page, testInfo)
  await page.goto("/app/home", { waitUntil: "commit", timeout: 120_000 })
  await expect(page.locator("[data-app-viewport]")).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-app-boot")), { timeout: 10_000 }).toBe(false)
  const log = await page.evaluate(() => (window as unknown as { __splashLog: string[] }).__splashLog)
  const leaving = log.findIndex((s) => s.startsWith("leaving|"))
  expect(leaving, log.join(" > ")).toBeGreaterThan(-1)
  // The app is under it, whole, from the first frame of the fade; never a
  // frame with neither.
  expect(log[leaving], log.join(" > ")).toBe("leaving|shell|")
  expect(log.filter((s) => s === "-||"), log.join(" > ")).toEqual([])
})
