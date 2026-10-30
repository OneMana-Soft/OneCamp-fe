import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"

import { SAM, docInfo, stubBackend, type Answers } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { more, openDocWith, openMore } from "./docWith"
import { PRIYA, type Person } from "./twoPeople"

// A doc's page chrome (B6), in a real browser on A1's two-person harness:
// the path above the doc, More's delete with Undo, the soft lock, an icon,
// sharing as full access and as an editor, and what a reader beside a writer
// may and may not do. Nothing reaches a real server: every request is
// answered here (stubbedApp), and the collaboration socket by the relay.

const DOC = "0b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"
const ENG = "1b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"
const RFCS = "2b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"
const MOVED = "3b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"

test.describe.configure({ mode: "serial" })

interface Tab {
  page: Page
  body: ReturnType<Page["locator"]>
  posts: { path: string; body: unknown }[]
  close(): Promise<void>
}

/** The access answer B6's pieces read (A5's GET /doc/access). */
function access(level: "full" | "edit" | "view", people: unknown[] = [], general: { private: boolean; level: string } = { private: true, level: "view" }) {
  return {
    data: {
      doc_uuid: DOC,
      level,
      owner: level === "full",
      lock: "",
      locked: false,
      can_share: level === "full",
      can_lock_soft: level !== "view",
      can_lock_hard: level === "full",
      ...(level === "view" ? {} : { sharing: { owner: SAM, people, teams: [], general, everyone: "none" } }),
    },
  }
}

/**
 * Opens the doc as someone, with the answers given on top of the doc's own:
 * as an editor unless told otherwise, its POSTs recorded.
 */
async function open(browser: Browser, testInfo: TestInfo, relay: CollabRelay, person: Person, opts: { edit?: boolean; doc?: Record<string, unknown>; answers?: Answers } = {}): Promise<Tab> {
  const edit = opts.edit ?? true
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const posts: Tab["posts"] = []
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON?.() ?? null })
  })
  const info = docInfo({ doc_uuid: DOC, doc_title: "Launch notes", doc_body: "<p>The plan.</p>", edit })
  Object.assign(info.data, opts.doc ?? {})
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: info,
    "/user/profile": { msg: "ok", data: person },
    "/auth/token": { data: { token: `e2e-${person.user_name}` } },
    [`/doc/ancestors/${DOC}`]: { data: { ancestors: [], truncated: false } },
    [`/doc/backlinks/${DOC}`]: { data: { tasks: [], projects: [], docs: [], count: 0 } },
    "/places": { data: { places: [] } },
    [`/doc/access/${DOC}`]: access(edit ? "full" : "view"),
    ...(opts.answers ?? {}),
  })
  await relay.attach(page, person.user_full_name)
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const body = page.locator(".doc-editor .ProseMirror")
  await expect(body).toBeVisible({ timeout: 60_000 })
  return { page, body, posts, close: () => context.close() }
}

test("the breadcrumb shows the path, and a page dropped on a crumb, or on Docs, is previewed and moves", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await open(browser, testInfo, relay, SAM, {
    doc: { doc_icon: "📐" },
    answers: {
      [`/doc/ancestors/${DOC}`]: { data: { ancestors: [{ kind: "doc", uuid: ENG, title: "Engineering", icon: "🛠️", has_children: true }, { kind: "doc", redacted: true, has_children: true }, { kind: "doc", uuid: RFCS, title: "RFCs", has_children: true }], truncated: false } },
      // Every move is previewed first (lib/docMove); here nobody's access changes.
      "/doc/move/preview": { data: { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." } },
      "/doc/move": { data: { doc_uuid: MOVED, parent_uuid: ENG, access: "adopt" } },
    },
  })
  const crumbs = tab.page.locator("[data-doc-breadcrumbs]")
  await expect(crumbs).toBeVisible({ timeout: 30_000 })
  await expect(crumbs).toContainText("Engineering")
  await expect(crumbs).toContainText("RFCs")
  await expect(crumbs).toContainText("Launch notes")
  // A page the viewer can't open is "…", never named.
  await expect(crumbs.locator("[data-crumb-hidden]")).toHaveCount(1)
  await expect(crumbs.getByRole("link", { name: /RFCs/ })).toHaveAttribute("href", `/app/doc/${RFCS}`)

  const drop = (target: string) =>
    tab.page.evaluate(
      ({ target, dragged }) => {
        const el = document.querySelector(`[data-doc-drop-target="${target}"]`)!
        const data = new DataTransfer()
        data.setData("text/plain", dragged)
        el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }))
        el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }))
      },
      { target, dragged: MOVED },
    )
  const sent = (path: string) => tab.posts.filter((p) => p.path === path).map((p) => p.body)

  await drop(ENG)
  await expect.poll(() => sent("/doc/move")).toEqual([{ doc_uuid: MOVED, parent_uuid: ENG, place: "last", access: "adopt" }])
  expect(sent("/doc/move/preview")).toEqual([{ doc_uuid: MOVED, parent_uuid: ENG, place: "last", access: "adopt" }])
  await expect(tab.page.getByText("Moved into “Engineering”", { exact: true })).toBeVisible()

  // Docs, the top: previewed as a move under a page is, then moved.
  await drop("top")
  await expect.poll(() => sent("/doc/move").length).toBe(2)
  expect(sent("/doc/move/preview")[1]).toEqual({ doc_uuid: MOVED, space: "workspace", place: "last", access: "keep" })
  expect(sent("/doc/move")[1]).toEqual({ doc_uuid: MOVED, space: "workspace", place: "last", access: "keep" })
  await expect(tab.page.getByText("Moved to the top of Docs", { exact: true })).toBeVisible()
  await tab.close()
})

test("More's Delete moves the doc to the trash, leaves its page, and Undo brings it back (N32)", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await open(browser, testInfo, relay, SAM, {
    answers: {
      "/doc/delete": { data: { batch_id: "b1", count: 1 } },
      "/doc/restore": { data: { restored: 1, parent_uuid: "" } },
      // The docs home it leaves for, with its list as a person would have it
      // (the doc just deleted gone from it). Unanswered, the home drew its
      // error state, and on a loaded machine its failed reads and retries
      // held the page until the toast's six seconds had nearly run.
      "/doc/list": (url: URL) => ({ data: { scope: url.searchParams.get("scope") ?? "recent", docs: [], count: 0, next_cursor: "" } }),
      "/doc/children": { data: { parent: "", nodes: [], hidden: 0, count: 0 } },
    },
  })
  // The page is left in the app, never by a page load: one took the Undo
  // toast with it (2 runs in 12) when the page guard had gone meanwhile.
  const loads: string[] = []
  tab.page.on("request", (r) => {
    if (r.resourceType() === "document") loads.push(new URL(r.url()).pathname)
  })
  await more(tab.page, "Delete")
  await expect.poll(() => tab.posts.some((p) => p.path === "/doc/delete")).toBe(true)
  // The words a row's menu says too (one docActions module), up as the page
  // is left. Undo the keyboard's way: the focus in the toasts opens the stack
  // and holds every toast's clock (shell T1), and Enter reaches the button
  // wherever the stack has it. A click waited behind a toast that came in on
  // top (an unanswered read's "Not in this test") until the six seconds ran out.
  const toast = tab.page.getByText("Moved “Launch notes” to the trash", { exact: true })
  await expect(toast).toBeVisible()
  const undo = tab.page.getByRole("button", { name: "Undo" })
  await undo.focus()
  await expect(tab.page).toHaveURL(/\/app\/doc$/)
  expect(loads).toEqual([])
  await undo.press("Enter")
  await expect.poll(() => tab.posts.find((p) => p.path === "/doc/restore")?.body).toEqual({ doc_uuid: DOC })
  // Back on its page: a page load of its own (the doc route's answer, then
  // its editor), waited for as the first open waits for it. Given the five
  // seconds a toast gets, it ran out twice in 36 runs as the machine's load
  // rose (back in 1 to 3 s otherwise), the doc route's answer still on its way.
  await expect(tab.body).toBeVisible({ timeout: 60_000 })
  await expect(tab.page).toHaveURL(new RegExp(`/app/doc/${DOC}$`))
  await tab.close()
})

test("a soft lock holds the editor until it is unlocked for this person (D-12)", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await open(browser, testInfo, relay, SAM, { doc: { doc_lock_level: "soft", doc_locked_by: { user_uuid: SAM.user_uuid, user_name: "Sam Rivera" } } })
  await expect(tab.body).toHaveAttribute("contenteditable", "false", { timeout: 30_000 })
  await tab.page.getByRole("button", { name: "Locked" }).click()
  const dialog = tab.page.locator("[data-doc-lock-dialog]")
  await expect(dialog).toContainText("Sam Rivera locked it")
  await dialog.getByRole("button", { name: "Unlock for me" }).click()
  await expect(tab.body).toHaveAttribute("contenteditable", "true")
  await expect(tab.page.getByRole("button", { name: "Unlocked for you" })).toBeVisible()
  // Nothing was sent: unlocking for oneself is the client's.
  expect(tab.posts.some((p) => p.path === "/doc/lock")).toBe(false)
  await tab.close()
})

test("an icon added from the title band shows above the title at once", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await open(browser, testInfo, relay, SAM, { doc: { doc_title: "Launch checklist" }, answers: { "/doc/look": { data: {} } } })
  await tab.page.locator("[data-doc-title-block]").hover()
  await tab.page.getByRole("button", { name: "Add icon" }).click()
  await expect(tab.page.locator("[data-doc-page-icon]")).toContainText("🚀")
  await expect.poll(() => tab.posts.find((p) => p.path === "/doc/look")?.body).toEqual({ doc_uuid: DOC, icon: "🚀" })
  await tab.close()
})

test("full access shares at any level; an editor invites, up to Can edit", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const people = { "/doc/searchUsers": { data: [PRIYA] } }
  const owner = await open(browser, testInfo, relay, SAM, { answers: { ...people, "/doc/access/update": { data: { effects: [], pages: 1, lose: 0, gain: 1, change: 0, summary: "" } } } })
  await owner.page.locator("[data-doc-share]").click()
  const dialog = owner.page.locator("[data-share-dialog]")
  await expect(dialog).toContainText("Sharing changes are recorded.")
  await dialog.getByRole("combobox", { name: "Add people or teams" }).fill("pri")
  await dialog.getByRole("option", { name: /priya/i }).click()
  await dialog.getByRole("button", { name: "Invite" }).click()
  await expect.poll(() => owner.posts.find((p) => p.path === "/doc/access/update")?.body).toEqual({ doc_uuid: DOC, adds: [{ kind: "user", uuid: PRIYA.user_uuid, level: "edit" }] })
  await owner.close()

  const editor = await open(browser, testInfo, relay, PRIYA, {
    answers: { ...people, [`/doc/access/${DOC}`]: access("edit", [{ ...PRIYA, level: "edit" }]), "/doc/access/invite": { data: { effects: [], pages: 1, lose: 0, gain: 1, change: 0, summary: "" } }, "/doc/searchUsers": { data: [SAM] } },
  })
  await editor.page.locator("[data-doc-share]").click()
  const asEditor = editor.page.locator("[data-share-dialog]")
  await asEditor.locator("[data-share-invite-level]").click()
  await expect(editor.page.getByRole("menuitem", { name: /Can comment/ })).toBeVisible()
  await expect(editor.page.getByRole("menuitem", { name: /Full access/ })).toHaveCount(0)
  await editor.page.keyboard.press("Escape")
  await expect(asEditor.locator("[data-guest-link-card]")).toHaveCount(0)
  await editor.close()
})

// DESIGN-BUILD-6, 22 Oct: on a phone the share sheet cut "Everyone in the
// workspace" mid-word, and the menu of the level it gives marked none.
for (const screen of [
  { on: "a phone", width: 390, height: 844, isMobile: true, hasTouch: true },
  { on: "a computer", width: 1280, height: 900, isMobile: false, hasTouch: false },
] as const) {
  test(`on ${screen.on}, general access names who it reaches in full, and its level menu marks the level`, async ({ browser }, testInfo) => {
    const relay = new CollabRelay()
    const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC, title: "Launch notes", body: "<p>The plan.</p>" }, { [`/doc/access/${DOC}`]: access("full", [], { private: false, level: "comment" }) }, screen)
    const { page } = tab
    if (screen.width < 640) {
      await page.getByRole("button", { name: "Document options" }).click()
      await page.getByText("Share", { exact: true }).click()
    } else {
      await page.locator("[data-doc-share]").click()
    }
    const dialog = page.locator("[data-share-dialog]")
    const title = dialog.locator("[data-access-card]").getByText("Everyone in the workspace", { exact: true })
    await expect(title).toBeVisible({ timeout: 60_000 })
    // Nothing of it hidden past its end or under its last line.
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)

    const level = dialog.getByRole("button", { name: "Everyone in the workspace: Can comment" })
    await (screen.hasTouch ? level.tap() : level.click())
    const item = (name: string) => page.getByRole("menuitem", { name: new RegExp(`^${name}`) })
    await expect(item("Can comment")).toHaveAttribute("aria-current", "true")
    await expect(item("Can comment").locator("[data-menu-check]")).toHaveAttribute("data-menu-check", "on")
    await expect(item("Can edit").locator("[data-menu-check]")).toHaveAttribute("data-menu-check", "off")
    await expect(item("Can view").locator("[data-menu-check]")).toHaveAttribute("data-menu-check", "off")
    await tab.close()
  })
}

test("a reader beside a writer sees the writing live, and gets none of the editor's page actions", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const writer = await open(browser, testInfo, relay, SAM)
  const reader = await open(browser, testInfo, relay, PRIYA, { edit: false })
  await writer.body.click()
  await writer.page.keyboard.press("Control+End")
  await writer.page.keyboard.type(" Sam adds a line")
  await expect(reader.body).toContainText("Sam adds a line", { timeout: 15_000 })

  await openMore(reader.page, "Duplicate")
  const menu = reader.page.locator("[data-doc-more-menu]")
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible()
  for (const item of ["Delete", "Move to…", "Lock page…", "Transfer ownership…"]) await expect(menu.getByRole("menuitem", { name: item })).toHaveCount(0)
  await reader.page.keyboard.press("Escape")
  // A reader adds no icon, and has no Share button to open.
  await reader.page.locator("[data-doc-title-block]").hover()
  await expect(reader.page.getByRole("button", { name: "Add icon" })).toHaveCount(0)
  await expect(reader.page.locator("[data-doc-share]")).toHaveCount(0)
  await writer.close()
  await reader.close()
})
