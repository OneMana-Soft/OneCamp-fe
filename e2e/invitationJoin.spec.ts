import { expect, test, type BrowserContextOptions, type Locator, type Page, type Request } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// An event's invitee joins its call from their invitation (meet-02, as Google
// Meet lets a calendar invitee in without asking): the invitation's page has
// "Join call", which opens the call's room with the invitee's key in the
// address's fragment; the room drops the key from the address and sends it
// with the join, and the server lets them straight in. Someone with only the
// room's link still waits to be let in.
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const KEY = "invitation-token"
const ROOM = "/public/r/weekly-sync-1a2b"
const GUEST: FakePerson = { identity: "guest-9a1c0000-00a4", name: "Alex Kim", attributes: { "oc.role": "guest", "oc.can": "" } }
const GUEST_TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: GUEST.identity, name: GUEST.name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`

/** The invitation, its event's call, and the room's door: the key lets one in, anyone else knocks. Every join's body is kept. */
async function stubInvitation(page: Page, testInfo: Parameters<typeof stubBackend>[1], view: Record<string, unknown> = {}) {
  const joins: Record<string, unknown>[] = []
  const knocks: string[] = []
  await stubBackend(page, testInfo, {
    "/public/rsvp/": {
      msg: "ok",
      data: {
        title: "Weekly sync", start: { at: "2030-11-04T15:00:00Z", zone: "Europe/London" }, end: { at: "2030-11-04T15:30:00Z" }, all_day: false,
        organiser: "Sam Rivera", ended: false, proposable: false, call_address: "/r/weekly-sync-1a2b",
        you: { name: "Alex Kim", email: "alex@example.com", response: "accepted" },
        guests: [{ name: "Maya Chen", response: "accepted" }],
        ...view,
      },
    },
    [ROOM]: { msg: "ok", data: { state: "live", available: true, title: "Weekly sync", workspace_name: "Acme" } },
    [`${ROOM}/join`]: (_url: URL, request: Request) => {
      const body = request.postDataJSON() as Record<string, unknown>
      joins.push(body)
      if (body.invitation === KEY) return { msg: "ok", data: { token: GUEST_TOKEN, room: "call-room" } }
      return withStatus(202, { data: { waiting: true, ticket: "t-1" } })
    },
    // Nobody running the call answers a knock.
    [`${ROOM}/knock/`]: (url: URL, request: Request) => {
      knocks.push(`${request.method()} ${url.pathname}`)
      return request.method() === "DELETE" ? { data: { left: true } } : new Promise(() => {})
    },
  })
  return { joins, knocks }
}

async function press(phone: boolean, target: Locator) {
  if (phone) await target.tap({ timeout: 60_000 })
  else await target.click({ timeout: 60_000 })
}

async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const [device, use] of Object.entries(DEVICES)) {
  const phone = device === "phone"

  test(`an invitee joins the event's call from their invitation without knocking, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const { joins, knocks } = await stubInvitation(page, testInfo)
    const server = await fakeCallServer(page, { you: GUEST })
    await page.goto(`/rsvp/${KEY}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.getByRole("heading", { name: "Weekly sync" })).toBeVisible({ timeout: 60_000 })

    const join = page.getByRole("link", { name: "Join call" })
    await expect(join).toBeVisible({ timeout: 30_000 })
    await expect(join).toBeInViewport()
    await shotInThemes(page, "invitation-join-call")
    await press(phone, join)

    // The room's page, with the key read and gone from the address.
    await page.waitForURL(/\/r\/weekly-sync-1a2b/, { timeout: 60_000 })
    await expect.poll(() => new URL(page.url()).hash, { message: "the key left the address", timeout: 30_000 }).toBe("")
    await page.getByLabel("Your name").fill(GUEST.name)
    testInfo.annotations.push({ type: "landed", description: page.url() })
    await shotInThemes(page, "invitation-room-landed")
    await press(phone, page.getByRole("button", { name: "Join now" }))

    // Nobody else is in the call yet (the invitee came early): they're in it, alone, with no lobby.
    await expect.poll(server.connected, { message: "the invitee's call connected", timeout: 60_000 }).toBe(true)
    await expect(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Leave call" })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("[data-guest-lobby]")).toHaveCount(0)
    await shotInThemes(page, "invitation-in-call-early")
    expect(joins.map((j) => j.invitation), "the join carried the invitee's key").toEqual([KEY])
    expect(knocks, "nobody knocked").toEqual([])
    await context.close()
  })

  test(`someone with only the room's link still waits to be let in, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const { joins } = await stubInvitation(page, testInfo)
    const server = await fakeCallServer(page, { you: GUEST })
    await page.goto("/r/weekly-sync-1a2b", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByLabel("Your name").fill("Jo Park")
    await press(phone, page.getByRole("button", { name: "Join now" }))

    await expect(page.locator("[data-guest-lobby]").getByRole("heading", { name: "Waiting to be let in" })).toBeVisible({ timeout: 30_000 })
    expect(joins, "the join carried no key").toEqual([expect.not.objectContaining({ invitation: expect.anything() })])
    expect(await server.connected(), "nothing reached the call server").toBe(false)
    await context.close()
  })

  test(`a refused key (wrong or expired) waits in the lobby like anyone else, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const { joins } = await stubInvitation(page, testInfo)
    const server = await fakeCallServer(page, { you: GUEST })
    await page.goto("/r/weekly-sync-1a2b#invitation=expired-key", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect.poll(() => new URL(page.url()).hash, { message: "the key left the address", timeout: 30_000 }).toBe("")
    await page.getByLabel("Your name").fill(GUEST.name)
    await press(phone, page.getByRole("button", { name: "Join now" }))

    await expect(page.locator("[data-guest-lobby]").getByRole("heading", { name: "Waiting to be let in" })).toBeVisible({ timeout: 30_000 })
    await shotInThemes(page, "invitation-key-refused-lobby")
    expect(joins.map((j) => j.invitation), "the join carried the key the server refused").toEqual(["expired-key"])
    expect(await server.connected(), "nothing reached the call server").toBe(false)
    await context.close()
  })

  for (const [name, view] of [
    ["ended", { ended: true }],
    ["no-call", { call_address: undefined }],
  ] as const) {
    test(`an invitation with no call to join (${name}) has no Join call, on a ${device}`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const context = await browser.newContext(use)
      const page = await context.newPage()
      await stubInvitation(page, testInfo, view)
      await page.goto(`/rsvp/${KEY}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByRole("heading", { name: "Weekly sync" })).toBeVisible({ timeout: 60_000 })
      await shotInThemes(page, `invitation-${name}`)
      await expect(page.getByRole("link", { name: "Join call" })).toHaveCount(0)
      await context.close()
    })
  }
}
