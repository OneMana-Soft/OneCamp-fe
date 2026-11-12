import { expect, test, type Browser, type Page, type Request } from "@playwright/test"
import { createHmac, randomUUID } from "crypto"
import { writeFileSync } from "fs"
import path from "path"

// THE RECORDING DRAWS THE STAGE (H3, meet-17, 6 Nov 2026). LiveKit's egress opens
// /call-recording-layout in its own Chrome and records it from START_RECORDING
// on. The backend sends the page there with the recorder's short token in the
// address's fragment (#lk=<LiveKit URL>&t=<token>), which no server sees; here a
// test stands in for that redirect and opens the page with the fragment set.
//
// Against a real LiveKit: the run script starts `livekit/livekit-server --dev`
// (H3_LIVEKIT_URL), and one page publishes twelve people's cameras (a canvas
// each) through livekit-client's own bundle. The page must draw the call's
// stage for them, say START_RECORDING once, and never say it for a bare
// address, a query token, or a token LiveKit refuses. The token goes to
// LiveKit and nowhere else.

const LK = process.env.H3_LIVEKIT_URL ?? "ws://127.0.0.1:7991"
// No gate starts that server: with no H3_LIVEKIT_URL, the tests that connect to LiveKit (one describe) skip and say
// how to run it. The bare address's test connects nowhere, so it runs either way.
const NO_LIVEKIT = !process.env.H3_LIVEKIT_URL
const NEEDS_LIVEKIT =
  "needs a LiveKit dev server, which no gate starts: run `docker run --rm --network host livekit/livekit-server --dev`, then set H3_LIVEKIT_URL=ws://127.0.0.1:7880"
// LiveKit's --dev keys, which the dev server prints for anyone: no secret of ours.
const KEY = process.env.H3_LIVEKIT_KEY ?? "devkey"
const SECRET = process.env.H3_LIVEKIT_SECRET ?? "secret"
const UMD = path.resolve("node_modules/livekit-client/dist/livekit-client.umd.js")
const ROUTE = "/call-recording-layout"

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
/** A LiveKit access token, signed with the dev server's key. */
function token(identity: string, video: Record<string, unknown>, name?: string, attributes?: Record<string, string>): string {
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: KEY, sub: identity, name, attributes, nbf: now - 5, exp: now + 600, video })}`
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`
}
/** The grant LiveKit's egress gives its recorder: hidden, subscribe-only. */
const recorderToken = (room: string) =>
  token(`EG_${randomUUID().slice(0, 8)}`, { room, roomJoin: true, canPublish: false, canPublishData: false, canSubscribe: true, hidden: true, recorder: true })

/** LiveKit's room service (Twirp, JSON), as the server's admin. */
async function roomService(method: string, body: Record<string, unknown>) {
  const http = LK.replace(/^ws/, "http")
  const auth = token("h3fe-admin", { roomAdmin: true, roomCreate: true, room: body.room ?? body.name })
  const res = await fetch(`${http}/twirp/livekit.RoomService/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  })
  expect(res.ok, `${method}: ${res.status}`).toBe(true)
}

/**
 * `n` people in `room`, each publishing a camera: a canvas in their own colour. Person 2 can also share a screen.
 * `off` publish no camera; `invited` join as the call's invite lets them in (the server's oc.role, calls HU13).
 */
async function people(browser: Browser, room: string, n: number, { off = [], invited = [] }: { off?: number[]; invited?: number[] } = {}): Promise<Page> {
  const page = await browser.newPage()
  // LiveKit's own address, a page with nothing of the app on it. Not a page Playwright fulfils: that has no address,
  // and Chrome keeps it off the loopback network (local network access), so LiveKit was out of its reach.
  await page.goto(LK.replace(/^ws/, "http"))
  await page.addScriptTag({ path: UMD })
  const tokens = Array.from({ length: n }, (_, i) =>
    token(`p${i + 1}`, { room, roomJoin: true, canPublish: true, canSubscribe: false }, `Person ${i + 1}`, invited.includes(i + 1) ? { "oc.role": "invitee" } : undefined),
  )
  await page.evaluate(
    async ({ url, tokens, off }) => {
      const { Room, Track } = (window as unknown as { LivekitClient: typeof import("livekit-client") }).LivekitClient
      const paint = (w: number, h: number, hue: number, text: string) => {
        const c = document.createElement("canvas")
        c.width = w
        c.height = h
        const g = c.getContext("2d")!
        let f = 0
        setInterval(() => {
          g.fillStyle = `hsl(${hue} 55% 42%)`
          g.fillRect(0, 0, w, h)
          g.fillStyle = "#fff"
          g.font = `${Math.round(h / 4)}px sans-serif`
          g.fillText(text, w / 10, h / 2 + (f++ % 8))
        }, 66)
        return c.captureStream(15).getVideoTracks()[0]
      }
      const w = window as unknown as { rooms: InstanceType<typeof Room>[]; shareScreen: () => Promise<void> }
      w.rooms = []
      for (const [i, t] of tokens.entries()) {
        const room = new Room()
        await room.connect(url, t)
        if (!off.includes(i + 1)) await room.localParticipant.publishTrack(paint(320, 180, (i * 29) % 360, `P${i + 1}`), { source: Track.Source.Camera, simulcast: false })
        w.rooms.push(room)
      }
      w.shareScreen = async () => {
        await w.rooms[1].localParticipant.publishTrack(paint(1280, 720, 210, "Slides"), { source: Track.Source.ScreenShare, simulcast: false })
      }
    },
    { url: LK, tokens, off },
  )
  return page
}

/** The page as egress opens it, at `width`x`height`, with what it says to egress, and every request and socket it opens. */
async function recorder(browser: Browser, width: number, height: number, address: string) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: "light" })
  const said: string[] = []
  const sockets: string[] = []
  const requests: Request[] = []
  page.on("console", (m) => {
    if (/^(START|END)_RECORDING$/.test(m.text())) said.push(m.text())
  })
  page.on("websocket", (ws) => sockets.push(ws.url()))
  page.on("request", (r) => requests.push(r))
  await page.goto(address)
  return { page, said, sockets, requests }
}

/** LiveKit's own way in: its signal socket (/rtc) and the check livekit-client makes when that fails (/rtc/validate). */
const toLiveKit = (address: string) => {
  const u = new URL(address.replace(/^ws/, "http"))
  return u.host === new URL(LK.replace(/^ws/, "http")).host && /^\/rtc(\/validate)?\/?$/.test(u.pathname)
}
/** Every request or socket that carried `secret` anywhere but to LiveKit: in its address (a fragment never leaves the browser), a header or a body. */
async function sentElsewhere({ requests, sockets }: { requests: Request[]; sockets: string[] }, secret: string): Promise<string[]> {
  const carried: string[] = []
  for (const r of requests) {
    const address = r.url().split("#")[0]
    if (toLiveKit(address)) continue
    const headers = await r.allHeaders().catch(() => r.headers())
    if ([address, JSON.stringify(headers), r.postData() ?? ""].some((s) => s.includes(secret))) carried.push(`${r.method()} ${address.replaceAll(secret, "<token>").slice(0, 120)}`)
  }
  for (const u of sockets) if (!toLiveKit(u) && u.includes(secret)) carried.push(`socket ${u.replaceAll(secret, "<token>").slice(0, 120)}`)
  return carried
}
const ticket = (t: string) => `${ROUTE}#lk=${encodeURIComponent(LK)}&t=${encodeURIComponent(t)}`
const stage = (page: Page) => page.locator("[data-recording-stage]")

/** The call's gutter round its tiles, 12px (STAGE_INSET): the recording keeps it on every side (DESIGN-BUILD-124's F3). */
const INSET = 12
/** How far in from the recording's edges its tiles and its "+N" sit, on each side; null with none drawn. */
const insets = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector("[data-recording-stage]")!.getBoundingClientRect()
    const boxes = [...document.querySelectorAll("[data-recording-stage] [data-stage-tile], [data-recording-stage] [data-stage-more]")]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (!boxes.length) return null
    return {
      left: Math.min(...boxes.map((r) => r.left)) - frame.left,
      top: Math.min(...boxes.map((r) => r.top)) - frame.top,
      right: frame.right - Math.max(...boxes.map((r) => r.right)),
      bottom: frame.bottom - Math.max(...boxes.map((r) => r.bottom)),
    }
  })
/** Every colour the stage draws with, element by element. */
const inks = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-recording-stage], [data-recording-stage] *")].map((e) => {
      const s = getComputedStyle(e)
      return [e.tagName, s.color, s.backgroundColor, s.borderColor, s.outlineColor, s.boxShadow, s.backgroundImage, s.fill, s.stroke].join(" ")
    }),
  )
const darkPage = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"))

/**
 * A scene of the recording, as egress records it:
 * - its tiles sit inside the call's gutter, and in a grid the outermost one sits at it (F3);
 * - it draws with the same colours when the recorder's Chrome prefers dark as when it prefers light, as the
 *   call's stage is dark in both themes (F1: the app's own page goes dark, the recording does not);
 * - with SHOTS_DIR, a shot in each scheme and where its pictures are, the only place the two may differ.
 */
async function scene(page: Page, name: string, { grid = false } = {}) {
  const dir = process.env.SHOTS_DIR
  const at = `${dir}/recording-${name}-${page.viewportSize()?.width}`
  const inset = await insets(page)
  if (inset) {
    const nearest = Math.min(inset.left, inset.top, inset.right, inset.bottom)
    expect(nearest, `${name}: ${JSON.stringify(inset)}`).toBeGreaterThanOrEqual(INSET - 0.5)
    if (grid) expect(nearest, `${name}: ${JSON.stringify(inset)}`).toBeLessThanOrEqual(INSET + 4)
  }
  const light = await inks(page)
  if (dir) {
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${at}-light.png` })
    const pictures = await page.locator("[data-recording-stage] video").evaluateAll((vs) => vs.map((v) => v.getBoundingClientRect().toJSON()))
    writeFileSync(`${at}-pictures.json`, JSON.stringify(pictures))
  }
  await page.emulateMedia({ colorScheme: "dark" })
  await expect.poll(() => darkPage(page)).toBe(true)
  expect(await inks(page)).toEqual(light)
  if (dir) {
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${at}-dark.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
  await expect.poll(() => darkPage(page)).toBe(false)
}

test.describe.configure({ mode: "serial" })

test.describe("against a LiveKit dev server", () => {
  test.skip(NO_LIVEKIT, NEEDS_LIVEKIT)

  test("draws the call's stage for twelve people, starts once, and ends when the call does", async ({ browser }) => {
    test.setTimeout(240_000)
    const room = `h3fe-${randomUUID().slice(0, 8)}`
    const cast = await people(browser, room, 12)
    const tokens = { wide: recorderToken(room), mid: recorderToken(room), phone: recorderToken(room) }
    const wide = await recorder(browser, 1920, 1080, ticket(tokens.wide))
    const { page, said } = wide

    // The grid of twelve, 4x3, each with their picture and their plate, and the address bare again.
    await expect(stage(page)).toHaveAttribute("data-recording-stage", "live", { timeout: 60_000 })
    await expect(page.locator("[data-stage-grid] [data-stage-tile]")).toHaveCount(12, { timeout: 60_000 })
    await expect(page.locator("[data-stage-grid] video")).toHaveCount(12, { timeout: 60_000 })
    for (let i = 1; i <= 12; i++) await expect(page.locator("[data-name-plate]", { hasText: new RegExp(`^Person ${i}$`) })).toHaveCount(1)
    expect(page.url()).toMatch(/\/call-recording-layout$/)
    await expect.poll(() => said).toEqual(["START_RECORDING"])
    // No pager, pin, menu or link: the recording shows no controls (the strip's +N is a place, as on the call).
    await expect(stage(page).locator("button:not([data-stage-more]), a, [data-stage-pager]")).toHaveCount(0)
    await scene(page, "grid", { grid: true })
    const mid = await recorder(browser, 1280, 720, ticket(tokens.mid))
    const phone = await recorder(browser, 390, 844, ticket(tokens.phone))
    await expect(mid.page.locator("[data-stage-grid] video")).toHaveCount(12, { timeout: 60_000 })
    await expect(phone.page.locator("[data-stage-tile]").first()).toBeVisible({ timeout: 60_000 })
    await scene(mid.page, "grid", { grid: true })
    await scene(phone.page, "grid", { grid: true })

    // The spotlight (Call Control): everyone's stage, and the recording's, with the strip and "+N". In 1080 less the
    // gutter (1056), seven places and "+N" fit the strip.
    await roomService("UpdateRoomMetadata", { room, metadata: JSON.stringify({ spotlight: { identity: "p3", by: "Host" } }) })
    await expect(page.locator("[data-stage-focus] [data-stage-tile]")).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator("[data-stage-focus] [data-name-plate]")).toHaveText("Person 3")
    await expect(page.locator("[data-stage-strip] [data-stage-tile]")).toHaveCount(7)
    await expect(page.locator("[data-stage-more]")).toHaveText("+4")
    await scene(page, "spotlight")
    await scene(mid.page, "spotlight")
    await scene(phone.page, "spotlight")

    // A share takes the focus from the spotlight, as on the call.
    await cast.evaluate(() => (window as unknown as { shareScreen: () => Promise<void> }).shareScreen())
    await expect(page.locator("[data-stage-focus] [data-name-plate]")).toContainText("Person 2 is presenting", { timeout: 30_000 })
    await expect(page.locator("[data-stage-more]")).toHaveText("+5")
    await scene(page, "share")
    await scene(mid.page, "share")
    await scene(phone.page, "share")
    expect(said).toEqual(["START_RECORDING"])

    // The call ends: the page says END_RECORDING, once, so the egress stops.
    await roomService("DeleteRoom", { room })
    await expect.poll(() => said, { timeout: 30_000 }).toEqual(["START_RECORDING", "END_RECORDING"])
    await page.waitForTimeout(1_000)
    expect(said).toEqual(["START_RECORDING", "END_RECORDING"])

    // Each recorder's token went to LiveKit's signal socket, and in no other request's address, header or body.
    for (const [seen, secret] of [[wide, tokens.wide], [mid, tokens.mid], [phone, tokens.phone]] as const) {
      expect(seen.sockets.some((u) => toLiveKit(u) && u.includes(secret))).toBe(true)
      expect(await sentElsewhere(seen, secret)).toEqual([])
    }
    await Promise.all([cast.close(), page.close(), mid.page.close(), phone.page.close()])
  })

  /** How the stage draws faces, plates and the focus's picture: what the call's tile (TileBody) decides. */
  const tiles = (page: Page) =>
    page.evaluate(() => ({
      stripFacesNamed: [...document.querySelectorAll("[data-stage-strip] [data-camera-off]")].map((f) => !!f.textContent?.includes("Person 1")),
      invitedMarked: [...document.querySelectorAll("[data-name-plate]")].filter((p) => p.textContent?.includes("Person 2")).map((p) => !!p.textContent?.includes("invited")),
      focusFit: [...document.querySelectorAll("[data-stage-focus] video")].map((v) => getComputedStyle(v).objectFit),
    }))

  test("draws the call's own tile: a face named in the grid and by its plate alone in the strip, the Invited mark, and the focus's picture fitted", async ({ browser }) => {
    test.setTimeout(120_000)
    const room = `h3fe-${randomUUID().slice(0, 8)}`
    const cast = await people(browser, room, 3, { off: [1], invited: [2] })
    const wide = await recorder(browser, 1920, 1080, ticket(recorderToken(room)))
    const phone = await recorder(browser, 390, 844, ticket(recorderToken(room)))
    for (const { page } of [wide, phone]) {
      await expect(page.locator("[data-stage-grid] [data-stage-tile]")).toHaveCount(3, { timeout: 60_000 })
      await expect(page.locator("[data-stage-grid] video")).toHaveCount(2, { timeout: 60_000 })
    }
    // In the grid, Person 1's face says their name as well as the plate (the call's grid tile, "md").
    await expect(wide.page.locator("[data-stage-grid] [data-camera-off]", { hasText: "Person 1" })).toHaveCount(1)
    await scene(wide.page, "faces")
    await scene(phone.page, "faces")

    // The spotlight on Person 3: Person 1's face goes to the strip, where the call's small tile drops the face's name.
    await roomService("UpdateRoomMetadata", { room, metadata: JSON.stringify({ spotlight: { identity: "p3", by: "Host" } }) })
    for (const { page } of [wide, phone]) {
      await expect(page.locator("[data-stage-focus] [data-name-plate]")).toHaveText("Person 3", { timeout: 30_000 })
      await expect(page.locator("[data-stage-strip] [data-stage-tile]")).toHaveCount(2)
      await expect.poll(() => tiles(page)).toEqual({ stripFacesNamed: [false], invitedMarked: [true], focusFit: ["contain"] })
    }
    await scene(wide.page, "faces-spotlight")
    await scene(phone.page, "faces-spotlight")
    await Promise.all([cast.close(), wide.page.close(), phone.page.close()])
  })

  test("draws an empty room's empty stage, and still starts", async ({ browser }) => {
    const room = `h3fe-${randomUUID().slice(0, 8)}`
    const { page, said } = await recorder(browser, 1920, 1080, ticket(recorderToken(room)))
    await expect(stage(page)).toHaveAttribute("data-recording-stage", "live", { timeout: 60_000 })
    await expect(page.locator("[data-stage-grid]")).toBeVisible()
    await expect(page.locator("[data-stage-tile]")).toHaveCount(0)
    await expect.poll(() => said).toEqual(["START_RECORDING"])
    await scene(page, "empty")
    await page.close()
  })

  test("a token LiveKit refuses draws nothing and never starts", async ({ browser }) => {
    const { page, said } = await recorder(browser, 1920, 1080, ticket("not-a-token"))
    await expect(stage(page)).toHaveAttribute("data-recording-stage", "failed", { timeout: 60_000 })
    await expect(page.locator("[data-stage-grid], [data-stage-tile], [data-name-plate]")).toHaveCount(0)
    expect(page.url()).toMatch(/\/call-recording-layout$/)
    await page.waitForTimeout(2_000)
    expect(said).toEqual([])
    await page.close()
  })
})

test("the bare address, or a token in the query, draws nothing, connects nowhere and never starts", async ({ browser }) => {
  const room = `h3fe-${randomUUID().slice(0, 8)}`
  for (const address of [ROUTE, `${ROUTE}?url=${encodeURIComponent(LK)}&token=${encodeURIComponent(recorderToken(room))}`]) {
    const { page, said, sockets } = await recorder(browser, 1920, 1080, address)
    await expect(stage(page)).toHaveAttribute("data-recording-stage", "idle", { timeout: 60_000 })
    await page.waitForTimeout(2_000)
    await expect(page.locator("[data-stage-grid], [data-stage-tile]")).toHaveCount(0)
    // The address is the bare path, whatever it was opened with.
    await expect.poll(() => page.url()).toMatch(/\/call-recording-layout$/)
    expect(sockets.filter((u) => u.startsWith(LK))).toEqual([])
    expect(said).toEqual([])
    // Noindex, and no referrer for anything the page loads.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer")
    await page.close()
  }
})
