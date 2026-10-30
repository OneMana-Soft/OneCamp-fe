import { expect, test, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { settled } from "./sheetLayout"
import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// The organiser of an event's call joins it from the event card, by the member
// door (/app/meet/join/r/<slug>), and runs the call from there. Event calls
// keep their lobby on, so every guest from outside waits to be let in. The
// door's call screen was never given the call's lobby (29 Oct 2026): whoever
// waited, the organiser saw nobody, and nobody could let them in. Whoever may
// admit now sees who waits at the door's call as at any other, and lets them
// in, one or all.
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const SLUG = "design-review-k3x9p2qa"
const MEETING = "6d1f0000-0000-4000-8000-0000000000e1"
const SID = "5e550000-0000-4000-8000-0000000000e2"
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
// The organiser runs the call: their role lets them admit.
const HOST: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "host", "oc.can": "admit" } }

type Knock = { ticket: string; name: string; knocked_at: string }
const knock = (ticket: string, name: string): Knock => ({ ticket, name, knocked_at: new Date().toISOString() })

type Box = { x: number; y: number; width: number; height: number }
/** Whether two boxes share any of the screen. */
const meets = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** The event's room behind its member door, the call it opens, who waits in its lobby, and every act sent. */
async function stubDoor(page: Page, testInfo: TestInfo) {
  const acts: Record<string, unknown>[] = []
  const lobby = { waiting: [knock("t-1", "Gia Russo")] }
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    [`/public/r/${SLUG}`]: { msg: "ok", data: { state: "live", available: true, title: "Design review", workspace_name: "Acme" } },
    "/calls/door": { msg: "ok", data: { token: TOKEN, room: `meet-${MEETING}`, title: "Design review" } },
    "/calls/current": () => ({ msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "host", can: ["admit"] }, waiting: lobby.waiting } }),
    [`/calls/${SID}/act`]: (_url: URL, request: { postDataJSON: () => Record<string, unknown> }) => {
      const act = request.postDataJSON()
      acts.push(act)
      return { msg: "ok", data: { affected: act.action === "admit_all" ? lobby.waiting.length : 1 } }
    },
  })
  return { acts, lobby }
}

/** The server's word that the call changed (MESSAGE_CALL_STATE, as the app's MQTT handler passes it on). */
async function callChanged(page: Page) {
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("onecamp:call-state", { detail: { resource_kind: "meeting", resource_id: id } })), MEETING)
}

async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const [device, use] of Object.entries(DEVICES)) {
  test(`the organiser in the call at the member door sees who waits, and lets one in, then all, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const { acts, lobby } = await stubDoor(page, testInfo)
    const server = await fakeCallServer(page, { you: HOST })
    await page.goto(`/app/meet/join/r/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
    await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)

    // One guest waits: named, with Admit.
    const bar = page.locator("[data-knock-bar]")
    await expect(bar.getByText("Gia Russo is waiting to join")).toBeVisible({ timeout: 30_000 })
    await shotInThemes(page, "member-door-knock-one")
    // The button says Admit; its name says whom (KnockBar's aria-label).
    await bar.getByRole("button", { name: "Admit Gia Russo", exact: true }).click()
    await expect.poll(() => acts.at(-1), { message: "Admit let Gia Russo in" }).toEqual(expect.objectContaining({ action: "admit", ticket: "t-1" }))

    // Two more knock: counted, with Admit all.
    lobby.waiting = [knock("t-2", "Jo Park"), knock("t-3", "Alex Kim")]
    await callChanged(page)
    await expect(bar.getByText("2 people are waiting to join")).toBeVisible({ timeout: 30_000 })
    // The first Admit's toast stands clear of the bar, so the next guests can
    // be let in while it shows (DESIGN-BUILD-37, 29 Oct 2026: on a phone it lay
    // over Admit all until it faded).
    const toast = page.getByRole("region", { name: /^Notifications/ }).getByRole("listitem").filter({ hasText: "Gia Russo can join now" })
    await expect(toast).toBeVisible({ timeout: 10_000 })
    // Its way in starts 16 px low (phone-toast-in): read its box once it has stopped moving.
    await settled(toast)
    const [toastBox, barBox] = [await toast.boundingBox(), await bar.boundingBox()]
    expect(toastBox && barBox, "the toast and the bar are both drawn").toBeTruthy()
    expect(meets(toastBox!, barBox!), `the toast ${JSON.stringify(toastBox)} meets the bar ${JSON.stringify(barBox)}`).toBe(false)
    await shotInThemes(page, "member-door-knock-many")
    // The button says Admit all; its name is "Admit everyone waiting".
    await bar.getByRole("button", { name: "Admit everyone waiting", exact: true }).click()
    await expect.poll(() => acts.at(-1), { message: "Admit all let everyone in" }).toEqual(expect.objectContaining({ action: "admit_all" }))

    // Nobody waits: the bar goes.
    lobby.waiting = []
    await callChanged(page)
    await expect(bar).toHaveCount(0, { timeout: 30_000 })
    await context.close()
  })
}
