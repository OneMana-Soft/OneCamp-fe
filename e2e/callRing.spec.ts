import { expect, test, type Browser, type TestInfo } from "@playwright/test"
import { ring, tell } from "./callRingEvent"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShot, SAM, stubBackend, tidy, withStatus } from "./stubbedApp"

// Ring in DMs (slack-06 H2). The server rings a DM's or group's people on
// their own topic (MESSAGE_CALL_RING); here the ring arrives as the MQTT
// handler passes it on (the "onecamp:call-ring" window event), dispatched
// until the realtime engine, which mounts at idle, hears it. The callee's
// card: top right at 1280 on the toast layer, the shared drawer at 390;
// Accept through the call's door, Decline for themselves, Escape hides. The
// caller's stage while alone: ringing, declined, didn't answer. The missed
// card: Call back, and the starter's No answer with Call again.

const person = (n: string, user_name: string) => ({ user_uuid: `5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e${n}`, user_name, user_full_name: user_name, uid: `0x${n}`, user_profile_object_key: "" })
const MAYA = person("6f", "Maya Chen")
const JONAS = person("70", "Jonas Weber")
const ME = { ...SAM, uid: "0x99", user_name: "Sam Rivera" }
const GROUP = "0c4a0000-0000-4000-8000-0000000005a1"
const SID = "5e550000-0000-4000-8000-0000000005b1"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 19, h, m)).toISOString()
const MISSED = "0c4a0000-0000-4000-8000-000000000505"
const NO_ANSWER = "0c4a0000-0000-4000-8000-000000000506"
const LAST = "0c4a0000-0000-4000-8000-000000000507"
const LIVE = "0c4a0000-0000-4000-8000-000000000508"

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const
const SCHEMES = ["light", "dark"] as const

type Who = { uuid: string; name: string }
const who = (p: typeof MAYA): Who => ({ uuid: p.user_uuid, name: p.user_full_name })

async function open(browser: Browser, testInfo: TestInfo, view: (typeof views)[number], scheme: string) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme as "light" | "dark",
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const tab = await context.newPage()
  tab.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}`))
  return { context, tab }
}

const shell = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS] },
  "/dm/getFile": { msg: "ok", data: {} },
  "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  "/user/botKinds": { msg: "ok", data: {} },
  "/config/client": { msg: "ok", data: { features: { calls: true } } },
  [`/groupChat/getDmParticipants/${GROUP}`]: { msg: "ok", data: { dm_grouping_id: GROUP, dm_name: "Launch crew", dm_unread: 0, dm_notification_type: "all", dm_participants: [ME, MAYA, JONAS, person("71", "Ana Cruz"), person("72", "Bo Lin")] } },
}

for (const view of views) {
  for (const scheme of SCHEMES) {
    test(`at ${view.name}, ${scheme}: a DM's call rings you, and a missed one calls back`, async ({ browser }, testInfo) => {
      test.setTimeout(420_000)
      const { context, tab } = await open(browser, testInfo, view, scheme)
      const declines: string[] = []
      let releaseToken = () => {}
      const tokenHeld = new Promise<void>((r) => (releaseToken = r))
      const chat = (id: string, from: object, text: string, m: number, extra: object = {}) => ({
        chat_uuid: id, chat_from: from, chat_to: ME, chat_created_at: at(9, m), chat_comment_count: 0,
        chat_body_text: text, chat_reactions: [], chat_attachments: [], ...extra,
      })
      // A missed call's facts as business/Huddle writes them at its end: only its starter came, and by names them.
      const facts = (session: string, by: { user_uuid: string; user_full_name: string }) =>
        JSON.stringify({ session, started: at(9, 1), ended: at(9, 2), seconds: 31, came: [{ uuid: by.user_uuid, name: by.user_full_name }], people: 1, missed: true, by: by.user_uuid })
      const chats = [
        chat(MISSED, MAYA, "<p>Maya Chen started a call</p>", 1, { chat_kind: "huddle", chat_system: facts("s-missed", MAYA) }),
        chat(NO_ANSWER, ME, "<p>Sam Rivera started a call</p>", 2, { chat_kind: "huddle", chat_system: facts("s-no-answer", ME) }),
        // A call on now in the DM (its post's facts as the call's start writes them), read live as the call's state says.
        chat(LIVE, MAYA, "<p>Maya Chen started a call</p>", 3, { chat_kind: "huddle", chat_system: JSON.stringify({ session: "s-dm", started: new Date(Date.now() - 60_000).toISOString() }) }),
        chat(LAST, MAYA, "<p>No worries, later.</p>", 4),
      ]
      await stubBackend(tab, testInfo, {
        ...shell,
        [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
        [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats, has_more: false } },
        "/dm/getCallToken": async () => {
          await tokenHeld
          return withStatus(503, { msg: "Not now" })
        },
        "/dm/": { msg: "ok", data: [] },
        "/calls/current": { msg: "ok", data: { live: true, session: { id: "s-dm", people: [] }, you: { role: "participant", can: [] } } },
        "/decline": (url: URL) => {
          declines.push(url.pathname)
          return { msg: "ok", data: { declined: true } }
        },
      })
      await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.locator(`#msg-${LAST}`).getByText("No worries, later.")).toBeVisible({ timeout: 150_000 })
      await tidy(tab)

      // The missed card: Call back where Join was; the starter's own reads No answer and Call again.
      const missed = tab.locator(`#msg-${MISSED} [data-call-card="missed"]`)
      await expect(missed).toContainText("Missed call", { timeout: 30_000 })
      const back = missed.getByRole("link", { name: "Call Maya back" })
      await expect(back).toHaveText("Call back")
      await expect(back).toHaveAttribute("href", `/app/meet/chat/${MAYA.user_uuid}`)
      const mine = tab.locator(`#msg-${NO_ANSWER} [data-call-card="missed"]`)
      await expect(mine).toContainText("No answer")
      await expect(mine.getByRole("link", { name: "Call again" })).toHaveAttribute("href", `/app/meet/chat/${MAYA.user_uuid}`)
      const box = await back.boundingBox()
      expect(box && box.height >= (view.phone ? 44 : 28), "Call back keeps its reach").toBe(true)
      expect(await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await reviewShot(tab, "ring-missed-call-back", scheme)
      // The call on now: its Join takes a finger's reach on a phone, as Call back does (DESIGN-BUILD-118 F4).
      const join = tab.locator(`#msg-${LIVE} [data-call-card="live"]`).getByRole("link", { name: "Join the huddle" })
      await expect(join).toBeVisible({ timeout: 30_000 })
      const reach = await join.boundingBox()
      expect(reach && reach.height >= (view.phone ? 44 : 28), `Join keeps its reach: ${JSON.stringify(reach)}`).toBe(true)
      await reviewShot(tab, "ring-live-join", scheme)

      // At 1280 the corner card, a region with its buttons; on a phone the drawer, a dialog whose pinned footer holds them.
      const card = (name: string) => tab.getByRole(view.phone ? "dialog" : "region", { name: `Incoming call from ${name}` })
      const dm = { state: "ring", session: "s-ring-dm", caller: who(MAYA), resource: { kind: "dm", uuid: `${MAYA.user_uuid} ${SAM.user_uuid}` } }

      // A DM's ring: who calls, Decline and Accept; at 1280 the focus on Accept (nobody typing).
      // The card is on its own fixed layer: the conversation behind it never moves.
      const behind = await tab.locator(`#msg-${LAST}`).boundingBox()
      await ring(tab, dm, () => expect(card("Maya Chen")).toBeVisible({ timeout: 3_000 }))
      expect(await tab.locator(`#msg-${LAST}`).boundingBox(), "the ring moved the page").toEqual(behind)
      await expect(card("Maya Chen")).toContainText("Calling you")
      await expect(tab.locator('[aria-live="assertive"]').filter({ hasText: "Maya Chen is calling you" })).toHaveCount(1)
      const accept = card("Maya Chen").getByRole("button", { name: "Accept" })
      const decline = card("Maya Chen").getByRole("button", { name: "Decline" })
      await expect(accept).toBeVisible()
      await expect(decline).toBeVisible()
      if (view.phone) {
        // The shared drawer: Decline left, Accept right, in its pinned footer, each 48px.
        const foot = tab.locator("[data-sheet-footer]")
        await expect(foot.getByRole("button")).toHaveText(["Decline", "Accept"])
        const [d, a] = [await foot.getByRole("button", { name: "Decline" }).boundingBox(), await foot.getByRole("button", { name: "Accept" }).boundingBox()]
        expect(d && a && d.x < a.x && Math.round(d.height) >= 48 && Math.round(a.height) >= 48).toBe(true)
      } else {
        await expect(accept).toBeFocused()
        const r = await card("Maya Chen").boundingBox()
        expect(r && r.y <= 24 && view.viewport.width - (r.x + r.width) <= 40 && Math.round(r.width) === 360, `top right: ${JSON.stringify(r)}`).toBe(true)
      }
      await reviewShot(tab, "ring-dm", scheme)

      // Escape hides it on this device, and declines nothing.
      await tab.keyboard.press("Escape")
      await expect(card("Maya Chen")).toHaveCount(0)
      expect(declines).toEqual([])

      // A group's ring names the group and its size.
      const group = { state: "ring", session: "s-ring-grp", caller: who(JONAS), resource: { kind: "group", uuid: GROUP } }
      await ring(tab, group, () => expect(card("Jonas Weber")).toContainText("Calling Launch crew · 5 people", { timeout: 3_000 }))
      await reviewShot(tab, "ring-group", scheme)
      // Decline: for you alone, at once.
      await card("Jonas Weber").getByRole("button", { name: "Decline" }).click()
      await expect(card("Jonas Weber")).toHaveCount(0)
      await expect.poll(() => declines).toEqual(["/calls/s-ring-grp/decline"])

      // A quiet ring: the Silent chip, no pulse; the drain stays.
      await ring(tab, { ...dm, session: "s-ring-quiet", quiet: true }, () => expect(card("Maya Chen")).toBeVisible({ timeout: 3_000 }))
      await expect(card("Maya Chen").getByLabel("Silent ring: your notifications are paused or this chat is muted")).toHaveText("Silent")
      await expect(card("Maya Chen").locator(".ring-pulse")).toHaveCount(0)
      await expect(card("Maya Chen").locator(".ring-drain")).toHaveCount(1)
      await reviewShot(tab, "ring-quiet", scheme)
      // The call ended (stop): it goes, silently.
      await tell(tab, { state: "stop", session: "s-ring-quiet" })
      await expect(card("Maya Chen")).toHaveCount(0)

      // Reduced motion: a still ring, no drain.
      await tab.emulateMedia({ reducedMotion: "reduce" })
      await ring(tab, { ...dm, session: "s-ring-still" }, () => expect(card("Maya Chen")).toBeVisible({ timeout: 3_000 }))
      expect(await card("Maya Chen").locator(".ring-pulse").evaluate((el) => getComputedStyle(el).display)).toBe("none")
      await reviewShot(tab, "ring-reduced-motion", scheme)
      await tell(tab, { state: "stop", session: "s-ring-still" })
      await expect(card("Maya Chen")).toHaveCount(0)
      await tab.emulateMedia({ reducedMotion: null })

      if (!view.phone) {
        // Typing in the composer: the ring never takes the focus, and a key types on.
        const composer = tab.locator('[contenteditable="true"]').first()
        await composer.click()
        await tab.keyboard.type("Back in")
        await ring(tab, { ...dm, session: "s-ring-typing" }, () => expect(card("Maya Chen")).toBeVisible({ timeout: 3_000 }))
        await tab.keyboard.type(" five")
        await expect(composer).toContainText("Back in five")
        await expect(card("Maya Chen")).toBeVisible()
        await tell(tab, { state: "stop", session: "s-ring-typing" })
        await expect(card("Maya Chen")).toHaveCount(0)

        // Over an open dialog: the card is above it, and its buttons take the click.
        await composer.blur()
        await tab.keyboard.press("ControlOrMeta+k")
        await expect(tab.getByRole("dialog", { name: "Search, jump, or ask" })).toBeVisible({ timeout: 30_000 })
        await ring(tab, { ...dm, session: "s-ring-dialog" }, () => expect(card("Maya Chen")).toBeVisible({ timeout: 3_000 }))
        const ab = await card("Maya Chen").getByRole("button", { name: "Accept" }).boundingBox()
        expect(await tab.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-ring-card]"), [ab!.x + ab!.width / 2, ab!.y + ab!.height / 2] as const)).toBe(true)
        expect(await tab.getByRole("dialog", { name: "Search, jump, or ask" }).evaluate((el) => el.contains(document.activeElement))).toBe(true)
        await reviewShot(tab, "ring-over-dialog", scheme)
        await tell(tab, { state: "stop", session: "s-ring-dialog" })
        await tab.keyboard.press("Escape")
      }

      // Accept: through the call's door, joined at once; Joining… while the call's token comes.
      await ring(tab, { ...dm, session: "s-ring-accept" }, () => expect(card("Maya Chen")).toBeVisible({ timeout: 3_000 }))
      await card("Maya Chen").getByRole("button", { name: "Accept" }).click()
      await expect(card("Maya Chen").getByRole("button", { name: "Joining…" })).toBeVisible({ timeout: 10_000 })
      await expect(card("Maya Chen").getByRole("button", { name: "Decline" })).toBeDisabled()
      await reviewShot(tab, "ring-joining", scheme)
      // The token refused: the card goes, and the call's door says so once, under its own Join now (DESIGN-BUILD-118 F1:
      // the card and the prejoin each said it, each with a retry).
      releaseToken()
      await expect(card("Maya Chen")).toHaveCount(0, { timeout: 30_000 })
      await expect(tab.getByText(/Couldn.t join/)).toHaveCount(1)
      await expect(tab.getByText(/Couldn.t join/)).toBeVisible()
      await expect(tab.getByRole("button", { name: "Join now" })).toHaveCount(1)
      await expect(tab.getByRole("button", { name: "Accept" })).toHaveCount(0)
      // Said once: no card comes back with its own failure later (Accept's wait at the door was 15 s).
      await tab.waitForTimeout(16_000)
      await expect(card("Maya Chen")).toHaveCount(0)
      await expect(tab.getByText(/Couldn.t join/)).toHaveCount(1)
      await reviewShot(tab, "ring-join-failed", scheme)
      await context.close()
    })

    test(`at ${view.name}, ${scheme}: in a call, a ring is quieter, and your own call's ring shows on the stage`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const { context, tab } = await open(browser, testInfo, view, scheme)
      const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "host", "oc.can": "" } }
      const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
      const rings: string[] = []
      await stubBackend(tab, testInfo, {
        ...shell,
        [`/user/profile/${JONAS.user_uuid}`]: { msg: "ok", data: JONAS },
        "/dm/getCallToken": { msg: "ok", data: { token: TOKEN } },
        "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [{ identity: SAM.user_uuid, user_uuid: SAM.user_uuid, name: SAM.user_full_name, role: "host", in_call: true }] }, you: { role: "host", can: [] } } },
        [`/calls/${SID}/ring`]: (url: URL) => {
          rings.push(url.pathname)
          return withStatus(429, { msg: "Still ringing", code: "still_ringing" })
        },
      })
      const server = await fakeCallServer(tab, { you: YOU, others: [] })
      await tab.goto(`/app/meet/chat/${JONAS.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await tab.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)

      // Your call rings Jonas: alone on the stage, his face and Ringing Jonas….
      const stage = tab.locator(`[data-caller-ring="${SID}"]`)
      // The ring has a place of its own and your tile keeps one beside it, as in a call of two: your face never shows
      // past the ring's card (DESIGN-BUILD-118 F2: your camera-off disc stood above the card in every state).
      const yours = tab.locator(`[data-flip-key="${SAM.user_uuid}|camera"]`)
      const apart = async () => {
        const [r, t] = [await stage.boundingBox(), await yours.boundingBox()]
        return !!r && !!t && (r.x + r.width <= t.x + 0.5 || t.x + t.width <= r.x + 0.5 || r.y + r.height <= t.y + 0.5 || t.y + t.height <= r.y + 0.5)
      }
      await ring(tab, { state: "ringing", session: SID, people: [who(JONAS)] }, () => expect(stage).toContainText("Ringing Jonas…", { timeout: 3_000 }))
      await expect(stage).toContainText("Up to 30 seconds")
      await expect(stage.getByLabel("Jonas Weber, ringing")).toBeVisible()
      await expect(yours).toBeVisible()
      await expect.poll(apart, { message: "the ring and your tile each in a place of their own" }).toBe(true)
      await reviewShot(tab, "caller-ringing", scheme)
      await tell(tab, { state: "declined", session: SID, by: who(JONAS) })
      await expect(stage).toContainText("Jonas declined")
      await expect(stage.getByLabel("Jonas Weber, declined")).toBeVisible()
      await expect(yours).toBeVisible()
      await expect.poll(apart, { message: "the ring and your tile each in a place of their own" }).toBe(true)
      await reviewShot(tab, "caller-declined", scheme)
      // Ring again asks the server; its refusal in words.
      await stage.getByRole("button", { name: "Ring again" }).click()
      await expect(stage).toContainText("It's still ringing.")
      expect(rings).toEqual([`/calls/${SID}/ring`])
      // The ring's end with no answer.
      await ring(tab, { state: "ringing", session: SID, people: [who(JONAS)] }, () => expect(stage).toContainText("Jonas didn't answer", { timeout: 4_000 }), 1_500)
      await expect(yours).toBeVisible()
      await expect.poll(apart, { message: "the ring and your tile each in a place of their own" }).toBe(true)
      await reviewShot(tab, "caller-no-answer", scheme)
      // A group of 5: each face its own state, the settled ones summed.
      const five = [MAYA, JONAS, person("71", "Ana Cruz"), person("72", "Bo Lin"), person("73", "Cy Park")].map(who)
      await ring(tab, { state: "ringing", session: SID, people: five }, () => expect(stage).toContainText("Ringing 5 people…", { timeout: 3_000 }))
      await tell(tab, { state: "declined", session: SID, by: five[0] })
      await tell(tab, { state: "declined", session: SID, by: five[2] })
      await expect(stage).toContainText("2 declined")
      await expect(stage.getByRole("listitem")).toHaveCount(5)
      // Five faces sit in one row, at 390 too (DESIGN-BUILD-118 F3: they wrapped 4 + 1).
      expect(await stage.getByRole("listitem").evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size), "one row").toBe(1)
      await expect(yours).toBeVisible()
      await expect.poll(apart, { message: "the ring and your tile each in a place of their own" }).toBe(true)
      await reviewShot(tab, "caller-group", scheme)

      // Maya rings you while you're in this call: quieter, says so, Leave and join; the focus stays.
      const card = tab.getByRole(view.phone ? "dialog" : "region", { name: "Incoming call from Maya Chen" })
      const focused = await tab.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? "")
      await ring(tab, { state: "ring", session: "s-other", caller: who(MAYA), resource: { kind: "dm", uuid: `${MAYA.user_uuid} ${SAM.user_uuid}` } }, () =>
        expect(card).toBeVisible({ timeout: 3_000 }),
      )
      await expect(card).toContainText("Calling you · You're in a call")
      await expect(card.getByRole("button", { name: "Leave and join" })).toBeVisible()
      await expect(card.locator(".ring-pulse")).toHaveCount(0)
      if (!view.phone) {
        expect(await tab.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? "")).toBe(focused)
        // Clear of the call's dock at the bottom.
        const [c, dock] = [await card.boundingBox(), await tab.locator("[data-call-dock], [data-dock]").first().boundingBox()]
        expect(!dock || (c && c.y + c.height < dock.y)).toBe(true)
      }
      await reviewShot(tab, "ring-in-a-call", scheme)
      await context.close()
    })
  }
}
