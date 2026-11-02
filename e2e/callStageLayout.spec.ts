import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { stageLayout, type Size, type StageInput } from "../lib/calls/stageLayout"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { facesClear } from "./stageFaces"
import { reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"
import { animationsSettled } from "./settled"

// Stage Layout (A4, #54; ROWS head S1 for meet-17, meet-14 and zoom-03): the
// call's stage draws what lib/calls/stageLayout says for the room its frame
// measures. With twelve in the call the grid draws everyone it can at 160x90
// or more and pages the rest (a phone drew two at a time before); on the
// stage the strip holds whoever fits, then "+N", which opens the grid; and
// everyone sharing is on the stage together, a second sharer's screen taking
// it from a pin as the first's does; on a phone a share has the stage's width,
// the strip under it, and pinches (V-233).
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000cf"
const SID = "5e550000-0000-4000-8000-0000000000af"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const OTHERS: FakePerson[] = ["Priya Shah", "Jo Park", "Alex Kim", "Maya Chen", "Lena Fischer", "Omar Haddad", "Ines Duarte", "Kenji Sato", "Ruth Mensah", "Tomas Novak", "Ada Lin"].map(
  (name, i) => ({ identity: `9a1c0000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, name }),
)
const [PRIYA, JO] = OTHERS
// The call's token, which says who you are as LiveKit's does: LiveKit names your part from its sub and name.
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
/** Twelve cameras (you and eleven others), as stageLayout counts them. */
const TWELVE = Array.from({ length: 12 }, (_, i) => `p${i}|camera`)

/** Opens the channel's call with `others` already in it, and joins. */
async function joinWith(page: Page, testInfo: TestInfo, others: FakePerson[]) {
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

/** The room the stage's frame leaves for tiles, as the page measures it (useContentBox). */
function frameBox(page: Page): Promise<Size> {
  return page.locator("[data-stage-layout]").evaluate((el) => {
    const css = getComputedStyle(el)
    return {
      w: Math.round(el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)),
      h: Math.round(el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)),
    }
  })
}

/** What stageLayout says for the stage as the page measures it now. */
async function said(page: Page, input: Omit<StageInput, "viewport">) {
  return stageLayout({ ...input, viewport: await frameBox(page) })
}

/** Whether every tile, and the pager, lies inside the frame's room for tiles; else what sticks out. */
function insideFrame(page: Page): Promise<string> {
  return page.locator("[data-stage-layout]").evaluate((frame) => {
    const css = getComputedStyle(frame)
    const box = frame.getBoundingClientRect()
    const room = {
      left: box.left + parseFloat(css.paddingLeft) - 1,
      right: box.right - parseFloat(css.paddingRight) + 1,
      top: box.top + parseFloat(css.paddingTop) - 1,
      bottom: box.bottom - parseFloat(css.paddingBottom) + 1,
    }
    for (const el of frame.querySelectorAll<HTMLElement>("[data-stage-tile], [data-stage-pager], [data-stage-more]")) {
      const r = el.getBoundingClientRect()
      if (r.left < room.left || r.right > room.right || r.top < room.top || r.bottom > room.bottom) return `${el.dataset.flipKey ?? el.tagName} sticks out of the stage`
    }
    return "inside"
  })
}

async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/**
 * Whether two fingers on a share stay the browser's, so it pinches (V-207, V-233): the page locks no zoom, and neither
 * what a finger on the share's middle meets nor anything above it sets a touch-action that stops a pinch.
 */
function pinchable(share: Locator): Promise<string> {
  return share.evaluate((tile) => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ?? ""
    if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0*)?\s*(,|$)/i.test(meta)) return `the page locks its zoom (${meta})`
    const r = tile.getBoundingClientRect()
    let el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!el || !tile.contains(el)) return `the share's middle is under ${el ? el.tagName.toLowerCase() : "nothing"}`
    for (; el; el = el.parentElement) {
      const t = getComputedStyle(el).touchAction
      if (t !== "auto" && t !== "manipulation" && !t.includes("pinch-zoom")) return `${el.tagName.toLowerCase()} sets touch-action: ${t}`
    }
    return "pinchable"
  })
}

const tilesIn = (scope: Locator) => scope.locator("[data-stage-tile]")
const shareOf = (p: FakePerson) => `[data-flip-key="${p.identity}|screen_share"]`
const cameraOf = (p: FakePerson) => `[data-flip-key="${p.identity}|camera"]`

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = (l: Locator) => (touch ? l.tap({ timeout: 60_000 }) : l.click({ timeout: 60_000 }))
    const size = touch ? "390" : "1280"

    test("the grid draws everyone it can at 160x90 or more, and pages the rest", async ({ page }, testInfo) => {
      await joinWith(page, testInfo, OTHERS)
      const grid = page.locator("[data-stage-grid]")
      await expect(tilesIn(grid).first()).toBeVisible({ timeout: 30_000 })
      let want = (await said(page, { tiles: TWELVE, presenting: [], mode: "grid" })).grid!
      await expect
        .poll(
          async () => {
            want = (await said(page, { tiles: TWELVE, presenting: [], mode: "grid" })).grid!
            const shown = await tilesIn(grid).count()
            return shown === want.keys.length ? "as stageLayout says" : `the grid draws ${shown}; stageLayout says ${want.keys.length}`
          },
          { message: "the grid draws as many as stageLayout says for the stage's room" },
        )
        .toBe("as stageLayout says")
      // A phone drew two at a time before (LiveKit's table).
      expect(want.keys.length).toBeGreaterThan(2)
      await expect.poll(() => facesClear(page), { message: "every face is clear of its name plate" }).toBe("clear")
      await shots(page, `call-stage-grid-12-${size}`)

      let seen = 0
      for (let p = 0; p < want.pages; p++) {
        if (want.pages > 1) await expect(page.getByText(`Page ${p + 1} of ${want.pages}`, { exact: true })).toBeVisible()
        const sizes = await tilesIn(grid).evaluateAll((els) => els.map((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight]))
        for (const [w, h] of sizes) {
          expect(w, "a tile's width").toBeGreaterThanOrEqual(160)
          expect(h, "a tile's height").toBeGreaterThanOrEqual(90)
        }
        await expect.poll(() => insideFrame(page), { message: "every tile and the pager lie inside the stage" }).toBe("inside")
        seen += sizes.length
        if (p < want.pages - 1) await press(page.getByRole("button", { name: "Next page" }))
      }
      expect(seen, "everyone is on a page").toBe(12)
      if (want.pages > 1) {
        await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled()
        await press(page.getByRole("button", { name: "Previous page" }))
        await expect(page.getByText(`Page ${want.pages - 1} of ${want.pages}`, { exact: true })).toBeVisible()
      }
    })

    test("on the stage the strip holds whoever fits, then +N, which opens the grid of everyone", async ({ page }, testInfo) => {
      await joinWith(page, testInfo, OTHERS)
      const grid = page.locator("[data-stage-grid]")
      // Pressing someone in the grid puts them on the stage, pinned.
      await press(tilesIn(grid).first())
      await expect(page.locator("[data-stage-focus]")).toBeVisible()
      const strip = page.locator("[data-stage-strip]")
      const more = page.locator("[data-stage-more]")
      await expect
        .poll(
          async () => {
            const want = (await said(page, { tiles: TWELVE, presenting: [], pin: TWELVE[0], mode: "speaker" })).strip
            const people = await tilesIn(strip).count()
            const plus = (await more.count()) ? (await more.innerText()).trim() : ""
            const got = `${people} people${plus ? ` and ${plus}` : ""}`
            const says = `${want.keys.length} people${want.more ? ` and +${want.more}` : ""}`
            return got === says ? "as stageLayout says" : `the strip shows ${got}; stageLayout says ${says}`
          },
          { message: "the strip shows whoever fits, then +N" },
        )
        .toBe("as stageLayout says")
      if (touch) {
        // A phone's: three people and "+8".
        await expect(tilesIn(strip)).toHaveCount(3)
        await expect(page.getByRole("button", { name: "Show everyone (8 more)" })).toBeVisible()
      }
      await expect.poll(() => insideFrame(page), { message: "the focus and the strip lie inside the stage" }).toBe("inside")
      await expect.poll(() => facesClear(page), { message: "every face is clear of its name plate" }).toBe("clear")
      await shots(page, `call-stage-strip-${size}`)
      await press(page.getByRole("button", { name: /^Show everyone \(\d+ more\)$/ }))
      await expect(page.locator('[data-stage-layout="grid"]')).toBeVisible()
      await expect(tilesIn(grid).first()).toBeVisible()
    })

    test("everyone sharing is on the stage together, and a second sharer takes it from a pin as the first does", async ({ page }, testInfo) => {
      const server = await joinWith(page, testInfo, OTHERS.slice(0, 5))
      const focus = page.locator("[data-stage-focus]")
      // You pin Jo; Priya begins sharing, and her screen takes the stage.
      await press(page.locator(`[data-stage-grid] ${cameraOf(JO)}`))
      await expect(focus.locator(cameraOf(JO))).toBeVisible()
      server.share(PRIYA.identity)
      await expect(focus.locator(shareOf(PRIYA))).toBeVisible()
      await expect(focus.locator(cameraOf(JO))).toHaveCount(0)
      // You pin Jo again; now Jo begins sharing too.
      await press(page.getByRole("button", { name: "Show Jo Park", exact: true }))
      await expect(focus.locator(cameraOf(JO))).toBeVisible()
      server.share(JO.identity)
      if (touch) {
        // A phone's stage holds the newest; Priya's waits first in the strip.
        await expect(focus.locator(shareOf(JO))).toBeVisible()
        await expect(tilesIn(focus)).toHaveCount(1)
        await expect(page.locator("[data-stage-strip] button").first()).toHaveAccessibleName("Show Priya Shah's screen")
      } else {
        await expect(focus.locator(shareOf(PRIYA))).toBeVisible()
        await expect(focus.locator(shareOf(JO))).toBeVisible()
        await expect(tilesIn(focus)).toHaveCount(2)
      }
      await expect.poll(() => insideFrame(page), { message: "the shares and the strip lie inside the stage" }).toBe("inside")
      await expect.poll(() => facesClear(page), { message: "every face is clear of its name plate" }).toBe("clear")
      await shots(page, `call-stage-two-sharers-${size}`)
      // Priya stops: Jo's screen has the stage.
      server.share(PRIYA.identity, false)
      await expect(focus.locator(shareOf(PRIYA))).toHaveCount(0)
      await expect(focus.locator(shareOf(JO))).toBeVisible()
    })

    // V-233 (DESIGN-BUILD-71): beside the strip a 390 phone drew a share in a 254 px column, a slide 254x143 in a
    // 254x700 stage. There the share takes the stage's width with the strip a row under it, in an empty call and a
    // busy one; a wide stage keeps its strip beside. Either way two fingers on the share stay the browser's.
    for (const [call, others] of [
      ["an empty call", OTHERS.slice(0, 1)],
      ["a busy call", OTHERS],
    ] as const) {
      test(`a shared screen draws as wide as the stage allows in ${call}, the strip ${touch ? "under" : "beside"} it`, async ({ page }, testInfo) => {
        const server = await joinWith(page, testInfo, [...others])
        server.share(PRIYA.identity)
        const screen = page.locator(`[data-stage-focus] ${shareOf(PRIYA)}`)
        await expect(screen).toBeVisible({ timeout: 30_000 })
        const strip = page.locator("[data-stage-strip]")
        const more = page.locator("[data-stage-more]")
        const input = {
          tiles: Array.from({ length: others.length + 1 }, (_, i) => `p${i}|camera`),
          presenting: [`${PRIYA.identity}|screen_share`],
          mode: "speaker" as const,
        }
        await expect
          .poll(
            async () => {
              const want = await said(page, input)
              const [s, f] = [await strip.boundingBox(), await screen.boundingBox()]
              if (!s || !f) return "the share or the strip isn't drawn"
              // The share is 1920x1080, fitted into its tile as the tile's object-contain fits it.
              const drawn = Math.min(f.width, (f.height * 16) / 9)
              const under = s.y >= f.y + f.height
              if (under !== want.strip.below) return `the strip is ${under ? "under" : "beside"} the share; stageLayout says ${want.strip.below ? "under" : "beside"}`
              if (Math.abs(drawn - want.focus.tile.w) > 2) return `the share draws ${Math.round(drawn)} px wide; stageLayout says ${want.focus.tile.w}`
              const people = await tilesIn(strip).count()
              const plus = (await more.count()) ? (await more.innerText()).trim() : ""
              const got = `${people} people${plus ? ` and ${plus}` : ""}`
              const says = `${want.strip.keys.length} people${want.strip.more ? ` and +${want.strip.more}` : ""}`
              return got === says ? "as stageLayout says" : `the strip shows ${got}; stageLayout says ${says}`
            },
            { message: "the share and the strip draw where stageLayout says" },
          )
          .toBe("as stageLayout says")
        // The bar for V-233's re-look: on a phone the shared slide is at least 366 px wide, read at rest. While the share
        // enters the stage (stageMotion's scale from 0.96) its box is up to 4% short, and the check above already takes it
        // within 2 px: V-318 read 364.27 px in the scale's tail.
        if (touch) {
          await animationsSettled(screen)
          const rest = (await screen.boundingBox())!
          expect(Math.min(rest.width, (rest.height * 16) / 9), "the shared slide's width at 390").toBeGreaterThanOrEqual(366)
        }
        await expect.poll(() => insideFrame(page), { message: "the share and the strip lie inside the stage" }).toBe("inside")
        await expect.poll(() => facesClear(page), { message: "every face is clear of its name plate" }).toBe("clear")
        expect(await pinchable(screen), "two fingers on the share stay the browser's").toBe("pinchable")
        await shots(page, `call-stage-share-${others.length > 1 ? "busy" : "empty"}-${size}`)
      })
    }
  })
}
