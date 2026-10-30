import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { holdChunk } from "./holdChunk"
import { countAsks, expectPicture, liveCamera, tracksGiven } from "./mediaWatch"
import { SAM, stubBackend } from "./stubbedApp"

// Join hands the green room's camera and microphone to the call (29 Oct
// 2026). The call sends the very tracks the green room opened, so joining asks
// the browser for nothing more: one getUserMedia serves the preview and the
// call, and the camera's light never goes off and on at Join. In the call the
// microphone still mutes, the camera still turns off and on and moves to
// another camera, and leaving stops every track.
test.use({
  // Two cameras, so the call can move to the second.
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream=device-count=2"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000ce"
const SID = "5e550000-0000-4000-8000-0000000000ae"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }
// The call's token, which says who you are as LiveKit's does: LiveKit names your part from its sub and name.
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
/** Words only the call's own chunk carries (VideoConference's stage), so holding it holds the call and nothing else. */
const CALL_CODE = "data-call-stage"
type RouterWindow = Window & { next: { router: { push(url: string): void } } }

/** A channel's call, its green room open with the camera showing; every ask and track watched from the start. */
async function greenRoom(page: Page, testInfo: TestInfo) {
  const asks = await countAsks(page)
  const tracks = await tracksGiven(page)
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
  })
  const server = await fakeCallServer(page, { you: YOU, others: [PRIYA] })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expectPicture(page)
  return { asks, tracks, server }
}

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = (target: Locator) => (touch ? target.tap({ timeout: 60_000 }) : target.click({ timeout: 60_000 }))
    /** Joins from the green room and waits until the call sends a camera and a microphone. */
    const join = async (page: Page, server: Awaited<ReturnType<typeof fakeCallServer>>) => {
      await press(page.getByRole("button", { name: "Join now" }))
      await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
      await expect
        .poll(() => server.published().map((t) => t.source).sort(), { message: "the call sends a camera and a microphone", timeout: 30_000 })
        .toEqual(["CAMERA", "MICROPHONE"])
      return page.getByRole("toolbar", { name: "Call controls" })
    }

    test("Join hands the green room's camera and microphone to the call: one ask for both, and the camera stays on", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const { asks, tracks, server } = await greenRoom(page, testInfo)
      // The green room opened both in one ask.
      expect(await asks()).toEqual(["audio+video"])
      await join(page, server)
      // The call sends what the green room opened, and asks the browser for nothing more.
      expect(await asks()).toEqual(["audio+video"])
      // Neither was stopped and opened again: the camera's light never went out at Join.
      expect(await tracks()).toEqual(["audio live", "video live"])
    })

    test("in the call the microphone mutes, and the camera turns off and on and moves to another camera", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const { server } = await greenRoom(page, testInfo)
      const dock = await join(page, server)
      // Mute and unmute reach the server, on the track the call sends.
      const muted = () => server.published().find((t) => t.source === "MICROPHONE")?.muted
      await press(dock.getByRole("button", { name: "Mute", exact: true }))
      await expect.poll(muted, { message: "the server hears the microphone muted" }).toBe(true)
      await press(dock.getByRole("button", { name: "Unmute", exact: true }))
      await expect.poll(muted, { message: "the server hears the microphone again" }).toBe(false)
      // Off lets the camera go, so its light goes out; on opens it again.
      await expect.poll(() => liveCamera(page), { message: "one camera is live in the call" }).toBe("fake_device_0")
      await press(dock.getByRole("button", { name: "Turn camera off" }))
      await expect.poll(() => liveCamera(page), { message: "turning the camera off lets it go" }).toBe("")
      await press(dock.getByRole("button", { name: "Turn camera on" }))
      await expect.poll(() => liveCamera(page), { message: "turning it on opens it again" }).toBe("fake_device_0")
      // Another camera: the call moves to it and lets the first go. A phone's
      // dock has no device chevron (the camera is chosen in the green room).
      if (touch) return
      await press(dock.getByRole("button", { name: "Choose a camera" }))
      await press(page.getByRole("menuitemradio", { name: "fake_device_1" }))
      await expect.poll(() => liveCamera(page), { message: "the call moves to the second camera" }).toBe("fake_device_1")
    })

    test("leaving the call stops every track the green room and the call opened", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const { tracks, server } = await greenRoom(page, testInfo)
      const dock = await join(page, server)
      await press(dock.getByRole("button", { name: "Leave call" }))
      await expect
        .poll(async () => (await tracks()).filter((t) => t.endsWith(" live")), { message: "no camera or microphone is left open" })
        .toEqual([])
    })

    test("leaving the page while the call's code is still coming stops what Join handed it", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      // The call's code never comes, as on a line that stalls: Join hands the
      // green room's camera and microphone over, the green room goes, and no
      // call takes them. Only the call's life on the page holds them, so
      // leaving the page must end them, or the camera's light stays on.
      const call = await holdChunk(page, CALL_CODE)
      const { tracks } = await greenRoom(page, testInfo)
      await press(page.getByRole("button", { name: "Join now" }))
      await expect.poll(call.asked, { message: "the page asked for the call's code", timeout: 30_000 }).toBe(true)
      await expect(page.locator("[data-preview]")).toHaveCount(0, { timeout: 30_000 })
      // Handed over, not stopped.
      expect(await tracks()).toEqual(["audio live", "video live"])
      // Away in the same tab, before the call came.
      await page.evaluate(() => (window as unknown as RouterWindow).next.router.push("/forgot-password"))
      await expect.poll(tracks, { message: "every track Join handed is ended", timeout: 30_000 }).toEqual(["audio ended", "video ended"])
      await call.done()
    })
  })
}
