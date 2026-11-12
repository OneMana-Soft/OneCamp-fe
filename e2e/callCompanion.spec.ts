import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShot, SAM, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"

// Companion mode, present only and Switch here (meet-04), at the web's edge:
// the echo proof. Whatever the other device does, this page never has two of
// its joins publish a microphone: Switch here joins as the person, the moved
// screen never joins again by itself, a companion publishes nothing, and
// present only publishes its screen and nothing else. The server clamps a
// companion's grant as well (backend calls_companion_test.go); this proves
// the web never asks.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000c4"
const SID = "5e550000-0000-4000-8000-0000000000c4"
// A member's LiveKit identity is their graph uid; a companion's is the server's "<uid>~c~<12 hex>".
const UID = "0x5a"
const COMPANION = `${UID}~c~0123456789ab`
const YOU: FakePerson = { identity: UID, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const PRIYA: FakePerson = { identity: "0x9a", name: "Priya Shah" }
/** A call token as LiveKit's: it names your part (sub) and your name. */
const tokenFor = (sub: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const inCall = (identity: string, user_uuid: string, name: string) => ({ identity, user_uuid, name, role: "participant", in_call: true })

/** A channel's call going on with Priya in it, and you in it on another device when elsewhere; every companion-token ask kept. */
async function greenRoom(page: Page, testInfo: TestInfo, o: { elsewhere: boolean; refuse?: boolean }) {
  const asked: string[] = []
  const people = [inCall(PRIYA.identity, "9a1c0000-0000-4000-8000-0000000000a1", PRIYA.name), ...(o.elsewhere ? [inCall(UID, SAM.user_uuid, SAM.user_full_name)] : [])]
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: tokenFor(UID) } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people }, you: { role: "participant", can: [] } } },
    [`/calls/${SID}/companion-token`]: () => {
      asked.push("companion-token")
      return o.refuse
        ? withStatus(409, { code: "call_not_started", msg: "Nobody is in this call yet. Join it instead." })
        : { msg: "ok", data: { token: tokenFor(COMPANION), room: "fake-call", session: SID } }
    },
  })
  const server = await fakeCallServer(page, { you: YOU, others: [PRIYA], youByToken: true })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { server, asked }
}

/** Present only's picker, answered with a drawn screen; on a phone there is none, as on every phone browser today. */
async function screenPicker(page: Page, phone: boolean) {
  await page.addInitScript((phone: boolean) => {
    if (phone) {
      delete (MediaDevices.prototype as { getDisplayMedia?: unknown }).getDisplayMedia
      return
    }
    MediaDevices.prototype.getDisplayMedia = async function () {
      const canvas = Object.assign(document.createElement("canvas"), { width: 640, height: 360 })
      const g = canvas.getContext("2d")!
      const draw = () => {
        g.fillStyle = "#3d6b8f"
        g.fillRect(0, 0, 640, 360)
        requestAnimationFrame(draw)
      }
      draw()
      return canvas.captureStream(15)
    }
  }, phone)
}

async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** Every button in `within` lies wholly inside the window: none is cut off at its foot or side. */
async function allInWindow(page: Page, within: Locator) {
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight])
  const buttons = await within.getByRole("button").all()
  expect(buttons.length, "actions to check").toBeGreaterThan(0)
  for (const b of buttons) {
    const box = (await b.boundingBox())!
    const name = await b.innerText()
    expect([box.x >= 0, box.y >= 0, box.x + box.width <= w, box.y + box.height <= h], `"${name}" inside the ${w}x${h} window`).toEqual([true, true, true, true])
  }
}

/** A companion's own room says what it is beside the place pill, and a screen reader reads it (nothing hides it). */
async function modeSays(page: Page, words: string) {
  const mode = page.locator("[data-companion-mode]")
  await expect(mode).toHaveText(words, { timeout: 30_000 })
  expect(await mode.evaluate((el) => !!el.closest("[aria-hidden='true']")), "the mode is read out").toBe(false)
}

/** Joins that published a microphone, of every join so far. */
const micJoins = (server: Awaited<ReturnType<typeof fakeCallServer>>) => server.publishedByJoin().filter((sources) => sources.includes("MICROPHONE")).length

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = (target: Locator) => (touch ? target.tap({ timeout: 60_000 }) : target.click({ timeout: 60_000 }))

    test("after Switch here and with a companion joined, only one join ever published a microphone", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await screenPicker(page, touch)
      const { server, asked } = await greenRoom(page, testInfo, { elsewhere: true })
      // In the call on another device: Join reads Switch here, and says what it does.
      const here = page.getByRole("button", { name: "Switch here" })
      await expect(here).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText("You're in this call on another device")).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole("button", { name: "Join as a companion" })).toBeVisible()
      // A phone has no screen to share: no Present only.
      await expect(page.getByRole("button", { name: "Present only" })).toHaveCount(touch ? 0 : 1)
      await shots(page, "companion-green-room-elsewhere")

      await press(here)
      await expect.poll(server.connected, { message: "Switch here connected", timeout: 30_000 }).toBe(true)
      await expect.poll(() => server.publishedByJoin()[0]?.slice().sort(), { message: "the person's join sends its microphone", timeout: 30_000 }).toContain("MICROPHONE")
      await expect(page.getByRole("toolbar", { name: "Call controls" })).toBeVisible({ timeout: 30_000 })
      await expect(page.locator("[data-companion-mode]"), "the person's own join names no mode").toHaveCount(0)

      // The other device switched back: this one is told, and stays out.
      server.kick("DUPLICATE_IDENTITY")
      await expect(page.getByRole("heading", { name: "This call moved to your other device" })).toBeVisible({ timeout: 30_000 })
      const actions = page.locator("[data-moved-actions]")
      await expect(actions.getByRole("button", { name: "Use here as a companion" })).toBeVisible()
      await expect(actions.getByRole("button", { name: "Switch back" })).toBeVisible()
      if (touch) {
        // The phone's actions sit in a footer at the foot of the window, under the page's header and banner, never below it.
        const box = (await actions.boundingBox())!
        const h = await page.evaluate(() => innerHeight)
        const foot = Math.round(box.y + box.height)
        expect(foot, "the footer reaches the window's foot").toBeGreaterThanOrEqual(h - 2)
        expect(foot, "the footer ends inside the window").toBeLessThanOrEqual(h)
      }
      await allInWindow(page, actions)
      await shots(page, "companion-moved")
      await page.waitForTimeout(1500)
      expect(server.joins(), "the moved screen joined nothing by itself").toHaveLength(1)

      // Use here as a companion: the companion's own token, and nothing to hear or speak with.
      await press(actions.getByRole("button", { name: "Use here as a companion" }))
      await expect.poll(() => server.joins().length, { message: "the companion joined", timeout: 30_000 }).toBe(2)
      await expect.poll(server.connected, { message: "the companion connected", timeout: 30_000 }).toBe(true)
      expect(asked).toEqual(["companion-token"])
      const dock = page.getByRole("toolbar", { name: "Call controls" })
      await expect(dock.getByRole("button", { name: "Leave call" })).toBeVisible({ timeout: 30_000 })
      await expect(dock.getByRole("button", { name: /^(Mute|Unmute)$/ })).toHaveCount(0)
      await expect(dock.getByRole("button", { name: /Turn camera/ })).toHaveCount(0)
      await expect(page.locator("audio")).toHaveCount(0)
      await modeSays(page, "Companion · no sound here")
      await shots(page, "companion-call")
      await page.waitForTimeout(1500)
      expect(server.publishedByJoin()[1], "the companion published nothing").toEqual([])
      expect(micJoins(server), "joins that ever published a microphone").toBe(1)

      // Leaving: the end screen shares the moved screen's height under the page's header, and its actions are in the window too.
      await press(dock.getByRole("button", { name: "Leave call" }))
      const left = page.locator("[data-call-left]")
      await expect(left.getByRole("heading", { name: "You left the call" })).toBeVisible({ timeout: 30_000 })
      await allInWindow(page, left)
    })

    test("present-only publishes screen_share only, and stopping the share leaves", async ({ page }, testInfo) => {
      test.skip(touch, "a phone browser has no screen to share: Present only isn't offered (the test above checks)")
      test.setTimeout(180_000)
      await screenPicker(page, false)
      const { server } = await greenRoom(page, testInfo, { elsewhere: false })
      await expect(page.getByRole("button", { name: "Join now" })).toBeVisible({ timeout: 60_000 })
      await shots(page, "companion-green-room")
      await press(page.getByRole("button", { name: "Present only" }))
      await expect.poll(server.connected, { message: "present-only connected", timeout: 30_000 }).toBe(true)
      await expect.poll(() => server.publishedByJoin()[0], { message: "present-only sends its screen", timeout: 30_000 }).toEqual(["SCREEN_SHARE"])
      await modeSays(page, "Presenting only · no sound here")
      await shots(page, "companion-presenting")
      await page.waitForTimeout(1500)
      expect(server.publishedByJoin(), "present-only published its screen and nothing else").toEqual([["SCREEN_SHARE"]])
      // Stopping the share from the dock ends present only: a wide dock's Share opens a menu (a screen or a board, callShareSound.spec.ts).
      await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Share" }))
      await press(page.getByRole("menuitem", { name: "Stop sharing" }))
      await expect(page.getByText(/You left the call/)).toBeVisible({ timeout: 30_000 })
    })

    test("a refused companion says the server's words under Join, and joins nothing", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await screenPicker(page, touch)
      const { server, asked } = await greenRoom(page, testInfo, { elsewhere: false, refuse: true })
      await press(page.getByRole("button", { name: "Join as a companion" }))
      await expect(page.getByRole("alert").filter({ hasText: "Nobody is in this call yet. Join it instead." })).toBeVisible({ timeout: 30_000 })
      expect(asked).toEqual(["companion-token"])
      expect(server.joins()).toHaveLength(0)
      await shots(page, "companion-refused")
    })
  })
}
