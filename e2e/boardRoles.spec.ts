import { expect, test, type Browser, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server shared by everyone's browser. Nothing leaves the machine.
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// A board's roles (miro-32): its owner (Sam) makes co-owners and turns the
// editors-may-share switch; a co-owner (Ann) shares and sets it but never
// deletes the board; an editor (Eve) shares only while the switch is on; a
// commenter (Vic) draws nothing and comments through the server (POST
// /board/comment), whose pin comes back to everyone over the board's socket.
// The server checks each rule; a refusal reads in its words.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f7"
const NAME = boardDocName(BOARD)
const EVE = { user_uuid: "5a7a1c11-0000-4000-8000-00000000000e", user_name: "eve", user_full_name: "Eve Stone", user_email_id: "eve@example.test", token: "eve" }
const PEOPLE = { sam: USERS.sam, ann: USERS.ann, vic: USERS.vic, eve: EVE }
type Who = keyof typeof PEOPLE
const LIST: Record<string, string> = { full: "board_owning_users", edit: "board_editing_users", comment: "board_commenting_users", view: "board_reading_users" }

/** The board, as the server keeps it: each person's level (Sam its owner), the switch, and what was asked of it. */
function theBoard() {
  const levels: Record<string, string> = { sam: "edit", ann: "full", eve: "edit", vic: "comment" }
  return { uuid: BOARD, title: "Launch plan", levels, editorsShare: true as boolean, update: boardDoc(ordered(note("n1", 100, 150, "Ship it"))), asked: [] as Array<{ path: string; body: Record<string, unknown> }> }
}
type Board = ReturnType<typeof theBoard>

/** The routes miro-32 adds or changes, answered as business/Board answers them. */
function roleFixtures(board: Board, who: Who, collab: ReturnType<typeof collabFor>): [RegExp, unknown][] {
  const me = PEOPLE[who]
  return [
    [
      /\/board\/getBoardPermissions$/,
      () => {
        const sharing: Record<string, unknown> = { board_uuid: BOARD, board_title: board.title, board_private: true, board_created_by: USERS.sam, board_editors_share: board.editorsShare }
        for (const l of Object.values(LIST)) sharing[l] = []
        for (const [token, level] of Object.entries(board.levels)) {
          if (token === "sam") continue
          ;(sharing[LIST[level]] as unknown[]).push(PEOPLE[token as Who])
          if (level === "full") (sharing.board_editing_users as unknown[]).push(PEOPLE[token as Who])
        }
        return { msg: "Success", data: sharing }
      },
    ],
    [
      /\/board\/(updateBoardPermissions|updateBoard)$/,
      (path: string, _url: URL, req: { postDataJSON: () => Record<string, unknown> }) => {
        const body = req.postDataJSON()
        board.asked.push({ path, body })
        if (typeof body.board_editors_share === "boolean") board.editorsShare = body.board_editors_share
        return { msg: "Success" }
      },
    ],
    [
      /\/board\/comment$/,
      (_path: string, _url: URL, req: { postDataJSON: () => Record<string, unknown> }) => {
        const body = req.postDataJSON()
        board.asked.push({ path: "/board/comment", body })
        if (!["edit", "full", "comment"].includes(board.levels[who] ?? "none")) return status(403, { msg: "Only the board's owners, editors and commenters can comment on it." })
        // The collaboration service's comment op: the caller is the author, whatever the body says.
        const pins = collab.doc(NAME).getMap("comments")
        const message = { id: `m${pins.size + 1}`, authorId: me.user_uuid, authorName: me.user_full_name, body: body.comment_text, createdAt: Date.now() }
        const id = body.action === "add" ? `p${pins.size + 1}` : String(body.board_comment_id)
        const cur = pins.get(id) as { messages: unknown[] } | undefined
        const pin = body.action === "add"
          ? { id, x: body.x, y: body.y, resolved: false, createdAt: Date.now(), authorId: me.user_uuid, authorName: me.user_full_name, messages: [message] }
          : { ...cur, messages: [...(cur?.messages ?? []), message] }
        // The collaboration service writes it as another person would: everyone on the board gets the pin live.
        collab.edit(NAME, (doc: { getMap: (n: string) => { set: (k: string, v: unknown) => void } }) => doc.getMap("comments").set(id, pin))
        return { msg: "Success", data: { comment: pin, removed: false } }
      },
    ],
  ]
}

async function person(browser: Browser, who: Who, board: Board, collab: ReturnType<typeof collabFor>, phone = false) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } })
  await context.addInitScript((camera: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(camera, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the tip then sits over the canvas's corner: the test says so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  const fixtures = [...roleFixtures(board, who, collab), ...boardFixtures([board], PEOPLE[who], USERS.sam)]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: PEOPLE[who], docs: [], collab, fixtures })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

const collabOf = (board: Board) => collabFor([{ id: NAME, update: board.update, levels: board.levels }])
const more = (page: Page) => page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true })
const shareDialog = async (page: Page) => {
  await page.getByRole("toolbar", { name: "Board tools" }).getByRole("button", { name: "Share", exact: true }).click()
  return page.getByRole("dialog", { name: /Share/ })
}
const rowOf = (dialog: ReturnType<Page["getByRole"]>, name: string) => dialog.locator("[data-share-row]").filter({ hasText: name })

test("the owner makes co-owners and turns editors' sharing off; a co-owner never deletes the board", async ({ browser }) => {
  test.setTimeout(150_000)
  const board = theBoard()
  const collab = collabOf(board)
  const sam = await person(browser, "sam", board, collab)

  // Deleting the board is its owner's.
  await more(sam.page).click()
  await expect(sam.page.getByRole("menuitem", { name: "Delete board" })).toBeVisible()
  await sam.page.keyboard.press("Escape")

  const dialog = await shareDialog(sam.page)
  await expect(rowOf(dialog, "ann").getByText("Co-owner")).toBeVisible()
  await expect(rowOf(dialog, "vic").getByText("Can comment")).toBeVisible()
  await dialog.getByRole("button", { name: "Role: Can edit" }).click()
  await expect(sam.page.getByRole("menuitem")).toHaveText(["Co-owner", "Can edit", "Can comment", "Can view"])
  await sam.page.keyboard.press("Escape")
  await rowOf(dialog, "eve").getByRole("button", { name: "eve: Can edit" }).click()
  await sam.page.getByRole("menuitem", { name: /^Co-owner/ }).click()
  await expect.poll(() => board.asked.at(-1)?.body).toEqual({ board_uuid: BOARD, add_co_owners: [EVE.user_uuid] })
  board.levels.eve = "full"
  await rowOf(dialog, "eve").getByRole("button", { name: "eve: Co-owner" }).click()
  await sam.page.getByRole("menuitem", { name: /^Can edit/ }).click()
  await expect.poll(() => board.asked.at(-1)?.body).toEqual({ board_uuid: BOARD, add_editors: [EVE.user_uuid] })
  board.levels.eve = "edit"
  const sw = dialog.getByRole("switch", { name: "Editors can share" })
  await expect(sw).toBeChecked()
  await sw.click()
  await expect.poll(() => board.editorsShare).toBe(false)
  await sam.context.close()

  // Ann, a co-owner: the switch, the roles below co-owner, never Delete.
  const ann = await person(browser, "ann", board, collab)
  await more(ann.page).click()
  await expect(ann.page.getByRole("menuitem", { name: "Delete board" })).toHaveCount(0)
  await ann.page.keyboard.press("Escape")
  const annDialog = await shareDialog(ann.page)
  await expect(annDialog.getByRole("switch", { name: "Editors can share" })).not.toBeChecked()
  await annDialog.getByRole("button", { name: "Role: Can edit" }).click()
  await expect(ann.page.getByRole("menuitem")).toHaveText(["Can edit", "Can comment", "Can view"])
  await ann.page.keyboard.press("Escape")
  await ann.context.close()

  // Eve, an editor, with the switch off: who has access, and why she can't share.
  const eve = await person(browser, "eve", board, collab)
  const eveDialog = await shareDialog(eve.page)
  await expect(eveDialog.getByText("The board's owner has turned off sharing by editors.")).toBeVisible()
  await expect(eveDialog.getByRole("combobox", { name: "Add people" })).toHaveCount(0)
  await expect(eveDialog.getByRole("switch")).toHaveCount(0)
  await eve.page.screenshot({ path: test.info().outputPath("editor-sharing-off-1280.png") })
  await eve.context.close()
})

test("a commenter draws nothing and comments through the server; the pin reaches everyone live", async ({ browser }) => {
  test.setTimeout(150_000)
  const board = theBoard()
  const collab = collabOf(board)
  const vic = await person(browser, "vic", board, collab)
  const sam = await person(browser, "sam", board, collab)
  const tools = vic.page.getByRole("toolbar", { name: "Board tools" })
  await expect(tools.getByRole("button", { name: "Share", exact: true })).toHaveCount(0)
  await tools.getByRole("button", { name: "Comment", exact: true }).click()
  const box = (await vic.page.locator(".excalidraw").first().boundingBox())!
  await vic.page.mouse.click(box.x + 300, box.y + 300)
  await vic.page.getByPlaceholder("Add a comment… (use @ to mention)").fill("Why this colour?")
  await vic.page.getByRole("group", { name: "New comment" }).getByRole("button", { name: "Comment", exact: true }).click()
  await expect.poll(() => board.asked.find((a) => a.path === "/board/comment")?.body).toMatchObject({ board_uuid: BOARD, action: "add", comment_text: "Why this colour?" })
  // The pin is the server's, on the live board: Vic's thread opens; Sam sees it too.
  await expect(vic.page.getByText("Why this colour?")).toBeVisible({ timeout: 10_000 })
  await expect(vic.page.getByRole("button", { name: "Resolve this comment" })).toHaveCount(0)
  await expect(sam.page.getByRole("button", { name: "Comment by Vic Reader" })).toBeVisible({ timeout: 10_000 })
  // The board's chip says what Vic may do: comment; once a viewer again, view only.
  const chip = (page: Page, says: string) => page.getByRole("toolbar", { name: "Board", exact: true }).getByText(says, { exact: true })
  await expect(chip(vic.page, "Can comment")).toBeVisible()
  await expect(chip(vic.page, "View only")).toHaveCount(0)
  await vic.page.screenshot({ path: test.info().outputPath("commenter-thread-1280.png") })
  board.levels.vic = "view"
  await vic.page.reload()
  await expect(vic.page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await expect(chip(vic.page, "View only")).toBeVisible()
  await expect(chip(vic.page, "Can comment")).toHaveCount(0)
  await vic.context.close()
  await sam.context.close()
})

test.describe("on a phone", () => {
  test("a commenter's pin is a sheet, and a refusal reads in the server's words", async ({ browser }) => {
    test.setTimeout(150_000)
    const board = theBoard()
    const collab = collabOf(board)
    const vic = await person(browser, "vic", board, collab, true)
    const cluster = vic.page.getByRole("toolbar", { name: "Board tools" })
    await expect(cluster.getByRole("button", { name: "Add a note" })).toHaveCount(0)
    await expect(cluster.getByRole("button", { name: "Share board" })).toHaveCount(0)
    await cluster.getByRole("button", { name: "Add a comment" }).tap()
    await vic.page.touchscreen.tap(195, 300)
    const sheet = vic.page.getByRole("dialog")
    await sheet.getByPlaceholder("Add a comment… (use @ to mention)").fill("Bigger text here?")
    await sheet.getByRole("button", { name: "Comment", exact: true }).tap()
    await expect.poll(() => board.asked.find((a) => a.path === "/board/comment")?.body).toMatchObject({ board_uuid: BOARD, action: "add", comment_text: "Bigger text here?" })
    await expect(vic.page.getByText("Bigger text here?")).toBeVisible({ timeout: 10_000 })
    await vic.page.screenshot({ path: test.info().outputPath("commenter-sheet-390.png") })
    // Sam takes Vic's role away meanwhile: Vic's reply is refused, in the server's words.
    board.levels.vic = "view"
    // The server's answer held a moment: Reply is busy meanwhile, and a second press asks nothing.
    let answer = () => {}
    const held = new Promise<void>((go) => (answer = go))
    let asks = 0
    await vic.page.route(/\/board\/comment$/, async (route) => {
      asks += 1
      await held
      await route.fallback()
    })
    const field = vic.page.getByPlaceholder("Reply… (use @ to mention)")
    await field.fill("And the title?")
    const reply = vic.page.getByRole("button", { name: "Reply" })
    await reply.tap()
    await expect(reply).toHaveAttribute("aria-busy", "true")
    await reply.dispatchEvent("click")
    answer()
    // The toast says it, and its live region reads it out too: the toast's own line, exactly.
    await expect(vic.page.getByText("Only the board's owners, editors and commenters can comment on it.", { exact: true })).toBeVisible({ timeout: 10_000 })
    expect(asks).toBe(1)
    // What Vic typed waits in the reply box, with the focus, for when they may again.
    await expect(field).toHaveValue("And the title?")
    await expect(field).toBeFocused()
    await vic.context.close()
  })

  test("the owner's share sheet offers co-owners and the switch", async ({ browser }) => {
    test.setTimeout(120_000)
    const board = theBoard()
    const collab = collabOf(board)
    const sam = await person(browser, "sam", board, collab, true)
    await sam.page.getByRole("toolbar", { name: "Board tools" }).getByRole("button", { name: "Share board" }).tap()
    const dialog = sam.page.getByRole("dialog", { name: /Share/ })
    await expect(rowOf(dialog, "ann").getByText("Co-owner")).toBeVisible()
    await expect(dialog.getByRole("switch", { name: "Editors can share" })).toBeVisible()
    await sam.page.screenshot({ path: test.info().outputPath("owner-share-390.png") })
    await sam.context.close()
  })
})
