import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { AI_READS, reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"

// The in-call AI says what it can hear (UX-CALLS-H2, CALLS-05). It said
// "Listening · shared with everyone in the call" and offered "What did we
// decide?" in a call nobody was transcribing; it answers from the transcript
// only, so the answer was a guess. Now it says it isn't listening until the
// transcript is on, with one press to turn it on for everyone (who are told
// first); then that it has just started, and how long it has heard. Someone
// who comes in after the transcript began is told since when it runs, and the
// assistant reads the call's kept lines (the server's, UX-CALLS-H3), not only
// what their screen has heard since. Where the workspace has transcripts off
// it says it can't follow the call and offers nothing it can't do; an ask that
// fails says why, and Try again asks it again.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000e5"
const SID = "5e550000-0000-4000-8000-0000000000e5"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name }
const MAYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000e1", name: "Maya Chen" }
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const ANSWER = "You agreed to ship v2 on Friday."

/** How the fake assistant answers each ask in turn: the answer, a server fault, or no answer at all (offline). */
type Reply = "answer" | 500 | "offline"

/** A channel's call with the AI on, joined over the fake call server; what the page asked the assistant and the transcription switch. */
async function inCall(
  page: Page,
  testInfo: TestInfo,
  press: (l: Locator) => Promise<void>,
  metadata: Record<string, unknown>,
  { mode = "backend", replies = [] }: { mode?: "backend" | "off"; replies?: Reply[] } = {},
) {
  const asked: Record<string, unknown>[] = []
  const queue = [...replies]
  const switched: Record<string, unknown>[] = []
  await stubBackend(page, testInfo, {
    ...AI_READS,
    "/config/client": { msg: "ok", data: { features: { calls: true, ai: true }, transcription_mode: mode, transcription_where: "server" } },
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    "/ai/status": { msg: "ok", data: { enabled: true, provider: "ollama", model: "qwen3" } },
    "/livekit/transcription": (_url: URL, request: Request) => {
      switched.push(request.postDataJSON() as Record<string, unknown>)
      return { msg: "ok" }
    },
  })
  // The answer streams as the server sends it (server-sent events).
  await page.route(/\/ai\/in-call\/ask\/stream$/, async (route) => {
    const request = route.request()
    const headers = {
      "access-control-allow-origin": request.headers()["origin"] || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "POST,OPTIONS",
    }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    asked.push(request.postDataJSON() as Record<string, unknown>)
    const reply = queue.shift() ?? "answer"
    if (reply === "offline") return route.abort("internetdisconnected")
    if (reply === 500) return route.fulfill({ status: 500, headers: { ...headers, "content-type": "application/json" }, body: "{}" })
    return route.fulfill({ status: 200, headers: { ...headers, "content-type": "text/event-stream" }, body: `data: ${JSON.stringify({ content: ANSWER })}\n\ndata: {"done": true}\n\n` })
  })
  const server = await fakeCallServer(page, { you: YOU, others: [MAYA], metadata, room: CH })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await press(page.getByRole("button", { name: "Join now" }))
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return { server, asked, switched }
}

/** Maya says a line, final, as her browser captions her (browser mode: the speaker is who LiveKit says sent it). */
const mayaSays = (server: Awaited<ReturnType<typeof fakeCallServer>>, id: string, text: string) =>
  server.sendData("lk.transcription", { id, text, isFinal: true }, MAYA.identity)

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
    const openAssistant = async (page: Page) => {
      await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: /^Ask AI/ }))
      const panel = page.getByRole("complementary", { name: "Ask about this call" })
      await expect(panel).toBeVisible({ timeout: 30_000 })
      return panel
    }
    const tag = touch ? "390" : "1280"

    test("the in-call AI says it isn't listening until the transcript is on, then that it has just started, and answers from what it heard", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { server, asked, switched } = await inCall(page, testInfo, press, {})
      const panel = await openAssistant(page)
      const hearing = panel.locator("[data-in-call-hearing]")
      // A screen reader hears the state as it changes, never the minutes ticking by (CR-B65 F2).
      const announced = hearing.getByRole("status")

      await expect(hearing).toHaveText("Not listening yet")
      await expect(announced).toHaveText("Not listening yet")
      // The switch has the call's own name: the confirm, the dock and the announcements say captions (CR-B65 F1).
      await expect(panel.getByText("Turn on captions so I can follow the call. Everyone in it is told first.")).toBeVisible()
      await expect(panel.getByRole("button", { name: "What did we decide?" }), "no suggestion it can't answer").toHaveCount(0)
      if (touch) {
        // A phone: the panel is a drawer over the dock, its ask box the screen's footer, clear of the home indicator.
        const vh = page.viewportSize()!.height
        const composer = panel.locator("[data-ai-composer]")
        const foot = await composer.evaluate((e) => parseFloat(getComputedStyle(e.parentElement!).paddingBottom))
        const box = (await composer.boundingBox())!
        expect(box.y + box.height, "the ask box sits at the foot of the screen").toBeGreaterThanOrEqual(vh - foot - 1)
        expect(box.y + box.height, "and inside it").toBeLessThanOrEqual(vh)
        const dock = page.getByRole("toolbar", { name: "Call controls" })
        const dockBox = await dock.boundingBox()
        if (dockBox) {
          const top = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-in-call-ai]"), [dockBox.x + dockBox.width / 2, Math.min(dockBox.y + dockBox.height / 2, vh - 1)] as const)
          expect(top, "the drawer covers the dock").toBe(true)
        }
      }
      await shots(page, `call-ai-not-listening-${tag}`)

      // One press, and everyone is told first: the call's own confirm.
      const turnOn = panel.getByRole("button", { name: "Turn on captions for everyone" })
      await expect(turnOn).toHaveText("Turn on captions")
      await press(turnOn)
      // The confirm's own button (the dock has a "Turn on captions" too): a dialog at a computer, a sheet on a phone.
      const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Turn on captions for everyone?" })
      await expect(confirm).toBeVisible()
      await shots(page, `call-ai-confirm-${tag}`)
      await press(confirm.getByRole("button", { name: "Turn on captions" }))
      await expect.poll(() => switched, { message: "the transcript was turned on for the call" }).toEqual([{ room_name: CH, on: true }])
      server.setMetadata({ transcription: { on: true, by: YOU.name, byId: YOU.identity, since: Date.now(), where: "server", kept: true } })

      await expect(hearing).toHaveText("Listening · just started")
      await expect(announced).toHaveText("Listening")
      await expect(panel.getByRole("button", { name: "What did we decide?" }), "no suggestions in the first 30 seconds").toHaveCount(0)
      // Nothing asked, nothing heard yet.
      await shots(page, `call-ai-empty-${tag}`)
      await mayaSays(server, "m1", "Let's ship v2 on Friday.")
      // Heard: Maya's line is in the call's captions.
      await expect(page.getByText("Let's ship v2 on Friday.").first()).toBeAttached({ timeout: 30_000 })

      const field = panel.getByPlaceholder("Ask about this call…")
      await press(field)
      await field.fill("What did we decide?")
      await press(panel.getByRole("button", { name: "Send message" }))
      await expect(panel.getByText(ANSWER)).toBeVisible({ timeout: 30_000 })
      // This screen heard the call from the transcript's start: it sends what it heard.
      expect(asked).toHaveLength(1)
      expect(asked[0]).toMatchObject({ room_id: CH, question: "What did we decide?", recent_transcript: "Maya Chen: Let's ship v2 on Friday." })
      await shots(page, `call-ai-listening-${tag}`)
    })

    test("someone who comes in after the transcript began is told since when it runs, and the assistant reads the call's kept lines", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const since = Date.now() - 12 * 60_000
      const { server, asked } = await inCall(page, testInfo, press, {
        transcription: { on: true, by: MAYA.name, byId: MAYA.identity, since, where: "server", kept: true },
      })
      // Maya turned it on before you came: the call's own notice says so; it's read and put away.
      const gotIt = page.locator("[data-captions-notice]").getByRole("button", { name: "Got it" })
      await expect(gotIt).toBeVisible({ timeout: 30_000 })
      await press(gotIt)
      const panel = await openAssistant(page)
      const hearing = panel.locator("[data-in-call-hearing]")
      // Since when, on the reader's own clock ("10:02", "10:02 AM").
      await expect(hearing).toHaveText(/^Listening · transcript on since \d{1,2}:\d{2}/)
      await mayaSays(server, "m2", "And Jonas writes the notes.")
      await expect(page.getByText("And Jonas writes the notes.").first()).toBeAttached({ timeout: 30_000 })

      if (!touch) {
        // By keyboard, from the ask field through the panel's controls: each stop is in the panel and shows its focus.
        const stops: string[] = []
        const stop = () =>
          page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null
            if (!a || !document.querySelector("[data-in-call-ai]")?.contains(a)) return null
            const shows = (e: Element) => {
              const cs = getComputedStyle(e)
              return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"
            }
            // The field shows its focus on its box (the composer's halo), the buttons on themselves.
            const ring = a.tagName === "TEXTAREA" ? shows(a.closest("[data-ai-composer]")!) : shows(a)
            return { name: (a.getAttribute("aria-label") || a.getAttribute("placeholder") || a.textContent || "").trim(), ring }
          })
        const walk = async (key: string) => {
          await panel.getByPlaceholder("Ask about this call…").focus()
          for (let i = 0; i < 12; i++) {
            const s = await stop()
            if (!s) return
            expect(s.ring, `a visible focus on "${s.name}"`).toBe(true)
            if (!stops.includes(s.name)) {
              stops.push(s.name)
              await shots(page, `call-ai-focus-${stops.length}`)
            }
            await page.keyboard.press(key)
          }
          throw new Error(`focus stayed in the panel after 12 presses of ${key}: ${stops.join(", ")}`)
        }
        await walk("Shift+Tab")
        await walk("Tab")
        console.log(`FOCUS STOPS ${stops.join(" | ")}`)
        // The ask field first (the AI's composer names it), then back through the suggestions to Close.
        expect(stops[0]).toBe("Message AI assistant")
        expect(stops).toContain("What did we decide?")
        expect(stops).toContain("Close AI panel")
      }

      await press(panel.getByRole("button", { name: "What did we decide?" }))
      await expect(panel.getByText(ANSWER)).toBeVisible({ timeout: 30_000 })
      // Not the line this screen heard: the server reads the call's own kept transcript, from its start.
      expect(asked).toHaveLength(1)
      expect(asked[0]).toMatchObject({ room_id: CH, question: "What did we decide?", recent_transcript: "" })
      await shots(page, `call-ai-late-${tag}`)
    })

    test("where the workspace has transcripts off it says it can't follow the call, with no Turn on and no suggestions", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { switched } = await inCall(page, testInfo, press, {}, { mode: "off" })
      const panel = await openAssistant(page)
      await expect(panel.locator("[data-in-call-hearing]")).toHaveText("Not listening")
      await expect(panel.getByText("Transcripts are off for this workspace, so I can't follow the call.")).toBeVisible()
      await expect(panel.getByRole("button", { name: /^Turn on/ }), "nothing the server would refuse").toHaveCount(0)
      await expect(panel.getByRole("button", { name: "What did we decide?" })).toHaveCount(0)
      await shots(page, `call-ai-off-${tag}`)
      expect(switched).toEqual([])
    })

    test("an ask that fails says why, offline or refused, and Try again asks it again", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await inCall(page, testInfo, press, { transcription: { on: true, by: MAYA.name, byId: MAYA.identity, since: Date.now() - 5 * 60_000, where: "server", kept: true } }, { replies: ["offline", 500, "answer"] })
      const gotIt = page.locator("[data-captions-notice]").getByRole("button", { name: "Got it" })
      await expect(gotIt).toBeVisible({ timeout: 30_000 })
      await press(gotIt)
      const panel = await openAssistant(page)
      const field = panel.getByPlaceholder("Ask about this call…")
      await press(field)
      await field.fill("Who writes the notes?")
      await press(panel.getByRole("button", { name: "Send message" }))
      await expect(panel.getByText("Couldn't reach the assistant. Check your connection and try again.")).toBeVisible({ timeout: 30_000 })
      await shots(page, `call-ai-error-${tag}`)

      await press(panel.getByRole("button", { name: "Try again" }))
      // A server fault in plain words, never its own text.
      await expect(panel.getByText("The assistant couldn't answer just now. Try again in a moment.")).toBeVisible({ timeout: 30_000 })
      await expect(panel.getByText("Couldn't reach the assistant. Check your connection and try again."), "the failed ask is replaced, not stacked").toHaveCount(0)

      await press(panel.getByRole("button", { name: "Try again" }))
      await expect(panel.getByText(ANSWER)).toBeVisible({ timeout: 30_000 })
      await expect(panel.getByRole("button", { name: "Try again" })).toHaveCount(0)
      await expect(panel.locator("[data-in-call-item]"), "one question, answered").toHaveCount(1)
      expect(asked.map((a) => a.question)).toEqual(["Who writes the notes?", "Who writes the notes?", "Who writes the notes?"])
    })
  })
}
