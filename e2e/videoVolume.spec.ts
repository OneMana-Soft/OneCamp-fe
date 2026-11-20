import { expect, test, type Locator, type Page } from "@playwright/test"

import { finger } from "./finger"
import { boxOf, errorsOf, onTaskPage, type Box } from "./lightboxVideo"
import { reviewShot } from "./stubbedApp"

// The video player's volume slider sits by Mute and showed only while a
// mouse hovered the player (V-1162). Tailwind draws group-hover only where the
// device can hover, so on a tablet or a phone, and by keyboard, the volume
// could only be muted or unmuted, never set. Here a finger and a keyboard set
// it, and the controls bar still fits its player with the slider shown. At
// 1280 a mouse over the player still shows it (no regression).

const VOLUME_BAR = /^(Mute|Unmute)$/

/** Mute (or Unmute) and the volume slider beside it, found whether it shows or not. */
function volumeOf(page: Page) {
  const mute = page.locator("[data-lightbox]").getByRole("button", { name: VOLUME_BAR })
  const thumb = mute.locator("xpath=..").locator('[role="slider"]')
  return { mute, thumb, track: thumb.locator("xpath=ancestor::div[1]") }
}

/** What the video itself plays at: its volume and whether it's muted. */
const sound = (page: Page) =>
  page.locator("[data-lightbox] video").evaluate((v: HTMLVideoElement) => ({ volume: Math.round(v.volume * 100) / 100, muted: v.muted }))

/** The time readout, "0:00 / 0:02". */
const timeOf = (page: Page) => page.locator("[data-lightbox]").getByText(/^\d+:\d\d \/ \d+:\d\d$/)

/** The thumb's value, as the slider tells it. */
const valueOf = async (thumb: Locator) => Number(await thumb.getAttribute("aria-valuenow"))

/** Every control in the bar under the seek bar stands inside the player, side by side, and the page doesn't scroll sideways. */
/** On a phone the volume slider stands over Mute instead, under the seek bar. */
async function barFits(page: Page, phone = false) {
  const box = page.locator("[data-lightbox]")
  const player = await boxOf(box.locator("video").locator("xpath=.."))
  const { mute, track } = volumeOf(page)
  const parts: { name: string; box: Box }[] = [
    { name: "Skip back", box: await boxOf(box.getByRole("button", { name: "Skip back 10 seconds", exact: true })) },
    { name: "Play", box: await boxOf(box.getByRole("button", { name: "Play", exact: true })) },
    { name: "Skip forward", box: await boxOf(box.getByRole("button", { name: "Skip forward 10 seconds", exact: true })) },
    { name: "Time", box: await boxOf(timeOf(page)) },
    { name: "Mute", box: await boxOf(mute) },
    ...(phone ? [] : [{ name: "Volume", box: await boxOf(track) }]),
    { name: "Playback settings", box: await boxOf(box.getByRole("button", { name: "Playback settings", exact: true })) },
    { name: "Fullscreen", box: await boxOf(box.getByRole("button", { name: "Enter fullscreen", exact: true })) },
  ]
  const outside = parts.filter(({ box: b }) => b.x < player.x - 0.5 || b.x + b.width > player.x + player.width + 0.5).map((p) => p.name)
  expect(outside, `every control stands inside the player (x ${Math.round(player.x)}..${Math.round(player.x + player.width)})`).toEqual([])
  const crowded = parts.slice(1).filter((p, i) => p.box.x < parts[i].box.x + parts[i].box.width - 0.5).map((p, i) => `${parts[i].name}|${p.name}`)
  expect(crowded, "each control keeps clear of the one before it").toEqual([])
  if (phone) {
    // The seek bar's root holds its thumb (a thumb sits in a span of its own inside the root).
    const seek = await boxOf(box.getByRole("slider").first().locator("xpath=../.."))
    const m = await boxOf(mute)
    const v = await boxOf(track)
    const t = await boxOf(volumeOf(page).thumb)
    // A thumb reaches 22 px round its centre under a finger (phone.css F3): that
    // reach stays off the seek bar's line and off Mute's and Settings' centres.
    const reach = { top: t.y + t.height / 2 - 22, bottom: t.y + t.height / 2 + 22 }
    expect(
      {
        inside: v.x >= player.x - 0.5 && v.x + v.width <= player.x + player.width + 0.5,
        underSeek: t.y >= seek.y + seek.height - 0.5 && reach.top > seek.y + seek.height / 2,
        overMute: t.y + t.height <= m.y + 0.5 && reach.bottom < m.y + m.height / 2,
        centred: Math.abs(v.x + v.width / 2 - (m.x + m.width / 2)) <= 1,
      },
      "on a phone the volume slider stands over Mute, inside the player and clear of the seek bar",
    ).toEqual({ inside: true, underSeek: true, overMute: true, centred: true })
  }
  const sideways = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
  expect(sideways, "the page doesn't scroll sideways").toBeLessThanOrEqual(0)
}

const SIZES = [
  { name: "an iPad Air in portrait, 820", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }, phone: false },
  { name: "a tablet in portrait, 768", use: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true }, phone: false },
  { name: "a phone, 390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, phone: true },
]

for (const size of SIZES) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`the lightbox video's volume on ${size.name}, ${theme}`, () => {
      test.use(size.use)

      test("a finger reaches the volume slider by Mute and drags it, and the bar still fits", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await onTaskPage(page, testInfo, theme, true)
        const { mute, thumb, track } = volumeOf(page)
        // No hover to reveal it, so it shows from the start: beside Mute on a
        // tablet, over Mute on a phone (no room beside it), the time kept whole.
        await expect(thumb, "a finger's device shows the volume slider from the start").toBeVisible()
        await expect(timeOf(page)).toBeVisible()
        await barFits(page, size.phone)
        // A tap on Mute mutes (the slider drops to 0), and nothing moves under the finger.
        const m = await boxOf(mute)
        await page.touchscreen.tap(m.x + m.width / 2, m.y + m.height / 2)
        await expect(page.locator("[data-lightbox]").getByRole("button", { name: "Unmute", exact: true }), "Mute took the tap").toBeVisible()
        await expect.poll(() => sound(page)).toEqual({ volume: 1, muted: true })
        const after = await boxOf(mute)
        expect(Math.abs(after.x - m.x) + Math.abs(after.y - m.y), "nothing moved under the finger").toBeLessThan(1)
        await expect(thumb).toBeVisible()
        await barFits(page, size.phone)
        await reviewShot(page, "v1162-volume", theme)
        // A finger drags it three quarters along: the video plays out loud at that.
        const t = await boxOf(thumb)
        const r = await boxOf(track)
        const to = r.x + r.width * 0.75
        const f = await finger(page)
        await f.down(t.x + t.width / 2, t.y + t.height / 2)
        for (let i = 1; i <= 6; i++) await f.move(t.x + t.width / 2 + ((to - t.x - t.width / 2) * i) / 6, t.y + t.height / 2)
        await f.up()
        await expect.poll(() => valueOf(thumb), { message: "the slider moved under the finger" }).toBeGreaterThan(0.5)
        const heard = await sound(page)
        expect(heard.muted, "dragging the volume up unmutes the video").toBe(false)
        expect(heard.volume).toBeGreaterThan(0.5)
        expect(heard.volume).toBeLessThan(0.95)
        expect(errorsOf.get(page), "the page raises no error of its own").toEqual([])
      })
    })
  }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`the lightbox video's volume on a desktop, 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test("the keyboard reaches the volume slider from Mute and moves it; a mouse over Mute still shows it", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await onTaskPage(page, testInfo, theme, false)
      const { mute, thumb, track } = volumeOf(page)
      // By keyboard alone, the mouse well away from the player.
      await page.mouse.move(1, 1)
      await page.locator("[data-lightbox]").getByRole("button", { name: "Skip forward 10 seconds", exact: true }).focus()
      await page.keyboard.press("Tab")
      await expect(mute).toBeFocused()
      await expect(thumb, "the volume slider shows while the keyboard is on Mute").toBeVisible()
      await page.keyboard.press("Tab")
      await expect(thumb, "Tab goes on from Mute to the volume slider").toBeFocused()
      for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft")
      await expect.poll(() => valueOf(thumb)).toBe(0.9)
      await expect.poll(() => sound(page)).toEqual({ volume: 0.9, muted: false })
      await barFits(page)
      await reviewShot(page, "v1162-volume-keyboard", theme)
      // A mouse over Mute shows it too (the old way), and drags it to a quarter.
      await thumb.blur()
      await mute.hover()
      await expect(thumb, "a mouse over Mute shows the volume slider").toBeVisible()
      const t = await boxOf(thumb)
      const r = await boxOf(track)
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
      await page.mouse.down()
      await page.mouse.move(r.x + r.width * 0.25, t.y + t.height / 2, { steps: 6 })
      await page.mouse.up()
      await expect.poll(() => valueOf(thumb), { message: "the slider moved under the mouse" }).toBeLessThan(0.4)
      const heard = await sound(page)
      expect(heard.volume).toBeGreaterThan(0.1)
      expect(heard.volume).toBeLessThan(0.4)
      await reviewShot(page, "v1162-volume", theme)
      // The seek bar keeps its arrows too, and the lightbox's own arrows still
      // page the set from anywhere else (here from Mute, a button).
      const lightbox = page.locator("[data-lightbox]")
      const at = () => lightbox.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)
      const from = await at()
      await lightbox.getByRole("slider").first().focus()
      await page.keyboard.press("ArrowRight")
      await expect.poll(at, { message: "the seek bar stepped on its arrow" }).toBeGreaterThan(from)
      await expect(lightbox.locator("video"), "the seek bar's arrow left the video on the stage").toHaveCount(1)
      await mute.focus()
      await page.keyboard.press("ArrowRight")
      await expect(lightbox.locator("video"), "the lightbox's arrow still moves on to the next file").toHaveCount(0)
      await page.keyboard.press("ArrowLeft")
      await expect(lightbox.locator("video"), "and back to the video").toHaveCount(1)
      expect(errorsOf.get(page), "the page raises no error of its own").toEqual([])
    })
  })
}
