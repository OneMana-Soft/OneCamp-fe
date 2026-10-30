import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import * as Y from "yjs"

import { SAM, docInfo, reviewShot, stubBackend } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA } from "./twoPeople"
// A doc's live copy as the server writes a template into it.
import { docFromBlocks } from "../../scripts/fluidity/fakeCollab.mjs"

// Docs programme B5, in a real browser on the production build: the
// sidebar's page tree (open a page, drag one into another and it is there
// after a reload), the docs home's tabs, counts and body search, the trash,
// and two tabs opening a doc made from a template showing it once (N37).
// Every request is answered here; nothing reaches a server.

const ID = (n: number) => `b5000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const ENGINEERING = ID(1)
const RFCS = ID(2)
const HANDBOOK = ID(3)
const SHARED_DRAFT = ID(4)
const OLD_PLAN = ID(5)

type Node = { kind: "doc"; uuid: string; title: string; has_children: boolean; can_edit: boolean }
const node = (uuid: string, title: string, has_children = false): Node => ({ kind: "doc", uuid, title, has_children, can_edit: true })

/** A workspace with a small tree, as the server holds it; moves change it. */
function workspace() {
  const children: Record<string, Node[]> = {
    "space=workspace": [node(ENGINEERING, "Engineering", true), node(HANDBOOK, "Handbook")],
    [`parent=${ENGINEERING}`]: [node(RFCS, "RFCs")],
    "space=shared": [node(SHARED_DRAFT, "Pilot onboarding checklist (draft)")],
    "space=private": [],
  }
  const moves: unknown[] = []
  // Every move is previewed first (lib/docMove): here nobody's access changes.
  const previews: unknown[] = []
  return { children, moves, previews }
}

const person = (u: { user_uuid: string; user_name: string; user_full_name: string }) => ({ user_uuid: u.user_uuid, user_name: u.user_name, user_full_name: u.user_full_name })

/** Answers the docs programme's reads and writes by path and query, after the stubbed app's own. */
async function serveDocs(page: Page, testInfo: TestInfo, ws: ReturnType<typeof workspace>, extra: Record<string, unknown> = {}) {
  await stubBackend(page, testInfo, {
    "/user/sidebarNav": { status: "success", data: { ...SAM, user_projects: [], user_channels: [], user_dms: [], user_teams: [] }, starred: [{ kind: "star", resource_kind: "doc", resource_uuid: HANDBOOK, position: "a", title: "Handbook", href: `/app/doc/${HANDBOOK}` }] },
    ...extra,
  })
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  await page.route(
    (url) => url.origin !== app.origin && /\/doc\/(children|move|list|search|trash|restore)|\/places/.test(url.pathname),
    async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const headers = { "access-control-allow-origin": req.headers()["origin"] || app.origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" }
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      const json = (body: unknown) => route.fulfill({ status: 200, headers, json: body })
      const q = url.searchParams
      if (url.pathname.endsWith("/doc/children")) {
        const key = q.get("parent") ? `parent=${q.get("parent")}` : `space=${q.get("space")}`
        const nodes = ws.children[key] ?? []
        return json({ data: { parent: q.get("parent") ?? "", nodes, hidden: 0, count: nodes.length } })
      }
      if (url.pathname.endsWith("/doc/move/preview")) {
        ws.previews.push(req.postDataJSON())
        return json({ data: { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." } })
      }
      if (url.pathname.endsWith("/doc/move")) {
        const m = req.postDataJSON() as { doc_uuid: string; parent_uuid?: string }
        ws.moves.push(m)
        // The server's tree after the move.
        for (const k of Object.keys(ws.children)) ws.children[k] = ws.children[k].filter((n) => n.uuid !== m.doc_uuid)
        const moved = node(m.doc_uuid, m.doc_uuid === HANDBOOK ? "Handbook" : "Moved")
        const into = m.parent_uuid ? `parent=${m.parent_uuid}` : "space=workspace"
        ws.children[into] = [...(ws.children[into] ?? []), moved]
        return json({ data: { doc_uuid: m.doc_uuid, parent_uuid: m.parent_uuid ?? "", access: "keep" } })
      }
      if (url.pathname.endsWith("/places")) return json({ data: { places: [] } })
      return route.fallback()
    },
  )
}

test.describe("the sidebar's page tree", () => {
  test("opens a page's children, and a page dragged into another is there after a reload", async ({ page }, testInfo) => {
    const ws = workspace()
    await serveDocs(page, testInfo, ws)
    await page.setViewportSize({ width: 1280, height: 860 })
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })

    const tree = page.getByRole("tree", { name: "Workspace pages" })
    await expect(tree).toBeVisible({ timeout: 60_000 })
    // Its rows are 28 px.
    expect(Math.round((await tree.getByRole("treeitem", { name: "Handbook" }).boundingBox())!.height)).toBe(28)
    // Shared with me shows, because something is; Private, empty, doesn't.
    await expect(page.getByRole("tree", { name: "Pages shared with me" })).toBeVisible()
    await expect(page.getByRole("tree", { name: "Private pages" })).toHaveCount(0)
    // A starred doc is in Starred.
    await expect(page.getByRole("region", { name: "Starred" }).getByRole("link", { name: "Handbook" })).toBeVisible()

    // Keyboard: ↓ to Handbook's row above it, → opens Engineering.
    const engineering = tree.getByRole("treeitem", { name: "Engineering" })
    await engineering.focus()
    await page.keyboard.press("ArrowRight")
    await expect(tree.getByRole("treeitem", { name: "RFCs" })).toBeVisible()

    // Drag Handbook onto the middle of Engineering: inside it.
    const handbook = tree.getByRole("treeitem", { name: "Handbook" })
    const box = (await engineering.boundingBox())!
    await handbook.dragTo(engineering, { targetPosition: { x: box.width / 2, y: box.height / 2 } })
    await expect.poll(() => ws.moves.length).toBe(1)
    // Previewed first, as every move is; nobody's access changed, so it moved unasked.
    expect(ws.previews).toEqual([{ doc_uuid: HANDBOOK, parent_uuid: ENGINEERING, place: "last", access: "keep" }])
    expect(ws.moves[0]).toMatchObject({ doc_uuid: HANDBOOK, parent_uuid: ENGINEERING, access: "keep" })

    await page.reload({ waitUntil: "domcontentloaded" })
    const after = page.getByRole("tree", { name: "Workspace pages" })
    await expect(after.getByRole("treeitem", { name: "Engineering" })).toBeVisible({ timeout: 60_000 })
    // Engineering stays open (remembered), with Handbook inside it.
    const inside = after.locator(`[data-tree-parent="${ENGINEERING}"]`)
    await expect(inside.filter({ hasText: "Handbook" })).toHaveCount(1)
  })

  test("gives the keys back to the row whose menu they opened", async ({ page }, testInfo) => {
    // The row's "⋯" hides once its menu lets the row go, so the menu can't
    // give the focus to it: after ⇧F10 and Escape it fell to <body> (F8,
    // REGRESSION-HUNT 26 Oct 2026).
    await serveDocs(page, testInfo, workspace())
    await page.setViewportSize({ width: 1280, height: 860 })
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const tree = page.getByRole("tree", { name: "Workspace pages" })
    const handbook = tree.getByRole("treeitem", { name: "Handbook" })
    await expect(handbook).toBeVisible({ timeout: 60_000 })
    await handbook.focus()
    await page.keyboard.press("Shift+F10")
    // The keys are in the menu: on the menu itself here, as its chunk lands
    // after the key (on its first item once the chunk is in).
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => menu.evaluate((m) => m.contains(document.activeElement))).toBe(true)
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
    await expect(handbook).toBeFocused()
    await page.keyboard.press("ArrowUp")
    await expect(tree.getByRole("treeitem", { name: "Engineering" })).toBeFocused()
  })
})

test.describe("the docs home", () => {
  const item = (uuid: string, title: string, path: { doc_uuid?: string; doc_title?: string; redacted?: boolean }[] = []) => ({
    doc_uuid: uuid,
    doc_title: title,
    doc_snippet: "",
    doc_updated_at: new Date(Date.now() - 3_600_000).toISOString(),
    owner: person(SAM),
    path,
  })
  const LISTS: Record<string, ReturnType<typeof item>[]> = {
    recent: [item(RFCS, "RFCs", [{ doc_uuid: ENGINEERING, doc_title: "Engineering" }])],
    mine: [item(ENGINEERING, "Engineering"), item(RFCS, "RFCs", [{ doc_uuid: ENGINEERING, doc_title: "Engineering" }])],
    shared: [item(SHARED_DRAFT, "Pilot onboarding checklist (draft)")],
    workspace: [item(ENGINEERING, "Engineering"), item(HANDBOOK, "Handbook"), item(RFCS, "RFCs", [{ doc_uuid: ENGINEERING, doc_title: "Engineering" }])],
    starred: [item(HANDBOOK, "Handbook")],
    archived: [],
  }

  async function serveHome(page: Page, testInfo: TestInfo) {
    await serveDocs(page, testInfo, workspace())
    const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
    await page.route(
      (url) => url.origin !== app.origin && /\/doc\/(list|search|trash|restore)$/.test(url.pathname),
      async (route) => {
        const req = route.request()
        const url = new URL(req.url())
        const headers = { "access-control-allow-origin": req.headers()["origin"] || app.origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*" }
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
        const json = (body: unknown) => route.fulfill({ status: 200, headers, json: body })
        if (url.pathname.endsWith("/doc/list")) {
          const scope = url.searchParams.get("scope") ?? ""
          const docs = LISTS[scope] ?? []
          const limit = Number(url.searchParams.get("limit") || 30)
          return json({ data: { scope, docs: docs.slice(0, limit), count: docs.length, next_cursor: "" } })
        }
        if (url.pathname.endsWith("/doc/search")) {
          return json({
            data: {
              query: url.searchParams.get("q"),
              docs: [{ ...item(HANDBOOK, "Handbook"), highlights: ["We deploy on <mark>Tuesdays</mark>, after the standup."] }],
              count: 1,
              capped: false,
            },
          })
        }
        if (url.pathname.endsWith("/doc/trash")) {
          return json({ data: { items: [{ doc_uuid: OLD_PLAN, doc_title: "Old plan", deleted_at: new Date(Date.now() - 86_400_000).toISOString(), subpages: 2, can_purge: true, purge_at: new Date(Date.now() + 29 * 86_400_000).toISOString() }], count: 1 } })
        }
        if (url.pathname.endsWith("/doc/restore")) return json({ msg: "Restored.", data: { restored: 3, parent_uuid: "" } })
        return route.fallback()
      },
    )
  }

  test("shows each list with its count, the paths in the list view, and finds words in docs' bodies", async ({ page }, testInfo) => {
    await serveHome(page, testInfo)
    await page.setViewportSize({ width: 1280, height: 860 })
    await page.goto("/app/doc", { waitUntil: "domcontentloaded", timeout: 120_000 })

    const tabs = page.getByRole("tablist", { name: "Docs" })
    await expect(tabs.getByRole("tab", { name: /Recent/ })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 })
    // Each tab's count is the server's, beside its name.
    await expect(tabs.getByRole("tab", { name: /^Workspace\s*3$/ })).toBeVisible({ timeout: 30_000 })
    await expect(tabs.getByRole("tab", { name: /^Shared with me\s*1$/ })).toBeVisible()

    await tabs.getByRole("tab", { name: /Shared with me/ }).click()
    await expect(page).toHaveURL(/tab=shared/)
    await expect(page.getByRole("link", { name: /Pilot onboarding checklist \(draft\)/ })).toBeVisible()

    // The list view: 36 px rows that say where each doc sits.
    await tabs.getByRole("tab", { name: /Workspace/ }).click()
    await page.getByRole("radio", { name: "List" }).click()
    const rfcs = page.getByRole("link", { name: /^RFCs, in Engineering/ })
    await expect(rfcs).toBeVisible()
    expect(Math.round((await rfcs.boundingBox())!.height)).toBe(36)
    await expect(page.getByText("in Engineering").first()).toBeVisible()

    // Search finds the word in a body, and marks it in the passage.
    await page.getByRole("searchbox", { name: "Search docs" }).fill("tuesdays")
    const passage = page.locator("[data-search-snippet] mark").first()
    await expect(passage).toHaveText("Tuesdays")
    await expect(page.getByText("1 doc", { exact: true })).toBeVisible()
  })

  test("lists the trash, and brings a page back with the pages deleted with it", async ({ page }, testInfo) => {
    await serveHome(page, testInfo)
    await page.goto("/app/doc/trash", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const row = page.locator(`[data-restore-row="${OLD_PLAN}"]`)
    await expect(row).toContainText("Old plan", { timeout: 60_000 })
    await expect(row).toContainText("+ 2 pages inside")
    const restore = page.waitForRequest((r) => r.url().endsWith("/doc/restore") && r.method() === "POST")
    await row.getByRole("button", { name: "Restore" }).click()
    expect((await restore).postDataJSON()).toEqual({ doc_uuid: OLD_PLAN })
    // Exact: the toast's live region repeats it after "Notification" for a moment.
    await expect(page.getByText("Restored “Old plan” and 2 pages inside", { exact: true })).toBeVisible()
  })

  test("at a sheet's width on a computer, a sheet opened from the keys takes them and gives them back", async ({ browser }, testInfo) => {
    // Under 640 px a window shows the phone's shell and its sheets. A sheet
    // opened from the keys took none of them: they stayed on the page behind
    // it, which the open sheet hides from a screen reader (27 Oct 2026).
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 600, height: 900 } })
    const page = await context.newPage()
    await serveHome(page, testInfo)
    await page.goto("/app/doc", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const pages = page.getByRole("button", { name: "Pages" })
    await expect(pages).toBeVisible({ timeout: 60_000 })
    await pages.focus()
    await page.keyboard.press("Enter")
    const pagesSheet = page.getByRole("dialog", { name: "Pages" })
    await expect(pagesSheet).toBeFocused({ timeout: 30_000 })
    const tree = pagesSheet.getByRole("tree", { name: "Workspace pages" })
    const handbook = tree.getByRole("treeitem", { name: "Handbook" })
    await expect(handbook).toBeVisible({ timeout: 30_000 })
    await handbook.focus()
    await page.keyboard.press("Shift+F10")
    const rowSheet = page.getByRole("dialog", { name: "Handbook" })
    await expect(rowSheet).toBeFocused({ timeout: 30_000 })
    // For review (SHOTS_DIR): the sheet as the keys find it, in both themes.
    if (process.env.SHOTS_DIR) {
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await reviewShot(page, "sheet-from-keys", theme)
      }
    }
    // Escape gives the keys back: the row's menu to its row (F8), the Pages
    // sheet to the button that opened it.
    await page.keyboard.press("Escape")
    await expect(rowSheet).toHaveCount(0)
    await expect(handbook).toBeFocused()
    await page.keyboard.press("ArrowUp")
    await expect(tree.getByRole("treeitem", { name: "Engineering" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(pagesSheet).toHaveCount(0)
    await expect(pages).toBeFocused()
    await context.close()
  })

  test("on a phone, a sheet a tap opens holds the focus itself, and a tap that closes it leaves it be", async ({ browser }, testInfo) => {
    // Never a field on a tap: the phone's keyboard would come up over the
    // sheet. The sheet itself takes the focus, for a screen reader, and a tap
    // that closes it gives the focus to nothing it came from.
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await serveHome(page, testInfo)
    await page.goto("/app/doc", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByRole("button", { name: "Pages" }).tap({ timeout: 60_000 })
    const pagesSheet = page.getByRole("dialog", { name: "Pages" })
    await expect(pagesSheet).toBeFocused({ timeout: 30_000 })
    const handbook = pagesSheet.getByRole("tree", { name: "Workspace pages" }).getByRole("treeitem", { name: "Handbook" })
    const more = handbook.getByRole("button", { name: "More for Handbook" })
    await more.tap({ timeout: 30_000 })
    const rowSheet = page.getByRole("dialog", { name: "Handbook" })
    await expect(rowSheet).toBeFocused({ timeout: 30_000 })
    // The scrim above the row's sheet: the tap closes the sheet and nothing
    // else, so the row under it opens no doc and the Pages sheet stays up.
    await page.touchscreen.tap(195, 40)
    await expect(rowSheet).toHaveCount(0)
    // Radix gives the focus back a task after the sheet goes: that task first.
    await page.evaluate(() => new Promise((done) => setTimeout(done, 0)))
    await expect(more).not.toBeFocused()
    await expect(pagesSheet).toBeVisible()
    await expect(page).toHaveURL(/\/app\/doc$/)
    // For review (SHOTS_DIR): the Pages sheet as the tap left it, in both themes.
    if (process.env.SHOTS_DIR) {
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await reviewShot(page, "scrim-tap-closed", theme)
      }
    }
    await context.close()
  })
})

test.describe("a doc made from a template", () => {
  const DOC = ID(9)

  async function openAs(browser: Browser, testInfo: TestInfo, relay: CollabRelay, who: typeof SAM) {
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await stubBackend(page, testInfo, {
      [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Meeting notes", doc_body: "", edit: true }),
      "/user/profile": { msg: "ok", data: who },
      "/auth/token": { data: { token: `e2e-${who.user_name}` } },
    })
    await relay.attach(page, who.user_full_name)
    // A just-made doc, opened as New doc opens it; an old link's ?template= too.
    await page.goto(`/app/doc/${DOC}?new=1&template=b5d0c000-0000-4000-8000-000000000001`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const body = page.locator('.doc-editor .ProseMirror[contenteditable="true"]')
    await expect(body).toBeVisible({ timeout: 60_000 })
    return { page, body, close: () => context.close() }
  }

  test("shows it once in two tabs opened together, and neither tab lays it in again (N37)", async ({ browser }, testInfo) => {
    const relay = new CollabRelay()
    // The server wrote the template into the live copy as it made the doc.
    const seeded = docFromBlocks([
      { type: "heading", level: 2, text: "Agenda" },
      { type: "bullets", items: [""] },
      { type: "heading", level: 2, text: "Action items" },
      { type: "todos", items: [{ text: "" }] },
    ])
    Y.applyUpdate(relay.doc(DOC), seeded.update)

    const [sam, priya] = await Promise.all([openAs(browser, testInfo, relay, SAM), openAs(browser, testInfo, relay, PRIYA)])
    await expect(sam.body).toContainText("Action items", { timeout: 15_000 })
    await expect(priya.body).toContainText("Action items", { timeout: 15_000 })
    // Time for any tab that would lay a template into an empty-looking doc.
    await sam.page.waitForTimeout(1500)
    const count = async (b: typeof sam.body) => (await b.innerText()).split("Action items").length - 1
    expect(await count(sam.body)).toBe(1)
    expect(await count(priya.body)).toBe(1)
    expect(relay.doc(DOC).getXmlFragment("default").toString().split("Action items").length - 1).toBe(1)
    // The address forgot it was new, and the old link's template.
    expect(new URL(sam.page.url()).search).toBe("")

    await sam.close()
    await priya.close()
  })
})
