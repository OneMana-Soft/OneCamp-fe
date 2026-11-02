import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
import { USERS, collabFor, dropCollabSocket, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, note } from "../scripts/fluidity/fakeBoard.mjs"

// A share link's visitors all sign in as the link, so each tab names itself
// on its collaboration socket with a key of its own (V-337): the relay lets
// only the same tab take its presence over when it reconnects. The key is the
// same on every socket the tab opens, a reconnect's included, and another
// tab's differs.

const BOARD = "b0a4d000-0000-4000-8000-0000000000e7"
const NAME = boardDocName(BOARD)
const TOKEN = "tk-link-token"
const LEVELS = { ann: "edit", guest: "view" }

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  computer: { viewport: { width: 1280, height: 860 } },
} satisfies Record<string, BrowserContextOptions>

const tabOf = (url: string) => new URL(url).searchParams.get("tab")

async function openGuest(browser: Browser, collab: ReturnType<typeof collabFor>, use: BrowserContextOptions) {
  const context = await browser.newContext(use)
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Kickoff", workspace_name: "Acme" }
  const { sockets } = await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${TOKEN}`)
  await expect(page.locator("[data-board-react]")).toBeEnabled({ timeout: 30_000 })
  // The collaboration server's sockets (they carry the schema hash), not the realtime ones.
  const collabSockets = () => (sockets as Array<{ url: string; open: boolean }>).filter((s) => new URL(s.url).searchParams.has("schema"))
  return { context, collabSockets }
}

for (const [device, use] of Object.entries(DEVICES)) {
  test(`on a ${device}, a link guest's tab names itself with one key on every socket it opens, a reconnect's too, and another tab's differs`, async ({ browser }) => {
    const collab = collabFor([{ id: NAME, update: boardDoc(note("n1", 40, 120, "Agenda")), levels: LEVELS }])
    const first = await openGuest(browser, collab, use)
    const key = tabOf(first.collabSockets()[0].url)
    expect(key).toMatch(/^[0-9a-f]{32}$/)

    // The socket goes and comes back: the tab's new socket carries its key.
    dropCollabSocket(first.context, true)
    await expect.poll(() => first.collabSockets().some((s) => s.open)).toBe(false)
    const before = first.collabSockets().length
    dropCollabSocket(first.context, false)
    await expect.poll(() => first.collabSockets().filter((s) => s.open).length, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(first.collabSockets().length).toBeGreaterThan(before)
    expect(first.collabSockets().map((s) => tabOf(s.url))).toEqual(first.collabSockets().map(() => key))

    // Another visitor of the link, in a tab of their own: another key.
    const second = await openGuest(browser, collab, use)
    const other = tabOf(second.collabSockets()[0].url)
    expect(other).toMatch(/^[0-9a-f]{32}$/)
    expect(other).not.toBe(key)
    await first.context.close()
    await second.context.close()
  })
}
