import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { SAM, reviewShot, reviewShotInThemes, stubBackend, withStatus } from "./stubbedApp"

// zoom-05 Head B: a call's transcript exports to a file (WebVTT, SubRip, plain
// text) through the read its panel already makes, saved under the name the
// server gives it; and a line is corrected where it is said: the viewer's own
// lines, and every line where the place gives the recording's Delete (a
// channel's moderators, or a workspace admin). A line changed first keeps the
// draft and says who changed it to what, once; a corrected line shows what was
// said under it without a tap. At 390 the menu and the editor are drawers; on
// any touch screen the pencil shows without a hover. The API is stubbed (Head A, 65fd234ac, isn't on the demo yet).

const CH = { ch_uuid: "0c4a0000-0000-4000-8000-0000000000e5", ch_name: "launch" }
const EG = "EG_export0001"
const STARTED = Math.floor(Date.now() / 1000) - 2 * 86_400
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "maya", user_full_name: "Maya Chen" }
const FILE = "launch call 15 Nov.srt"
const line = (uid: string, who: typeof MAYA, text: string, seconds: number, more: object = {}) => ({
  uid,
  transcript_from: { ...who, user_profile_object_key: "" },
  transcript_text: text,
  transcript_timestamp: 0,
  transcript_offset_ms: seconds * 1000,
  ...more,
})
const CORRECTED = { transcript_original_text: "The beta notes go out Sunday.", transcript_corrected_at: "2026-11-16T09:00:00Z", transcript_corrected_by: { user_uuid: SAM.user_uuid, user_full_name: "Sam Rivera" } }
const LINES = [line("0x1", SAM, "Morning, everyone.", 1), line("0x2", MAYA, "Let's ship it fried eh.", 6), line("0x3", MAYA, "The beta notes go out Monday.", 10, CORRECTED)]
const WORDS = { msg: "ok", data: { recording_transcript: LINES, transcript_count: 3, recording_stared_at: new Date(STARTED * 1000).toISOString() }, pageCount: 1 }

type Asked = { exports: URL[]; patches: { path: string; body: unknown }[] }

async function open(
  page: Page,
  testInfo: TestInfo,
  { admin = false, workspaceAdmin = false, patch }: { admin?: boolean; workspaceAdmin?: boolean; patch?: (body: { text: string; was: string }) => unknown } = {},
): Promise<Asked> {
  const asked: Asked = { exports: [], patches: [] }
  await page.addInitScript(() => {
    if (localStorage.getItem("ui-theme") === null) localStorage.setItem("ui-theme", "system")
  })
  await stubBackend(page, testInfo, {
    "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [], user_dms: [], user_projects: [] } },
    // ch_is_admin is the channel's moderator count, as the server sends it.
    "/ch/channelBasicInfo/": { msg: "ok", channel_info: { ch_uuid: CH.ch_uuid, ch_name: CH.ch_name, ch_is_admin: admin ? 1 : 0 } },
    ...(workspaceAdmin ? { "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } } } : {}),
    "/ch/getRecordingList/": { msg: "ok", channel_info: { recordings: [], has_more: false, is_member: 1 } },
    "/getRecordingTranscript/": WORDS,
    "/calls/recordings/": (url: URL, request: Request) => {
      const body = request.postDataJSON() as { text: string; was: string }
      asked.patches.push({ path: url.pathname, body })
      return patch ? patch(body) : { msg: "ok", line: { ...LINES[0], transcript_text: body.text } }
    },
  })
  // The file is a file, not JSON: answered ahead of the stubs, as the API answers it.
  await page.route(
    (url) => url.pathname.includes("/getRecordingTranscript/") && url.searchParams.has("format"),
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback()
      const url = new URL(route.request().url())
      asked.exports.push(url)
      const cors = { "access-control-allow-origin": route.request().headers()["origin"] ?? "", "access-control-allow-credentials": "true", "access-control-expose-headers": "Content-Disposition" }
      if (url.searchParams.get("format") === "txt") {
        await route.fulfill({ status: 503, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ msg: "Service unavailable" }) })
        return
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/x-subrip; charset=utf-8", "content-disposition": `attachment; filename="${FILE}"` },
        body: "1\n00:00:01,000 --> 00:00:03,000\nMorning, everyone.\n",
      })
    },
  )
  // A call nobody recorded opens on its words alone: no picture to stub.
  await page.goto(`/app/channel/${CH.ch_uuid}/recording?play=${EG}&at=0&media=0`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("dialog").locator("[data-transcript]")).toContainText("Morning, everyone.", { timeout: 60_000 })
  return asked
}

const player = (page: Page) => page.getByRole("dialog").first()
const pencils = (page: Page) => player(page).getByRole("button", { name: "Correct this line" })

async function noSideways(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll).toBeLessThanOrEqual(client)
}

async function tall(l: Locator) {
  const box = await l.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
}

/** Its words are all there: nothing in it cut off (toBeVisible passes on a clipped sentence). */
async function unclipped(l: Locator) {
  const cut = await l.evaluate((el) => [el, ...Array.from(el.querySelectorAll("*"))].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth).length)
  expect(cut).toBe(0)
}

for (const [width, height, phone] of [
  [1280, 860, false],
  [390, 844, true],
] as const) {
  const press = (l: Locator) => (phone ? l.tap() : l.click())

  test.describe(`a call's transcript, exported and corrected, at ${width}`, () => {
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone, contextOptions: { reducedMotion: "reduce" } })

    test("Export asks the panel's own read with format= and saves the server's name; a failed one says so with Try again", async ({ page }, testInfo) => {
      const asked = await open(page, testInfo)
      const exported = player(page).getByRole("button", { name: "Export" })
      // A finger's size on a phone; a mouse keeps it compact (V-1164).
      if (phone) await tall(exported)
      else expect((await exported.boundingBox())?.height ?? 0).toBeLessThan(44)
      await press(exported)
      const menu = page.getByRole("menu")
      await expect(menu.getByRole("menuitem")).toHaveText(["WebVTT (.vtt)", "SubRip (.srt)", "Plain text (.txt)"])
      if (phone) {
        await tall(menu.getByRole("menuitem").first())
        await noSideways(page)
        await reviewShotInThemes(page, "z05b-export")
      } else await reviewShot(page, "z05b-export", "light")
      const saved = page.waitForEvent("download")
      await press(menu.getByRole("menuitem", { name: "SubRip (.srt)" }))
      expect((await saved).suggestedFilename()).toBe(FILE)
      expect(asked.exports.at(-1)?.pathname).toMatch(new RegExp(`/getRecordingTranscript/${CH.ch_uuid}/${EG}$`))
      expect(asked.exports.at(-1)?.searchParams.get("format")).toBe("srt")
      // The server can't make the file just now: one sentence, and Try again asks again.
      await press(player(page).getByRole("button", { name: "Export" }))
      await press(page.getByRole("menu").getByRole("menuitem", { name: "Plain text (.txt)" }))
      const failed = player(page).getByRole("alert")
      await expect(failed).toContainText("Couldn't export the transcript.")
      // Its own line under the header, never cut; Try again a finger's size on a phone.
      await unclipped(failed)
      const again = player(page).getByRole("button", { name: "Try again" })
      if (phone) await tall(again)
      await noSideways(page)
      await reviewShot(page, "z05b-export-failed", "light")
      await press(again)
      await expect.poll(() => asked.exports.filter((u) => u.searchParams.get("format") === "txt").length).toBe(2)
    })

    test("a plain member's pencil is on their own line only; a 409 keeps the draft and the resend goes against the new words", async ({ page }, testInfo) => {
      let first = true
      const asked = await open(page, testInfo, {
        patch: (body) => {
          if (!first) return { msg: "ok", line: { ...LINES[0], transcript_text: body.text } }
          first = false
          return withStatus(409, { msg: 'Maya Chen changed this line to "Morning, everybody."', line: { ...LINES[0], transcript_text: "Morning, everybody." } })
        },
      })
      await expect(pencils(page)).toHaveCount(1)
      await press(pencils(page))
      const box = page.getByRole("textbox", { name: "Correct this line" })
      await expect(box).toHaveValue("Morning, everyone.")
      const save = page.getByRole("button", { name: "Save", exact: true })
      await expect(save).toBeDisabled()
      await box.fill("Morning, all.")
      if (phone) {
        // A drawer, its Save and Cancel pinned at the foot of the screen, each a finger's size.
        await expect(page.locator("[data-line-editor]")).toBeVisible()
        const foot = await save.boundingBox()
        expect((foot?.y ?? 0) + (foot?.height ?? 0)).toBeGreaterThan(height - 120)
        await tall(save)
        await tall(page.getByRole("button", { name: "Cancel", exact: true }))
        await noSideways(page)
        await reviewShotInThemes(page, "z05b-editor")
      } else await reviewShot(page, "z05b-editor", "light")
      await press(save)
      await expect(page.getByText('Maya Chen changed this line to "Morning, everybody."')).toBeVisible()
      // The sentence already says the new words: they aren't said twice (MAIN M2).
      await expect(page.getByText(/Now:/)).toHaveCount(0)
      await expect(box).toHaveValue("Morning, all.")
      await reviewShot(page, "z05b-conflict", "light")
      await press(save)
      await expect(player(page).locator("[data-transcript]")).toContainText("Morning, all.")
      expect(asked.patches.map((p) => p.body)).toEqual([
        { text: "Morning, all.", was: "Morning, everyone." },
        { text: "Morning, all.", was: "Morning, everybody." },
      ])
      expect(asked.patches[0].path).toMatch(new RegExp(`/calls/recordings/${EG}/transcript/lines/0x1$`))
    })

    test("a channel's moderator sees the pencil on every line; a corrected line shows what was said without a tap", async ({ page }, testInfo) => {
      await open(page, testInfo, { admin: true })
      await expect(pencils(page)).toHaveCount(3)
      if (phone) await tall(pencils(page).first())
      // What was said is under the line as it opens (MAIN M1); who changed it when is the mark's.
      const said = player(page).getByText("Said: The beta notes go out Sunday.")
      await expect(said).toBeVisible()
      await unclipped(said)
      await expect(player(page).getByText(/^Corrected by Sam Rivera, /)).toHaveCount(0)
      await noSideways(page)
      await reviewShotInThemes(page, "z05b-corrected")
      if (phone) await tall(player(page).getByRole("button", { name: "Corrected" }))
      await press(player(page).getByRole("button", { name: "Corrected" }))
      await expect(player(page).getByText(/^Corrected by Sam Rivera, /)).toBeVisible()
      await expect(said).toBeVisible()
    })

    test("a workspace admin who isn't the channel's moderator sees the pencil on every line, as the server allows (F1)", async ({ page }, testInfo) => {
      await open(page, testInfo, { workspaceAdmin: true })
      await expect(pencils(page)).toHaveCount(3)
    })
  })
}

// A touch screen at a tablet's width (md and up): no hover to find the pencil
// by, so it shows, a finger's size (the house's hover:none rule).
test.describe("a call's transcript on a touch tablet at 1024", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, contextOptions: { reducedMotion: "reduce" } })

  test("the pencil shows without a hover, 44 px", async ({ page }, testInfo) => {
    await open(page, testInfo)
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true)
    await expect(pencils(page)).toHaveCount(1)
    await expect(pencils(page)).toHaveCSS("opacity", "1")
    await tall(pencils(page))
  })
})

// V-1164: a touch tablet in portrait, md and up, so none of the phone's sizes
// apply: Export, the failed export's Try again and the Corrected mark take the
// pencil's hover:none rule, a finger's size each.
test.describe("a call's transcript on a touch tablet at 820", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, contextOptions: { reducedMotion: "reduce" } })

  test("Export, Try again and Corrected are 44 px without a hover", async ({ page }, testInfo) => {
    await open(page, testInfo)
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true)
    const exported = player(page).getByRole("button", { name: "Export" })
    // Soft, so a short run names each one's height.
    const finger = async (l: Locator, what: string) => expect.soft((await l.boundingBox())?.height ?? 0, what).toBeGreaterThanOrEqual(44)
    await finger(exported, "Export")
    await finger(player(page).getByRole("button", { name: "Corrected" }), "Corrected")
    await exported.tap()
    await page.getByRole("menu").getByRole("menuitem", { name: "Plain text (.txt)" }).tap()
    const again = player(page).getByRole("button", { name: "Try again" })
    await expect(again).toBeVisible()
    await finger(again, "Try again")
    await noSideways(page)
    await reviewShot(page, "v1164-touch", "light")
  })
})
