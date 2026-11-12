import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"

// A recording asks first and tells everyone (UX-CALLS-H1, CALLS-07). Record
// started at one press, and everyone else learnt of it from a pill at the top
// of the stage, if they saw it. Now whoever records is asked first, told that
// everyone is told and where the recording goes; and everyone else's screen
// says who started recording, with Got it and Leave call. The person who
// started it is never told they did.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000e7"
const SID = "5e550000-0000-4000-8000-0000000000e7"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name }
const MAYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000e2", name: "Maya Chen" }
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`

/** #launch's call, joined over the fake call server, by a channel admin (who may record) or a member; what the page asked to start. */
async function inCall(page: Page, testInfo: TestInfo, press: (l: Locator) => Promise<void>, admin: boolean) {
  const starts: Record<string, unknown>[] = []
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: admin, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: admin ? "host" : "participant", can: [] } } },
    "/ch/startCallRecording": (_url: URL, request: Request) => {
      starts.push(request.postDataJSON() as Record<string, unknown>)
      return { msg: "ok" }
    },
  })
  const server = await fakeCallServer(page, { you: YOU, others: [MAYA], room: CH })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await press(page.getByRole("button", { name: "Join now" }))
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return { server, starts }
}

/**
 * By keyboard through the controls of `scope`, from where the focus is now: each stop is
 * in it and shows its focus, and is shot for the design look (light and dark). The stops' names.
 */
async function focusWalk(page: Page, scope: Locator, name: string, key = "Tab") {
  const stops: string[] = []
  for (let i = 0; i < 8; i++) {
    const s = await scope.evaluate((root) => {
      const a = document.activeElement as HTMLElement | null
      if (!a || !root.contains(a)) return null
      const cs = getComputedStyle(a)
      return { name: (a.getAttribute("aria-label") || a.textContent || "").trim(), ring: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none" }
    })
    if (!s || stops.includes(s.name)) break
    expect(s.ring, `a visible focus on "${s.name}"`).toBe(true)
    stops.push(s.name)
    await shots(page, `${name}-${stops.length}`)
    await page.keyboard.press(key)
  }
  return stops
}

async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch })
    const press = (l: Locator) => (touch ? l.tap({ timeout: 60_000 }) : l.click({ timeout: 60_000 }))
    const tag = touch ? "390" : "1280"
    const notice = (page: Page) => page.locator("[data-recording-notice]")

    test("a recording starts only after the confirm, which says everyone is told and where it goes, and its starter gets no notice", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server, starts } = await inCall(page, testInfo, press, true)
      const dock = page.getByRole("toolbar", { name: "Call controls" })
      // Record: its own button on a wide dock, a row in More on a phone's.
      if (touch) {
        await press(dock.getByRole("button", { name: "More call options" }))
        await press(page.getByRole("menuitem", { name: "Record call" }))
      } else {
        await press(dock.getByRole("button", { name: "Record" }))
      }
      // The app's one confirm: a dialog at a computer, a sheet on a phone.
      const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Record this call?" })
      await expect(confirm).toBeVisible({ timeout: 30_000 })
      await expect(confirm).toContainText("Everyone in it is told, and can leave. The recording goes to #launch's recordings, where its members can watch it.")
      expect(starts, "nothing started before the confirm").toEqual([])
      await shots(page, `call-record-confirm-${tag}`)
      if (!touch) {
        // By keyboard: one Tab on from where the confirm puts the focus (a focus a script set shows no ring
        // after a click, by the browser's rule), then through its buttons; the confirm keeps the focus in it.
        await page.keyboard.press("Tab")
        const stops = await focusWalk(page, confirm, "call-record-confirm-focus")
        expect(stops).toEqual(expect.arrayContaining(["Start recording", "Cancel"]))
      }

      await press(confirm.getByRole("button", { name: "Start recording" }))
      await expect.poll(() => starts, { message: "the recording was asked for once" }).toEqual([{ channel_uuid: CH }])
      // As the server writes it: who started it first, its egress id seconds later (CR-B66 F1).
      server.setMetadata({ isRecording: true, recordingStartedBy: YOU.name })
      await expect(page.locator("[data-recording-pill]")).toBeVisible()
      await expect(confirm).toBeHidden()
      server.setMetadata({ isRecording: true, recordingStartedBy: YOU.name, egressID: "EG_mine" })
      await page.waitForTimeout(500)
      // Told already: the confirm was theirs.
      await expect(notice(page)).toHaveCount(0)
      // Their own screen says who started it, as Meet and Teams say it: you (shown, and read out on a phone).
      await expect(page.locator("[data-recording-pill]")).toContainText("Recording · started by you")
      await expect(page.locator("[data-recording-pill]")).not.toContainText(YOU.name)
      await shots(page, `call-record-started-by-you-${tag}`)
    })

    test("the recording's notice sits above the captions notice, both in the stage, the dock and the first tile's name in view", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server } = await inCall(page, testInfo, press, false)
      server.setMetadata({
        isRecording: true,
        recordingStartedBy: MAYA.name,
        transcription: { on: true, by: MAYA.name, byId: MAYA.identity, since: Date.now(), where: "server", kept: false },
      })
      const captions = page.locator("[data-captions-notice]")
      await expect(notice(page)).toBeVisible({ timeout: 30_000 })
      await expect(captions).toBeVisible({ timeout: 30_000 })
      const rec = (await notice(page).boundingBox())!
      const cap = (await captions.boundingBox())!
      expect(rec.y + rec.height, "the recording notice ends above the captions notice").toBeLessThanOrEqual(cap.y)
      for (const box of [rec, cap]) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      }
      const inView = async (l: Locator, what: string) => {
        const b = (await l.boundingBox())!
        expect(b, `${what} is drawn`).toBeTruthy()
        expect(b.y, `${what} starts in view`).toBeGreaterThanOrEqual(0)
        expect(b.y + b.height, `${what} ends in view`).toBeLessThanOrEqual(viewport.height)
      }
      await inView(page.getByRole("toolbar", { name: "Call controls" }), "the dock")
      await inView(page.getByText(MAYA.name, { exact: true }).first(), "the first tile's name")
      await shots(page, `call-record-notice-captions-${tag}`)
    })

    test("someone else's screen says who started recording, with Got it and Leave call, once per recording", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server } = await inCall(page, testInfo, press, false)
      // As the server writes it: who started it first; its egress id lands later (CR-B66 F1).
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name })
      await expect(notice(page)).toBeVisible({ timeout: 30_000 })
      await expect(notice(page)).toContainText("Maya Chen started recording")
      await expect(notice(page)).toContainText("Everything said and shown from now is recorded. Leave if you don't want to be in it.")
      // Within the stage, under its top row, and its buttons in reach of a thumb.
      const box = await notice(page).boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      if (touch) {
        for (const name of ["Got it", "Leave call"]) {
          // The shared touch target (app/phone.css): the control's ::before reaches out to 44 px.
          const hit = await notice(page).getByRole("button", { name }).evaluate((el) => parseFloat(getComputedStyle(el, "::before").height))
          expect(hit, `${name} takes a 44 px tap`).toBeGreaterThanOrEqual(44)
        }
      }
      await shots(page, `call-record-notice-${tag}`)

      if (!touch) {
        // Leave call is the danger ink at rest and under the pointer, on a LIGHT page: the stage is always dark,
        // so the token resolves to its dark value there (MAIN 11:1x: no hex hover of its own, never a white hover).
        const leave = notice(page).getByRole("button", { name: "Leave call" })
        const ink = () =>
          notice(page).evaluate((n) => {
            const probe = document.createElement("span")
            probe.style.color = "var(--danger-ink)"
            n.appendChild(probe)
            const stage = getComputedStyle(probe).color
            probe.remove()
            document.body.appendChild(probe)
            const page = getComputedStyle(probe).color
            probe.remove()
            return { stage, page }
          })
        const { stage, page: pageInk } = await ink()
        expect(stage, "the stage's danger ink is the dark one, not the light page's").not.toBe(pageInk)
        await expect.poll(() => leave.evaluate((e) => getComputedStyle(e).color), { message: "Leave call at rest" }).toBe(stage)
        await leave.hover()
        await expect.poll(() => leave.evaluate((e) => getComputedStyle(e).color), { message: "Leave call hovered" }).toBe(stage)
        await page.mouse.move(0, 0)
        // By keyboard: the notice took the focus (from nowhere) on Got it; Shift+Tab to Leave call, then on through Got it.
        await expect(notice(page).getByRole("button", { name: "Got it" })).toBeFocused()
        await page.keyboard.press("Shift+Tab")
        const stops = await focusWalk(page, notice(page), "call-record-notice-focus")
        expect(stops).toEqual(["Leave call", "Got it"])
      }

      await press(notice(page).getByRole("button", { name: "Got it" }))
      await expect(notice(page)).toHaveCount(0)
      // Read and put away: the stage's pill keeps saying who started it (read out on a phone, where it shows the dot and time).
      await expect(page.locator("[data-recording-pill]")).toContainText(`started by ${MAYA.name}`)
      await shots(page, `call-record-started-by-${tag}`)
      // The recording's id lands after Got it: the same recording, read already.
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1" })
      await page.waitForTimeout(500)
      await expect(notice(page), "told twice about one recording").toHaveCount(0)
      // Something else about the call changes: the recording's notice was read.
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1", muteOnEntry: true })
      await page.waitForTimeout(500)
      await expect(notice(page)).toHaveCount(0)

      // A new recording is news again; Leave call leaves.
      server.setMetadata({})
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_2" })
      await expect(notice(page)).toBeVisible({ timeout: 30_000 })
      await press(notice(page).getByRole("button", { name: "Leave call" }))
      await expect(page.getByRole("heading", { name: "You left the call" })).toBeVisible({ timeout: 30_000 })
    })
  })
}
