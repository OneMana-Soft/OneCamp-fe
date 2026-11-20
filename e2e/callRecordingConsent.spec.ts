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
  const consents: unknown[] = []
  await stubBackend(page, testInfo, {
    [`/calls/${SID}/consent`]: (_url: URL, request: Request) => (consents.push(request.postDataJSON()), { msg: "ok", data: { recorded: true } }),
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
  return { server, starts, consents }
}

// zoom-09 C1: a guest at a meeting's link (guest/m), who answers a recording's notice before anything of theirs is sent.
const KAI: FakePerson = { identity: "guest-9a1c0000-00e7", name: "Kai Lin", attributes: { "oc.role": "guest", "oc.can": "" } }
const KAI_TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: KAI.identity, name: KAI.name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const LINK = "mt-consent-e7"
async function asGuest(page: Page, testInfo: TestInfo, press: (l: Locator) => Promise<void>, metadata: Record<string, unknown>) {
  const consents: { body: unknown; auth?: string }[] = []
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    [`/guest/meet/${LINK}/join`]: { msg: "ok", data: { token: KAI_TOKEN, room: CH } },
    [`/guest/meet/${LINK}`]: { msg: "ok", data: { state: "live", available: true, title: "Launch review", workspace_name: "Acme" } },
    "/guest/calls/consent": (_url: URL, request: Request) => (consents.push({ body: request.postDataJSON(), auth: request.headers()["authorization"] }), { msg: "ok", data: { recorded: true } }),
  })
  const server = await fakeCallServer(page, { you: KAI, others: [MAYA], room: CH, metadata })
  await page.goto(`/guest/m/${LINK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByLabel("Your name").fill(KAI.name)
  await press(page.getByRole("button", { name: "Join now" }))
  await expect.poll(server.connected, { message: "the guest's call connected to the fake call server", timeout: 60_000 }).toBe(true)
  return { server, consents }
}

/** Record: its own button on a wide dock, a row in More on a phone's; the app's one confirm, a dialog at a computer, a sheet on a phone. */
async function askToRecord(page: Page, press: (l: Locator) => Promise<void>, touch: boolean) {
  const dock = page.getByRole("toolbar", { name: "Call controls" })
  if (touch) {
    await press(dock.getByRole("button", { name: "More call options" }))
    await press(page.getByRole("menuitem", { name: "Record call" }))
  } else {
    await press(dock.getByRole("button", { name: "Record" }))
  }
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Record this call?" })
  await expect(confirm).toBeVisible({ timeout: 30_000 })
  return confirm
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
    // The dock's microphone and camera, whichever way each is now.
    const devices = (page: Page) => page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: /^(Mute|Unmute|Turn camera on|Turn camera off)$/ })

    test("a recording starts only after the confirm, which says everyone is told and where it goes, and its starter gets no notice", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server, starts } = await inCall(page, testInfo, press, true)
      const confirm = await askToRecord(page, press, touch)
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
      // A transcript that is on but not kept writes nothing down: the notice says nothing of one (V-948, CR-268 T1).
      await expect(notice(page)).toContainText("Everything said and shown from now is recorded. The recording goes to #launch's recordings, where its members can watch it. Leave if you don't want to be in it.")
      await expect(notice(page)).not.toContainText("with a transcript")
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
      await expect(notice(page)).toContainText("Everything said and shown from now is recorded. The recording goes to #launch's recordings, where its members can watch it. Leave if you don't want to be in it.")
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

    // V-948: people consented to a recording without being told the call's words are written down too. A recording
    // makes no transcript of its own: the server keeps the call's lines only while its transcript is on and kept, and
    // files them under the recording as it runs. Then the confirm and everyone's notice say so, and no word names a
    // summary.
    test("with the call's transcript on, the confirm and everyone's notice say a transcript comes with the recording, and none names a summary (V-948)", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server, starts } = await inCall(page, testInfo, press, true)
      const transcription = { on: true, by: MAYA.name, byId: MAYA.identity, since: Date.now(), where: "server" }
      // First on but not kept: nothing is written down, so the confirm says nothing of a transcript (CR-268 T1).
      server.setMetadata({ transcription: { ...transcription, kept: false } })
      const captions = page.locator("[data-captions-notice]")
      await expect(captions).toBeVisible({ timeout: 30_000 })
      await press(captions.getByRole("button", { name: "Got it" }))
      await expect(captions).toHaveCount(0)
      const unkept = await askToRecord(page, press, touch)
      await expect(unkept).toContainText("Everyone in it is told, and can leave. The recording goes to #launch's recordings, where its members can watch it.")
      await expect(unkept).not.toContainText("with a transcript")
      await press(unkept.getByRole("button", { name: "Cancel" }))
      await expect(unkept).toBeHidden()
      server.setMetadata({ transcription })

      const confirm = await askToRecord(page, press, touch)
      await expect(confirm).toContainText("Everyone in it is told, and can leave. The recording, with a transcript, goes to #launch's recordings, where its members can watch it.")
      await expect(confirm).not.toContainText(/summar|recap/i)
      await shots(page, `call-record-confirm-transcript-${tag}`)
      await press(confirm.getByRole("button", { name: "Cancel" }))
      await expect(confirm).toBeHidden()
      expect(starts, "Cancel started nothing").toEqual([])

      // Maya records: everyone else's screen says a transcript comes with it.
      server.setMetadata({ transcription, isRecording: true, recordingStartedBy: MAYA.name })
      await expect(notice(page)).toBeVisible({ timeout: 30_000 })
      await expect(notice(page)).toContainText("Maya Chen started recording")
      await expect(notice(page)).toContainText("Everything said and shown from now is recorded, with a transcript. The recording goes to #launch's recordings, where its members can watch it. Leave if you don't want to be in it.")
      await expect(notice(page)).not.toContainText(/summar|recap/i)
      await shots(page, `call-record-notice-transcript-${tag}`)
    })

    test("a member's Got it is kept as their OK of that recording, and Leave call as left before they leave (zoom-09)", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server, consents } = await inCall(page, testInfo, press, false)
      await expect.poll(() => server.published().some((t) => !t.muted), { message: "the member's microphone or camera is on", timeout: 30_000 }).toBe(true)
      const was = server.published().map((t) => t.muted)
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1" })
      await expect(notice(page)).toBeVisible({ timeout: 30_000 })
      // A member is told, never held: no dialog, their microphone and camera stay as they were, and the dock stays theirs.
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      await page.waitForTimeout(600)
      expect(server.published().map((t) => t.muted), "a member's devices stay as they were while the notice shows").toEqual(was)
      await expect(devices(page)).toHaveCount(2)
      for (const control of await devices(page).all()) await expect(control, "a member's dock isn't held by a notice").not.toHaveAttribute("aria-disabled", "true")
      await press(notice(page).getByRole("button", { name: "Got it" }))
      await expect.poll(() => consents).toEqual([{ choice: "accepted", recording: "EG_1", transcript: 0 }])
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_2" })
      await expect(notice(page)).toBeVisible({ timeout: 30_000 })
      await press(notice(page).getByRole("button", { name: "Leave call" }))
      await expect(page.getByRole("heading", { name: "You left the call" })).toBeVisible({ timeout: 30_000 })
      expect(consents.at(-1)).toEqual({ choice: "left", recording: "EG_2", transcript: 0 })
    })

    test("a guest who joins a recorded call answers first: nothing is sent until OK, Esc and a press outside do nothing, and a recording started later asks again (zoom-09)", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const { server, consents } = await asGuest(page, testInfo, press, { isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1" })
      const asked = page.getByRole("alertdialog").and(page.locator("[data-recording-notice]"))
      await expect(asked).toBeVisible({ timeout: 30_000 })
      await expect(asked).toContainText("Maya Chen started recording")
      // A guest has no place: they're told where it stays all the same (D-CL-7).
      await expect(asked).toContainText("The recording stays with this conversation, for the people in it.")
      await page.waitForTimeout(800)
      expect(server.published(), "nothing of the guest's is sent before OK").toEqual([])
      await page.keyboard.press("Escape")
      await (touch ? page.touchscreen.tap(viewport.width / 2, 20) : page.mouse.click(8, 8))
      await page.waitForTimeout(300)
      await expect(asked, "Esc and a press outside leave the question open").toBeVisible()
      expect(server.published()).toEqual([])
      if (touch) {
        // A drawer: on the screen's bottom edge, OK and Leave call in its pinned footer, each a 44 px tap.
        const box = (await asked.boundingBox())!
        expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1)
        const foot = asked.locator("[data-sheet-footer]")
        for (const name of ["OK", "Leave call"]) expect((await foot.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      await page.waitForTimeout(120)
      await shots(page, `call-consent-guest-${tag}`)
      await press(asked.getByRole("button", { name: "OK" }))
      await expect(asked).toHaveCount(0)
      await expect.poll(() => consents).toEqual([{ body: { choice: "accepted", recording: "EG_1", transcript: 0 }, auth: `Bearer ${KAI_TOKEN}` }])
      await expect.poll(() => server.published().filter((t) => !t.muted).length, { message: "the guest's choice is sent once they said OK", timeout: 30_000 }).toBeGreaterThan(0)
      // A new recording mid-call: everything of theirs goes quiet until they say OK again.
      server.setMetadata({ isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_2" })
      await expect(asked).toBeVisible({ timeout: 30_000 })
      await expect.poll(() => server.published().every((t) => t.muted), { message: "muted until OK", timeout: 30_000 }).toBe(true)
      await press(asked.getByRole("button", { name: "OK" }))
      await expect.poll(() => server.published().some((t) => !t.muted), { message: "back as it was", timeout: 30_000 }).toBe(true)
      expect(consents.at(-1)).toMatchObject({ body: { choice: "accepted", recording: "EG_2" } })
    })

    test("while a guest's OK is out it's busy: a second press, a tap or a click and Enter, sends nothing more, and the notice closes on the answer (zoom-09)", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const { consents } = await asGuest(page, testInfo, press, { isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1" })
      // The server holds the answer (it may take up to 8 s before the retry line); each OK that leaves the page is counted.
      let posts = 0
      let answer = () => {}
      const held = new Promise<void>((r) => (answer = r))
      await page.route("**/guest/calls/consent", async (r) => {
        if (r.request().method() !== "POST") return r.fallback()
        posts++
        await held
        return r.fallback()
      })
      const asked = page.getByRole("alertdialog").and(page.locator("[data-recording-notice]"))
      const ok = asked.getByRole("button", { name: "OK" })
      await expect(asked).toBeVisible({ timeout: 30_000 })
      await press(ok)
      await expect.poll(() => posts, { message: "the OK left the page", timeout: 10_000 }).toBe(1)
      await expect(ok, "OK says its answer is out").toHaveAttribute("aria-busy", "true")
      await (touch ? ok.tap({ force: true }) : ok.click({ force: true }))
      await ok.focus()
      await expect(ok, "a busy OK keeps its focus").toBeFocused()
      await page.keyboard.press("Enter")
      await page.waitForTimeout(400)
      expect(posts, "a second press sends nothing more").toBe(1)
      await expect(asked, "the notice holds until the answer").toBeVisible()
      answer()
      await expect(asked, "the hold ends on the answer").toHaveCount(0)
      await expect.poll(() => consents).toEqual([{ body: { choice: "accepted", recording: "EG_1", transcript: 0 }, auth: `Bearer ${KAI_TOKEN}` }])
      expect(posts).toBe(1)
    })

    test("a guest whose notice can't load is told so, with Try again and Leave call, and stays held: the dock's microphone and camera wait on OK, and let go after it (zoom-09)", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      // The notice's own code (the chunk that carries its retry line, "Your OK didn't reach the server") can't come until the guest tries again.
      let down = true
      await page.route("**/_next/static/chunks/**", async (r) => {
        const res = await r.fetch()
        const body = await res.text()
        if (down && body.includes("Your OK didn")) return r.abort("internetdisconnected")
        return r.fulfill({ response: res, body })
      })
      const { server, consents } = await asGuest(page, testInfo, press, { isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1" })
      const failed = page.locator("[data-recording-notice][data-part-failed]")
      await expect(failed).toContainText("Maya Chen started recording", { timeout: 30_000 })
      await expect(failed).toContainText("This notice didn't load. Check your connection, then try again.")
      await expect(failed.getByRole("button", { name: "Leave call" })).toBeVisible()
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      // Held all the same, with the dock in reach: its microphone and camera wait on OK, and say so when pressed.
      await expect(devices(page)).toHaveCount(2)
      for (const control of await devices(page).all()) await expect(control).toHaveAttribute("aria-disabled", "true")
      const mic = devices(page).first()
      await (touch ? mic.tap({ force: true }) : mic.click({ force: true }))
      await expect(page.getByText("Press OK on the notice first", { exact: true })).toBeVisible()
      await expect(page.getByText("Your microphone and camera stay off until you do.", { exact: true })).toBeVisible()
      await page.waitForTimeout(400)
      expect(server.published().filter((t) => !t.muted), "nothing of the guest's is sent").toEqual([])
      expect(consents).toEqual([])
      down = false
      await press(failed.getByRole("button", { name: "Try again" }))
      const asked = page.getByRole("alertdialog").and(page.locator("[data-recording-notice]"))
      await expect(asked).toBeVisible({ timeout: 30_000 })
      await press(asked.getByRole("button", { name: "OK" }))
      await expect(asked).toHaveCount(0)
      await expect.poll(() => server.published().some((t) => !t.muted), { message: "back as it was", timeout: 30_000 }).toBe(true)
      for (const control of await devices(page).all()) await expect(control, "the dock lets go after OK").not.toHaveAttribute("aria-disabled", "true")
      expect(consents).toEqual([{ body: { choice: "accepted", recording: "EG_1", transcript: 0 }, auth: `Bearer ${KAI_TOKEN}` }])
    })

    if (!touch)
      test("a guest's notice opens on OK, and Tab and Shift+Tab move between OK and Leave call without leaving it (zoom-09)", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { consents } = await asGuest(page, testInfo, press, { isRecording: true, recordingStartedBy: MAYA.name, egressID: "EG_1" })
        const asked = page.getByRole("alertdialog").and(page.locator("[data-recording-notice]"))
        const ok = asked.getByRole("button", { name: "OK" })
        const leave = asked.getByRole("button", { name: "Leave call" })
        await expect(asked).toBeVisible({ timeout: 30_000 })
        await expect(ok, "OK takes the first focus, never Leave call").toBeFocused()
        for (const [key, to] of [["Tab", leave], ["Tab", ok], ["Shift+Tab", leave], ["Shift+Tab", ok]] as const) {
          await page.keyboard.press(key)
          await expect(to, `${key} keeps to OK and Leave call`).toBeFocused()
          expect(await asked.evaluate((d) => d.contains(document.activeElement)), `${key} stays inside the notice`).toBe(true)
        }
        expect(consents, "moving the focus answers nothing").toEqual([])
        await page.keyboard.press("Enter")
        await expect(asked).toHaveCount(0)
        await expect.poll(() => consents).toEqual([{ body: { choice: "accepted", recording: "EG_1", transcript: 0 }, auth: `Bearer ${KAI_TOKEN}` }])
      })
  })
}
