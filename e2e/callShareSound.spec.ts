import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { SAM, stubBackend } from "./stubbedApp"

// A share takes the tab's sound with it (meet-14), as Meet's does: started
// from the dock, it sends its picture and the sound the browser gives with
// it, and stopping it stops both. Chromium's stand-in picker
// (--use-fake-ui-for-media-stream) answers a share that asks for sound with a
// sound track, as Chrome does for a tab with "Also share tab audio" on; a
// share that never asks for sound gets none.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000d2"
const SID = "5e550000-0000-4000-8000-0000000000d2"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }
// The call's token, which says who you are as LiveKit's does.
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`

/** A channel's call, joined, sending a camera and a microphone. */
async function inCall(page: Page, testInfo: TestInfo, press: (target: Locator) => Promise<void>) {
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
  })
  const server = await fakeCallServer(page, { you: YOU, others: [PRIYA] })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await press(page.getByRole("button", { name: "Join now" }))
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  await expect
    .poll(() => server.published().map((t) => t.source).sort(), { message: "the call sends a camera and a microphone", timeout: 30_000 })
    .toEqual(["CAMERA", "MICROPHONE"])
  return server
}

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = (target: Locator) => (touch ? target.tap({ timeout: 60_000 }) : target.click({ timeout: 60_000 }))
    /** Share's item: a wide dock's Share opens a menu (a screen or a board, callBoard.spec.ts); a phone's dock keeps it in More. */
    const shareControl = async (page: Page, name: "Share screen" | "Stop sharing") => {
      await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: touch ? "More call options" : "Share" }))
      await press(page.getByRole("menuitem", { name }))
    }

    test("a share sends the tab's sound with its picture, and stopping it stops both", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      // Every track a share is given, kept, to see each one end.
      await page.addInitScript(() => {
        const md = navigator.mediaDevices
        const given: MediaStreamTrack[] = ((window as unknown as { shareTracks: MediaStreamTrack[] }).shareTracks = [])
        const ask = md.getDisplayMedia.bind(md)
        md.getDisplayMedia = async (c?: DisplayMediaStreamOptions) => {
          ;(window as unknown as { shareAsked?: DisplayMediaStreamOptions }).shareAsked = c
          const stream = await ask(c)
          given.push(...stream.getTracks())
          return stream
        }
      })
      const tracks = () => page.evaluate(() => (window as unknown as { shareTracks: MediaStreamTrack[] }).shareTracks.map((t) => `${t.kind} ${t.readyState}`).sort())
      const server = await inCall(page, testInfo, press)
      await shareControl(page, "Share screen")
      await expect
        .poll(() => server.published().filter((t) => t.source.startsWith("SCREEN_SHARE")).map((t) => `${t.source}${t.muted ? " muted" : ""}`).sort(), {
          message: "the share sends its picture and its sound",
          timeout: 30_000,
        })
        .toEqual(["SCREEN_SHARE", "SCREEN_SHARE_AUDIO"])
      expect(await tracks()).toEqual(["audio live", "video live"])
      // What the production build hands the browser, as headless Chromium's fake capture doesn't report it back: leave the
      // call's own sound out of the capture, and so a whole screen's sound may be offered (DESIGN-BUILD-55: an echo otherwise).
      expect(
        await page.evaluate(() => {
          const c = (window as unknown as { shareAsked: DisplayMediaStreamOptions & { systemAudio?: string } }).shareAsked
          return { audio: c.audio, systemAudio: c.systemAudio }
        }),
        "the share leaves the call's own sound out",
      ).toEqual({ audio: { restrictOwnAudio: true }, systemAudio: "include" })
      await shareControl(page, "Stop sharing")
      await expect.poll(tracks, { message: "stopping the share ends its picture and its sound", timeout: 30_000 }).toEqual(["audio ended", "video ended"])
    })
  })
}
