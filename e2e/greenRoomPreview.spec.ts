import { expect, test, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
import { countAsks, expectPicture, tracksGiven } from "./mediaWatch"
import { reviewShot, SHOT_THEMES, stubBackend, untilStill } from "./stubbedApp"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"

// A green room's camera preview (29 Oct 2026). The camera and the microphone's
// meter open as the room mounts, in one ask, and the picture shows at once:
// LiveKit's client is no part of a room page's first load, and the preview
// doesn't wait for it. When it comes it takes that same camera (the effects
// need it). Until the camera opens the preview says it is starting, in the
// frame the picture will fill, and nothing moves when it shows. A camera
// refused, missing or in use says why in that frame; a client that can't load
// leaves the picture on, and Join asks for it again: the call joins, or says
// it couldn't connect, with Try again. Leaving the room stops the camera and
// the microphone.
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const ROOM = "/public/r/maya"
const ROOM_ANSWERS = { [ROOM]: { data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } } }
// LiveKit's client is the chunk that carries its protocol's message names.
const LIVEKIT = "livekit.SignalRequest"

// A guest who joins the room: the door's join answers with a call token, and the fake call server takes the call.
const GUEST: FakePerson = { identity: "guest-9a1c0000-00a3", name: "Gia Russo", attributes: { "oc.role": "guest", "oc.can": "" } }
const GUEST_TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: GUEST.identity, name: GUEST.name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const JOIN_ANSWERS = { ...ROOM_ANSWERS, [`${ROOM}/join`]: { msg: "ok", data: { token: GUEST_TOKEN, room: "call-room" } } }

/** A review shot in each review theme, switched in place: the app follows the system's scheme. */
async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/**
 * LiveKit's client, held or refused as the test says, until `open`: `hold`
 * keeps its chunk back, `refuse` aborts every request for it (the page's own
 * chunk loader asks again before it gives up). `asked` counts the requests.
 */
async function liveKitGate(page: Page, mode: "hold" | "refuse") {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  let shut = true
  let asked = 0
  await page.route(/\/_next\/static\/chunks\/[^?]+\.js(\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (!body.includes(LIVEKIT)) return route.fulfill({ response, body })
    asked += 1
    if (mode === "refuse" && shut) return route.abort("failed")
    if (mode === "hold") await opened
    return route.fulfill({ response, body })
  })
  return {
    open: () => {
      shut = false
      open()
    },
    asked: () => asked,
  }
}

/** The preview's frame, its controls and Join, where they are drawn. */
async function boxes(page: Page) {
  return {
    frame: await page.locator("[data-preview]").boundingBox(),
    controls: await page.locator("[data-prejoin-controls]").boundingBox(),
    join: await page.getByRole("button", { name: "Join now" }).boundingBox(),
  }
}

type MediaWindow = Window & {
  __openCamera: () => void
  __mendCamera: () => void
  next: { router: { push(url: string): void } }
}

/** getUserMedia held back until `open`, as a camera still opening, from before the page's first script. */
async function cameraGate(page: Page) {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices
    const ask = media.getUserMedia.bind(media)
    let open!: () => void
    const opened = new Promise<void>((resolve) => (open = resolve))
    Object.assign(window, { __openCamera: open })
    media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      await opened
      return ask(constraints)
    }
  })
  return { open: () => page.evaluate(() => (window as unknown as MediaWindow).__openCamera()) }
}

/**
 * The camera failing as the browser says `name` (NotAllowedError, NotFoundError,
 * NotReadableError) for any ask that wants it, until `mend`; the microphone
 * alone still opens. Add it before countAsks, so the failed asks are counted.
 */
async function cameraFails(page: Page, name: string) {
  await page.addInitScript((name) => {
    const media = navigator.mediaDevices
    const ask = media.getUserMedia.bind(media)
    let failing = true
    Object.assign(window, { __mendCamera: () => (failing = false) })
    media.getUserMedia = (constraints?: MediaStreamConstraints) =>
      failing && constraints?.video ? Promise.reject(new DOMException("The camera can't open", name)) : ask(constraints)
  }, name)
  return { mend: () => page.evaluate(() => (window as unknown as MediaWindow).__mendCamera()) }
}

/** Waits until the page has stopped asking for LiveKit's client: a refused load has given up. */
async function untilClientGivenUp(asked: () => number) {
  let last = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        const n = asked()
        if (n !== last) [last, since] = [n, Date.now()]
        return n > 0 && Date.now() - since >= 2_000
      },
      { message: "the client's load has given up", timeout: 60_000 },
    )
    .toBe(true)
}

const press = (device: string, target: Locator) => (device === "phone" ? target.tap() : target.click())

/**
 * The preview's video as it is now: whether it has a frame to show, the live
 * camera track it shows (by id), and whether LiveKit holds it (its attach sets
 * autoplay on the element, outside Safari).
 */
const previewNow = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-preview] video")
    const stream = v?.srcObject
    const live = stream instanceof MediaStream ? stream.getVideoTracks().find((t) => t.readyState === "live") : undefined
    return { framed: (v?.readyState ?? 0) >= 2, camera: live?.id ?? null, liveKit: !!v?.autoplay }
  })

for (const [device, use] of Object.entries(DEVICES)) {
  test(`a guest's camera shows before the call's client arrives, from one ask for the camera and microphone, and stays the same track once it does, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const asks = await countAsks(page)
    await stubBackend(page, testInfo, ROOM_ANSWERS)
    const liveKit = await liveKitGate(page, "hold")
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    // The client is asked for as the room mounts, and held back: the picture comes without it.
    await expect.poll(liveKit.asked, { timeout: 60_000 }).toBe(1)
    await expect.poll(async () => (await previewNow(page)).framed, { message: "the camera shows while the client is held", timeout: 30_000 }).toBe(true)
    const held = await previewNow(page)
    expect(held.camera, "a live camera track in the preview").not.toBeNull()
    expect(held.liveKit).toBe(false)
    await expect(page.locator("[data-preview]").getByRole("status")).toHaveCount(0)
    // One ask, as the room opens: the camera and the microphone (its meter) together.
    expect(await asks()).toEqual(["audio+video"])

    // The client comes and takes that same track: no second ask, and the picture never goes.
    liveKit.open()
    await expect.poll(async () => (await previewNow(page)).liveKit, { message: "LiveKit holds the camera", timeout: 30_000 }).toBe(true)
    expect(await previewNow(page)).toEqual({ framed: true, camera: held.camera, liveKit: true })
    expect(await asks()).toEqual(["audio+video"])
    await context.close()
  })

  for (const theme of SHOT_THEMES) {
    test(`a guest's camera preview says it is starting while the camera opens, and nothing moves when it shows, on a ${device}, ${theme}`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000)
      const context = await browser.newContext({ ...use, colorScheme: theme, permissions: ["camera", "microphone"] })
      const page = await context.newPage()
      const camera = await cameraGate(page)
      await stubBackend(page, testInfo, ROOM_ANSWERS)
      await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

      const preview = page.locator("[data-preview]")
      await expect(preview.locator('[data-camera-state="starting"]')).toBeVisible({ timeout: 60_000 })
      // One status line, in the frame.
      await expect(preview.getByRole("status")).toHaveText("Starting your camera…")
      // The column's entrance has settled: what moves from here is the camera's doing.
      await untilStill(page)
      const starting = await boxes(page)
      await reviewShot(page, "prejoin-starting", theme)

      await camera.open()
      await expectPicture(page)
      await expect(preview.locator("[data-camera-state]")).toHaveCount(0)
      await expect(preview.getByRole("status")).toHaveCount(0)
      await untilStill(page)
      expect(await boxes(page)).toEqual(starting)
      await reviewShot(page, "prejoin-camera", theme)
      await context.close()
    })
  }

  test(`a call's client that can't load leaves the camera on, and opening the effects asks for it again, which takes that same camera, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const asks = await countAsks(page)
    await stubBackend(page, testInfo, ROOM_ANSWERS)
    const liveKit = await liveKitGate(page, "refuse")
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    // The client is refused, and nothing asks for it again by itself: the picture stays, with nothing to say.
    await untilClientGivenUp(liveKit.asked)
    await expectPicture(page)
    const refused = await previewNow(page)
    expect(refused.camera, "a live camera track in the preview").not.toBeNull()
    expect(refused.liveKit).toBe(false)
    await expect(page.locator("[data-preview]").getByRole("status")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Turn camera off" })).toBeVisible()
    await untilStill(page)
    await shotInThemes(page, "prejoin-client-failed")

    // Opening the effects asks for the client again, and it takes the camera already open.
    const before = liveKit.asked()
    liveKit.open()
    await press(device, page.getByRole("button", { name: "Backgrounds and sound" }))
    await expect.poll(async () => (await previewNow(page)).liveKit, { message: "LiveKit holds the camera", timeout: 30_000 }).toBe(true)
    expect(liveKit.asked()).toBeGreaterThan(before)
    expect(await previewNow(page)).toEqual({ framed: true, camera: refused.camera, liveKit: true })
    expect(await asks()).toEqual(["audio+video"])
    await context.close()
  })

  // Join after the client couldn't load (DB-35, 29 Oct 2026): the green room says nothing of it, so Join
  // must ask for the client again and join, or, when it still can't come, say so with Try again.
  test(`Join asks again for a call's client that couldn't load, and the call joins, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    await stubBackend(page, testInfo, JOIN_ANSWERS)
    const server = await fakeCallServer(page, { you: GUEST })
    const liveKit = await liveKitGate(page, "refuse")
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await untilClientGivenUp(liveKit.asked)
    await expectPicture(page)
    await page.getByLabel("Your name").fill(GUEST.name)
    const before = liveKit.asked()
    liveKit.open()
    await press(device, page.getByRole("button", { name: "Join now" }))
    await expect.poll(server.connected, { message: "the guest's call connected to the fake call server", timeout: 60_000 }).toBe(true)
    expect(liveKit.asked(), "Join asked for the client again").toBeGreaterThan(before)
    await expect(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Leave call" })).toBeVisible({ timeout: 30_000 })
    await shotInThemes(page, "prejoin-client-failed-joined")
    await context.close()
  })

  test(`Join says the call couldn't connect, with Try again, when its client still can't load, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    await stubBackend(page, testInfo, JOIN_ANSWERS)
    const server = await fakeCallServer(page, { you: GUEST })
    const liveKit = await liveKitGate(page, "refuse")
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await untilClientGivenUp(liveKit.asked)
    await expectPicture(page)
    await page.getByLabel("Your name").fill(GUEST.name)
    const before = liveKit.asked()
    await press(device, page.getByRole("button", { name: "Join now" }))
    // The call's own words for a connection that can't be made (callErrors' CONNECT_FAILURE_TEXT), with the way on.
    await expect(page.getByRole("heading", { name: "Couldn't connect to the meeting" })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("Your network couldn't reach the call. Check your connection, then try again.")).toBeVisible()
    expect(liveKit.asked(), "Join asked for the client again").toBeGreaterThan(before)
    expect(await server.connected(), "nothing reached the call server").toBe(false)
    await shotInThemes(page, "prejoin-client-failed-join-failed")
    // Try again goes back to the green room, with the camera on, and Join can go again.
    await press(device, page.getByRole("button", { name: "Try again" }))
    await expectPicture(page)
    await expect(page.getByRole("button", { name: "Join now" })).toBeVisible()
    await context.close()
  })

  // The app's one set of words for a camera that can't open (lib/media), in the frame, with the way on.
  const FAILURES = [
    { name: "NotAllowedError", is: "refused", state: "denied", says: "Your browser blocked the camera. You can join with audio.", way: "How to allow the camera" },
    { name: "NotFoundError", is: "missing", state: "busy", says: "No camera was found. You can join with audio.", way: "Try again" },
    { name: "NotReadableError", is: "in use", state: "busy", says: "Your camera is in use. You can join with audio.", way: "Try again" },
  ] as const
  for (const failure of FAILURES) {
    test(`a guest whose camera is ${failure.is} is told so in the frame, and can still join, on a ${device}`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000)
      const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
      const page = await context.newPage()
      const camera = await cameraFails(page, failure.name)
      const asks = await countAsks(page)
      await stubBackend(page, testInfo, ROOM_ANSWERS)
      const liveKit = await liveKitGate(page, "hold")
      liveKit.open()
      await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

      const preview = page.locator("[data-preview]")
      const told = preview.locator(`[data-camera-state="${failure.state}"]`)
      await expect(told.getByRole("status")).toHaveText(failure.says, { timeout: 60_000 })
      await expect(told.getByRole("button", { name: failure.way })).toBeVisible()
      await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible()
      // Joining with audio stays open to them.
      await page.getByLabel("Your name").fill("Gia Russo")
      await expect(page.getByRole("button", { name: "Join now" })).toBeEnabled()
      await untilStill(page)
      await shotInThemes(page, `prejoin-camera-${failure.name}`)
      // The call's client comes all the same, so Join needn't wait for it:
      // the call's code is fetched once the page is idle (useCallLifecycle),
      // camera or none.
      await expect.poll(liveKit.asked, { message: "LiveKit's client is asked for with no camera", timeout: 30_000 }).toBeGreaterThan(0)
      if (failure.state === "denied") {
        // A prompt answered no refuses both; nothing is asked again.
        expect(await asks()).toEqual(["audio+video"])
      } else {
        // A device's failure costs only that device: each kind is asked again alone, and the microphone opens.
        expect((await asks()).slice(1).sort()).toEqual(["audio", "video"])
        await camera.mend()
        await press(device, told.getByRole("button", { name: "Try again" }))
        await expectPicture(page)
        await expect(preview.getByRole("status")).toHaveCount(0)
      }
      await context.close()
    })
  }

  test(`a guest's camera and microphone stop when they leave the green room, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const tracks = await tracksGiven(page)
    await stubBackend(page, testInfo, ROOM_ANSWERS)
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })

    // The camera, held by LiveKit once its client comes, and the meter's microphone: one of each, live.
    await expectPicture(page)
    await expect.poll(async () => (await previewNow(page)).liveKit, { message: "LiveKit holds the camera", timeout: 30_000 }).toBe(true)
    expect(await tracks()).toEqual(["audio live", "video live"])

    // Turning the camera off lets it go; the microphone stays for the meter.
    await press(device, page.getByRole("button", { name: "Turn camera off" }))
    await expect.poll(tracks).toEqual(["audio live", "video ended"])
    await press(device, page.getByRole("button", { name: "Turn camera on" }))
    await expectPicture(page)
    expect(await tracks()).toEqual(["audio live", "video ended", "video live"])

    // Away from the room in the same tab: every track it opened stops.
    await page.evaluate(() => (window as unknown as MediaWindow).next.router.push("/forgot-password"))
    await expect(page.locator("[data-preview]")).toHaveCount(0, { timeout: 30_000 })
    await expect.poll(tracks).toEqual(["audio ended", "video ended", "video ended"])
    await context.close()
  })
}
