import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShotInThemes, SAM, stubBackend, withStatus } from "./stubbedApp"

// The calls below join over the fake call server with fake media; a launch
// option forces its own worker, so it is the file's.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

// zoom-09 C2: Admin > Transcription says where call audio goes today, and call
// audio leaves this server only on the admin's acknowledgement, asked in the
// shared confirm (a sheet on a phone). The C2 backend isn't live: its fields
// are stubbed here.

const ON_SERVER = {
  mode: "backend", mode_source: "default", stt_provider: "local", stt_provider_source: "default",
  stt_model: "", stt_base_url: "", stt_language: "", has_stt_api_key: false, stt_api_key_source: "none",
  has_google_credentials: false, google_source: "none",
  where: "server", audio_leaves_server: false, acknowledged_where: "", needs_acknowledgement: false,
  captions_off_reason: "transcriber_not_running", agent: { running: false },
}

/** The admin's card, with the transcriber down; every POST's body, answered by `answer` (a withStatus answer, or 200 by default). */
async function adminCard(page: Page, testInfo: TestInfo, answer?: (n: number) => ReturnType<typeof withStatus> | undefined) {
  const posts: unknown[] = []
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
    "/config/client": { msg: "ok", data: { features: { calls: true }, transcription_mode: "backend", transcription_off_reason: "transcriber_not_running" } },
    "/admin/transcription/config": (_url: URL, request: Request) => {
      if (request.method() !== "POST") return { msg: "ok", data: ON_SERVER }
      posts.push(request.postDataJSON())
      const a = answer?.(posts.length)
      if (a) return a
      return { msg: "ok", data: { ...ON_SERVER, mode: "frontend", where: "browser", audio_leaves_server: true, acknowledged_where: "browser", captions_off_reason: "" } }
    },
  })
  await page.goto("/app/admin?tab=transcription", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Call audio stays on this server.")).toBeVisible({ timeout: 60_000 })
  return posts
}

test.describe("call audio leaves the server only on an admin's acknowledgement (zoom-09 C2)", () => {
  test("the card says where audio goes and that the transcriber is down, once, with its one command", async ({ page }, testInfo) => {
    await adminCard(page, testInfo)
    await expect(page.getByText(/Captions are off: the transcriber isn't running/)).toBeVisible()
    await expect(page.getByText("make stt_up", { exact: true })).toHaveCount(1)
    await expect(page.getByText(/Start it on the server/)).toHaveCount(1)
    await expect(page.getByText("Transcriber: Not running.")).toBeVisible()
    await reviewShotInThemes(page, "c2-admin-server-down")
  })

  test("choosing the browser asks first, naming where; Esc cancels with nothing sent and focus back on the choice", async ({ page }, testInfo) => {
    const posts = await adminCard(page, testInfo)
    const browser = page.getByRole("radio", { name: "Browser" })
    await browser.click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("leaves this server")
    await expect(dialog.getByRole("button", { name: "Send call audio to Google or Microsoft" })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible()
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=alertdialog]"))).toBe(true)
    await reviewShotInThemes(page, "c2-admin-confirm")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    expect(posts).toEqual([])
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=radiogroup]"))).toBe(true)
  })

  test("the acknowledgement is the save: it posts acknowledge_where, and a 503 says nothing was saved", async ({ page }, testInfo) => {
    const posts = await adminCard(page, testInfo, (n) => (n === 1 ? withStatus(503, { msg: "Could not record the acknowledgement." }) : undefined))
    await page.getByRole("radio", { name: "Browser" }).click()
    const send = page.getByRole("button", { name: "Send call audio to Google or Microsoft" })
    await send.click()
    await expect(page.getByRole("alertdialog")).toContainText("wasn't saved")
    await send.click()
    await expect(page.getByRole("alertdialog")).toBeHidden()
    expect(posts).toEqual([{ mode: "frontend", acknowledge_where: "browser" }, { mode: "frontend", acknowledge_where: "browser" }])
    await expect(page.getByText(/Call audio leaves this server: each person's browser/)).toBeVisible()
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: "dark" })
    test("the confirm is a sheet with its actions in the footer, 44px tall", async ({ page }, testInfo) => {
      await adminCard(page, testInfo)
      await expect(page.getByText("make stt_up", { exact: true })).toHaveCount(1)
      await reviewShotInThemes(page, "c2-admin-server-down")
      await page.getByRole("radio", { name: "Browser" }).tap()
      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toHaveAttribute("data-v3-sheet", "")
      const send = dialog.getByRole("button", { name: "Send call audio to Google or Microsoft" })
      expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await reviewShotInThemes(page, "c2-admin-confirm")
    })
  })
})

// In a call, while the server's transcriber is down: pressing Captions says
// why in one plain line instead of a confirm that can only fail, and sends
// nothing. A member is told to ask an admin; a workspace admin gets the link.
const CH = "c0ffee00-0000-4000-8000-0000000000c2"
const SID = "5e550000-0000-4000-8000-0000000000c2"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name }
const MAYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000c2", name: "Maya Chen" }
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const DOWN = "Captions are off: this workspace's transcriber isn't running."

/** #launch's call over the fake call server, the transcriber down, joined by a member or a workspace admin; every captions switch the page sent. */
async function inCall(page: Page, testInfo: TestInfo, press: (l: Locator) => Promise<void>, workspaceAdmin: boolean) {
  const switches: unknown[] = []
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: workspaceAdmin } },
    "/config/client": { msg: "ok", data: { features: { calls: true }, transcription_mode: "backend", transcription_off_reason: "transcriber_not_running" } },
    "/livekit/transcription": (_url: URL, request: Request) => (switches.push(request.postDataJSON()), { msg: "ok" }),
    "/ch/getCallToken": { msg: "ok", data: { token: TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
  })
  const server = await fakeCallServer(page, { you: YOU, others: [MAYA], room: CH })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await press(page.getByRole("button", { name: "Join now" }))
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return switches
}

/**
 * Review shots of the call with its note up. The window goes to the background
 * for the shots, which stops a toast's clock as it would for anyone who
 * switched away (4 s is less than two themes take), and comes back after them.
 */
async function shotWithItsNote(page: Page, name: string) {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")))
  await reviewShotInThemes(page, name)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
}

test.describe("in a call, captions say why they're off (zoom-09 C2)", () => {
  test.describe("a member at 390 with touch", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    test("pressing Captions says the transcriber isn't running and to ask an admin, with no link and nothing sent", async ({ page }, testInfo) => {
      const press = (l: Locator) => l.tap({ timeout: 60_000 })
      const switches = await inCall(page, testInfo, press, false)
      await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "More call options" }))
      await expect(page.getByRole("menuitem", { name: DOWN })).toBeVisible()
      await reviewShotInThemes(page, "c2-dock-label")
      await press(page.getByRole("menuitem", { name: DOWN }))
      const said = page.locator(".toast-root").filter({ hasText: DOWN })
      await expect(said).toContainText(`${DOWN} Ask an admin to start it.`, { timeout: 30_000 })
      await expect(said.getByRole("link")).toHaveCount(0)
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      expect(switches).toEqual([])
      await shotWithItsNote(page, "c2-member-captions-off")
    })
  })

  test.describe("a workspace admin at 1280", () => {
    test.use({ viewport: { width: 1280, height: 860 } })
    test("the Captions control's label says why, and pressing it links to Admin > Transcription, with nothing sent", async ({ page }, testInfo) => {
      const press = (l: Locator) => l.click({ timeout: 60_000 })
      const switches = await inCall(page, testInfo, press, true)
      await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: DOWN }))
      const said = page.locator(".toast-root").filter({ hasText: DOWN })
      await expect(said).toBeVisible({ timeout: 30_000 })
      await expect(said.getByRole("link", { name: "Start it in Admin > Transcription" })).toHaveAttribute("href", "/app/admin?tab=transcription")
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      expect(switches).toEqual([])
      await shotWithItsNote(page, "c2-admin-captions-off")
    })
  })
})
