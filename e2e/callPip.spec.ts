import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { CALL_PIP_SIZE } from "../lib/calls/callPip"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { releaseWindowLoads, reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"

// A call's picture-in-picture from the dock (meet-14), as Meet's: the call in
// a window of its own over other tabs and apps (Chrome's Document
// Picture-in-Picture). Headless Chromium has it, and Playwright hands its
// window over as a page of the context: it shows the person you'd look for,
// its Mute mutes the call, the dock closes it, and Leave there leaves. Where a
// browser has only a video's own picture-in-picture (Safari), the focus's own
// picture is popped out instead.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000d3"
const SID = "5e550000-0000-4000-8000-0000000000d3"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }
// The call's token, which says who you are as LiveKit's does.
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`

/** A channel's call, joined, sending a camera and a microphone. */
async function inCall(page: Page, testInfo: TestInfo, press: (target: Locator) => Promise<void>, others: FakePerson[]) {
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
  })
  const server = await fakeCallServer(page, { you: YOU, others })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await press(page.getByRole("button", { name: "Join now" }))
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  await expect
    .poll(() => server.published().map((t) => t.source).sort(), { message: "the call sends a camera and a microphone", timeout: 30_000 })
    .toEqual(["CAMERA", "MICROPHONE"])
  return server
}

/** A page's body font, as it draws. */
const fontOf = (p: Page) => p.evaluate(() => getComputedStyle(document.body).fontFamily)
/** The font families a page has loaded, so it draws in them rather than in a fallback. */
const loadedFaces = (p: Page) =>
  p.evaluate(() => {
    const families: string[] = []
    document.fonts.forEach((face) => {
      if (face.status === "loaded") families.push(face.family.replace(/["']/g, ""))
    })
    return families
  })
/** A control's fill, as it draws. */
const fillOf = (control: Locator) => control.evaluate((el) => getComputedStyle(el).backgroundColor)
/** How many times a page draws `text` where an eye reads it: shown, and more than a pixel (screen-reader-only text isn't).
 *  Counted at the innermost element that reads it whole, so a name drawn in two spans (a plate's first word and the rest,
 *  narrow plates) is drawn once, and the same name drawn again anywhere else still counts twice. */
const timesDrawn = (p: Page, text: string) =>
  p.evaluate((t) => {
    const reads = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim() === t
    let n = 0
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!reads(el) || Array.from(el.children).some(reads)) continue
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
      const box = el.getBoundingClientRect()
      if (box.width > 1 && box.height > 1) n++
    }
    return n
  }, text)

/** The window (or the call's tab) as a reviewer sees it, in each theme the review asks for; the window follows the call's tab. */
async function shots(page: Page, shot: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    if (shot !== page) await shot.emulateMedia({ colorScheme: theme })
    await reviewShot(shot, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const [label, size, viewport, touch] of [
  ["at 1280", "1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", "390", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    // Touch, but never a phone's page (isMobile): Playwright emulates that in every page of the context, the window
    // too, which then draws zoomed with its picture over its toolbar, and a phone has no such window.
    test.use({ viewport, hasTouch: touch })
    const press = (target: Locator) => (touch ? target.tap({ timeout: 60_000 }) : target.click({ timeout: 60_000 }))
    /** The dock's picture-in-picture: its own button on a wide dock, a row in More on a phone's. */
    const pipControl = async (page: Page, name: "Picture-in-picture" | "Close picture-in-picture") => {
      const dock = page.getByRole("toolbar", { name: "Call controls" })
      if (touch) {
        await press(dock.getByRole("button", { name: "More call options" }))
        const row = page.getByRole("menuitem", { name })
        await expect(row, `More offers ${name}`).toBeVisible({ timeout: 30_000 })
        await press(row)
      } else {
        const button = dock.getByRole("button", { name })
        await expect(button, `the dock offers ${name}`).toBeVisible({ timeout: 30_000 })
        await press(button)
      }
    }

    test("the call opens in a window of its own: the person you'd look for, its Mute, the dock's close and its Leave", async ({ page, context }, testInfo) => {
      test.setTimeout(180_000)
      const server = await inCall(page, testInfo, press, [PRIYA])
      const opened = context.waitForEvent("page", { timeout: 30_000 }).catch(() => null)
      await pipControl(page, "Picture-in-picture")
      const pip = await opened
      expect(pip, "picture-in-picture opened a window of its own").not.toBeNull()
      // At the size it opens: the context's viewport is Playwright's, never the window's (a phone has no such window).
      await pip!.setViewportSize(CALL_PIP_SIZE)
      // One picture: no one has spoken yet, so the first other person, never you.
      await expect(pip!.locator("[data-stage-tile]"), "the window shows one picture").toHaveCount(1, { timeout: 30_000 })
      await expect(pip!.locator(`[data-flip-key="${PRIYA.identity}|camera"]`), "the window shows Priya").toBeVisible()
      // Her name on the picture's plate, and only there: her camera is off, and her face draws no name of its own (DESIGN-BUILD-57).
      await expect(pip!.locator("[data-name-plate]"), "with her name").toHaveText("Priya Shah")
      await expect(pip!.locator("[data-camera-off]"), "her face, as her camera is off").toBeVisible()
      expect(await timesDrawn(pip!, PRIYA.name), "the window names her once, on the plate").toBe(1)
      // Dressed like the app: the call page's font, and the dock's own fill on its Mute.
      const controls = pip!.getByRole("toolbar", { name: "Call controls" })
      expect(await fontOf(pip!), "the window draws in the call page's font").toBe(await fontOf(page))
      const dockMute = page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Mute", exact: true })
      expect(await fillOf(controls.getByRole("button", { name: "Mute", exact: true })), "its Mute wears the dock's fill").toBe(await fillOf(dockMute))
      // The call's tab while the window is open (the window's own shot is the next test's).
      await shots(page, page, `call-pip-dock-${size}`)
      // Its Mute is the dock's own switch.
      await controls.getByRole("button", { name: "Mute" }).click()
      await expect
        .poll(() => server.published().find((t) => t.source === "MICROPHONE")?.muted, { message: "Mute in the window mutes the call", timeout: 30_000 })
        .toBe(true)
      await expect(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Unmute" }), "the dock says so too").toBeVisible()
      // The dock closes it.
      const closed = pip!.waitForEvent("close", { timeout: 30_000 }).then(() => true, () => false)
      await pipControl(page, "Close picture-in-picture")
      expect(await closed, "the dock's control closes the window").toBe(true)
      // Leave there leaves the call, and the window goes with it.
      const again = context.waitForEvent("page", { timeout: 30_000 }).catch(() => null)
      await pipControl(page, "Picture-in-picture")
      const pip2 = await again
      expect(pip2, "it opens again").not.toBeNull()
      await pip2!.setViewportSize(CALL_PIP_SIZE)
      const gone = pip2!.waitForEvent("close", { timeout: 30_000 }).then(() => true, () => false)
      await pip2!.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Leave call" }).click()
      await expect.poll(server.connected, { message: "Leave in the window leaves the call", timeout: 30_000 }).toBe(false)
      expect(await gone, "the window closes with the call").toBe(true)
    })

    test("the window loads the call's own font and draws in it, at the size it opens", async ({ page, context }, testInfo) => {
      test.setTimeout(150_000)
      await inCall(page, testInfo, press, [PRIYA])
      const opened = context.waitForEvent("page", { timeout: 30_000 }).catch(() => null)
      await pipControl(page, "Picture-in-picture")
      const pip = await opened
      expect(pip, "picture-in-picture opened a window of its own").not.toBeNull()
      await pip!.setViewportSize(CALL_PIP_SIZE)
      await expect(pip!.locator("[data-name-plate]"), "the window shows Priya, by name").toHaveText("Priya Shah", { timeout: 30_000 })
      // The last steps: the window's fetches go only once the call page's stubs do (releaseWindowLoads).
      await releaseWindowLoads(page)
      const face = (await fontOf(page)).split(",")[0].replace(/["']/g, "").trim()
      await expect
        .poll(() => loadedFaces(pip!), { message: `the window loaded the call page's ${face}, so it draws in it, not in a fallback`, timeout: 30_000 })
        .toContain(face)
      // As a person sees it, at the size it opens.
      await shots(page, pip!, `call-pip-${size}`)
    })

    test("a browser with only a video's picture-in-picture pops out the focus's own picture", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      // Safari's way: no window of our own, only a <video>'s picture-in-picture.
      await page.addInitScript(() => Object.defineProperty(window, "documentPictureInPicture", { value: undefined, configurable: true }))
      await inCall(page, testInfo, press, [])
      // The picture goes once it plays.
      await expect
        .poll(() => page.evaluate(() => (document.querySelector(`[data-flip-key$="|camera"] video`) as HTMLVideoElement | null)?.readyState ?? 0), {
          message: "your camera's picture plays",
          timeout: 30_000,
        })
        .toBeGreaterThanOrEqual(1)
      await pipControl(page, "Picture-in-picture")
      const out = () => page.evaluate(() => document.pictureInPictureElement?.closest<HTMLElement>("[data-flip-key]")?.dataset.flipKey ?? null)
      await expect.poll(out, { message: "your own picture is popped out, as you're alone", timeout: 30_000 }).toBe(`${YOU.identity}|camera`)
      await pipControl(page, "Close picture-in-picture")
      await expect.poll(out, { message: "the dock takes it back", timeout: 30_000 }).toBeNull()
    })
  })
}
