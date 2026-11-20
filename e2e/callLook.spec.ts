import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, test, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
import { expectPicture } from "./mediaWatch"
import { reviewShot, SHOT_THEMES, stubBackend } from "./stubbedApp"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"

// Touch-up and low light (meet-09, 7 Nov 2026): chosen in the green room,
// they change the preview's picture as the call will send it; the call puts
// them on its camera as it publishes, and the in-call panel takes them off.
// The camera is a still of a dim room with a noisy face in it (written below
// as Chromium's fake capture file), so each one's change can be measured:
// low light lifts the picture's brightness, a touch-up quiets the skin's
// grain while the eye's edge stays as sharp and the face as bright. The face is a deep skin tone
// under a strong warm lamp, the most colourful of lowLight.test.ts's skin
// tones, and then the darkest skin tone, MST 10, in a dim room (FACES). Low light eases its lift in over some seconds, so the touch-up is
// measured once the lift has settled: a face it lifts must still be skin.

const W = 640
const H = 360
/** Where things are in the still, as fractions of the frame. */
const FACE = { x: 0.5, y: 0.55, rx: 0.16, ry: 0.32 }
const EYE = { x: 0.44, y: 0.45, r: 0.035 }

/** A face's colour in the still, as Chromium reads a Y4M (BT.601): luma and the two chroma codes. */
interface Face {
  y: number
  u: number
  v: number
}
/**
 * The darkest of the Monk skin tones, MST 10 (rgb 41, 36, 32), in a dim room
 * (0.4 of its light), in video range as Chromium reads a Y4M (V-812, after
 * h4a/monk.mjs writeCamera): read pixel by pixel, its grain's dark half fell
 * under the touch-up's skin floor (look.ts).
 */
function mst10(): Face {
  const [r, g, b] = [41, 36, 32].map((c) => c * 0.4)
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const u = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const v = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return { y: Math.round(16 + (y * 219) / 255), u: Math.round(128 + ((u - 128) * 224) / 255), v: Math.round(128 + ((v - 128) * 224) / 255) }
}
/** The faces the touch-up and low light are measured on: a deep skin tone under a strong warm lamp, and the darkest skin tone. */
const FACES: Record<string, Face> = { "a deep skin tone under a warm lamp": { y: 62, u: 112, v: 152 }, "the darkest skin tone (MST 10)": mst10() }

/** One YUV 4:2:0 frame: a dim blue-grey room, a face in a skin tone with fixed grain, and a dark eye. */
function stillY4m(face: Face): Buffer {
  const y = Buffer.alloc(W * H)
  const u = Buffer.alloc((W / 2) * (H / 2))
  const v = Buffer.alloc((W / 2) * (H / 2))
  let seed = 7
  const grain = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 33) - 16
  const at = (px: number, py: number) => {
    const fx = px / W
    const fy = py / H
    if (Math.hypot((fx - EYE.x) * (W / H), fy - EYE.y) < EYE.r) return "eye"
    return ((fx - FACE.x) / FACE.rx) ** 2 + ((fy - FACE.y) / FACE.ry) ** 2 < 1 ? "face" : "room"
  }
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const k = at(px, py)
      y[py * W + px] = k === "eye" ? 18 : k === "face" ? face.y + grain() : 30
    }
  for (let py = 0; py < H / 2; py++)
    for (let px = 0; px < W / 2; px++) {
      const k = at(px * 2, py * 2)
      u[py * (W / 2) + px] = k === "face" ? face.u : k === "eye" ? 128 : 136
      v[py * (W / 2) + px] = k === "face" ? face.v : k === "eye" ? 128 : 122
    }
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), y, u, v])
}
/** Each face's still, as a fake camera file, and the browser that has it as its camera. */
const STILLS = Object.entries(FACES).map(([face, colour], i) => {
  const file = path.resolve(`node_modules/.cache/callLook/camera-${i}.y4m`)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, stillY4m(colour))
  return { face, launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`] } }
})

test.use({ launchOptions: STILLS[0].launchOptions })

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const ROOM = "/public/r/maya"
const GUEST: FakePerson = { identity: "guest-9a1c0000-00b7", name: "Gia Russo", attributes: { "oc.role": "guest", "oc.can": "" } }
const GUEST_TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: GUEST.identity, name: GUEST.name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const ANSWERS = {
  [ROOM]: { data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } },
  [`${ROOM}/join`]: { msg: "ok", data: { token: GUEST_TOKEN, room: "call-room" } },
}

interface Seen {
  /** The whole picture's mean brightness, 0-255. */
  mean: number
  /** The grain in a patch of cheek: the spread of its brightness, as a percentage of it (so a lift doesn't count as grain). */
  grain: number
  /** That patch of cheek's mean brightness, 0-255. */
  face: number
  /** How much darker the eye is than the skin around it, as a fraction of the skin's brightness. */
  edge: number
}

/**
 * Waits until low light's lift has settled on a <video>: its brightness the same, within 1%, over 3 s of the frames'
 * own clock (the clock the lift eases by, lowLight.ts), however slowly a busy machine shows them.
 */
async function settled(video: Locator, message: string) {
  let last = (await seen(video)).mean
  await expect
    .poll(
      async () => {
        const now = (await seen(video, 3)).mean
        const change = Math.abs(now - last) / Math.max(1, last)
        last = now
        return change
      },
      { message, timeout: 90_000 },
    )
    .toBeLessThan(0.01)
}

/**
 * The picture a <video> shows, measured as the still was drawn: the first frame it shows that isn't black, once `after`
 * seconds of its frames' own clock have gone by. A busy machine can show a frame read as the camera's track is handed to
 * its processor, or one the processor hasn't drawn yet, as black; that's no picture of the room. If no picture comes
 * within 20 s, the one it shows then is measured, for the assertion to fail on.
 */
async function seen(video: Locator, after = 0): Promise<Seen> {
  return video.evaluate(
    async (v: HTMLVideoElement, { FACE, EYE, span }) => {
      const c = document.createElement("canvas")
      const x = c.getContext("2d", { willReadFrequently: true })!
      const until = performance.now() + 20_000
      let clock: number | null = null
      let gone = 0
      for (;;) {
        const frame = await new Promise<VideoFrameCallbackMetadata | null>((r) => {
          const late = setTimeout(() => r(null), Math.max(0, until - performance.now()))
          v.requestVideoFrameCallback((_, m) => (clearTimeout(late), r(m)))
        })
        if (frame) {
          // Only the clock going on counts: a processor's track starts a clock of its own.
          if (clock !== null && frame.mediaTime > clock) gone += frame.mediaTime - clock
          clock = frame.mediaTime
          if (gone < span) continue
        }
        c.width = v.videoWidth
        c.height = v.videoHeight
        x.drawImage(v, 0, 0, c.width, c.height)
        if (!frame) break
        const d = x.getImageData(0, 0, Math.max(1, c.width), Math.max(1, c.height)).data
        let lit = false
        for (let i = 0; i < d.length && !lit; i += 4) lit = d[i] + d[i + 1] + d[i + 2] > 6
        if (lit) break
      }
      const w = v.videoWidth
      const h = v.videoHeight
      const luma = (fx: number, fy: number, fw: number, fh: number) => {
        const d = x.getImageData(Math.round(fx * w), Math.round(fy * h), Math.max(1, Math.round(fw * w)), Math.max(1, Math.round(fh * h))).data
        const ys: number[] = []
        for (let i = 0; i < d.length; i += 4) ys.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length
        return { mean, sd: Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length) }
      }
      const cheek = luma(FACE.x + 0.03, FACE.y + 0.08, 0.06, 0.1)
      const eye = luma(EYE.x - EYE.r / 3, EYE.y - EYE.r / 2, EYE.r / 2, EYE.r / 2)
      const skin = luma(EYE.x - EYE.r / 3, EYE.y + EYE.r * 2.2, EYE.r / 2, EYE.r / 2)
      return { mean: luma(0, 0, 1, 1).mean, grain: (100 * cheek.sd) / Math.max(1, cheek.mean), face: cheek.mean, edge: (skin.mean - eye.mean) / Math.max(1, skin.mean) }
    },
    { FACE, EYE, span: after },
  )
}

const press = (device: string, target: Locator) => (device === "phone" ? target.tap() : target.click())

/** A review shot in each review theme: the call's surfaces are dark in both. */
async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** Every toast the context's pages show, by its words, as they appear: a toast that has closed by itself is still counted. */
async function toastsSaid(context: BrowserContext): Promise<(page: Page) => Promise<string[]>> {
  await context.addInitScript(() => {
    const said: string[] = []
    ;(window as { toastsSaid?: string[] }).toastsSaid = said
    new MutationObserver(() =>
      document.querySelectorAll(".toast-root").forEach((t) => {
        const words = t.textContent ?? ""
        if (words && !said.includes(words)) said.push(words)
      }),
    ).observe(document, { subtree: true, childList: true, characterData: true })
  })
  return (page) => page.evaluate(() => (window as { toastsSaid?: string[] }).toastsSaid ?? [])
}

/**
 * The computer the call's strain watch (lib/calls/processors/strain.ts)
 * sees in the context's pages. The browser has no Compute Pressure API, as
 * Firefox and Safari don't, so how long each frame's effect takes is all the
 * watch has. On a computer that can't keep up, each frame's low-light copy
 * waits 40 ms. On one that keeps up, the page's clock stands still while a
 * frame goes through the camera's processor (a stream of video frames), so
 * every frame's effect takes no time, however slow this machine's graphics
 * are. Either way the frames are made as ever.
 */
async function computer(context: BrowserContext, pace: "keeps up" | "can't keep up") {
  await context.addInitScript((pace) => {
    delete (window as { PressureObserver?: unknown }).PressureObserver
    if (pace === "can't keep up") {
      const copyTo = VideoFrame.prototype.copyTo
      VideoFrame.prototype.copyTo = async function (this: VideoFrame, ...a: Parameters<typeof copyTo>) {
        const layout = await copyTo.apply(this, a)
        await new Promise((r) => setTimeout(r, 40))
        return layout
      }
      return
    }
    const now = performance.now.bind(performance)
    let making = 0
    let since = 0
    performance.now = () => (making > 0 ? since : now())
    const Stream = TransformStream
    class Timed<I, O> extends Stream<I, O> {
      constructor(t?: Transformer<I, O>, writable?: QueuingStrategy<I>, readable?: QueuingStrategy<O>) {
        const transform = t?.transform
        const frame = async (chunk: I, controller: TransformStreamDefaultController<O>) => {
          if (!transform || !(chunk instanceof VideoFrame)) return transform?.call(t, chunk, controller)
          if (making++ === 0) since = now()
          try {
            return await transform.call(t, chunk, controller)
          } finally {
            making--
          }
        }
        super(t && transform ? Object.create(t, { transform: { value: frame } }) : t, writable, readable)
      }
    }
    window.TransformStream = Timed
  }, pace)
}

for (const [still, { face }] of STILLS.entries()) for (const [device, use] of Object.entries(DEVICES)) touchUpAndLowLight(still, face, device, use)

function touchUpAndLowLight(still: number, face: string, device: string, use: BrowserContextOptions) {
  const shot = (name: string) => (still ? `${name}-face${still}` : name)
  test(`touch-up and low light change the green room's picture and the call's, and come off in the call${still ? `, with ${face}` : ""}, on a ${device}`, async ({ browser, playwright }, testInfo) => {
    test.setTimeout(240_000)
    // A still is its browser's camera from launch (Playwright won't launch one per describe), so a later still's browser is the test's own.
    const own = still ? await playwright.chromium.launch(STILLS[still].launchOptions) : null
    const context = await (own ?? browser).newContext({
      ...use,
      permissions: ["camera", "microphone"],
      ...(own ? { baseURL: testInfo.project.use.baseURL, serviceWorkers: "block" as const } : {}),
    })
    // The effects as chosen, all through: on a slow machine the call's strain watch would make them lighter (the next test).
    await computer(context, "keeps up")
    const said = await toastsSaid(context)
    const page = await context.newPage()
    await stubBackend(page, testInfo, ANSWERS)
    const server = await fakeCallServer(page, { you: GUEST })
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    const preview = page.locator("[data-preview] video")
    const plain = await seen(preview)
    expect(plain.grain, "the still's grain reaches the preview").toBeGreaterThan(5)

    // The green room: both off at first, then each one on, measured.
    await press(device, page.getByRole("button", { name: "Backgrounds and sound" }))
    const picker = page.locator("[data-effects-picker]")
    const touchUp = picker.getByRole("radiogroup", { name: "Touch-up" })
    const lowLight = picker.getByRole("switch", { name: "Low light" })
    await expect(touchUp.getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true")
    await expect(lowLight).toHaveAttribute("aria-checked", "false")
    await press(device, lowLight)
    await expect.poll(async () => (await seen(preview)).mean, { message: "low light lifts the dim room", timeout: 60_000 }).toBeGreaterThan(plain.mean * 1.3)
    await settled(preview, "the green room's lift settles")
    const lit = await seen(preview)
    await press(device, touchUp.getByRole("radio", { name: "Smooth" }))
    await settled(preview, "the green room's lift holds with the touch-up")
    await expect.poll(async () => (await seen(preview)).grain, { message: "a smooth touch-up quiets the lifted skin's grain", timeout: 60_000 }).toBeLessThan(plain.grain * 0.6)
    const both = await seen(preview)
    expect(both.edge, "the eye's edge stays sharp").toBeGreaterThan(plain.edge * 0.8)
    expect(Math.abs(both.face - lit.face), "the touch-up keeps the face as bright as low light made it, within 3%").toBeLessThanOrEqual(lit.face * 0.03)
    await shotInThemes(page, shot(`look-green-room-on-${device}`))
    await page.keyboard.press("Escape")

    // The call puts them on its camera as it publishes.
    await page.getByLabel("Your name").fill(GUEST.name)
    await press(device, page.getByRole("button", { name: "Join now" }))
    await expect.poll(server.connected, { message: "the guest's call connected to the fake call server", timeout: 60_000 }).toBe(true)
    const self = page.locator(`[data-flip-key="${GUEST.identity}|camera"] video`)
    await expect(self).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await seen(self)).mean, { message: "the call's camera is lifted too", timeout: 60_000 }).toBeGreaterThan(plain.mean * 1.3)
    await settled(self, "the call's lift settles")
    await expect.poll(async () => (await seen(self)).grain, { message: "the call's touch-up quiets the lifted skin's grain", timeout: 60_000 }).toBeLessThan(plain.grain * 0.6)

    // The in-call panel shows them on, and takes each one off.
    if (device === "phone") {
      await press(device, page.getByRole("button", { name: "More call options" }))
      await press(device, page.getByRole("menuitem", { name: "Backgrounds and sound" }))
    } else {
      await page.getByRole("button", { name: "Choose a camera" }).click()
      await page.getByRole("menuitem", { name: "Background and touch-up…" }).click()
    }
    const panel = page.locator("[data-call-effects]")
    const smooth = panel.getByRole("radiogroup", { name: "Touch-up" }).getByRole("radio", { name: "Smooth" })
    await expect(smooth).toHaveAttribute("aria-checked", "true")
    await shotInThemes(page, shot(`look-call-on-${device}`))
    // The shot is of the effects as chosen: the strain watch made nothing lighter while it was taken.
    await expect(smooth, "the touch-up is still smooth after the shot").toHaveAttribute("aria-checked", "true")
    await expect(page.locator(".toast-root").filter({ hasText: "Effects made lighter" })).toHaveCount(0)
    await press(device, panel.getByRole("switch", { name: "Low light" }))
    await expect.poll(async () => (await seen(self)).mean, { message: "low light off: the room as dim as it is", timeout: 60_000 }).toBeLessThan(plain.mean * 1.12)
    await press(device, panel.getByRole("radiogroup", { name: "Touch-up" }).getByRole("radio", { name: "Off" }))
    await expect.poll(async () => (await seen(self)).grain, { message: "touch-up off: the grain is back", timeout: 60_000 }).toBeGreaterThan(plain.grain * 0.85)
    await shotInThemes(page, shot(`look-call-off-${device}`))
    expect((await said(page)).filter((words) => words.includes("Effects made lighter")), "the call never made this computer's effects lighter").toEqual([])
    await context.close()
    await own?.close()
  })
}

// Stepped down in the call (V-780, 8 Nov 2026): effects chosen in the green
// room ride into the call on the same camera processor, and the call's strain
// watch must hear that processor's frame times, or a computer that can't keep
// up is never made lighter. Here each frame's low-light copy waits 40 ms (a
// busy computer), and frame times are all the watch has (computer, above).
for (const [device, use] of Object.entries(DEVICES)) {
  test(`effects chosen in the green room are made lighter in the call when the computer can't keep up, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    await computer(context, "can't keep up")
    const page = await context.newPage()
    await stubBackend(page, testInfo, ANSWERS)
    const server = await fakeCallServer(page, { you: GUEST })
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectPicture(page)
    const preview = page.locator("[data-preview] video")
    const plain = await seen(preview)

    // The green room: low light and a smooth touch-up, on the preview.
    await press(device, page.getByRole("button", { name: "Backgrounds and sound" }))
    const picker = page.locator("[data-effects-picker]")
    await press(device, picker.getByRole("switch", { name: "Low light" }))
    await press(device, picker.getByRole("radiogroup", { name: "Touch-up" }).getByRole("radio", { name: "Smooth" }))
    await expect.poll(async () => (await seen(preview)).mean, { message: "low light lifts the green room's preview", timeout: 60_000 }).toBeGreaterThan(plain.mean * 1.3)
    await page.keyboard.press("Escape")

    await page.getByLabel("Your name").fill(GUEST.name)
    await press(device, page.getByRole("button", { name: "Join now" }))
    await expect.poll(server.connected, { message: "the guest's call connected to the fake call server", timeout: 60_000 }).toBe(true)
    await expect(page.locator(`[data-flip-key="${GUEST.identity}|camera"] video`)).toBeVisible({ timeout: 60_000 })

    // Three slow checks, 2 s apart: the touch-up goes first, and it is said once.
    const lighter = page.locator(".toast-root").filter({ hasText: "Effects made lighter" })
    await expect(lighter.filter({ hasText: "Your computer is busy, so your touch-up is subtler for now." }), "the call's strain watch makes the touch-up subtler").toBeVisible({ timeout: 30_000 })
    await expect(lighter).toHaveCount(1)
    // Shot at rest: fully in, before it goes. The window goes to the background
    // for the shots, which stops a toast's clock as it would for anyone who
    // switched away, and comes back after them.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")))
    await expect(lighter).toHaveAttribute("data-state", "open")
    await expect(lighter.locator(".toast-card"), "the notice is fully in").toHaveCSS("opacity", "1")
    await shotInThemes(page, `look-call-lighter-toast-${device}`)
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await expect(lighter, "the notice goes by itself").toHaveCount(0, { timeout: 15_000 })

    // The in-call panel shows what the watch chose, and why.
    if (device === "phone") {
      await press(device, page.getByRole("button", { name: "More call options" }))
      await press(device, page.getByRole("menuitem", { name: "Backgrounds and sound" }))
    } else {
      await page.getByRole("button", { name: "Choose a camera" }).click()
      await page.getByRole("menuitem", { name: "Background and touch-up…" }).click()
    }
    const panel = page.locator("[data-call-effects]")
    await expect(panel.getByRole("radiogroup", { name: "Touch-up" }).getByRole("radio", { name: "Subtle" })).toHaveAttribute("aria-checked", "true")
    await expect(panel.getByRole("switch", { name: "Low light" }), "low light goes last").toHaveAttribute("aria-checked", "true")
    await expect(panel.getByText("Lighter for now: this device is busy.")).toBeVisible()
    await shotInThemes(page, `look-call-lighter-${device}`)
    await context.close()
  })
}
