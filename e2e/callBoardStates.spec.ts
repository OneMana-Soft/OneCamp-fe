import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShot, SAM, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"
import { toast } from "./toasts"

// A board on a call's stage, in the states only a call server brings (calls
// package B, zoom-new-whiteboard): Share's board row when the call holds
// sharing, or while someone else's board is up; and why a board left the
// stage when the hosts turned off sharing, said to its presenter and to
// everyone else. The call connects to a fake server (fakeCallServer), so the
// room's metadata and the server's packets arrive as LiveKit brings them.
// The board picker's empty and error states need no server: the list answers.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000cc"
const SID = "5e550000-0000-4000-8000-0000000000ac"
const BOARD = "b0a4d000-0000-4000-8000-000000000003"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }
const HELD = "The people running the call have turned off screen sharing."

/** The call, its session and the list of boards (`boards` answers getBoardList). */
async function stubCall(page: Page, testInfo: TestInfo, boards: unknown = { msg: "Success", pageCount: 1, data: { boards: [], count: 0 } }) {
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    "/board/getBoardList": boards,
    // The board on the stage opens its collaboration session with a token of
    // the member's own; the socket itself stays silent (stubBackend).
    "/auth/token": { data: { token: "e2e-sam" } },
  })
}
async function join(page: Page) {
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
}
/** Joins over the fake server and waits for the room to connect. */
async function joinConnected(page: Page, testInfo: TestInfo, opts: Parameters<typeof fakeCallServer>[1]) {
  await stubCall(page, testInfo)
  const server = await fakeCallServer(page, opts)
  await join(page)
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return server
}
/** A review shot in each theme the run takes (SHOTS_DIR), back in light after. */
async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}
const shareMenu = (page: Page) => page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Share" })

test.describe("at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("Share's board row says why it's off while the call holds sharing", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinConnected(page, testInfo, { you: YOU, others: [PRIYA], metadata: { held: ["share"] } })
    await shareMenu(page).click({ timeout: 60_000 })
    const row = page.getByRole("menuitem", { name: /Present a board/ })
    await expect(row).toHaveAttribute("aria-disabled", "true")
    await expect(row).toContainText(HELD)
    await shots(page, "board-share-held")
  })

  test("Share's board row names who's presenting while someone else's board is up", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinConnected(page, testInfo, { you: YOU, others: [PRIYA], metadata: { board: { uuid: BOARD, by: PRIYA.identity, draw: "everyone" } } })
    await shareMenu(page).click({ timeout: 60_000 })
    const row = page.getByRole("menuitem", { name: /Present a board/ })
    await expect(row).toHaveAttribute("aria-disabled", "true")
    await expect(row).toContainText("Priya Shah is presenting a board")
    await shots(page, "board-share-busy")
  })

  test("the picker says when you have no boards to present, and when the list didn't load", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await stubCall(page, testInfo)
    await join(page)
    await shareMenu(page).click({ timeout: 60_000 })
    await page.getByRole("menuitem", { name: /Present a board/ }).click()
    const picker = page.getByRole("dialog", { name: "Present a board" })
    await expect(picker.getByText("No boards you can edit yet")).toBeVisible()
    await shots(page, "board-picker-empty")
  })

  test("the picker says the list didn't load, with a way to try again", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await stubCall(page, testInfo, withStatus(500, { msg: "boom" }))
    await join(page)
    await shareMenu(page).click({ timeout: 60_000 })
    await page.getByRole("menuitem", { name: /Present a board/ }).click()
    const picker = page.getByRole("dialog", { name: "Present a board" })
    await expect(picker.getByRole("button", { name: /Try again/ })).toBeVisible()
    await shots(page, "board-picker-error")
  })
})

test.describe("at 390 with touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("More's board row says why it's off while the call holds sharing", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinConnected(page, testInfo, { you: YOU, others: [PRIYA], metadata: { held: ["share"] } })
    await page.getByRole("button", { name: "More call options" }).tap({ timeout: 60_000 })
    const row = page.getByRole("menuitem", { name: /Present a board/ })
    await expect(row).toHaveAttribute("aria-disabled", "true")
    await expect(row).toContainText(HELD)
    await shots(page, "board-share-held")
  })

  test("More's board row names who's presenting while someone else's board is up", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await joinConnected(page, testInfo, { you: YOU, others: [PRIYA], metadata: { board: { uuid: BOARD, by: PRIYA.identity, draw: "everyone" } } })
    await page.getByRole("button", { name: "More call options" }).tap({ timeout: 60_000 })
    const row = page.getByRole("menuitem", { name: /Present a board/ })
    await expect(row).toHaveAttribute("aria-disabled", "true")
    await expect(row).toContainText("Priya Shah is presenting a board")
    await shots(page, "board-share-busy")
  })

  test("the picker sheet says when you have no boards, and when the list didn't load", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await stubCall(page, testInfo)
    await join(page)
    await page.getByRole("button", { name: "More call options" }).tap({ timeout: 60_000 })
    await page.getByRole("menuitem", { name: /Present a board/ }).tap()
    const sheet = page.getByRole("dialog", { name: "Present a board" })
    await expect(sheet.getByText("No boards you can edit yet")).toBeVisible()
    await shots(page, "board-picker-empty")
  })

  test("the picker sheet says the list didn't load, with a way to try again", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await stubCall(page, testInfo, withStatus(500, { msg: "boom" }))
    await join(page)
    await page.getByRole("button", { name: "More call options" }).tap({ timeout: 60_000 })
    await page.getByRole("menuitem", { name: /Present a board/ }).tap()
    const sheet = page.getByRole("dialog", { name: "Present a board" })
    await expect(sheet.getByRole("button", { name: /Try again/ })).toBeVisible()
    await shots(page, "board-picker-error")
  })

  test("its presenter reads that their board left the stage because the hosts turned off sharing", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const server = await joinConnected(page, testInfo, { you: YOU, others: [PRIYA] })
    server.setMetadata({ board: { uuid: BOARD, by: YOU.identity, draw: "everyone" } })
    await expect(page.locator(`[data-call-board="${BOARD}"]`)).toBeVisible({ timeout: 30_000 })
    server.setMetadata({ held: ["share"] })
    await server.sendData("oc.call", { t: "board_stopped", by: YOU.name, reason: "share_held" })
    await expect(toast(page, "Your board left the stage: hosts turned off sharing")).toBeVisible()
    await shots(page, "board-left-held-yours")
  })

  test("everyone else reads whose board left the stage, and why", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const server = await joinConnected(page, testInfo, { you: YOU, others: [PRIYA], metadata: { board: { uuid: BOARD, by: PRIYA.identity, draw: "everyone" } } })
    server.setMetadata({ held: ["share"] })
    await server.sendData("oc.call", { t: "board_stopped", by: PRIYA.name, reason: "share_held" })
    await expect(toast(page, "Hosts turned off sharing, so Priya Shah's board left the stage")).toBeVisible()
    await shots(page, "board-left-held-theirs")
  })
})
