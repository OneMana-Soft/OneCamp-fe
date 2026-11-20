import { expect, test, type Page } from "@playwright/test"

import { boxOf, errorsOf, onTaskPage, type Box } from "./lightboxVideo"
import { reviewShot } from "./stubbedApp"

// A toast stands clear of a full-screen overlay's own foot controls from sm up
// (V-1139). The lightbox's video player draws its controls along the stage's
// foot, edge to edge: its seek bar, then Skip back, Play and Skip forward at
// the left end and Mute, Playback settings and Enter fullscreen at the right.
// A toast raised while a video was open sat bottom right, 24px off the foot,
// over the right end, and above the dialog (--z-toast over --z-modal) took the
// presses meant for those controls, at tablet widths and at 1280 alike. The
// toast here is the app's own: the lightbox reads the next file's address
// ahead, that read fails, and the failure is told. On a phone the lightbox is
// a sheet and toasts come in at the top (app/phone.css C9): the guard. With the
// document open the stage has no foot controls of its own: the toast keeps its
// own place and covers nothing (the second guard).

const meets = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const span = (b: Box) => `x ${Math.round(b.x)}..${Math.round(b.x + b.width)} y ${Math.round(b.y)}..${Math.round(b.y + b.height)}`

const CONTROLS = ["Skip back 10 seconds", "Play", "Skip forward 10 seconds", "Mute", "Playback settings", "Enter fullscreen"] as const

/** The video's foot controls by name (the seek bar's whole track as "Seek"), each with its box. */
async function footControls(page: Page) {
  const box = page.locator("[data-lightbox]")
  const named = await Promise.all(
    CONTROLS.map(async (name) => ({ name: name as string, box: await boxOf(box.getByRole("button", { name, exact: true })) })),
  )
  const seek = await box.getByRole("slider").first().evaluate((thumb) => {
    const r = thumb.parentElement!.parentElement!.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  return [{ name: "Seek", box: seek }, ...named]
}

/** What a press at each box's centre reaches: the closest labelled control there. */
const reached = (page: Page, boxes: { name: string; box: Box }[]) =>
  Promise.all(boxes.map(({ name, box: b }) =>
    page.evaluate(({ x, y, name }) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      if (name === "Seek") return el.closest("[data-orientation]") && !el.closest(".toast-root") ? "Seek" : el.className.toString().slice(0, 40)
      const button = el.closest("button")
      return button ? button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "" : el.className.toString().slice(0, 40)
    }, { x: b.x + b.width / 2, y: b.y + b.height / 2, name }),
  ))

async function press(page: Page, touch: boolean, name: string) {
  const b = await boxOf(page.locator("[data-lightbox]").getByRole("button", { name, exact: true }))
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2]
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

async function toastUp(page: Page) {
  const toast = page.locator(".toast-root[data-state='open']").filter({ hasText: /went wrong|couldn|error/i }).first()
  await expect(toast, "the read ahead's failure is told").toBeVisible({ timeout: 30_000 })
  // Settled: the toast's way in has ended (two reads alike).
  let last = ""
  await expect.poll(async () => { const now = JSON.stringify(await boxOf(toast)); const same = now === last; last = now; return same }, { intervals: [200] }).toBe(true)
  return toast
}

async function standsClear(page: Page, touch: boolean, theme: string) {
  const toast = await toastUp(page)
  // Measured first: an error toast stays 6s.
  const t = await boxOf(toast)
  const controls = await footControls(page)
  const reach = await reached(page, controls)
  const mark = await page.evaluate(() => [document.documentElement.hasAttribute("data-overlay-foot"), getComputedStyle(document.documentElement).getPropertyValue("--overlay-foot")])
  await reviewShot(page, "v1139-video-toast", theme)
  const size = `${page.viewportSize()?.width}x${page.viewportSize()?.height}`
  console.log(`V1139 ${size} ${theme}: toast ${span(t)}; mark ${JSON.stringify(mark)}; ${controls.map((c) => `${c.name} ${span(c.box)}`).join("; ")}; presses reach ${JSON.stringify(reach)}; page errors ${JSON.stringify(errorsOf.get(page))}`)
  const covered = controls.filter((c) => meets(t, c.box)).map((c) => `${c.name} (${span(c.box)})`)
  expect(covered, `the toast (${span(t)}) stands clear of the video's foot controls`).toEqual([])
  expect(reach, "a press at each foot control's centre reaches that control").toEqual(controls.map((c) => c.name))
  // A real press: Mute mutes, and the lightbox stays open.
  await press(page, touch, "Mute")
  await expect(page.locator("[data-lightbox]").getByRole("button", { name: "Unmute", exact: true }), "Mute took its press").toBeVisible()
  await expect(page.locator("[data-lightbox]")).toBeVisible()
}

/** With the document on the stage: nothing holds the foot, and the toast covers none of the lightbox's controls. */
async function documentLeftAlone(page: Page, touch: boolean, theme: string) {
  await toastUp(page)
  await press(page, touch, "Next")
  const box = page.locator("[data-lightbox]")
  await expect(box.locator("video")).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-overlay-foot")), { message: "the video let the foot go" }).toBe(false)
  const toast = await toastUp(page)
  const t = await boxOf(toast)
  const buttons = await box.getByRole("button").evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: { x: r.x, y: r.y, width: r.width, height: r.height } } })
      .filter((b) => b.box.width > 0 && b.box.height > 0 && b.name))
  const reach = await reached(page, buttons)
  await reviewShot(page, "v1139-document-toast", theme)
  console.log(`V1139 DOC ${page.viewportSize()?.width}x${page.viewportSize()?.height} ${theme}: toast ${span(t)}; ${buttons.map((b) => `${b.name} ${span(b.box)}`).join("; ")}; reach ${JSON.stringify(reach)}`)
  expect(reach, "a press at each of the lightbox's controls reaches it").toEqual(buttons.map((b) => b.name))
  await expect(box).toBeVisible()
}

const SIZES = [
  { name: "a tablet in portrait, 768", use: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true } },
  { name: "an iPad Air in portrait, 820", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
  { name: "a desktop, 1280", use: { viewport: { width: 1280, height: 800 } } },
  { name: "a phone, 390 (guard)", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
]

for (const size of SIZES) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`a toast over the lightbox's video on ${size.name}, ${theme}`, () => {
      test.use(size.use)

      test("stands clear of the video's foot controls, and each control takes its own press", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const touch = !!size.use.hasTouch
        await onTaskPage(page, testInfo, theme, touch)
        await standsClear(page, touch, theme)
        // V-1160: a video that won't load raised "Failed to load video" here, unhandled.
        expect(errorsOf.get(page), "the page raises no error of its own").toEqual([])
      })
    })
  }
}

test.describe("a toast over the lightbox's document on a tablet, 768 (guard)", () => {
  test.use(SIZES[0].use)

  test("keeps its own place, and covers none of the lightbox's controls", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await onTaskPage(page, testInfo, "light", true)
    await documentLeftAlone(page, true, "light")
    expect(errorsOf.get(page), "the page raises no error of its own").toEqual([])
  })
})
