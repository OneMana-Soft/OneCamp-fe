import { expect, test, type BrowserContextOptions, type Locator, type Page, type Request } from "@playwright/test"
import { expectPicture } from "./mediaWatch"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { routeChunks } from "./holdChunk"
import { AI_READS, reviewShot, SAM, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"

// A background made from words (meet-09, 9 Nov 2026): a member whose
// workspace's AI is on describes one in the green room, the workspace's model
// answers with a recipe (POST /ai/call-background: a palette, one of the
// built-ins' layouts, some extras), and this browser paints it, shows it, and
// on "Use this" puts it on the camera live, without asking for the camera
// again. Nothing waits on the model: while it works the other backgrounds
// stay usable and Cancel is in view; when it fails, the background is as it
// was. At 390 the composer's actions are the sheet's pinned foot, and the
// call's panel pins them at every width. The words go to that one address
// only, and no picture leaves the browser. A guest, and a workspace whose AI is off, are never offered one.
// The camera is Chromium's fake one: no person in it, so a background covers
// all of it, and its top edge is the scene's sky.

test.use({ actionTimeout: 60_000, launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const CH = "c0ffee00-0000-4000-8000-0000000000e9"
const SID = "5e550000-0000-4000-8000-0000000000e9"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const WORDS = "Night sky over quiet hills"
const EXAMPLES_FIRST = "Misty pine forest at dawn"
/** A string only the composer's chunk carries (AiBackground's placeholder). */
const COMPOSER_CODE = "A calm beach at sunset"
/** The recipe as the server answers it: Lagoon's layout in a twilight palette, with mist low over the land. */
const RECIPE = { palette: ["#3A5BA0", "#6F8FC8", "#2D6A4F", "#1B4332", "#F1E3B5"], layout: "lake", extras: ["mist"] }
const SKY: RGB = [0x3a, 0x5b, 0xa0]
/** Where the sky is alone in a Lagoon scene however a frame crops it: a strip along the top, right of centre (its glow is top left). */
const TOP_RIGHT = { x: 0.62, y: 0.01, w: 0.3, h: 0.04 }

const ROOM = "/public/r/maya"
const GUEST: FakePerson = { identity: "guest-9a1c0000-00e9", name: "Gia Russo", attributes: { "oc.role": "guest", "oc.can": "" } }

type RGB = [number, number, number]
type Answer = NonNullable<Parameters<typeof stubBackend>[2]>

/** A channel's call for a member, with the workspace's AI on or off, and the model's answers. */
function memberAnswers(ai: boolean, made?: (request: Request) => unknown): Answer {
  return {
    ...AI_READS,
    "/config/client": { msg: "ok", data: { features: { calls: true, ai } } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    ...(made ? { "/ai/call-background": (_url: URL, request: Request) => made(request) } : {}),
  }
}

/** The mean colour of a box (fractions of the frame) in a <video>'s next frame or an <img>, as it draws. */
async function colourIn(target: Locator, box = TOP_RIGHT): Promise<RGB> {
  return target.evaluate(async (el: HTMLVideoElement | HTMLImageElement, b) => {
    const video = el instanceof HTMLVideoElement
    if (video) await new Promise((r) => el.requestVideoFrameCallback(() => r(null)))
    else await el.decode()
    const w = video ? el.videoWidth : el.naturalWidth
    const h = video ? el.videoHeight : el.naturalHeight
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const g = c.getContext("2d", { willReadFrequently: true })!
    g.drawImage(el, 0, 0, w, h)
    const d = g.getImageData(Math.round(b.x * w), Math.round(b.y * h), Math.max(1, Math.round(b.w * w)), Math.max(1, Math.round(b.h * h))).data
    const sum = [0, 0, 0]
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k]
    return sum.map((s) => Math.round(s / (d.length / 4))) as RGB
  }, box)
}
const away = (a: RGB, b: RGB) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))

const press = (device: string, target: Locator) => (device === "phone" ? target.tap() : target.click())

async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** How many times the page has asked for the camera. */
async function countCameraAsks(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    const w = window as { cameraAsks?: number }
    w.cameraAsks = 0
    navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => {
      if (c?.video) w.cameraAsks = (w.cameraAsks ?? 0) + 1
      return ask(c)
    }
  })
  return () => page.evaluate(() => (window as { cameraAsks?: number }).cameraAsks ?? 0)
}

/** The composer's actions, wherever they are: under its preview, or in its sheet's pinned foot (the green room's Cancel is another). */
const acts = (page: Page) => page.locator("[data-made-background], [data-made-foot]")

/**
 * The state's actions sit in its sheet's pinned foot (phone overlays are drawers; RULINGS 14): each button is in the
 * foot, and whole in view with the body scrolled back to its top, where the grid is.
 */
async function inPinnedFoot(within: Locator, names: string[]) {
  const foot = within.locator("[data-sheet-footer]")
  await expect.soft(foot, "the sheet has a pinned foot").toHaveCount(1)
  if ((await foot.count()) === 1) await foot.evaluate((f) => f.previousElementSibling?.scrollTo({ top: 0 }))
  for (const name of names) {
    const button = foot.getByRole("button", { name, exact: true })
    await expect.soft(button, `${name} is in the pinned foot`).toBeVisible({ timeout: 5_000 })
    await expect.soft(button, `${name} is whole in view with the sheet scrolled to its top`).toBeInViewport({ ratio: 1, timeout: 5_000 })
    // On top, too: nothing over it (on a phone, the call's controls).
    if ((await button.count()) === 1) {
      const onTop = await button.evaluate((b) => {
        const r = b.getBoundingClientRect()
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height - 4)
        return !!at && b.contains(at)
      })
      expect.soft(onTop, `${name} is on top, not under anything`).toBe(true)
    }
  }
}

async function openGreenRoomPicker(page: Page, device: string): Promise<Locator> {
  await press(device, page.getByRole("button", { name: "Backgrounds and sound" }))
  const picker = page.locator("[data-effects-picker]")
  await expect(picker.getByRole("radio", { name: "No effect" })).toBeVisible()
  return picker
}

for (const [device, use] of Object.entries(DEVICES)) {
  test(`a member makes a background from words, sees it, puts it on the camera live, and it is kept into the call, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const sent: { path: string; body: string; type: string }[] = []
    page.on("request", (r) => {
      if (r.method() !== "GET") sent.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "", type: r.headers()["content-type"] ?? "" })
    })
    let answer: (v: unknown) => void = () => {}
    const asked: unknown[] = []
    await stubBackend(
      page,
      testInfo,
      memberAnswers(true, (request) => {
        asked.push(request.postDataJSON())
        return new Promise((r) => (answer = r))
      }),
    )
    const server = await fakeCallServer(page, { you: YOU })
    const cameraAsks = await countCameraAsks(page)
    await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    const preview = page.locator("[data-preview] video")
    const before = await colourIn(preview)
    expect(away(before, SKY), "the camera's top edge isn't the scene's sky yet").toBeGreaterThan(60)

    const picker = await openGreenRoomPicker(page, device)
    await press(device, picker.getByRole("radio", { name: "Make a background from words" }))
    const made = picker.locator("[data-made-background]")
    await expect(made.getByLabel("Describe a background")).toBeVisible()
    await shotInThemes(page, `made-composer-${device}`)
    await press(device, made.getByRole("button", { name: WORDS }))
    await expect(made.getByLabel("Describe a background")).toHaveValue(WORDS)
    await press(device, made.getByRole("button", { name: "Make it" }))

    // The model works; the call and the camera don't wait on it.
    await expect(made.getByRole("status")).toHaveText("Making your background…")
    await expect(acts(page).getByRole("button", { name: "Cancel" })).toBeVisible()
    if (device === "phone") await inPinnedFoot(page.locator("body"), ["Cancel"])
    await expect.poll(() => asked, { message: "the words went to the workspace's model, once" }).toEqual([{ words: WORDS }])
    await shotInThemes(page, `made-making-${device}`)
    answer({ msg: "ok", data: { recipe: RECIPE, model: { label: "qwen3:4b-instruct", provider: "ollama" } } })

    // The preview is the recipe's scene, painted here.
    const shown = made.locator("[data-made-preview]")
    await expect(shown).toBeVisible()
    expect(away(await colourIn(shown), SKY), "the preview's top edge is the recipe's sky").toBeLessThan(24)
    await expect(made.getByText("Made by qwen3:4b-instruct, your workspace's model. OneCamp doesn't save your words.")).toBeVisible()
    if (device === "phone") await inPinnedFoot(page.locator("body"), ["Use this", "Try again"])
    // On a computer the popover is shorter than the composer: when the preview lands, its actions come into view.
    else for (const name of ["Use this", "Try again"]) await expect.soft(acts(page).getByRole("button", { name }), `${name} is in view when the preview lands`).toBeInViewport({ ratio: 1, timeout: 5_000 })
    // One filled primary and one remake: no Make it beside Try again while the preview is of these words; once they
    // differ, Make it is back and Try again is gone.
    const field = made.getByLabel("Describe a background")
    await expect.soft(made.getByRole("button", { name: "Make it" }), "no Make it beside Try again").toHaveCount(0)
    await field.fill(`${WORDS}, with snow`)
    await expect.soft(made.getByRole("button", { name: "Make it" }), "Make it is back once the words differ").toBeVisible({ timeout: 5_000 })
    await expect.soft(acts(page).getByRole("button", { name: "Try again" }), "and Try again is gone").toHaveCount(0, { timeout: 5_000 })
    await field.fill(WORDS)
    await expect(acts(page).getByRole("button", { name: "Try again" })).toBeVisible()
    // The frame as the preview lands: the words let go, and the preview's line in view above the actions.
    await field.blur()
    await made.getByText(/^Made by /).scrollIntoViewIfNeeded()
    await shotInThemes(page, `made-preview-${device}`)

    // Use this: on the camera, live, from the camera it already has.
    const asks = await cameraAsks()
    await press(device, acts(page).getByRole("button", { name: "Use this" }))
    await expect(picker.getByRole("radio", { name: "Your scene" })).toHaveAttribute("aria-checked", "true")
    await expect(made).toHaveCount(0)
    // The tile just chosen is in view, with focus on it.
    const yours = picker.getByRole("radio", { name: "Your scene" })
    await expect.soft(yours, "Your scene is in view after Use this").toBeInViewport({ ratio: 1, timeout: 5_000 })
    await expect.soft(yours, "and has the focus").toBeFocused({ timeout: 5_000 })
    await expect.poll(async () => away(await colourIn(preview), SKY), { message: "the camera's top edge is the scene's sky", timeout: 60_000 }).toBeLessThan(40)
    expect(await cameraAsks(), "putting it on didn't ask for the camera again").toBe(asks)
    await expect(picker.getByRole("button", { name: "Make another" })).toBeVisible()
    await shotInThemes(page, `made-on-camera-${device}`)

    // Kept on this device: a reload puts it back on the camera, and the call takes it.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    await expect.poll(async () => away(await colourIn(preview), SKY), { message: "after a reload the camera has the scene", timeout: 60_000 }).toBeLessThan(40)
    const again = await openGreenRoomPicker(page, device)
    await expect(again.getByRole("radio", { name: "Your scene" })).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("Escape")
    await press(device, page.getByRole("button", { name: "Join now" }))
    await expect.poll(server.connected, { message: "the call connected to the fake call server", timeout: 60_000 }).toBe(true)
    const self = page.locator(`[data-flip-key="${YOU.identity}|camera"] video`)
    await expect(self).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => away(await colourIn(self), SKY), { message: "the call's camera has the scene", timeout: 60_000 }).toBeLessThan(40)
    if (device === "phone") {
      await press(device, page.getByRole("button", { name: "More call options" }))
      await press(device, page.getByRole("menuitem", { name: "Backgrounds and sound" }))
    } else {
      await page.getByRole("button", { name: "Choose a camera" }).click()
      await page.getByRole("menuitem", { name: "Background and touch-up…" }).click()
    }
    const panel = page.locator("[data-call-effects]")
    await expect(panel.getByRole("radio", { name: "Your scene" })).toHaveAttribute("aria-checked", "true")
    await expect(panel.getByRole("button", { name: "Make another" })).toBeVisible()
    await shotInThemes(page, `made-in-call-${device}`)

    // Another, in the call: the panel's actions are its pinned foot, above the call's controls, at every width.
    await press(device, panel.getByRole("button", { name: "Make another" }))
    const inCall = panel.locator("[data-made-background]")
    await press(device, inCall.getByRole("button", { name: WORDS }))
    await press(device, inCall.getByRole("button", { name: "Make it" }))
    await expect(inCall.getByRole("status")).toHaveText("Making your background…")
    await inPinnedFoot(panel, ["Cancel"])
    await shotInThemes(page, `made-in-call-making-${device}`)
    await expect.poll(() => asked.length, { message: "the second ask reached the model" }).toBe(2)
    answer({ msg: "ok", data: { recipe: RECIPE, model: { label: "qwen3:4b-instruct", provider: "ollama" } } })
    await expect(inCall.locator("[data-made-preview]")).toBeVisible()
    await inPinnedFoot(panel, ["Use this", "Try again"])
    await shotInThemes(page, `made-in-call-preview-${device}`)

    // The words went to that one address, once per ask; no picture left the browser.
    expect(sent.filter((s) => s.body.includes(WORDS)).map((s) => s.path), "the words went only to the model's address").toEqual(["/ai/call-background", "/ai/call-background"])
    expect(sent.filter((s) => /^(image\/|multipart\/)/.test(s.type)).map((s) => s.path), "no picture was sent").toEqual([])
    await context.close()
  })

  test(`while the model works the backgrounds stay usable and Cancel stops it, and a failure leaves the background as it was, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    let asks = 0
    await stubBackend(
      page,
      testInfo,
      memberAnswers(true, () => (++asks === 1 ? new Promise(() => {}) : withStatus(503, { msg: "Couldn't make a background just now. Try again in a moment." }))),
    )
    await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    const picker = await openGreenRoomPicker(page, device)
    await press(device, picker.getByRole("radio", { name: "Make a background from words" }))
    const made = picker.locator("[data-made-background]")
    await made.getByLabel("Describe a background").fill("A calm beach at sunset")
    await press(device, made.getByRole("button", { name: "Make it" }))
    await expect(made.getByRole("status")).toHaveText("Making your background…")

    // Nothing waits: a built-in goes on while the model works.
    await press(device, picker.getByRole("radio", { name: "Dusk" }))
    await expect(picker.getByRole("radio", { name: "Dusk" })).toHaveAttribute("aria-checked", "true")
    await expect(made.getByRole("status")).toHaveText("Making your background…")
    await press(device, acts(page).getByRole("button", { name: "Cancel" }))
    await expect(made.getByRole("status")).toHaveCount(0)
    await expect(made.getByLabel("Describe a background")).toHaveValue("A calm beach at sunset")
    await expect(made.getByRole("button", { name: "Make it" })).toBeEnabled()

    // The model can't make one: said plainly, and the background is as it was.
    await press(device, made.getByRole("button", { name: "Make it" }))
    await expect(made.getByRole("alert")).toHaveText("Couldn't make one just now. Your background hasn't changed.")
    await expect(picker.getByRole("radio", { name: "Dusk" })).toHaveAttribute("aria-checked", "true")
    await expect(picker.getByRole("radio", { name: "Make a background from words" })).toHaveAttribute("aria-checked", "false")
    await shotInThemes(page, `made-failed-${device}`)
    await press(device, picker.getByRole("radio", { name: "Lagoon" }))
    await expect(picker.getByRole("radio", { name: "Lagoon" })).toHaveAttribute("aria-checked", "true")
    expect(asks, "Cancel, then one more ask").toBe(2)
    await context.close()
  })

  test(`a guest, and a member whose workspace's AI is off, are never offered one, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    let made = 0
    await stubBackend(page, testInfo, {
      ...memberAnswers(false, () => (made++, withStatus(403, { msg: "AI is switched off in this workspace." }))),
      [ROOM]: { data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } },
    })
    await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    let picker = await openGreenRoomPicker(page, device)
    await expect(picker.getByRole("radio", { name: "Lagoon" })).toBeVisible()
    await expect(picker.getByRole("radio", { name: /Make a background from words|Your scene/ })).toHaveCount(0)
    await page.keyboard.press("Escape")

    // A guest, in a workspace whose AI is on.
    const guest = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const door = await guest.newPage()
    await stubBackend(door, testInfo, {
      "/config/client": { msg: "ok", data: { features: { calls: true, ai: true } } },
      [ROOM]: { data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } },
      "/ai/call-background": () => (made++, withStatus(403, { msg: "Sign in first." })),
    })
    await fakeCallServer(door, { you: GUEST })
    await door.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(door)
    picker = await openGreenRoomPicker(door, device)
    await expect(picker.getByRole("radio", { name: "Lagoon" })).toBeVisible()
    await expect(picker.getByRole("radio", { name: /Make a background from words|Your scene/ })).toHaveCount(0)
    await shotInThemes(door, `made-guest-none-${device}`)
    expect(made, "nobody asked the model").toBe(0)
    await guest.close()
    await context.close()
  })

  test(`offline, Make it and Try again are off and say why, and the composer's own close is named for it, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    let answer: ((v: unknown) => void) | null = null
    await stubBackend(page, testInfo, memberAnswers(true, () => new Promise((r) => (answer = r))))
    await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    const picker = await openGreenRoomPicker(page, device)
    await press(device, picker.getByRole("radio", { name: "Make a background from words" }))
    const made = picker.locator("[data-made-background]")
    // The panel has its own Close: the composer's says what it closes.
    await expect.soft(made.getByRole("button", { name: "Close making one" })).toBeVisible({ timeout: 5_000 })
    await made.getByLabel("Describe a background").fill(WORDS)
    const why = made.getByText("You're offline. Making one needs your workspace's server.")
    await context.setOffline(true)
    await expect(why).toBeVisible()
    await expect(made.getByRole("button", { name: "Make it" })).toBeDisabled()
    await shotInThemes(page, `made-offline-${device}`)
    await context.setOffline(false)
    await press(device, made.getByRole("button", { name: "Make it" }))
    await expect.poll(() => answer !== null, { message: "the ask reached the model" }).toBe(true)
    answer!({ msg: "ok", data: { recipe: RECIPE, model: { label: "qwen3:4b-instruct", provider: "ollama" } } })
    await expect(made.locator("[data-made-preview]")).toBeVisible()
    await context.setOffline(true)
    await expect(why).toBeVisible()
    await expect(acts(page).getByRole("button", { name: "Try again" })).toBeDisabled()
    await expect(acts(page).getByRole("button", { name: "Use this" })).toBeEnabled()
    await shotInThemes(page, `made-offline-preview-${device}`)
    await context.close()
  })
}

test("by keyboard alone the arrows reach Make one without choosing it, one Tab reaches the words, and focus follows every step, on a computer", async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ ...DEVICES.computer, permissions: ["camera", "microphone"] })
  const page = await context.newPage()
  let answer: ((v: unknown) => void) | null = null
  await stubBackend(page, testInfo, memberAnswers(true, () => new Promise((r) => (answer = r))))
  const answered = async () => {
    await expect.poll(() => answer !== null, { message: "the ask reached the model" }).toBe(true)
    answer!({ msg: "ok", data: { recipe: RECIPE, model: { label: "qwen3:4b-instruct", provider: "ollama" } } })
    answer = null
  }
  /** Focus is on this, shown (:focus-visible), and never dropped to <body>. */
  const focusOn = async (target: Locator, what: string) => {
    await expect.soft(target, `${what} has the focus`).toBeFocused({ timeout: 5_000 })
    expect.soft(await page.evaluate(() => document.activeElement !== document.body), `${what}: focus isn't on <body>`).toBe(true)
    expect.soft(await target.evaluate((el) => el.matches(":focus-visible")).catch(() => false), `${what}: its ring shows`).toBe(true)
  }
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expectPicture(page)
  const picker = await openGreenRoomPicker(page, "computer")
  const made = picker.locator("[data-made-background]")
  const makeOne = picker.getByRole("radio", { name: "Make a background from words" })
  // An arrow held as a person holds it: Radix moves the focus a task after the key goes down, and selects only while it is down.
  const arrow = async (key: string) => {
    await page.keyboard.down(key)
    await page.waitForTimeout(80)
    await page.keyboard.up(key)
  }
  // Arrowing over Add yours selects it, and that opens the file chooser (the shared picker's): taken here, and left.
  page.on("filechooser", () => {})

  // Arrows onto Make one open the composer under the grid; the grid's current stays Berry, focus stays on the tile, and back is one arrow.
  await picker.getByRole("radio", { name: "Berry" }).click()
  await arrow("ArrowRight")
  await arrow("ArrowRight")
  await focusOn(makeOne, "Make one")
  await expect(made.getByLabel("Describe a background")).toBeVisible()
  await expect(makeOne).toHaveAttribute("aria-checked", "false")
  await expect(picker.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "true")
  await shotInThemes(page, "made-keys-make-one-computer")
  await arrow("ArrowLeft")
  await focusOn(picker.getByRole("radio", { name: "Add a picture of your own" }), "Add yours, one arrow back")
  await arrow("ArrowRight")
  await focusOn(makeOne, "Make one again")

  // One Tab is the words; the next, the first example; picking it hands focus to Make it.
  await page.keyboard.press("Tab")
  await focusOn(made.getByLabel("Describe a background"), "the words, one Tab from Make one")
  await page.keyboard.press("Tab")
  await focusOn(made.getByRole("button", { name: EXAMPLES_FIRST }), "the first example")
  await shotInThemes(page, "made-keys-example-computer")
  await page.keyboard.press("Enter")
  await focusOn(made.getByRole("button", { name: "Make it" }), "Make it, after an example")
  await shotInThemes(page, "made-keys-make-it-computer")

  // Every step keeps the focus: Make it, then Cancel, then the words; the preview hands it to Use this; Try again to Cancel; Use this to Your scene.
  await page.keyboard.press("Enter")
  await focusOn(acts(page).getByRole("button", { name: "Cancel" }), "Cancel, after Make it")
  await page.keyboard.press("Enter")
  await focusOn(made.getByLabel("Describe a background"), "the words, after Cancel")
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")
  await focusOn(acts(page).getByRole("button", { name: "Cancel" }), "Cancel, after the second Make it")
  await answered()
  await focusOn(acts(page).getByRole("button", { name: "Use this" }), "Use this, when the preview lands")
  await page.keyboard.press("Tab")
  await focusOn(acts(page).getByRole("button", { name: "Try again" }), "Try again")
  await page.keyboard.press("Enter")
  await focusOn(acts(page).getByRole("button", { name: "Cancel" }), "Cancel, after Try again")
  await answered()
  await focusOn(acts(page).getByRole("button", { name: "Use this" }), "Use this, when the second preview lands")
  await page.keyboard.press("Enter")
  const scene = picker.getByRole("radio", { name: "Your scene" })
  await focusOn(scene, "Your scene, after Use this")
  // V-863: the focus shows on the chosen tile, a brand outline outside its white ring, in both themes.
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme })
    const ring = await scene.evaluate((el) => {
      const s = getComputedStyle(el)
      // The brand as the picker's surface sets it (the call's dark surface keeps its own in a light theme).
      const probe = (el.closest("[data-effects-picker]") ?? document.body).appendChild(document.createElement("i"))
      probe.style.color = "var(--brand)"
      const brand = getComputedStyle(probe).color
      probe.remove()
      return { outline: `${s.outlineStyle} ${s.outlineWidth} at ${s.outlineOffset}`, brand: s.outlineColor === brand, ringOffset: s.getPropertyValue("--tw-ring-offset-width").trim() }
    })
    expect.soft(ring, `Your scene's focus shows outside its white ring (${theme})`).toEqual({ outline: "solid 2px at 2px", brand: true, ringOffset: "0px" })
  }
  await page.emulateMedia({ colorScheme: "light" })
  // DB-135 F5: Use this brought it into view clear of its scroll area's top edge, so its rings (out to 4 px) are whole.
  const clear = () =>
    scene.evaluate((el) => {
      let area = el.parentElement
      while (area && !/(auto|scroll)/.test(getComputedStyle(area).overflowY)) area = area.parentElement
      return Math.round(el.getBoundingClientRect().top - (area ?? document.documentElement).getBoundingClientRect().top)
    })
  await expect.poll(clear, { message: "Your scene's rings are whole under its scroll area's top edge" }).toBeGreaterThanOrEqual(4)
  await shotInThemes(page, "made-keys-your-scene-computer")
  await context.close()
})

/**
 * The composer's chunk on its way, through the one fetch-safe chunk route (e2e/holdChunk's routeChunks): hold() keeps
 * every ask for it until pass() or fail(); after fail() each ask is cut off as a lost connection (the runtime's own
 * retry too) until the next hold(). asks() counts them. done() lets it through and drops the route before the page
 * closes, as holdChunk's done() does.
 */
function composerChunk() {
  let settle: (how: "pass" | "fail") => void = () => {}
  let gate: Promise<"pass" | "fail"> = Promise.resolve("pass")
  let asked = 0
  let routed: Page | undefined
  const install = async (page: Page) => {
    routed = page
    await routeChunks(page, async (body) => {
      if (!body.includes(COMPOSER_CODE)) return "through"
      asked++
      return (await gate) === "fail" ? "refuse" : "through"
    })
  }
  return {
    install,
    hold: () => void (gate = new Promise((r) => (settle = r))),
    pass: () => settle("pass"),
    fail: () => settle("fail"),
    asks: () => asked,
    done: async () => {
      settle("pass")
      await routed?.unrouteAll({ behavior: "ignoreErrors" })
    },
  }
}

/** A box's top, from the picker's own top (so its scroll doesn't count), and its height. */
const placeIn = (target: Locator) =>
  target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = el.closest("[data-effects-picker]")!.getBoundingClientRect().top
    return { top: Math.round(r.top - top), height: Math.round(r.height) }
  })

/** Where the focus is: in the composer's frame, or the page itself. */
const focusIn = (page: Page) =>
  page.evaluate(() => (document.activeElement?.closest("[data-made-background]") ? "the composer" : document.activeElement === document.body ? "the page" : (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "")))

// DB-135 F1-F4 (11 Nov): the composer's chunk, held, then lost, then back, in the green room and in the call. While
// it comes its frame holds the composer's place and closes; when it can't come the frame says so, closes to Make one,
// and Make one again (the green room) or Try again (the call) brings the composer without a reload, which would leave
// the call.
for (const [device, use] of Object.entries(DEVICES)) {
  test(`the composer's frame holds its place while its chunk comes, says when it can't, and asks again without a reload, in the green room and in the call, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    await stubBackend(page, testInfo, memberAnswers(true, () => new Promise(() => {})))
    const server = await fakeCallServer(page, { you: YOU })
    const chunk = composerChunk()
    await chunk.install(page)
    await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    const kept = () => page.evaluate(() => (window as { stayed?: boolean }).stayed === true)

    /** One place's run: `again` asks for the chunk again after it couldn't come (Make one again, or Try again). */
    const run = async (picker: Locator, place: string, again: "make one" | "try again") => {
      await page.evaluate(() => ((window as { stayed?: boolean }).stayed = true))
      const makeOne = picker.getByRole("radio", { name: "Make a background from words" })
      const made = picker.locator("[data-made-background]")
      const foot = page.locator("[data-sheet-footer]")
      const footAt = async () => ((await foot.count()) === 1 ? await foot.boundingBox() : null)

      // a. Held: the frame holds the composer's place, says it's loading, and closes.
      chunk.hold()
      await press(device, makeOne)
      await expect(made).toHaveAttribute("aria-busy", "true")
      await expect(made.getByRole("status")).toHaveText("Loading…")
      await expect(made.getByRole("button", { name: "Close making one" })).toBeVisible()
      const loading = await placeIn(made)
      const tiles = await placeIn(makeOne)
      const footBefore = await footAt()
      await shotInThemes(page, `made-composer-loading-${place}-${device}`)

      // b. Lost: it says so in the composer's words, in the same place, with Try again; Close goes back to Make one.
      chunk.fail()
      await expect(made.getByRole("alert")).toHaveText("Couldn't make one just now. Your background hasn't changed.")
      await expect(made.getByRole("button", { name: "Try again" })).toBeVisible()
      expect.soft((await placeIn(made)).top, `the failed frame starts where the composer would (${place})`).toBe(loading.top)
      await shotInThemes(page, `made-composer-unloaded-${place}-${device}`)
      const asked = chunk.asks()
      if (again === "make one") {
        await press(device, made.getByRole("button", { name: "Close making one" }))
        await expect(made).toHaveCount(0)
        await expect(makeOne, `focus is back on Make one (${place})`).toBeFocused()
        chunk.hold()
        await press(device, makeOne)
      } else {
        chunk.hold()
        await press(device, made.getByRole("button", { name: "Try again" }))
      }
      await expect(made.getByRole("status")).toHaveText("Loading…")
      expect.soft(await focusIn(page), `focus is not dropped to the page while it comes again (${place})`).not.toBe("the page")

      // Back: with the focus on the frame's Close, the composer lands in the frame's place and takes the focus.
      await made.getByRole("button", { name: "Close making one" }).focus()
      chunk.pass()
      await expect(made.getByLabel("Describe a background")).toBeVisible()
      expect(chunk.asks(), `the chunk was asked for again (${place})`).toBeGreaterThan(asked)
      expect(await kept(), `the composer came without a reload (${place})`).toBe(true)
      await expect.poll(() => focusIn(page), { message: `the composer took the focus as it landed (${place})` }).toBe("the composer")
      expect.soft(await placeIn(made), `the composer's box is its loading frame's (${place})`).toEqual(loading)
      expect.soft((await placeIn(makeOne)).top, `the tiles above didn't move (${place})`).toBe(tiles.top)
      expect.soft(await footAt(), `the foot didn't move (${place})`).toEqual(footBefore)
      await press(device, made.getByRole("button", { name: "Close making one" }))
      await expect(made).toHaveCount(0)
      await expect(makeOne, `Close hands the focus back to Make one (${place})`).toBeFocused()
    }

    await run(await openGreenRoomPicker(page, device), "green-room", "make one")

    // The call, on a fresh page: the chunk isn't in yet there.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    await press(device, page.getByRole("button", { name: "Join now" }))
    await expect.poll(server.connected, { message: "the call connected to the fake call server", timeout: 60_000 }).toBe(true)
    if (device === "phone") {
      await press(device, page.getByRole("button", { name: "More call options" }))
      await press(device, page.getByRole("menuitem", { name: "Backgrounds and sound" }))
    } else {
      await page.getByRole("button", { name: "Choose a camera" }).click()
      await page.getByRole("menuitem", { name: "Background and touch-up…" }).click()
    }
    const panel = page.locator("[data-call-effects]")
    await expect(panel.getByRole("radio", { name: "No effect" })).toBeVisible()
    await run(panel.locator("[data-effects-picker]"), "in-call", "try again")
    expect(await server.connected(), "the call is still connected").toBe(true)
    await chunk.done()
    await context.close()
  })
}
