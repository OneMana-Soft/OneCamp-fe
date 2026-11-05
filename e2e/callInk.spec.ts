import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"
import { expectTouchSize } from "./touchTarget"

// Annotation on Call Signals (ROWS head S3 for meet-14 and zoom-03): anyone
// the call lets share draws on a screen someone shares, everyone sees it on
// the same spot of that screen in the drawer's own hue, and the sharer and
// whoever runs the call clear everyone's.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000d1"
const SID = "5e550000-0000-4000-8000-0000000000d1"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000003a1", name: "Priya Shah", shares: true }
const JO: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000003a2", name: "Jo Park" }
const PRIYAS = `${PRIYA.identity}|screen_share`
const YOURS = `${YOU.identity}|screen_share`
// The call's token, which says who you are as LiveKit's does.
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`

/** Opens the channel's call with `others` in it (Priya sharing her screen, and Jo, unless a test says otherwise), and joins. */
async function joinWith(page: Page, testInfo: TestInfo, others: FakePerson[] = [PRIYA, JO]) {
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
  })
  const server = await fakeCallServer(page, { you: YOU, others })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return server
}

async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

type Point = { x: number; y: number }

/** A stroke from `from` to `to`: a mouse's press, moves and release, or a finger's (Chromium's touch input, so the page gets touch pointers). */
async function drag(page: Page, touch: boolean, from: Point, to: Point) {
  const along = (i: number) => ({ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 })
  if (!touch) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(along(i).x, along(i).y)
    await page.mouse.up()
    return
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
  // At a finger's pace (a move a frame), and the finger rests before it lifts, as one does at a stroke's end. Eight moves
  // in a blink, lifted mid-move, make Chromium fling, and the next tap only stops the fling: it never clicks, so the
  // sharer's Clear drawings menu never opened at 390 (V-207; a second tap, or one 3 s later, did).
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...along(i), id: 1 }] })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(150)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
}

/** The ink packets the page sent to the call, in order. */
async function inkSent(server: Awaited<ReturnType<typeof joinWith>>) {
  return (await server.received()).filter((d) => d.topic === "oc.signal" && (d.json as { kind?: string }).kind === "ink").map((d) => (d.json as { payload: { share: string; p: number[]; end?: boolean } }).payload)
}

/**
 * DESIGN-BUILD-57 MUST 1: the drawing bar lies whole inside its tile, nothing of the tile's own (its pin) lies over any
 * part of a control, as a press at its middle and near each corner meets that control, and on a phone each is 44 px.
 */
async function barIsClear(page: Page, tile: Locator, tools: Locator, touch: boolean) {
  if (!touch) {
    await page.mouse.move(1, 1)
    await expect(page.getByRole("tooltip"), "no tooltip lies over the bar").toHaveCount(0)
  }
  const t = (await tile.boundingBox())!
  const bar = (await tools.boundingBox())!
  const pin = tile.getByRole("button", { name: /^(Pin to the stage|Unpin)$/ })
  if ((await pin.count()) > 0 && (await pin.isVisible())) {
    const q = (await pin.boundingBox())!
    const apart = q.x >= bar.x + bar.width || q.x + q.width <= bar.x || q.y >= bar.y + bar.height || q.y + q.height <= bar.y
    expect(apart, `the pin (${Math.round(q.x)},${Math.round(q.y)}) stays off the bar (${Math.round(bar.x)}..${Math.round(bar.x + bar.width)})`).toBe(true)
  }
  // The bar is one row at every size: at 390 its fifth button once dropped alone under the first (V-216).
  const tops: number[] = []
  for (const b of await tools.getByRole("button").all()) tops.push(Math.round((await b.boundingBox())!.y))
  expect(Math.max(...tops) - Math.min(...tops), `the drawing bar's buttons sit on one row (tops ${tops.join(", ")})`).toBeLessThanOrEqual(1)
  for (const b of await tools.getByRole("button").all()) {
    const name = await b.getAttribute("aria-label")
    const r = (await b.boundingBox())!
    expect(r.x >= t.x - 0.5 && r.y >= t.y - 0.5 && r.x + r.width <= t.x + t.width + 0.5 && r.y + r.height <= t.y + t.height + 0.5, `${name} lies inside its tile`).toBe(true)
    const met = await b.evaluate((el) => {
      const q = el.getBoundingClientRect()
      return [0.5, 0.2, 0.8].flatMap((fx) => [0.5, 0.2, 0.8].map((fy) => [fx, fy])).every(([fx, fy]) => {
        const at = document.elementFromPoint(q.x + q.width * fx, q.y + q.height * fy)
        return !!at && el.contains(at)
      })
    })
    expect(met, `a press anywhere on ${name} meets it`).toBe(true)
    if (touch) expectTouchSize(Math.min(r.width, r.height), `${name} for a finger`)
  }
}

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = (l: Locator) => (touch ? l.tap({ timeout: 60_000 }) : l.click({ timeout: 60_000 }))
    const size = touch ? "390" : "1280"

    test("you draw on Priya's screen, she draws back in her own hue, and the sharer clears everyone's", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server = await joinWith(page, testInfo)
      const share = page.locator(`[data-flip-key="${PRIYAS}"]`).first()
      await expect(share, "Priya's screen is on the stage").toBeVisible({ timeout: 30_000 })
      const annotate = share.getByRole("button", { name: "Annotate Priya Shah's screen" })
      await expect(annotate, "her screen offers Annotate").toBeVisible({ timeout: 30_000 })
      await press(annotate)
      const tools = share.getByRole("toolbar", { name: "Drawing" })
      await expect(tools.getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true")
      await barIsClear(page, share, tools, touch)
      // DESIGN-BUILD-57 MUST 2: drawing, the bar leads with the way out, set apart from the tools.
      await expect(tools.getByRole("button", { name: "Stop drawing" }), "the way out leads the bar").toBeVisible()
      await expect(tools.getByRole("separator")).toHaveCount(1)
      // You don't run the call and it isn't your screen: your own drawings are yours to clear, not everyone's.
      await expect(tools.getByRole("button", { name: "Clear my drawings" })).toBeVisible()
      await expect(tools.getByRole("button", { name: "Clear drawings" }), "no menu of everyone's to clear").toHaveCount(0)

      // Across the middle of her frame, left to right.
      const box = (await share.locator("[data-ink-surface]").boundingBox())!
      await drag(page, touch, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 }, { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5 })
      await expect(share.locator(`[data-ink-stroke][data-by="${YOU.identity}"]`), "your stroke shows on her screen").toHaveCount(1)
      await expect.poll(async () => (await inkSent(server)).some((p) => p.end), { message: "the stroke went to the call, ended", timeout: 30_000 }).toBe(true)
      const sent = await inkSent(server)
      expect(sent.every((p) => p.share === PRIYAS), "on her screen").toBe(true)
      const ys = sent.flatMap((p) => p.p.filter((_, i) => i % 2 === 1))
      expect(Math.min(...ys), "on the middle of her frame, however wide your stage").toBeGreaterThan(1900)
      expect(Math.max(...ys)).toBeLessThan(2200)

      // Priya draws back: it shows in her hue, as the call names its sender.
      await server.sendData("oc.signal", { kind: "ink", payload: { share: PRIYAS, id: "p1", tool: "pen", at: 0, p: [600, 900, 3400, 3200], end: true } }, PRIYA.identity)
      await expect(share.locator(`[data-ink-stroke][data-by="${PRIYA.identity}"]`), "Priya's stroke shows").toHaveCount(1)
      await shots(page, `call-ink-${size}`)

      // Clear mine takes yours, never hers.
      await press(tools.getByRole("button", { name: "Clear my drawings" }))
      await expect(share.locator("[data-ink-stroke]")).toHaveCount(1)
      await expect(share.locator(`[data-ink-stroke][data-by="${PRIYA.identity}"]`)).toHaveCount(1)
      // Jo can't clear everyone's on her screen; Priya, sharing it, can.
      await server.sendData("oc.signal", { kind: "ink-clear", payload: { share: PRIYAS, whose: "all" } }, JO.identity)
      await page.waitForTimeout(500)
      await expect(share.locator("[data-ink-stroke]"), "Jo's clear counts for nothing").toHaveCount(1)
      await server.sendData("oc.signal", { kind: "ink-clear", payload: { share: PRIYAS, whose: "all" } }, PRIYA.identity)
      await expect(share.locator("[data-ink-stroke]"), "the sharer's clear takes everyone's").toHaveCount(0)

      // Stop drawing puts the pen down, and so does Escape.
      await press(tools.getByRole("button", { name: "Stop drawing" }))
      await expect(annotate, "the way back in").toBeVisible()
      await expect(tools.getByRole("button", { name: "Pen" })).toHaveCount(0)
      await press(annotate)
      await expect(tools.getByRole("button", { name: "Stop drawing" })).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(annotate).toBeVisible()
      await expect(tools.getByRole("button", { name: "Stop drawing" })).toHaveCount(0)
    })

    test("people whose names share a hue draw in their own colours, each their tile's (V-190)", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // Sam Rivera (you) and Lena Ortiz both hash to lake, and so does a guest's raw name, "Guest: Kai Lin"; the call shows him as Kai Lin.
      const LENA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000003a3", name: "Lena Ortiz" }
      const KAI: FakePerson = { identity: "guest-9a1c0000-0000-4000-8000-0000000003a4", name: "Guest: Kai Lin" }
      const server = await joinWith(page, testInfo, [PRIYA, LENA, KAI])
      const share = page.locator(`[data-flip-key="${PRIYAS}"]`).first()
      await expect(share, "Priya's screen is on the stage").toBeVisible({ timeout: 30_000 })
      await press(share.getByRole("button", { name: "Annotate Priya Shah's screen" }))
      const box = (await share.locator("[data-ink-surface]").boundingBox())!
      await drag(page, touch, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 }, { x: box.x + box.width * 0.7, y: box.y + box.height * 0.4 })
      // Each drawer's own line, stacked under yours (40% down) at 60% and 80%, so every colour shows (DESIGN-BUILD-67 MUST 1).
      for (const [who, id, y] of [[LENA, "l1", 2458], [KAI, "k1", 3277]] as const)
        await server.sendData("oc.signal", { kind: "ink", payload: { share: PRIYAS, id, tool: "pen", at: 0, p: [1229, y, 2867, y], end: true } }, who.identity)
      const hues: string[] = []
      for (const who of [YOU, LENA, KAI]) {
        const stroke = share.locator(`[data-ink-stroke][data-by="${who.identity}"]`)
        await expect(stroke, `${who.name}'s stroke shows`).toHaveCount(1, { timeout: 30_000 })
        const hue = (await stroke.first().getAttribute("data-hue")) ?? ""
        hues.push(hue)
        // On a wide screen every tile is in view: their speaking ring is their ink's colour.
        if (!touch) await expect(page.locator(`[data-flip-key="${who.identity}|camera"] [data-speaking-ring]`).first(), `${who.name}'s ring matches their ink`).toHaveAttribute("data-hue", hue)
      }
      expect(new Set(hues).size, `three drawers, three colours (${hues.join(", ")})`).toBe(3)
      await shots(page, `call-ink-hues-${size}`)
    })

    test("ink reads on a white slide: you share one and draw on it, Priya draws back, and as its sharer you clear everyone's", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // Your share's picture is a white slide (a canvas's stream): headless Chromium's own capture is a dark test card,
      // and ink must read on the white slides people share (DESIGN-BUILD-57's re-shot).
      await page.addInitScript(() => {
        navigator.mediaDevices.getDisplayMedia = async () => {
          const canvas = Object.assign(document.createElement("canvas"), { width: 1920, height: 1080 })
          const g = canvas.getContext("2d")!
          const paint = () => {
            g.fillStyle = "#ffffff"
            g.fillRect(0, 0, 1920, 1080)
            g.fillStyle = "#1f2328"
            g.font = "600 84px sans-serif"
            g.fillText("Launch plan", 160, 240)
            g.fillStyle = "#57606a"
            g.font = "48px sans-serif"
            ;["Beta opens on Monday", "The pricing page goes live", "Docs and the demo are ready"].forEach((t, i) => g.fillText(`\u2022  ${t}`, 160, 420 + i * 110))
          }
          paint()
          setInterval(paint, 250)
          return canvas.captureStream(8)
        }
      })
      const server = await joinWith(page, testInfo, [{ ...PRIYA, shares: false }, JO])
      await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: touch ? "More call options" : "Share" }))
      await press(page.getByRole("menuitem", { name: "Share screen" }))
      const mine = page.locator(`[data-flip-key="${YOURS}"]`).first()
      await expect(mine, "your screen is on the stage").toBeVisible({ timeout: 30_000 })
      await expect
        .poll(() => mine.locator("video").first().evaluate((v: HTMLVideoElement) => v.videoWidth), { message: "the slide plays in your tile", timeout: 30_000 })
        .toBeGreaterThan(0)
      await press(mine.getByRole("button", { name: "Annotate your screen" }))
      const tools = mine.getByRole("toolbar", { name: "Drawing" })
      await barIsClear(page, mine, tools, touch)
      const box = (await mine.locator("[data-ink-surface]").boundingBox())!
      await drag(page, touch, { x: box.x + box.width * 0.2, y: box.y + box.height * 0.74 }, { x: box.x + box.width * 0.62, y: box.y + box.height * 0.74 })
      await expect(mine.locator(`[data-ink-stroke][data-by="${YOU.identity}"]`), "your stroke shows on your slide").toHaveCount(1)
      await server.sendData("oc.signal", { kind: "ink", payload: { share: YOURS, id: "p1", tool: "pen", at: 0, p: [3000, 700, 3500, 1500, 3900, 900], end: true } }, PRIYA.identity)
      await expect(mine.locator(`[data-ink-stroke][data-by="${PRIYA.identity}"]`), "Priya's stroke shows on your slide").toHaveCount(1)
      await shots(page, `call-ink-white-${size}`)
      // It's your screen, so Clear offers everyone's as well as yours.
      await press(tools.getByRole("button", { name: "Clear drawings" }))
      await press(page.getByRole("menuitem", { name: "Clear all drawings" }))
      await expect(mine.locator("[data-ink-stroke]"), "your clear takes everyone's").toHaveCount(0)
      await expect
        .poll(async () => (await server.received()).some((d) => d.topic === "oc.signal" && (d.json as { kind?: string }).kind === "ink-clear"), { message: "the clear went to the call", timeout: 30_000 })
        .toBe(true)
    })
  })
}

// V-207: a quick stroke lifted while the finger still moves is a fling to Chromium. Unless the ink keeps its touches,
// the next tap only stops that fling and never clicks, and the sharer's Clear drawings menu stayed shut.
test.describe("at 390 with touch, a quick stroke", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const CROWD: FakePerson[] = Array.from({ length: 24 }, (_, i) => ({
    identity: `9a1c0000-0000-4000-8000-0000000004${String(i).padStart(2, "0")}`,
    name: `Guest ${String(i + 1).padStart(2, "0")}`,
  }))

  async function drawOnYourScreen(page: Page, testInfo: TestInfo, others: FakePerson[]) {
    await joinWith(page, testInfo, others)
    await page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "More call options" }).tap({ timeout: 60_000 })
    await page.getByRole("menuitem", { name: "Share screen" }).tap({ timeout: 60_000 })
    const mine = page.locator(`[data-flip-key="${YOURS}"]`).first()
    await expect(mine, "your screen is on the stage").toBeVisible({ timeout: 30_000 })
    await mine.getByRole("button", { name: "Annotate your screen" }).tap({ timeout: 60_000 })
    const tools = mine.getByRole("toolbar", { name: "Drawing" })
    await expect(tools).toBeVisible()
    const box = (await mine.locator("[data-ink-surface]").boundingBox())!
    const at = (fx: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * 0.74 })
    return { tools, yours: mine.locator(`[data-ink-stroke][data-by="${YOU.identity}"]`), from: at(0.2), to: at(0.62) }
  }

  test("lifted mid-move, it leaves the next tap alone: Clear drawings opens the first time", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { tools, yours, from, to } = await drawOnYourScreen(page, testInfo, [{ ...PRIYA, shares: false }, JO])
    // Eight moves in a blink, lifted mid-move: a flick, the quickest a stroke comes.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] })
    for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y, id: 1 }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await expect(yours, "the flick draws").toHaveCount(1)
    // One tap at once, and no second: the menu opens.
    await tools.getByRole("button", { name: "Clear drawings" }).tap()
    await expect(page.getByRole("menuitem", { name: "Clear my drawings" }), "the first tap after the flick opens Clear drawings").toBeVisible({ timeout: 3_000 })
    await page.getByRole("menuitem", { name: "Clear my drawings" }).tap()
    await expect(yours, "its Clear my drawings takes the stroke").toHaveCount(0)
  })

  // A pinch isn't here: headless Chromium makes no zoom of a synthesized two-finger pinch (Input.synthesizePinchGesture,
  // or two CDP fingers even with maxTouchPoints 2, leave visualViewport.scale at 1). hooks/useClaimTouches.test.tsx pins
  // what a pinch needs from the ink instead: two fingers are never claimed, and the claim comes off when drawing ends.
  test("while you draw, touch still works around the ink: the drawing bar's taps and the People list's scroll", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { tools, yours, from, to } = await drawOnYourScreen(page, testInfo, [{ ...PRIYA, shares: false }, JO, ...CROWD])
    await drag(page, true, from, to)
    await expect(yours).toHaveCount(1)
    await tools.getByRole("button", { name: "Undo" }).tap()
    await expect(yours, "a tap on Undo takes the stroke back").toHaveCount(0)

    // The People list, 27 in the call, scrolls under a finger.
    const dock = page.getByRole("toolbar", { name: "Call controls" })
    const people = dock.getByRole("button", { name: /^People/ })
    if (await people.isVisible()) await people.tap()
    else {
      await dock.getByRole("button", { name: "More call options" }).tap()
      await page.getByRole("menuitem", { name: /^People/ }).tap()
    }
    const panel = page.getByRole("complementary", { name: "People" }).or(page.getByRole("dialog", { name: /People/ })).first()
    await expect(panel, "People opens").toBeVisible({ timeout: 30_000 })
    await expect(panel.getByText("Guest 24"), "the whole call is listed").toHaveCount(1)
    const list = (
      await panel.evaluateHandle((root) =>
        ([root, ...Array.from(root.querySelectorAll("*"))] as Element[]).find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 40) ?? null,
      )
    ).asElement()
    expect(list, "27 people overflow the People list").not.toBeNull()
    // Once it stops moving (a sheet slides in), a finger swipes up from the lowest spot of the list nothing covers.
    const box = () => list!.evaluate((e) => JSON.stringify(e.getBoundingClientRect()))
    await expect.poll(async () => { const a = await box(); await page.waitForTimeout(150); return a === (await box()) }, { message: "the People list stops moving" }).toBe(true)
    const swipe = await list!.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = Math.max(r.top, 0) + 12
      for (let y = Math.min(r.bottom, innerHeight) - 12; y > top + 80; y -= 16) {
        const hit = document.elementFromPoint(r.left + r.width / 2, y)
        if (hit && el.contains(hit)) return { x: r.left + r.width / 2, y, up: Math.round((y - top) * 0.8), why: "" }
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, (r.top + r.bottom) / 2)
      return { x: 0, y: 0, up: 0, why: `nothing of the list is uncovered: ${hit?.tagName}.${hit?.className}` }
    })
    expect(swipe.why, "a spot of the People list takes a finger").toBe("")
    await drag(page, true, { x: swipe.x, y: swipe.y }, { x: swipe.x, y: swipe.y - swipe.up })
    const what = await list!.evaluate((e) => `${e.tagName}.${e.className} touch-action ${getComputedStyle(e).touchAction}, ${e.clientHeight} of ${e.scrollHeight}`)
    await expect.poll(() => list!.evaluate((e) => e.scrollTop), { message: `the People list scrolled under the finger (${what})` }).toBeGreaterThan(20)
  })
})
