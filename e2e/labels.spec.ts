import { expect, test, type Browser, type BrowserContextOptions, type Page, type Request } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"
import { docFromBlocks } from "../scripts/fluidity/fakeCollab.mjs"
import { SAM, stubBackend, withStatus } from "./stubbedApp"
import { SCREENS, press, screenUse } from "./screens"
import { takesAFinger } from "./menuReach"
import { settled } from "./sheetLayout"
import { toast } from "./toasts"

// Sensitivity labels (miro-44 L). A workspace admin defines labels in
// Settings › Security, each with rules; anyone who can edit a board or a doc
// puts one on it from its chip or More (a sheet on a phone, Save pinned in its
// footer); the label's chip shows on the item's header; the share dialog's
// external link and the board's Export say when a label holds them back; and
// what the server refuses (a lowering by an editor, a doc's export) is said in
// the server's own words. At 1280 and at 390 by touch.

const BOARD = "b0a4d000-0000-4000-8000-0000000000a1"
const DOC = "d0c00000-0000-4000-8000-0000000000a1"
const RULES = [
  { key: "no_guest_links", name: "No guest links" },
  { key: "no_export", name: "No exports" },
]
const CONFIDENTIAL = { id: "1abe1000-0000-4000-8000-000000000001", name: "Confidential", colour: "red", rank: 2, rules: ["no_export", "no_guest_links"] }
const INTERNAL = { id: "1abe1000-0000-4000-8000-000000000002", name: "Internal", colour: "amber", rank: 1, rules: ["no_guest_links"] }
type Label = typeof CONFIDENTIAL
const LOWERS = "Only the board's owner or a workspace admin can lower or remove its label “Confidential”."
const DOC_REFUSED = "This doc is labelled Confidential: it can't be exported. Its owner or a workspace admin can change the label."

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

/**
 * One item's label as the server keeps it: GET answers it, PUT puts one on or takes it off. Someone who isn't the
 * item's owner is refused a lowering (business/Label Lowers: a lower level, or fewer rules), in the server's words.
 */
function itemLabel(kind: "board" | "doc", start: Label | null, { owner }: { owner: boolean }) {
  let on = start
  const puts: { label_id: string | null }[] = []
  const answer = (_path: string, _url: URL, req: Request) => {
    if (req.method() !== "PUT") return { msg: "ok", data: on }
    const body = req.postDataJSON() as { label_id: string | null }
    puts.push(body)
    const next = [CONFIDENTIAL, INTERNAL].find((l) => l.id === body.label_id) ?? null
    const lowers = !!on && (!next || next.rank < on.rank || on.rules.some((r) => !next.rules.includes(r)))
    if (lowers && !owner) return status(403, { code: "label_owner_lowers", msg: LOWERS })
    on = next
    return { msg: "ok", data: on }
  }
  const fixtures = [
    [/\/labels$/, { msg: "ok", data: { labels: [INTERNAL, CONFIDENTIAL], rules: RULES } }],
    [new RegExp(`/labels/items/${kind}/[^/]+$`), answer],
    [/\/guest\/links$/, { msg: "ok", data: [] }],
  ] as const
  return { fixtures, puts }
}

async function openBoard(browser: Browser, device: keyof typeof DEVICES, user: typeof USERS.sam, label: ReturnType<typeof itemLabel>) {
  const n1 = note("n1", 0, 0, "Q3 numbers")
  const levels = { sam: "edit", ann: "edit", vic: "view" }
  const board = { uuid: BOARD, title: "Board pack", levels, update: boardDoc([...n1]) }
  const collab = collabFor([{ id: boardDocName(BOARD), update: board.update, levels }])
  const context = await browser.newContext({ ...DEVICES[device] })
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows; the test reads past it */
    }
  })
  // Who the share dialog reads as owner and editors (its external link is for them): Sam owns the board, Ann edits it.
  const who = (u: typeof USERS.sam) => ({ user_uuid: u.user_uuid, user_name: u.user_name, user_full_name: u.user_full_name })
  const permissions = { board_uuid: BOARD, board_title: board.title, board_private: false, board_created_by: who(USERS.sam), board_editing_users: [who(USERS.ann)], board_viewing_users: [who(USERS.vic)] }
  const fixtures = [...label.fixtures, [/\/board\/getBoardPermissions$/, { msg: "ok", data: permissions }], ...boardFixtures([board], user, USERS.sam)]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: fixtures as never })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

const boardMore = (page: Page) => page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true })

test.describe("a board's sensitivity label (miro-44 L)", () => {
  test("on a computer: an editor labels it from More; its chip, Share and Export say so; a lowering the server refuses says why", async ({ browser }) => {
    test.setTimeout(120_000)
    const label = itemLabel("board", null, { owner: false })
    const { context, page } = await openBoard(browser, "computer", USERS.ann, label)
    const cluster = page.getByRole("toolbar", { name: "Board", exact: true })
    await expect(cluster.locator("[data-item-label]")).toHaveCount(0)

    await boardMore(page).click()
    await page.getByRole("menuitem", { name: "Label…" }).click()
    const picker = page.getByRole("dialog", { name: "Label this board" })
    await expect(picker.getByRole("radio")).toHaveCount(3)
    await expect(picker.getByRole("radio").first()).toContainText("No guest links · No exports")
    await picker.getByRole("radio", { name: /Confidential/ }).click()
    await picker.getByRole("button", { name: "Save" }).click()
    await expect(picker).toHaveCount(0)
    expect(label.puts).toEqual([{ label_id: CONFIDENTIAL.id }])
    const chip = cluster.getByRole("button", { name: "Label: Confidential. Change the label" })
    await expect(chip).toBeVisible()

    // Share: the external link says the label and can't be turned on.
    await page.getByRole("button", { name: "Share", exact: true }).click()
    const share = page.getByRole("dialog").filter({ has: page.locator("[data-guest-link-card]") })
    await expect(share.getByText("Off · Labelled Confidential")).toBeVisible()
    await expect(share.locator("[data-label-held='no_guest_links']")).toContainText("Labelled Confidential · No guest links")
    await expect(share.getByRole("switch", { name: "Anyone with the link" })).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(share).toHaveCount(0)

    // Export: the dialog says the label, and makes nothing.
    await boardMore(page).click()
    await page.getByRole("menuitem", { name: "Export…" }).click()
    const exp = page.getByRole("dialog", { name: "Export this board" })
    await expect(exp.locator("[data-label-held='no_export']")).toContainText("Labelled Confidential · No exports")
    await expect(exp.getByRole("button", { name: "Export" })).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(exp).toHaveCount(0)

    // An editor who isn't the owner can't take it off: the server's words, in place, and the picker stays.
    await chip.click()
    await picker.getByRole("radio", { name: /No label/ }).click()
    await picker.getByRole("button", { name: "Save" }).click()
    await expect(picker.getByRole("alert")).toHaveText(LOWERS)
    await expect(picker).toBeVisible()
    expect(label.puts).toEqual([{ label_id: CONFIDENTIAL.id }, { label_id: null }])
    await context.close()
  })

  test("on a phone: the label leads the board's cluster, and its picker is a sheet with Save pinned in reach", async ({ browser }) => {
    test.setTimeout(120_000)
    const label = itemLabel("board", CONFIDENTIAL, { owner: true })
    const { context, page } = await openBoard(browser, "phone", USERS.sam, label)
    const actions = page.locator("[data-board-phone-actions]")
    const chip = actions.getByRole("button", { name: "Label: Confidential. Change the label" })
    await expect(chip).toBeVisible()
    expect(await takesAFinger(chip)).toBe(true)
    // The chip and the cluster stay on the screen, side by side.
    const box = (await actions.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)

    await chip.tap()
    const sheet = page.getByRole("dialog", { name: "Label this board" })
    await expect(sheet).toBeVisible()
    const save = sheet.getByRole("button", { name: "Save" })
    await sheet.getByRole("radio", { name: /Internal/ }).tap()
    expect(await takesAFinger(save)).toBe(true)
    const saveBox = (await save.boundingBox())!
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(844)
    await save.tap()
    await expect(sheet).toHaveCount(0)
    // The owner may lower it.
    expect(label.puts).toEqual([{ label_id: INTERNAL.id }])
    await expect(actions.getByRole("button", { name: "Label: Internal. Change the label" })).toBeVisible()

    // Board options offers the same picker.
    await actions.getByRole("button", { name: "Board options" }).tap()
    await expect(page.getByRole("menuitem", { name: "Label…" })).toBeVisible()
    await context.close()
  })

  test("someone who can only view sees the label, as a mark, and is offered no way to change it", async ({ browser }) => {
    test.setTimeout(120_000)
    const label = itemLabel("board", CONFIDENTIAL, { owner: false })
    const { context, page } = await openBoard(browser, "computer", USERS.vic, label)
    const cluster = page.getByRole("toolbar", { name: "Board", exact: true })
    await expect(cluster.locator("[data-item-label='Confidential']")).toBeVisible()
    await expect(cluster.getByRole("button", { name: /Change the label/ })).toHaveCount(0)
    await boardMore(page).click()
    await expect(page.getByRole("menuitem", { name: "Export…" })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Label…" })).toHaveCount(0)
    await context.close()
  })
})

test.describe("a doc's sensitivity label (miro-44 L)", () => {
  test("shows beside the title, is offered in More, and a refused export says the server's words", async ({ browser }) => {
    test.setTimeout(120_000)
    const label = itemLabel("doc", CONFIDENTIAL, { owner: true })
    const d = docFromBlocks([{ type: "heading", level: 1, text: "Board pack notes" }, { type: "paragraph", text: "Numbers for the board." }])
    const levels = { sam: "full" }
    const docs = [{ id: DOC, title: "Board pack notes", html: d.html, update: d.update, levels }]
    const refused: string[] = []
    const fixtures = [
      ...label.fixtures,
      [
        /\/doc\/recordExport$/,
        (_p: string, _u: URL, req: Request) => {
          refused.push(req.postDataJSON().format)
          return status(403, { code: "label_forbids", msg: DOC_REFUSED })
        },
      ],
    ]
    const context = await browser.newContext(DEVICES.computer)
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.sam, docs, collab: collabFor(docs), fixtures: fixtures as never })
    const page = await context.newPage()
    await page.goto(`/app/doc/${DOC}`)
    await expect(page.locator('.doc-editor .ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 30_000 })
    const chip = page.locator("header").getByRole("button", { name: "Label: Confidential. Change the label" })
    await expect(chip).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "More doc actions" }).click()
    await expect(page.getByRole("menuitem", { name: "Label…" })).toBeVisible()
    await page.getByRole("menuitem", { name: "Export as Markdown" }).click()
    // Read in the toast list: for its first second Radix's announcer repeats the words for screen readers (e2e/toasts).
    await expect(toast(page, DOC_REFUSED)).toBeVisible()
    expect(refused).toEqual(["md"])

    await chip.click()
    await expect(page.getByRole("dialog", { name: "Label this doc" }).getByRole("radio", { name: /Confidential/ })).toHaveAttribute("aria-checked", "true")
    await context.close()
  })
})

const ADMIN = { ...SAM, user_is_admin: true }

/** The workspace's labels as /admin/labels keeps them. */
function workspace() {
  const labels: Label[] = [CONFIDENTIAL]
  const writes: { method: string; path: string; body: unknown }[] = []
  const list = () => ({ msg: "ok", data: { labels, rules: RULES } })
  const admin = (url: URL, request: Request) => {
    const method = request.method()
    const body = method === "GET" ? undefined : request.postDataJSON()
    writes.push({ method, path: url.pathname.slice(url.pathname.indexOf("/admin/labels")), body })
    if (method === "POST" && url.pathname.endsWith("/remove")) {
      const id = url.pathname.split("/").slice(-2)[0]
      labels.splice(
        labels.findIndex((l) => l.id === id),
        1,
      )
      return { msg: "ok" }
    }
    if (method === "POST") {
      if (labels.some((l) => l.name.toLowerCase() === String(body.name).toLowerCase())) return withStatus(409, { msg: "Another label has that name. Choose another." })
      const made = { ...body, id: "1abe1000-0000-4000-8000-0000000000ff" }
      labels.push(made)
      return { msg: "ok", data: made }
    }
    return { msg: "ok", data: null }
  }
  return { list, admin, writes, labels }
}

for (const screen of SCREENS) {
  test.describe(`Settings › Security › Sensitivity labels, ${screen.name}`, () => {
    test.use(screenUse(screen, "light"))

    test("an admin adds a label with its rules, and removes one after being asked", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const phone = screen.hasTouch
      const ws = workspace()
      await stubBackend(page, testInfo, {
        "/user/profile": { msg: "ok", data: ADMIN },
        "/labels": () => ws.list(),
        "/admin/labels": ws.admin,
      })
      await page.goto("/app/admin?tab=security", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const section = page.locator("#security-labels")
      const list = section.getByRole("list", { name: "Sensitivity labels" })
      await expect(list).toBeVisible({ timeout: 60_000 })
      await list.scrollIntoViewIfNeeded()
      await expect(list.getByRole("listitem")).toHaveCount(1)
      await expect(list.getByRole("listitem").first()).toContainText("No guest links · No exports · Level 2")

      const add = section.getByRole("button", { name: "Add a label" })
      if (phone) expect(await takesAFinger(add)).toBe(true)
      await press(screen, add)
      const dialog = page.getByRole("dialog", { name: "Add a label" })
      await dialog.getByLabel("Name").fill("Internal")
      await dialog.getByLabel("Level").fill("1")
      const rule = dialog.getByRole("switch", { name: "No guest links" })
      if (phone) {
        // The sheet scrolls, and its rules sit below its first screen: they are brought into reach, as a thumb would.
        // Read once it is still: the sheet goes on moving for a moment after the scroll.
        await rule.evaluate((el) => el.scrollIntoView({ block: "center" }))
        await settled(rule)
        expect(await takesAFinger(rule)).toBe(true)
      }
      await press(screen, rule)
      const save = dialog.getByRole("button", { name: "Add the label" })
      const saveBox = (await save.boundingBox())!
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(screen.height)
      await press(screen, save)
      await expect(dialog).toHaveCount(0)
      await expect(list.getByRole("listitem")).toHaveCount(2)
      expect(ws.writes.filter((w) => w.method === "POST")).toEqual([{ method: "POST", path: "/admin/labels", body: { name: "Internal", colour: "rose", rank: 1, rules: ["no_guest_links"] } }])

      const remove = list.getByRole("button", { name: "Remove Internal" })
      if (phone) {
        // The list grew by a row, and the new row's Remove stands at the screen's foot, under the tab bar: brought into reach, as a thumb would.
        await remove.evaluate((el) => el.scrollIntoView({ block: "center" }))
        await settled(remove)
        expect(await takesAFinger(remove)).toBe(true)
      }
      await press(screen, remove)
      const ask = page.getByRole("dialog", { name: "Remove Internal?" })
      await press(screen, ask.getByRole("button", { name: "Remove the label" }))
      await expect(ask).toHaveCount(0)
      await expect(list.getByRole("listitem")).toHaveCount(1)
      expect(ws.writes.filter((w) => w.path.endsWith("/remove")).map((w) => w.path)).toEqual(["/admin/labels/1abe1000-0000-4000-8000-0000000000ff/remove"])
    })
  })
}
