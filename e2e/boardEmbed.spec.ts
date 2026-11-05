import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test"
import { embedCode } from "../lib/embeds/embedCode"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, shape } from "../scripts/fluidity/fakeBoard.mjs"

// A board embeds in another site (miro-34, H-a). The person sharing it copies
// the embed code with a new link; a page on another site that pastes it frames
// <link>/embed and sees the board, live and read only, with no control that
// writes or shares. The same page framing the app, or the link's own page, is
// refused: every page but the embed keeps X-Frame-Options SAMEORIGIN
// (lib/security/framing.ts). A link turned off (or expired: the server gives
// the same answer) says so inside the frame. OneCamp's own corner cards (the
// install prompt, tips) never draw on the other site's page.

const BOARD = "b0a4d000-0000-4000-8000-0000000000e1"
const NAME = boardDocName(BOARD)
const TOKEN = "embed-link-roadmap"
const LEVELS = { ann: "edit", guest: "view" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const app = () => String(test.info().project.use.baseURL).replace(/\/+$/, "")
const link = () => `${app()}/guest/b/${TOKEN}`

/** Two notes and a shape: five elements on the canvas. */
const drawing = () => boardDoc([...note("n1", 0, 0, "Ship the pricing page"), ...note("n2", 220, 0, "Load test"), shape("s1", "ellipse", 0, 240)])

/** The link's answer while it works, and the server's 404 once it is turned off. */
function linkFixture(state: { on: boolean }): [RegExp, unknown] {
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Roadmap", workspace_name: "Acme" }
  return [new RegExp(`/guest/collab/${TOKEN}$`), () => (state.on ? { msg: "ok", data: session } : status(404, { msg: "This link has expired or was turned off." }))]
}

/**
 * The other site's page: what the person pasted, then two frames of its own, of the app and of the link's own page.
 * Another origin with a server of its own, on another port. A page the test fulfilled itself would prove nothing:
 * Chromium counts it public and refuses every frame of the app's loopback address, the embed's too (Local Network
 * Access, net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS), whatever the headers say.
 */
async function sitePage(context: BrowserContext, pasted: string): Promise<Page> {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Partner roadmap</title><h1>Our roadmap</h1>${pasted}
<iframe name="app" title="The app" src="${app()}/app" width="320" height="200"></iframe>
<iframe name="link" title="The link's page" src="${link()}" width="320" height="200"></iframe>`
  const server = http.createServer((_req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  context.on("close", () => {
    server.closeAllConnections()
    server.close()
  })
  const site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // fakeApp stops every address but the app's and its servers': the other site goes through to its own server.
  await context.route(`${site}/**`, (route) => route.continue())
  const page = await context.newPage()
  await page.goto(`${site}/roadmap`)
  return page
}

const embedded = (page: Page) => page.frameLocator('iframe[src$="/embed"]')

/** The embed draws the board, read only: the canvas in view mode, the tag, and no React button or hand. */
async function seesTheBoard(page: Page) {
  const frame = embedded(page)
  await expect(frame.locator('[data-guest-board][data-board-elements="5"]')).toBeAttached({ timeout: 30_000 })
  await expect(frame.locator(".excalidraw canvas").first()).toBeVisible()
  await expect(frame.locator(".excalidraw.excalidraw--view-mode")).toBeAttached()
  await expect(frame.getByText("Read only")).toBeVisible()
  await expect(frame.getByRole("button", { name: /React|raise your hand/ })).toHaveCount(0)
  // The way to the whole board is the link's own page, in a tab of its own.
  const open = frame.getByRole("link", { name: /^Open/ })
  await expect(open).toHaveAttribute("href", `/guest/b/${TOKEN}`)
  await expect(open).toHaveAttribute("target", "_blank")
  await expect(open).toHaveAttribute("rel", /noopener/)
  // The board's name keeps the header's room (DB-101's F1: at 390 the frame cut it and the workspace's to "Ac… | Road…"):
  // drawn whole, and on a phone the workspace is its mark alone, Open its icon (its name is its aria-label).
  const title = frame.getByRole("heading", { level: 1, name: "Roadmap" })
  await expect(title).toBeVisible()
  expect(await title.evaluate((h) => h.scrollWidth <= h.clientWidth), "the board's name is drawn whole").toBe(true)
  // A phone's frame: the partner's page fits the phone (its viewport meta), and the frame is narrower than sm.
  const phone = await title.evaluate((h) => (h.ownerDocument.defaultView?.innerWidth ?? 1280) < 640)
  expect(phone, "the frame is a phone's on a phone").toBe((page.viewportSize()?.width ?? 1280) < 640)
  await expect(frame.locator("[data-workspace-mark]")).toBeVisible()
  await expect(frame.locator("[data-workspace-name]")).toBeVisible({ visible: !phone })
  await expect(open.getByText("Open", { exact: true })).toBeVisible({ visible: !phone })
}

/** The app and the link's own page refuse the other site: Chromium draws its error page in their frames. */
async function refusesTheRest(page: Page) {
  for (const name of ["app", "link"]) {
    await expect.poll(() => page.frame({ name })?.url(), { message: `the ${name} frame is refused`, timeout: 15_000 }).toBe("chrome-error://chromewebdata/")
  }
}

/**
 * OneCamp's own corner cards never draw on the other site's page. The install prompt is the one the shell can put
 * there (a phone that has been here before, on a build that isn't the demo's, which never prompts): a card in the
 * corner host, as components/ui/CornerStack mounts it, stays hidden in the embed.
 */
async function keepsTheShellOff(page: Page) {
  const frame = page.frames().find((f) => f.url().endsWith(`/guest/b/${TOKEN}/embed`))
  expect(frame, "the embed's frame").toBeTruthy()
  await frame!.evaluate(() => {
    const host = document.createElement("div")
    host.setAttribute("data-corner-stack", "right")
    host.className = "corner-stack corner-stack-right"
    host.innerHTML = '<div data-corner-card="" class="corner-card">Add OneCamp to your Home Screen</div>'
    document.body.append(host)
  })
  const card = embedded(page).getByText("Add OneCamp to your Home Screen")
  await expect(card).toBeAttached()
  await expect(card).toBeHidden()
}

for (const [device, use] of Object.entries(DEVICES)) {
  test(`on a ${device}, another site frames a board's embed and sees it read only, while the app and the link's own page refuse it`, async ({ browser }) => {
    test.setTimeout(90_000)
    const context = await browser.newContext(use)
    const collab = collabFor([{ id: NAME, update: drawing(), levels: LEVELS }])
    await fakeApp(context, { app: app(), user: USERS.vic, docs: [], collab, fixtures: [linkFixture({ on: true })] })
    const page = await sitePage(context, embedCode(link(), "Roadmap"))
    await seesTheBoard(page)
    await refusesTheRest(page)
    await keepsTheShellOff(page)
    await context.close()
  })
}

test("the person sharing a board copies its embed code with a new link, and another site that pastes it shows the board", async ({ browser }) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ ...DEVICES.computer, permissions: ["clipboard-read", "clipboard-write"] })
  const update = drawing()
  const collab = collabFor([{ id: NAME, update, levels: LEVELS }])
  const owner = { user_uuid: USERS.ann.user_uuid, user_name: USERS.ann.user_name, user_full_name: USERS.ann.user_full_name, user_email_id: USERS.ann.user_email_id }
  const permissions = { board_uuid: BOARD, board_title: "Roadmap", board_private: true, board_created_by: owner, board_editing_users: [], board_viewing_users: [] }
  const made = { token: TOKEN, grant_id: "g-embed", resource_type: "board", resource_id: BOARD, capability: "view", expires_at: null }
  await fakeApp(context, {
    app: app(),
    user: USERS.ann,
    docs: [],
    collab,
    fixtures: [
      ...boardFixtures([{ uuid: BOARD, title: "Roadmap", levels: LEVELS, update }], USERS.ann, USERS.ann),
      [/\/board\/getBoardPermissions$/, { msg: "ok", data: permissions }],
      [/\/guest\/links$/, (_path: string, _url: URL, req: { method(): string }) => (req.method() === "POST" ? { msg: "ok", data: made } : { msg: "ok", data: [] })],
      linkFixture({ on: true }),
    ],
  })
  const member = await context.newPage()
  await member.goto(`/app/board/${BOARD}`)
  await member.getByRole("button", { name: "Share", exact: true }).click()
  const dialog = member.getByRole("dialog")
  await dialog.getByRole("switch", { name: "Anyone with the link" }).click()
  await expect(dialog.getByText(/embed this board/)).toBeVisible()
  await dialog.getByRole("button", { name: "Create link" }).click()
  await expect(dialog.getByRole("textbox", { name: "Guest link" })).toHaveValue(link())
  await dialog.getByRole("button", { name: "Copy embed code" }).click()
  await expect(dialog.getByRole("button", { name: "Copied" })).toHaveCount(1)
  const code = await member.evaluate(() => navigator.clipboard.readText())
  expect(code).toBe(embedCode(link(), "Roadmap"))
  // The code, pasted in another site's page as it is.
  const page = await sitePage(context, code)
  await seesTheBoard(page)
  await context.close()
})

test("a link turned off says so inside the other site's frame, and nothing more", async ({ browser }) => {
  test.setTimeout(90_000)
  const context = await browser.newContext(DEVICES.phone)
  const state = { on: true }
  const collab = collabFor([{ id: NAME, update: drawing(), levels: LEVELS }])
  await fakeApp(context, { app: app(), user: USERS.vic, docs: [], collab, fixtures: [linkFixture(state)] })
  const page = await sitePage(context, embedCode(link(), "Roadmap"))
  await expect(embedded(page).locator('[data-guest-board][data-board-elements="5"]')).toBeAttached({ timeout: 30_000 })
  state.on = false
  await page.reload()
  const frame = embedded(page)
  // Said as the link's own page says it (PublicGone), with no way on.
  await expect(frame.getByRole("heading", { level: 1, name: "This shared board doesn't exist or was deleted" })).toBeVisible({ timeout: 30_000 })
  await expect(frame.getByText("The link may have expired or been turned off.")).toBeVisible()
  await expect(frame.locator("[data-guest-board]")).toHaveCount(0)
  // Nothing to open or press. The one link is the skip link every page has, to its own content.
  await expect(frame.getByRole("link")).toHaveCount(1)
  await expect(frame.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", /^#/)
  await expect(frame.getByRole("button")).toHaveCount(0)
  await context.close()
})

test("only the embed sends frame-ancestors * and no X-Frame-Options; the link's page and the app keep SAMEORIGIN", async ({ request }) => {
  const embed = await request.get(`/guest/b/${TOKEN}/embed`, { maxRedirects: 0 })
  expect(embed.status()).toBe(200)
  expect(embed.headers()["x-frame-options"]).toBeUndefined()
  expect(embed.headers()["content-security-policy"]).toBe("frame-ancestors *")
  expect(embed.headers()["content-security-policy-report-only"] ?? "").not.toContain("frame-ancestors")
  for (const path of [`/guest/b/${TOKEN}`, "/app", "/"]) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.headers()["x-frame-options"], path).toBe("SAMEORIGIN")
    expect(res.headers()["content-security-policy"], path).toBeUndefined()
    expect(res.headers()["content-security-policy-report-only"], path).toContain("frame-ancestors 'self'")
  }
})
