import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test"
import { reviewShot, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"

// A member at a dead link's door (29 Oct 2026): a room whose call was removed,
// or a meeting link that ended. The door's own read says the link is gone, so
// the member is told at once, as every dead link is told (the shared gone
// state, PublicGone, in the door's guest page's own words, with the way home),
// and nothing asks for the camera or the microphone: before this, the green
// room opened them for a link that could never join. Until the read answers,
// the door holds the call's shape and says what it is doing, as the guest
// door does (GuestNotYet). A live door still opens its green room.
// A member is in their own workspace, so their gone page leaves the guest
// page's "Made with OneCamp" off; a guest at the same dead door is told the
// same words, from the one module, under the credit (CR-86 SF1, SF2).
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

// The server has calls on: without them every /app/meet page says calling isn't set up.
const CALLS_ON = { "/config/client": { msg: "ok", data: { features: { calls: true } } } }
const GONE = withStatus(404, { msg: "This link is no longer available." })
const LIVE_ROOM = { msg: "ok", data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } }
const ROOM = {
  what: "a removed room",
  page: "/app/meet/join/r/design-review-gone",
  guest: "/r/design-review-gone",
  read: "/public/r/design-review-gone",
  shot: "room",
  heading: "This room doesn't exist or was deleted",
  detail: "Its owner may have closed it or given it a new address. Ask whoever invited you for the room's link.",
}
const LINK = {
  what: "an ended meeting link",
  page: "/app/meet/join/mt-ended-7f3k",
  guest: "/guest/m/mt-ended-7f3k",
  read: "/guest/meet/mt-ended-7f3k",
  shot: "link",
  heading: "This meeting link doesn't exist or was deleted",
  detail: "The meeting may have ended, or the invite expired or was turned off. Ask the host for a new link.",
}

/** Every getUserMedia the page makes, by the kinds it asks for ("audio+video"). */
async function countAsks(page: Page) {
  await page.addInitScript(() => {
    const asks: string[] = []
    Object.assign(window, { __asks: asks })
    const media = navigator.mediaDevices
    const ask = media.getUserMedia.bind(media)
    media.getUserMedia = (c?: MediaStreamConstraints) => {
      asks.push([c?.audio ? "audio" : "", c?.video ? "video" : ""].filter(Boolean).join("+"))
      return ask(c)
    }
  })
  return () => page.evaluate(() => (window as unknown as { __asks: string[] }).__asks)
}

/** A review shot in each review theme, switched in place: the app follows the system's scheme. */
async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** The shared gone state, in the door's guest page's words, with the member's way home and no Join. */
async function expectGone(page: Page, door: typeof ROOM) {
  const gone = page.locator("[data-public-gone]")
  await expect(gone.getByRole("heading", { name: door.heading })).toBeVisible({ timeout: 30_000 })
  await expect(gone.getByText(door.detail)).toBeVisible()
  await expect(gone.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/app/home")
  await expect(page.getByRole("button", { name: "Join now" })).toHaveCount(0)
  // A member is in their own workspace: no "Made with OneCamp" under it.
  await expect(page.locator("[data-made-with]")).toHaveCount(0)
}

/** The door before its read answers: the call's shape, saying what it is doing, with no Join. */
async function expectNotYet(page: Page, words: string) {
  await expect(page.getByRole("status").filter({ hasText: words })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Join now" })).toHaveCount(0)
}

for (const [device, use] of Object.entries(DEVICES)) {
  for (const door of [ROOM, LINK]) {
    test(`a member at ${door.what}'s door is told at once, in the shared gone state, and nothing asks for the camera, on a ${device}`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000)
      const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
      const page = await context.newPage()
      const asks = await countAsks(page)
      await stubBackend(page, testInfo, { ...CALLS_ON, [door.read]: GONE })
      await page.goto(door.page, { waitUntil: "domcontentloaded", timeout: 120_000 })

      await expectGone(page, door)
      // Nothing asked for the camera or the microphone, then or since.
      await page.waitForTimeout(1_500)
      expect(await asks()).toEqual([])
      await shotInThemes(page, `member-door-gone-${door.shot}`)
      await context.close()
    })

    test(`a guest at ${door.what}'s door is told the same words as a member, under the credit, on a ${device}`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000)
      const context = await browser.newContext({ ...use })
      const page = await context.newPage()
      await stubBackend(page, testInfo, { ...CALLS_ON, [door.read]: GONE })
      await page.goto(door.guest, { waitUntil: "domcontentloaded", timeout: 120_000 })

      const gone = page.locator("[data-public-gone]")
      await expect(gone.getByRole("heading", { name: door.heading })).toBeVisible({ timeout: 30_000 })
      await expect(gone.getByText(door.detail)).toBeVisible()
      await expect(page.locator("[data-made-with]")).toHaveCount(1)
      await shotInThemes(page, `guest-door-gone-${door.shot}`)
      await context.close()
    })
  }

  test(`a member at a live room's door gets its green room, which opens the camera and microphone, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const asks = await countAsks(page)
    await stubBackend(page, testInfo, { ...CALLS_ON, "/public/r/maya": LIVE_ROOM })
    await page.goto("/app/meet/join/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    await expect(page.getByRole("button", { name: "Join now" })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("Maya Chen's room").first()).toBeVisible()
    await expect.poll(async () => (await asks()).length, { message: "the green room asked for the camera and microphone", timeout: 30_000 }).toBeGreaterThan(0)
    await expect(page.locator("[data-public-gone]")).toHaveCount(0)
    await context.close()
  })

  test(`a member waits in the call's shape while the door's read is on its way, and nothing asks for the camera before it answers, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const asks = await countAsks(page)
    let answer = () => {}
    const answered = new Promise<void>((resolve) => (answer = resolve))
    await stubBackend(page, testInfo, { ...CALLS_ON, "/public/r/maya": () => answered.then(() => LIVE_ROOM) })
    await page.goto("/app/meet/join/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    await expectNotYet(page, "Checking the link…")
    await page.waitForTimeout(1_500)
    expect(await asks()).toEqual([])
    await shotInThemes(page, "member-door-checking")
    answer()
    await expect(page.getByRole("button", { name: "Join now" })).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await asks()).length, { message: "the green room asked once the door answered", timeout: 30_000 }).toBeGreaterThan(0)
    await context.close()
  })

  test(`a member at a door the server can't answer is told it is still trying, in the call's shape, with no camera ask, then gets the green room, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const asks = await countAsks(page)
    let reachable = false
    // No answer at all (the network failed) until the server is back.
    await stubBackend(page, testInfo, { ...CALLS_ON, "/public/r/maya": () => (reachable ? LIVE_ROOM : withStatus(0, {})) })
    await page.goto("/app/meet/join/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    await expectNotYet(page, "Couldn't reach the server, retrying…")
    await page.waitForTimeout(1_500)
    expect(await asks()).toEqual([])
    await shotInThemes(page, "member-door-retrying")
    reachable = true
    // The door asks again on its own (5 s or so after a failure, longer after each).
    await expect(page.getByRole("button", { name: "Join now" })).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await asks()).length, { message: "the green room asked once the door answered", timeout: 30_000 }).toBeGreaterThan(0)
    await context.close()
  })

  test(`a member whose live door is gone by Join is told in the same shared gone state, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    // The room's call is removed between the door's read and Join.
    await stubBackend(page, testInfo, { ...CALLS_ON, "/public/r/maya": LIVE_ROOM, "/calls/door": GONE })
    await page.goto("/app/meet/join/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    const join = page.getByRole("button", { name: "Join now" })
    await expect(join).toBeVisible({ timeout: 60_000 })
    await join.click()
    await expectGone(page, ROOM)
    await context.close()
  })
}
