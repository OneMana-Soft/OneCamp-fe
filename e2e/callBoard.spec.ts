import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// Present a board (calls package B, zoom-new-whiteboard). At 1280 a member's
// Share opens a menu, the screen or a board; on a phone, More has Present a
// board. The picker lists only the boards you may edit (getBoardList with
// editable=1), and the one picked reaches Call Control as present_board.
//
// The call's server never answers here (stubBackend accepts every socket and
// says nothing), so the call is still connecting: its dock is up, which is
// all this needs. The stage follows the room's metadata, which only a call
// server sends: callConference.test.tsx and callBoardStage.test.tsx cover it.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000cb"
const SID = "5e550000-0000-4000-8000-0000000000ab"
const LAUNCH = "b0a4d000-0000-4000-8000-000000000001"
const RETRO = "b0a4d000-0000-4000-8000-000000000002"
const BOARDS = {
  msg: "Success",
  pageCount: 1,
  data: {
    boards: [
      { board_uuid: LAUNCH, board_title: "Launch plan", board_private: true, board_updated_at: "2026-10-27T08:00:00Z" },
      { board_uuid: RETRO, board_title: "Retro", board_private: true, board_updated_at: "2026-10-26T16:00:00Z" },
    ],
    count: 2,
  },
}

/** The call and its session; the board lists asked for and the acts sent land in the lists returned. */
async function stubCall(page: Page, testInfo: TestInfo) {
  const lists: string[] = []
  const acts: unknown[] = []
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    "/board/getBoardList": (url: URL) => {
      lists.push(url.search)
      return BOARDS
    },
    [`/calls/${SID}/act`]: (_url: URL, request: Request) => {
      acts.push(request.postDataJSON())
      return { msg: "ok", data: { affected: 1 } }
    },
  })
  return { lists, acts }
}
async function join(page: Page) {
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
}

test.describe("at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("Share offers a board beside the screen, and the board picked goes up through the server", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const { lists, acts } = await stubCall(page, testInfo)
    await join(page)
    await page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Share" }).click({ timeout: 60_000 })
    await expect(page.getByRole("menuitem", { name: /Share screen/ })).toBeVisible()
    await page.getByRole("menuitem", { name: /Present a board/ }).click()
    const picker = page.getByRole("dialog", { name: "Present a board" })
    await expect(picker.getByRole("button", { name: /Retro/ })).toBeVisible()
    expect(lists.some((q) => /[?&]editable=1(&|$)/.test(q)), "the list asked only for boards you may edit").toBe(true)
    await picker.getByRole("button", { name: /Retro/ }).click()
    await expect(picker).toBeHidden()
    await expect.poll(() => acts, { message: "present_board, with the board picked" }).toContainEqual(expect.objectContaining({ action: "present_board", board: RETRO }))
  })
})

test.describe("at 390 with touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("More offers a board, the picker is a sheet, and the board tapped goes up through the server", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const { lists, acts } = await stubCall(page, testInfo)
    await join(page)
    await page.getByRole("button", { name: "More call options" }).tap({ timeout: 60_000 })
    await page.getByRole("menuitem", { name: /Present a board/ }).tap()
    const sheet = page.getByRole("dialog", { name: "Present a board" })
    await expect(sheet.getByRole("button", { name: /Launch plan/ })).toBeVisible()
    expect(lists.some((q) => /[?&]editable=1(&|$)/.test(q)), "the list asked only for boards you may edit").toBe(true)
    await sheet.getByRole("button", { name: /Launch plan/ }).tap()
    await expect(sheet).toBeHidden()
    await expect.poll(() => acts, { message: "present_board, with the board tapped" }).toContainEqual(expect.objectContaining({ action: "present_board", board: LAUNCH }))
  })
})
