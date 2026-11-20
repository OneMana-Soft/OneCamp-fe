import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, dropCollabSocket, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"

// miro-33, the owner's side and the guest's reconnect: a board's links are its
// owner's and co-owners' alone. The owner makes a comment link with a password;
// a co-owner sees "Password set" (never the password) and changes the role, and
// a change that lost a race says so in the server's words, then shows the link
// as it now is; an editor, even with sharing by editors on, sees no link card.
// A member sees a guest's thread under "Guest: <name>", the server's stamp.
// A guest's page asks again on every reconnect: a new role takes effect, a new
// password brings the prompt back, and a link turned off shows the gone state.

const BOARD = "b0a4d000-0000-4000-8000-0000000000fa"
const NAME = boardDocName(BOARD)
const RACE = "Someone changed this link just now. Look at it again, then make your change."
const EVE = { user_uuid: "5a7a1c11-0000-4000-8000-00000000000e", user_name: "eve", user_full_name: "Eve Stone", user_email_id: "eve@example.test", token: "eve" }
const PEOPLE = { sam: USERS.sam, ann: USERS.ann, eve: EVE }
type Who = keyof typeof PEOPLE
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
const LIVE = `${b64({ alg: "HS256" })}.${b64({ sub: "guest-g9", name: "Guest: Priya", guest: true })}.sig`

// The computer in light, the phone (touch) in dark: both widths, both themes.
const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 }, colorScheme: "light" },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: "dark" },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES

/** After every finite animation, so the frame is the resting design. */
const shot = async (page: Page, name: string) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 5_000 }).catch(() => {})
  await page.waitForTimeout(300)
  await page.screenshot({ path: process.env.SHOTS_DIR ? `${process.env.SHOTS_DIR}/${name}` : test.info().outputPath(name) })
}

type Link = { id: string; capability: string; expires_at: string | null; created_at: string; mine: boolean; has_password: boolean }

/** The board and its links, as the server keeps them; what was asked of it. */
function theBoard() {
  const levels: Record<string, string> = { sam: "edit", ann: "full", eve: "edit" }
  const links: Link[] = []
  return { uuid: BOARD, title: "Launch plan", levels, editorsShare: true, links, race: false, update: boardDoc([...note("n1", 100, 150, "Ship it")]), asked: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>, lists: 0 }
}
type Board = ReturnType<typeof theBoard>

function linkFixtures(board: Board, who: Who): [RegExp, unknown][] {
  type Req = { method(): string; postDataJSON(): Record<string, unknown> | null }
  const manages = who === "sam" || board.levels[who] === "full"
  return [
    [
      /\/board\/getBoardPermissions$/,
      () => ({
        msg: "Success",
        data: {
          board_uuid: BOARD, board_title: board.title, board_private: true, board_created_by: USERS.sam, board_editors_share: board.editorsShare,
          board_owning_users: [USERS.ann], board_editing_users: [USERS.ann, EVE], board_commenting_users: [], board_reading_users: [],
        },
      }),
    ],
    [
      /\/guest\/links$/,
      (_p: string, _u: URL, req: Req) => {
        if (req.method() === "GET") {
          board.lists++
          return { msg: "ok", data: board.links.map((l) => ({ ...l, mine: who === "sam" })), max_days: 0 }
        }
        const body = req.postDataJSON() ?? {}
        board.asked.push({ method: "POST", path: "/guest/links", body })
        if (!manages) return status(403, { msg: "Only the board's owner and co-owners can change that." })
        const id = `l${board.links.length + 1}`
        const expires = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
        board.links.unshift({ id, capability: String(body.capability), expires_at: expires, created_at: new Date().toISOString(), mine: true, has_password: !!body.password })
        return { msg: "ok", data: { token: `tok-${id}`, grant_id: `g-${id}`, resource_type: "board", resource_id: BOARD, capability: body.capability, expires_at: expires } }
      },
    ],
    [
      /\/guest\/links\/([^/]+)$/,
      (path: string, _u: URL, req: Req) => {
        const body = req.postDataJSON() ?? {}
        board.asked.push({ method: req.method(), path, body })
        if (!manages) return status(403, { msg: "Only the board's owner and co-owners can change that." })
        const link = board.links.find((l) => path.endsWith(`/${l.id}`))
        if (!link) return status(404, { msg: "That link is gone." })
        if (board.race) {
          // Someone else saved first: the link is a view link now.
          board.race = false
          link.capability = "view"
          return status(409, { msg: RACE, status: "conflict" })
        }
        if (typeof body.capability === "string") link.capability = body.capability
        if (typeof body.password === "string") link.has_password = body.password !== ""
        return { msg: "ok", data: link }
      },
    ],
  ]
}

async function member(browser: Browser, who: Who, board: Board, collab: ReturnType<typeof collabFor>, device: Device) {
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((camera: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(camera, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the tip then sits over the canvas's corner */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  const fixtures = [...linkFixtures(board, who), ...boardFixtures([board], PEOPLE[who], USERS.sam)]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: PEOPLE[who], docs: [], collab, fixtures })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

const press = (device: Device, el: ReturnType<Page["getByRole"]>) => (device === "phone" ? el.tap() : el.click())
const shareDialog = async (page: Page, device: Device) => {
  const tools = page.getByRole("toolbar", { name: "Board tools" })
  await press(device, device === "phone" ? tools.getByRole("button", { name: "Share board" }) : tools.getByRole("button", { name: "Share", exact: true }))
  return page.getByRole("dialog", { name: /Share/ })
}

for (const [device, use] of Object.entries(DEVICES) as [Device, BrowserContextOptions][]) {
  test(`the owner makes a password comment link; a co-owner changes it and a lost race says so; an editor sees no link card, on a ${device}`, async ({ browser }) => {
    test.setTimeout(180_000)
    const board = theBoard()
    const collab = collabFor([{ id: NAME, update: board.update, levels: board.levels }])
    // A guest's thread, as the server stamped it: the grant, named "Guest: Priya".
    const message = { id: "m1", authorId: "guest-g9", authorName: "Guest: Priya", body: "Can the launch move a week?", createdAt: Date.now() }
    collab.edit(NAME, (doc: { getMap: (n: string) => { set: (k: string, v: unknown) => void } }) =>
      doc.getMap("comments").set("p1", { id: "p1", x: 200, y: 320, resolved: false, createdAt: Date.now(), authorId: "guest-g9", authorName: "Guest: Priya", messages: [message] }))

    // Sam, the owner: a member's view of the guest's thread, then the link card.
    const sam = await member(browser, "sam", board, collab, device)
    const pin = sam.page.getByRole("button", { name: "Comment by Guest: Priya" })
    await expect(pin).toBeVisible({ timeout: 15_000 })
    if (device === "computer") {
      await pin.click()
      await expect(sam.page.getByText("Can the launch move a week?")).toBeVisible()
      await expect(sam.page.getByText("Guest: Priya").first()).toBeVisible()
      await shot(sam.page, "member-sees-guest-thread-1280.png")
      await sam.page.keyboard.press("Escape")
    }
    const dialog = await shareDialog(sam.page, device)
    await expect(dialog.getByText("They can invite people, up to Can edit.", { exact: true })).toBeVisible()
    const card = dialog.locator("[data-guest-link-card]")
    await press(device, card.getByRole("switch", { name: "Anyone with the link" }))
    const options = card.locator("[data-guest-link-options]")
    await press(device, options.getByRole("button", { name: "Permission: Can view" }))
    await expect(sam.page.getByRole("menuitem")).toHaveCount(3)
    await press(device, sam.page.getByRole("menuitem", { name: /^Can comment/ }))
    await press(device, options.getByRole("button", { name: "Add a password" }))
    const secret = options.getByLabel("Link password")
    await secret.fill("abc")
    await press(device, options.getByRole("button", { name: "Create link" }))
    await expect(options.getByRole("alert")).toBeVisible()
    expect(board.asked).toHaveLength(0)
    await secret.fill("open-sesame")
    // The refusal's words go once she types again.
    await expect(options.getByRole("alert")).toHaveCount(0)
    await shot(sam.page, `owner-link-card-${device === "phone" ? "390-dark" : "1280"}.png`)
    await press(device, options.getByRole("button", { name: "Create link" }))
    await expect.poll(() => board.asked.at(-1)?.body).toMatchObject({ resource_type: "board", resource_id: BOARD, capability: "comment", password: "open-sesame" })
    await expect(card.getByLabel("Guest link")).toBeVisible()
    // A link with a password has no embed code: the card says why.
    await expect(card.getByText("A board with a password can't be embedded. Share the link instead.")).toBeVisible()
    await expect(card.getByRole("button", { name: "Copy embed code" })).toHaveCount(0)
    await sam.context.close()

    // Ann, a co-owner: the row says a password is set and never shows it; she changes the role.
    const ann = await member(browser, "ann", board, collab, device)
    const annCard = (await shareDialog(ann.page, device)).locator("[data-guest-link-card]")
    const row = annCard.locator("[data-link-row]")
    await expect(row).toContainText("Can comment")
    await expect(row.locator("[data-link-facts]")).toContainText("Password set · ends")
    await expect(annCard).not.toContainText("open-sesame")
    const change = async (from: string, to: string) => {
      await press(device, row.getByRole("button", { name: `Change the “${from}” link` }))
      const editor = annCard.locator("[data-link-change]")
      await press(device, editor.getByRole("button", { name: `Permission: ${from}` }))
      await press(device, ann.page.getByRole("menuitem", { name: new RegExp(`^${to}`) }))
      return editor
    }
    // Someone saves first: the server's words, then the link as it now is.
    board.race = true
    const lists = board.lists
    const editor = await change("Can comment", "Can edit")
    await press(device, editor.getByRole("button", { name: "Save changes" }))
    await expect(ann.page.getByText(RACE, { exact: true })).toBeVisible()
    await expect.poll(() => board.lists).toBeGreaterThan(lists)
    await expect(row).toContainText("Can view")
    await expect(row.locator("[data-link-facts]")).toContainText("Password set ·")
    await shot(ann.page, `coowner-race-${device === "phone" ? "390-dark" : "1280"}.png`)
    await expect(annCard.locator("[data-link-change]")).toHaveCount(0)
    // Again, on the link as it is: only what changed is sent.
    const again = await change("Can view", "Can edit")
    await press(device, again.getByRole("button", { name: "Save changes" }))
    await expect.poll(() => board.asked.at(-1)).toMatchObject({ method: "PATCH", body: { capability: "edit" } })
    expect(board.asked.at(-1)!.path).toMatch(/\/guest\/links\/l1$/)
    expect(Object.keys(board.asked.at(-1)!.body)).toEqual(["capability"])
    await expect(row).toContainText("Can edit")
    await expect(row.locator("[data-link-facts]")).toContainText("Password set ·")
    await ann.context.close()

    // Eve, an editor, with sharing by editors on: she invites, but sees no link card.
    const eve = await member(browser, "eve", board, collab, device)
    const eveDialog = await shareDialog(eve.page, device)
    await expect(eveDialog.getByRole("combobox", { name: "Add people" })).toBeVisible()
    await expect(eveDialog.locator("[data-guest-link-card]")).toHaveCount(0)
    await expect(eveDialog.getByRole("switch", { name: "Anyone with the link" })).toHaveCount(0)
    if (device === "computer") await shot(eve.page, "editor-no-link-card-1280.png")
    await eve.context.close()
  })

  test(`a guest's page asks again on each reconnect: a new role, a new password, a link turned off, on a ${device}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const update = boardDoc([...note("n1", 0, 0, "Ship the pricing page")])
    const collab = collabFor([{ id: NAME, update, levels: { [LIVE]: "view" } }])
    const context = await browser.newContext(use)
    let link: "comment" | "edit" | "locked" | "off" = "comment"
    const asked: Array<Record<string, unknown>> = []
    const session = (capability: string, unlock = "") => ({ collab_token: LIVE, document_name: NAME, resource_type: "board", resource_id: BOARD, capability, title: "Kickoff", workspace_name: "Acme", unlock })
    await fakeApp(context, {
      app: String(test.info().project.use.baseURL),
      user: USERS.vic,
      docs: [],
      collab,
      fixtures: [
        [/\/guest\/collab\/re-link$/, (_p: string, _u: URL, req: { postDataJSON(): Record<string, unknown> | null }) => {
          const body = req.postDataJSON() ?? {}
          asked.push(body)
          if (link === "off") return status(404, { msg: "This link has ended or been turned off." })
          if (link !== "locked") return { msg: "ok", data: session(link) }
          if (body.unlock === "u-2" || body.password === "pw-123456") return { msg: "ok", data: session("edit", "u-2") }
          if (!body.password) return status(401, { msg: "This link needs its password.", status: "password_needed" })
          return status(401, { msg: "That password doesn't open this link.", status: "wrong_password" })
        }],
      ],
    })
    const page = await context.newPage()
    await page.goto("/guest/b/re-link")
    const name = page.getByLabel("Your name, as the team will see it")
    await expect(name).toBeVisible()
    if (device === "phone") await shot(page, "guest-name-390-dark.png")
    await name.fill("Priya")
    await press(device, page.getByRole("button", { name: "Continue" }))
    await expect(page.locator("[data-link-role=comment]")).toBeVisible()
    const reconnect = async () => {
      dropCollabSocket(context, true)
      await page.waitForTimeout(300)
      dropCollabSocket(context, false)
    }
    // The owner makes it an edit link: the next connect brings the new role.
    link = "edit"
    await reconnect()
    await expect(page.locator("[data-link-role=edit]")).toBeVisible({ timeout: 30_000 })
    // The owner sets a password: the prompt comes back; a wrong one is refused in the server's words.
    link = "locked"
    await reconnect()
    await expect(page.getByText("This link needs its password.")).toBeVisible({ timeout: 30_000 })
    const field = page.getByLabel("Password", { exact: true })
    await field.fill("not-it")
    await press(device, page.getByRole("button", { name: "Open the board" }))
    await expect(page.getByText("That password doesn't open this link.")).toBeVisible()
    await shot(page, `guest-password-refused-${device === "phone" ? "390-dark" : "1280"}.png`)
    await field.fill("pw-123456")
    await press(device, page.getByRole("button", { name: "Open the board" }))
    await expect(page.locator("[data-link-role=edit]")).toBeVisible()
    expect(asked.at(-1)).toMatchObject({ display_name: "Priya" })
    // The owner turns it off: the next connect shows the gone state.
    link = "off"
    await reconnect()
    await expect(page.getByText("The link may have expired or been turned off.")).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("[data-guest-board]")).toHaveCount(0)
    if (device === "phone") await shot(page, "guest-link-gone-390-dark.png")
    await context.close()
  })
}
