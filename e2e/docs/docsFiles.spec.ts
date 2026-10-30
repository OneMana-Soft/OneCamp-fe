import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, docInfo, reviewShot, stubBackend } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { more } from "./docWith"
import { docx, pdf, png } from "./fileBytes"
import { PRIYA } from "./twoPeople"

// Docs & Files (docs F1b), in a real browser on the production build: a
// project's Docs & Files holding a folder, files (a two-page PDF, a PNG, a
// Word file and slides), a link and colours, each row with who last changed
// it and when. A folder opens in place; each file previews (the slides, which
// no viewer reads, as a card with Download; a PDF where the browser shows
// none, as the same card); a file takes a new version with a note and lists
// its versions; several items take a colour at once, chosen in the neutral
// tone; a phone's row sheet names its item and groups its actions; a link is
// added, https only, and opens in a new tab. At 1280 and 390, light and dark.
// It runs in Chromium proper, which reads PDFs as Chrome does; the phone with
// its PDF viewer off, as a phone's Chrome has none. Every
// request is answered here, by F1a's contract (design/docs-vs-notion/
// F1-FILES.md, with DOCS-LEAD-2's rulings): nothing reaches a server.
// SHOTS_DIR names a folder for the review's screenshots (stubbedApp's
// reviewShot); without it none are taken.

const id = (n: number) => `f1b00000-0000-4000-8000-${String(n).padStart(12, "0")}`
const P = id(1)
const CONTRACTS = id(10)
const NDA = id(11)
const MSA = id(12)
const BRIEF = id(20)
const MOCK = id(21)
const SPEC = id(22)
const DECK = id(23)
const DESIGNS = id(30)
const PLAN = id(40)
const HANDBOOK = id(41)
const GUIDE = id(42)

const MIME = {
  pdf: "application/pdf",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

// ---- the project's Docs & Files, as the server holds it ----

/** Teammates who changed things: who a row says made its last change. */
const MAYA = { user_uuid: "5c2e8f1a-3b4d-4e6f-8a9b-0c1d2e3f4a5b", user_name: "Maya", user_full_name: "Maya Chen" }
const LEO = { user_uuid: "7d3f9a2b-4c5e-4f70-9b1c-2d3e4f5a6b7c", user_name: "Leo", user_full_name: "Leo Martin" }
type Person = { user_uuid: string; user_name: string; user_full_name: string }

interface Version {
  n: number
  attachment_id: string
  name: string
  size_bytes: number
  mime: string
  note?: string
  created_by: Person
  created_at: string
  bytes: Buffer
}
type Node = {
  kind: "doc"
  uuid: string
  title: string
  has_children: boolean
  can_edit: boolean
  private: boolean
  node_kind?: string
  color?: string
  link_url?: string
  file?: unknown
  updated_at?: string
  updated_by?: Person
}

function world() {
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  const version = (file: string, n: number, name: string, mime: string, bytes: Buffer, h: number, by: Person, note?: string): Version => ({
    n,
    attachment_id: `${file}-v${n}`,
    name,
    size_bytes: bytes.length,
    mime,
    note,
    created_by: by,
    created_at: ago(h),
    bytes,
  })
  const versions: Record<string, Version[]> = {
    [BRIEF]: [version(BRIEF, 2, "Launch brief.pdf", MIME.pdf, pdf("Launch brief"), 3, MAYA, "Legal's edits"), version(BRIEF, 1, "Launch brief draft.pdf", MIME.pdf, pdf("Launch brief (draft)"), 50, SAM)],
    [MOCK]: [version(MOCK, 1, "Homepage mock.png", MIME.png, png(960, 600), 6, LEO)],
    [SPEC]: [version(SPEC, 1, "Launch spec.docx", MIME.docx, docx("Launch spec", "What ships on the last Tuesday of the month, and who signs it off."), 20, MAYA)],
    [DECK]: [version(DECK, 1, "Q4 kickoff.pptx", MIME.pptx, Buffer.from("PK slides"), 30, SAM)],
    [NDA]: [version(NDA, 1, "Mutual NDA.pdf", MIME.pdf, pdf("Mutual NDA"), 70, LEO)],
  }
  const facts = (file: string) => {
    const v = versions[file][0]
    return { name: v.name, size_bytes: v.size_bytes, mime: v.mime, versions: versions[file].length, attachment_id: v.attachment_id }
  }
  const node = (uuid: string, title: string, more: Partial<Node> = {}): Node => ({ kind: "doc", uuid, title, has_children: false, can_edit: true, private: true, ...more })
  // A file was last changed by its newest version: who uploaded it, and when.
  const fileNode = (uuid: string, title: string) => node(uuid, title, { node_kind: "file", file: facts(uuid), updated_at: versions[uuid][0].created_at, updated_by: versions[uuid][0].created_by })
  const top: Node[] = [
    node(CONTRACTS, "Contracts", { node_kind: "folder", color: "moss", has_children: true, updated_at: ago(1), updated_by: LEO }),
    node(PLAN, "Launch plan", { color: "berry", updated_at: ago(2), updated_by: MAYA }),
    fileNode(BRIEF, "Launch brief.pdf"),
    fileNode(MOCK, "Homepage mock.png"),
    fileNode(SPEC, "Launch spec.docx"),
    fileNode(DECK, "Q4 kickoff.pptx"),
    node(DESIGNS, "Launch designs", { node_kind: "link", link_url: "https://www.figma.com/file/launch-designs", updated_at: ago(52), updated_by: LEO }),
    node(HANDBOOK, "Handbook", { has_children: true, updated_at: ago(30), updated_by: SAM }),
  ]
  const inside: Record<string, Node[]> = {
    [CONTRACTS]: [fileNode(NDA, "Mutual NDA.pdf"), node(MSA, "MSA drafts", { node_kind: "folder", updated_at: ago(80), updated_by: SAM })],
    [MSA]: [],
    [HANDBOOK]: [node(GUIDE, "Onboarding guide", { updated_at: ago(30), updated_by: SAM })],
  }
  const all = () => [...top, ...Object.values(inside).flat()]
  // A file uploaded into a folder: its first version, Sam's, now.
  const upload = (parent: string, name: string, mime: string, bytes: Buffer): Node => {
    const uuid = id(200 + Object.keys(versions).length)
    versions[uuid] = [version(uuid, 1, name, mime, bytes, 0, SAM)]
    const made = fileNode(uuid, name)
    ;(inside[parent] ??= []).push(made)
    return made
  }
  return {
    top,
    inside,
    versions,
    facts,
    all,
    upload,
    colours: [] as Array<{ doc_uuids: string[]; color: string | null }>,
    made: [] as Array<Record<string, unknown>>,
    notes: [] as string[],
  }
}
type World = ReturnType<typeof world>

/** Where the files' bytes are served from: the app's own origin, as a signed address would serve them. */
const FILES_PATH = "/__docs-files/"

const corsOf = (req: Request, appOrigin: string) => ({
  "access-control-allow-origin": req.headers()["origin"] || appOrigin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
})

/** The project page's reads, and F1's reads and writes by its contract. */
async function serve(page: Page, testInfo: TestInfo, w: World, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    // The first-run keyboard tip, which would rise in the corner mid-test,
    // and the shared demo's note, which a build for the demo shows once.
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem("onecamp:demo-shared-note-seen", "1")
  }, theme)
  const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
  const none: unknown[] = []
  await stubBackend(page, testInfo, {
    // The project's tasks, which its header counts on every tab: none.
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: none,
        project_tasks_todo: none,
        project_tasks_in_progress: none,
        project_tasks_in_review: none,
        project_tasks_done: none,
        project_tasks_canceled: none,
        project_tasks_done_count: 0,
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    // The project's Attachments (what its tasks and comments carry): none.
    [`/project/attachments/${P}`]: { msg: "ok", data: { ...project, project_attachments: none } },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    "/notices": { msg: "ok", data: { notices: [] } },
  })
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  // The browser's own PDF viewer loads from its extension and the browser's
  // shared resources (chrome://resources): the browser's to answer, never the
  // stub's (which answers anything off the app with 404).
  await page.route((url) => url.protocol === "chrome-extension:" || url.protocol === "chrome:", (route) => route.continue())
  // Anything else the page asks for and nobody answers, said in the run's log.
  page.on("response", (r) => {
    if (r.status() === 404) console.log(`[docsFiles] 404 ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  page.on("pageerror", (e) => console.log(`[docsFiles] page error: ${e.message}`))

  await page.route(`**${FILES_PATH}**`, async (route) => {
    const att = new URL(route.request().url()).pathname.slice(FILES_PATH.length)
    const v = Object.values(w.versions)
      .flat()
      .find((x) => x.attachment_id === att)
    if (!v) return route.fulfill({ status: 404, body: "" })
    return route.fulfill({ status: 200, contentType: v.mime, body: v.bytes })
  })
  // A link opens its document in a new tab: answered here, never fetched.
  await page.context().route(/^https:\/\/(docs\.google\.com|www\.figma\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>The linked document</title><p>The linked document.</p>" }),
  )

  await page.route(
    (url) => url.origin !== app.origin && /\/doc\/(children|getDocInfo|ancestors|files|color|createDoc|getFile)\b/.test(url.pathname),
    async (route) => {
      const req = route.request()
      const headers = corsOf(req, app.origin)
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      const json = (body: unknown) => route.fulfill({ status: 200, headers, json: body })
      const url = new URL(req.url())
      const path = url.pathname

      if (path.endsWith("/doc/children")) {
        const parent = url.searchParams.get("parent")
        const nodes = parent ? (w.inside[parent] ?? []) : url.searchParams.get("space") === `project:${P}` ? w.top : []
        return json({ msg: "ok", data: { parent: parent ?? "", nodes, hidden: 0, count: nodes.length } })
      }
      const info = /\/doc\/getDocInfo\/([^/]+)$/.exec(path)
      if (info) {
        const node = w.all().find((n) => n.uuid === info[1])
        if (!node) return route.fulfill({ status: 404, headers, json: { msg: "Not here" } })
        const answer = docInfo({ doc_uuid: node.uuid, doc_title: node.title, doc_body: "", edit: true })
        return json({ ...answer, data: { ...answer.data, doc_node_kind: node.node_kind, doc_color: node.color ?? null, doc_link_url: node.link_url } })
      }
      const above = /\/doc\/ancestors\/([^/]+)$/.exec(path)
      if (above) {
        const parent = Object.entries(w.inside).find(([, nodes]) => nodes.some((n) => n.uuid === above[1]))?.[0]
        const ancestors = parent ? w.all().filter((n) => n.uuid === parent) : []
        return json({ msg: "ok", data: { ancestors, truncated: false } })
      }
      const versions = /\/doc\/files\/([^/]+)\/versions$/.exec(path)
      if (versions) {
        const file = versions[1]
        if (req.method() === "POST") {
          // Replace with a new version: the file, and what changed beside it.
          const body = req.postDataBuffer()?.toString("latin1") ?? ""
          const note = /name="note"\r\n\r\n([^\r]*)/.exec(body)?.[1]
          if (note) w.notes.push(note)
          const n = w.versions[file][0].n + 1
          const bytes = pdf("Launch brief (signed)")
          const next: Version = { n, attachment_id: `${file}-v${n}`, name: "Launch brief (signed).pdf", size_bytes: bytes.length, mime: MIME.pdf, note, created_by: SAM, created_at: new Date().toISOString(), bytes }
          w.versions[file] = [next, ...w.versions[file]]
          // A new version is the file's last change: by who uploaded it, now.
          for (const node of w.all())
            if (node.uuid === file) Object.assign(node, { file: w.facts(file), updated_at: next.created_at, updated_by: next.created_by })
          const { bytes: _bytes, ...shown } = next
          void _bytes
          return json({ msg: "ok", data: shown })
        }
        // Newest first.
        return json({ msg: "ok", data: { versions: (w.versions[file] ?? []).map(({ bytes, ...v }) => (void bytes, v)) } })
      }
      const got = /\/doc\/getFile\/([^/]+)\/([^/]+)$/.exec(path)
      if (got) return json({ msg: "Got the url!", url: `${app.origin}${FILES_PATH}${got[2]}` })
      if (path.endsWith("/doc/color")) {
        const body = req.postDataJSON() as { doc_uuids: string[]; color: string | null }
        w.colours.push(body)
        for (const node of w.all()) if (body.doc_uuids.includes(node.uuid)) node.color = body.color ?? undefined
        return json({ msg: "ok", data: { count: body.doc_uuids.length } })
      }
      if (path.endsWith("/doc/createDoc")) {
        const body = req.postDataJSON() as Record<string, unknown>
        w.made.push(body)
        const uuid = id(100 + w.made.length)
        w.top.push({ kind: "doc", uuid, title: String(body.doc_title || "docs.google.com"), has_children: false, can_edit: true, private: true, node_kind: body.node_kind as string | undefined, link_url: body.link_url as string | undefined })
        return json({ msg: "ok", data: { doc_uuid: uuid, doc_title: body.doc_title } })
      }
      if (path.endsWith("/doc/files") && req.method() === "POST") {
        // An upload (docs F1b): the file, into the folder its form names.
        const form = req.postDataBuffer()?.toString("latin1") ?? ""
        const name = /name="file"; filename="([^"]+)"/.exec(form)?.[1] ?? "file"
        const parent = /name="parent_uuid"\r\n\r\n([^\r]*)/.exec(form)?.[1] ?? ""
        return json({ msg: "ok", data: w.upload(parent, name, MIME.pdf, pdf(name)) })
      }
      return route.fallback()
    },
  )
}


/**
 * A PDF on the stage, as the browser shows one: in its viewer's frame where
 * it has a viewer (the computer's runs), which draws its pages a moment after
 * the frame is up; else the file's card, never a blank frame (the phone's
 * runs: a phone's Chrome has none).
 */
async function pdfShown(page: Page, preview: Locator, name: string) {
  if (await page.evaluate(() => navigator.pdfViewerEnabled)) {
    await expect(preview.locator('iframe[title="PDF Document"]')).toBeVisible({ timeout: 30_000 })
    // The viewer draws its pages inside the browser's plugin, which tells the
    // page nothing when it's done: a shot gives it a moment, a plain run doesn't wait.
    if (process.env.SHOTS_DIR) await page.waitForTimeout(2_000)
    return "viewer"
  }
  const card = preview.getByTestId("no-preview")
  await expect(card).toContainText(name, { timeout: 30_000 })
  await expect(card).toContainText("Can't preview this file")
  await expect(preview.locator('iframe[title="PDF Document"]')).toHaveCount(0)
  return "card"
}

/**
 * The card's Download: on a computer, the card's own button; on a phone, the
 * sheet's footer's, the only one there, primary while the card shows (design
 * review, 22 Oct).
 */
function cardDownload(preview: Locator, phone: boolean): Locator {
  if (!phone) return preview.getByTestId("no-preview").getByRole("button", { name: "Download" })
  return preview.locator("[data-sheet-footer]").getByRole("button", { name: "Download", exact: true })
}

/** A row's tint and its bar are the ink (the layer's neutral tone), never its own hue. */
async function expectNeutral(row: Locator) {
  const look = await row.evaluate((el) => {
    const s = getComputedStyle(el)
    return { tint: s.getPropertyValue("--ix-tint").trim(), mark: s.getPropertyValue("--ix-mark").trim(), ink: s.getPropertyValue("--ink").trim() }
  })
  expect(look.ink).not.toBe("")
  expect(look.tint).toBe(look.ink)
  expect(look.mark).toBe(look.ink)
}

/** A finger held on an element until what it opens is up, as a phone sends it. */
async function hold(page: Page, target: Locator, until: Locator) {
  const box = (await target.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const at = [{ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at })
  await expect(until).toBeVisible({ timeout: 10_000 })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
}

const MODES = [
  { mode: "1280-light", width: 1280, height: 800, theme: "light" as const, phone: false },
  { mode: "1280-dark", width: 1280, height: 800, theme: "dark" as const, phone: false },
  { mode: "390-light", width: 390, height: 844, theme: "light" as const, phone: true },
  { mode: "390-dark", width: 390, height: 844, theme: "dark" as const, phone: true },
]

// Chromium proper, which reads a PDF in a page as Chrome does (the headless
// shell reads none). A browser's channel is the file's, never a group's.
test.use({ channel: "chromium" })

/** A phone's Chrome shows no PDF in a page: the browser says so as the app reads it. */
const noPdfViewer = () => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { get: () => false, configurable: true })

for (const m of MODES) {
  test.describe(`Docs & Files at ${m.mode}`, () => {
    test.use({
      viewport: { width: m.width, height: m.height },
      colorScheme: m.theme,
      ...(m.phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    })

    let w: World
    const row = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true })
    const press = (l: Locator) => (m.phone ? l.tap() : l.click())

    test.beforeEach(async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      w = world()
      if (m.phone) await page.addInitScript(noPdfViewer)
      await serve(page, testInfo, w, m.theme)
      await page.goto(`/app/project/${P}?tab=docs`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(row(page, "Contracts")).toBeVisible({ timeout: 60_000 })
    })

    test("a project's Docs & Files shows each kind as itself", async ({ page }) => {
      await expect(page.getByRole("tab", { name: "Docs & Files" })).toHaveAttribute("aria-selected", "true")
      const mark = (name: string) => row(page, name).locator("[data-node-mark]")
      await expect(mark("Contracts")).toHaveAttribute("data-node-mark", "folder")
      await expect(mark("Contracts")).toBeVisible()
      // On a computer the chevron takes a row's mark's place under the
      // pointer; a touch screen shows the two side by side (touch test below).
      if (!m.phone) await expect(row(page, "Contracts").locator("[data-tree-toggle]")).toBeHidden()
      await expect(mark("Contracts")).toHaveAttribute("data-hue", "moss")
      await expect(row(page, "Launch plan").locator("[data-doc-icon]")).toHaveCount(1)
      await expect(row(page, "Launch plan").locator("[data-colour-dot]")).toHaveAttribute("data-colour-dot", "berry")
      await expect(mark("Launch brief.pdf")).toHaveAttribute("data-node-mark", "file")
      await expect(mark("Launch designs")).toHaveAttribute("data-provider", "figma")
      await expect(row(page, "Launch designs").locator("[data-tree-meta]")).toHaveText("figma.com")
      // "+" only where things go inside.
      await expect(row(page, "Contracts").locator("[data-tree-add]")).toHaveCount(1)
      await expect(row(page, "Launch brief.pdf").locator("[data-tree-add]")).toHaveCount(0)
      // A file's size as every size is written (one decimal, "bytes" under a KB), and its versions.
      await expect(row(page, "Launch brief.pdf").locator("[data-tree-meta]")).toHaveText(/^\d+(\.\d)? KB · v2$/)
      await expect(row(page, "Q4 kickoff.pptx").locator("[data-tree-meta]")).toHaveText("9 bytes")
      // Who made each row's last change, and when, at the row's end on a
      // computer (design review, shot 01); a phone's narrow row leaves it out.
      const edited = (name: string) => row(page, name).locator("[data-tree-aside]")
      if (m.phone) await expect(edited("Launch plan")).toBeHidden()
      else {
        await expect(edited("Launch plan")).toHaveText("Maya · 2h ago")
        await expect(edited("Launch brief.pdf")).toHaveText("Maya · 3h ago")
        await expect(edited("Contracts")).toHaveText("Leo · 1h ago")
        await expect(edited("Launch designs")).toHaveText(/^Leo · \d{1,2} \w{3}$/)
      }
      await reviewShot(page, "01-docs-and-files", m.theme)
      if (!m.phone) {
        // A file's menu, from a right click: what a file can have done to it,
        // in groups: opening it, its versions, organising it, the trash.
        await row(page, "Launch brief.pdf").click({ button: "right" })
        const menu = page.getByRole("menu")
        await expect(menu.getByRole("menuitem", { name: "Replace with a new version…" })).toBeVisible()
        await expect(menu.getByRole("menuitem", { name: "See all versions" })).toBeVisible()
        await expect(menu.getByRole("menuitem", { name: "Add a page inside" })).toHaveCount(0)
        await expect(menu.getByRole("separator")).toHaveCount(3)
        await reviewShot(page, "02-file-menu", m.theme)
      }
    })

    test("a folder opens in place, and an empty one says what goes there", async ({ page }) => {
      await press(row(page, "Contracts"))
      await page.waitForURL(new RegExp(`/app/doc/${CONTRACTS}$`), { timeout: 60_000 })
      await expect(page.getByRole("heading", { level: 1, name: "Contracts" })).toBeVisible({ timeout: 60_000 })
      await expect(page.locator("[data-folder-meta]")).toHaveText("2 items · Moss")
      await expect(row(page, "Mutual NDA.pdf")).toBeVisible()
      // A folder is never a page: no editor, no live session.
      await expect(page.locator(".ProseMirror")).toHaveCount(0)
      await reviewShot(page, "03-folder", m.theme)
      await press(row(page, "MSA drafts"))
      await page.waitForURL(new RegExp(`/app/doc/${MSA}$`), { timeout: 60_000 })
      await expect(page.getByRole("heading", { level: 1, name: "MSA drafts" })).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText("This folder is empty")).toBeVisible()
      await expect(page.locator("[data-node-crumbs]").getByRole("link", { name: "Contracts" })).toBeVisible()
      await reviewShot(page, "04-folder-empty", m.theme)
      // Upload files: the chooser opens with the upload's code on its way
      // (components/docFiles/dropFiles), and what's chosen lands in the folder.
      const chooser = page.waitForEvent("filechooser")
      await press(page.getByRole("button", { name: "Upload files" }))
      await (await chooser).setFiles({ name: "MSA redline.pdf", mimeType: MIME.pdf, buffer: pdf("MSA redline") })
      await expect(page.getByText("Uploaded MSA redline.pdf").first()).toBeVisible({ timeout: 30_000 })
      await expect(row(page, "MSA redline.pdf").first()).toBeVisible({ timeout: 30_000 })
      expect(w.inside[MSA].map((n) => n.title)).toEqual(["MSA redline.pdf"])
    })

    test("each file previews, and slides are a card with Download", async ({ page }) => {
      const preview = page.locator("[data-file-preview]")
      const open = async (name: string) => {
        await press(row(page, name))
        await expect(preview).toBeVisible({ timeout: 30_000 })
      }
      const close = async () => {
        await page.keyboard.press("Escape")
        await expect(preview).toHaveCount(0, { timeout: 10_000 })
      }
      await open("Launch brief.pdf")
      await expect(preview.locator("[data-preview-meta]")).toContainText("Version 2")
      // A real two-page PDF: its pages on a computer, its card on a phone.
      expect(await pdfShown(page, preview, "Launch brief.pdf")).toBe(m.phone ? "card" : "viewer")
      await reviewShot(page, "05-preview-pdf", m.theme)
      await close()
      await open("Homepage mock.png")
      await expect(preview.getByRole("img", { name: "Homepage mock.png" })).toBeVisible({ timeout: 30_000 })
      await reviewShot(page, "06-preview-png", m.theme)
      await close()
      await open("Launch spec.docx")
      await expect(preview.getByText("What ships on the last Tuesday of the month")).toBeVisible({ timeout: 30_000 })
      await reviewShot(page, "07-preview-docx", m.theme)
      await close()
      await open("Q4 kickoff.pptx")
      const card = preview.getByTestId("no-preview")
      await expect(card).toContainText("Q4 kickoff.pptx")
      await expect(card).toContainText("Can't preview this file")
      await expect(cardDownload(preview, m.phone)).toBeVisible()
      if (m.phone) {
        // One Download: the card has none, and the footer's is the sheet's action.
        await expect(card.getByRole("button")).toHaveCount(0)
        await expect(cardDownload(preview, true)).toHaveClass(/bg-brand/)
      }
      await reviewShot(page, "08-preview-pptx", m.theme)
    })

    // Design review, 21 Oct (shots 05 and 10): a PDF in a browser with no PDF
    // viewer was a blank white sheet. It is the file's card, and its Download
    // gets the file.
    test("a file the browser can't show is its card with Download, never a blank page", async ({ page }) => {
      await page.addInitScript(noPdfViewer)
      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(row(page, "Launch brief.pdf")).toBeVisible({ timeout: 60_000 })
      await press(row(page, "Launch brief.pdf"))
      const preview = page.locator("[data-file-preview]")
      await expect(preview).toBeVisible({ timeout: 30_000 })
      expect(await pdfShown(page, preview, "Launch brief.pdf")).toBe("card")
      if (!m.phone) await reviewShot(page, "20-pdf-no-viewer", m.theme)
      const saved = page.waitForEvent("download", { timeout: 30_000 })
      await press(cardDownload(preview, m.phone))
      expect((await saved).suggestedFilename()).toBe("Launch brief.pdf")
    })

    test("a file takes a new version with what changed, and lists its versions", async ({ page }) => {
      await press(row(page, "Launch brief.pdf"))
      const preview = page.locator("[data-file-preview]")
      await expect(preview).toBeVisible({ timeout: 30_000 })
      await preview.getByRole("button", { name: m.phone ? "New version" : "Replace with a new version", exact: true }).click()
      const replace = page.locator("[data-replace-version-dialog]")
      await expect(replace).toBeVisible()
      await replace.locator('input[type="file"]').setInputFiles({ name: "Launch brief (signed).pdf", mimeType: MIME.pdf, buffer: pdf("Launch brief (signed)") })
      await replace.getByRole("textbox", { name: "What changed (optional)" }).fill("Signed by the client")
      await reviewShot(page, "09-replace-version", m.theme)
      await replace.getByRole("button", { name: "Upload new version" }).click()
      await expect(page.getByText("“Launch brief.pdf” is now version 3", { exact: true })).toBeVisible({ timeout: 30_000 })
      expect(w.notes).toEqual(["Signed by the client"])
      await expect(replace).toHaveCount(0)
      // Its versions, newest first, each with what changed.
      const toggle = preview.getByRole("button", { name: m.phone ? "Versions" : "See all versions", exact: true })
      await toggle.click()
      const list = preview.getByRole("list", { name: "Versions" })
      await expect(list.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 })
      await expect(list.getByRole("listitem").first()).toContainText("Signed by the client")
      await expect(list.getByRole("listitem").first()).toContainText("Current")
      await expect(list.getByRole("listitem").nth(1)).toContainText("Legal's edits")
      await expect(list.getByRole("button", { name: "Download version 1" })).toBeVisible()
      // Pressed, the toggle is neutral, never the accent (design review, shot
      // 10): the stage's white on a computer, the ink in a phone's sheet.
      await expect(toggle).toHaveAttribute("aria-pressed", "true")
      await expect(toggle).toHaveAttribute("data-tone", m.phone ? "neutral" : "light")
      if (!m.phone) await pdfShown(page, preview, "Launch brief (signed).pdf")
      await reviewShot(page, "10-versions", m.theme)
    })

    // A touch screen has no hover: a row with things inside shows its chevron
    // beside its mark, a folder (its coloured tile) as a page (its icon), shut
    // or open, and every row keeps the expand slot so the titles line up.
    test("on a touch screen a folder opens in the tree beside its tile, as a page with pages inside does", async ({ page }) => {
      test.skip(!m.phone, "a touch screen")
      const parts = (name: string) => ({ toggle: row(page, name).locator("[data-tree-toggle]"), mark: row(page, name).locator("[data-tree-slot] > span").first(), slot: row(page, name).locator("[data-tree-slot]") })
      for (const name of ["Contracts", "Handbook"]) {
        await expect(parts(name).toggle).toBeVisible()
        await expect(parts(name).mark).toBeVisible()
      }
      await expect(parts("Contracts").mark.locator("[data-node-mark]")).toHaveAttribute("data-hue", "moss")
      // Side by side, never over each other: the chevron, then the mark.
      const edges = async (l: Locator) => {
        const b = (await l.boundingBox())!
        return { left: Math.round(b.x), right: Math.round(b.x + b.width) }
      }
      const chevron = await edges(parts("Contracts").toggle)
      const tile = await edges(parts("Contracts").mark)
      expect(chevron.right).toBeLessThanOrEqual(tile.left)
      // A row with nothing inside keeps the slot empty: every title starts in one place.
      expect((await edges(parts("Launch plan").slot)).right).toBe((await edges(parts("Handbook").slot)).right)
      await reviewShot(page, "01b-touch-tree-shut", m.theme)
      await parts("Contracts").toggle.tap()
      await expect(row(page, "Contracts")).toHaveAttribute("aria-expanded", "true")
      await expect(row(page, "Mutual NDA.pdf")).toBeVisible({ timeout: 30_000 })
      await expect(parts("Contracts").mark).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/app/project/${P}\\?tab=docs`))
      await reviewShot(page, "01c-touch-tree-folder-open", m.theme)
      await parts("Handbook").toggle.tap()
      await expect(row(page, "Onboarding guide")).toBeVisible({ timeout: 30_000 })
      await expect(parts("Handbook").mark).toBeVisible()
      await reviewShot(page, "01d-touch-tree-both-open", m.theme)
      // Shut again from the same chevron.
      await parts("Contracts").toggle.tap()
      await expect(row(page, "Contracts")).toHaveAttribute("aria-expanded", "false")
      await expect(row(page, "Mutual NDA.pdf")).toHaveCount(0)
    })

    // Design review, 22 Oct (shot 11): at 60dvh a row's twelve actions
    // scrolled on every phone. The sheet grows to the shared maximum: at
    // 390x844 it holds them all; at 375x667 the trash is pinned in its
    // footer while the rest scrolls, under the footer's hairline.
    test("a row's sheet holds all its actions on a phone, and keeps its trash in reach on a short one", async ({ page }) => {
      test.skip(!m.phone, "a phone's sheet")
      const brief = row(page, "Launch brief.pdf")
      const sheet = page.locator("[data-doc-row-sheet]")
      const body = sheet.locator("[data-overlay-body]")
      const footer = sheet.locator("[data-sheet-footer]")
      const trash = footer.getByRole("button", { name: "Move to trash", exact: true })
      const scrolls = () => body.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
      await hold(page, brief, sheet)
      await expect(trash).toBeInViewport({ ratio: 1 })
      expect(await scrolls()).toBe(false)
      await expect(footer.locator("[data-tail-rule]")).toHaveCSS("visibility", "visible")
      await reviewShot(page, "11b-row-sheet-fits", m.theme)
      await page.keyboard.press("Escape")
      await expect(sheet).toHaveCount(0, { timeout: 10_000 })

      await page.setViewportSize({ width: 375, height: 667 })
      await brief.scrollIntoViewIfNeeded()
      await hold(page, brief, sheet)
      await expect(trash).toBeInViewport({ ratio: 1 })
      expect(await scrolls()).toBe(true)
      // While more is below, the footer's hairline is the line above the trash, and its own rule stands down.
      await expect(body).toHaveAttribute("data-more-below", "")
      expect(await footer.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/)
      await expect(footer.locator("[data-tail-rule]")).toHaveCSS("visibility", "hidden")
      await reviewShot(page, "11c-row-sheet-375x667", m.theme)
      await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      await expect(body).not.toHaveAttribute("data-more-below", "")
      await expect(footer.locator("[data-tail-rule]")).toHaveCSS("visibility", "visible")
      await expect(trash).toBeInViewport({ ratio: 1 })
    })

    // Docs & Files is the project's place for files; the tab beside it, once
    // also "Files", holds what tasks and comments carry and says so (agreed
    // with PROJ-LEAD-4).
    test("the project's other tab for files is Attachments, and says what lives there", async ({ page }) => {
      const tab = page.getByRole("tab", { name: "Attachments", exact: true })
      await expect(tab).toBeVisible()
      await expect(page.getByRole("tab", { name: "Files", exact: true })).toHaveCount(0)
      await reviewShot(page, "13-tabs", m.theme)
      await press(tab)
      await expect(tab).toHaveAttribute("aria-selected", "true")
      await expect(page.getByText("Files added to this project's tasks and comments show up here.")).toBeVisible({ timeout: 30_000 })
      await reviewShot(page, "14-attachments", m.theme)
    })

    test("several items take a colour at once", async ({ page }) => {
      const brief = row(page, "Launch brief.pdf")
      const deck = row(page, "Q4 kickoff.pptx")
      if (m.phone) {
        // A finger held on a row opens its sheet; Select starts choosing, and a tap chooses.
        const sheet = page.locator("[data-doc-row-sheet]")
        await hold(page, brief, sheet)
        await expect(page.locator("[data-file-preview]")).toHaveCount(0)
        // The sheet covers the row, so it names the item, mark and name; its
        // actions come in groups; Colour shows the item's own (none: a line
        // across), never an empty box under Select (design review, shot 11).
        const named = sheet.locator("[data-sheet-header] [data-row-sheet-name]")
        await expect(named).toHaveText("Launch brief.pdf")
        await expect(named.locator("[data-node-mark]")).toHaveAttribute("data-node-mark", "file")
        await expect(named).toBeInViewport()
        expect(await sheet.locator("[data-sheet-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-sheet-group")))).toEqual(["open", "select", "holds", "organise", "danger"])
        await expect(sheet.getByRole("button", { name: "Colour…", exact: true }).locator("[data-colour-glyph]")).toHaveAttribute("data-colour-glyph", "none")
        await reviewShot(page, "11-row-sheet", m.theme)
        await sheet.getByRole("button", { name: "Select", exact: true }).click()
        await expect(sheet).toHaveCount(0, { timeout: 10_000 })
        await deck.tap()
      } else {
        await brief.click({ modifiers: ["ControlOrMeta"] })
        await deck.click({ modifiers: ["ControlOrMeta"] })
      }
      const bar = page.getByRole("toolbar", { name: "Selected items" })
      await expect(bar).toContainText("2 selected")
      await expect(brief).toHaveAttribute("aria-selected", "true")
      await expect(deck).toHaveAttribute("aria-selected", "true")
      await expect(page.locator("[data-file-preview]")).toHaveCount(0)
      // Chosen rows look the same at every size: an ink tint and bar, the
      // check in the accent; a row's own hue only on its mark (shot 12).
      await expectNeutral(brief)
      await expectNeutral(deck)
      await reviewShot(page, "12-selected", m.theme)
      await bar.getByRole("button", { name: "Colour", exact: true }).click()
      if (m.phone) {
        const colour = page.locator("[data-colour-sheet]")
        await expect(colour).toBeVisible()
        // None and the six hues in one row, each a finger's size.
        const swatches = await colour.getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), size: Math.round(r.width) })))
        expect(swatches).toHaveLength(7)
        expect(new Set(swatches.map((r) => r.top)).size).toBe(1)
        expect(Math.min(...swatches.map((r) => r.size))).toBeGreaterThanOrEqual(40)
        await reviewShot(page, "13-colour", m.theme)
        await colour.getByRole("radio", { name: "Sky" }).click()
      } else {
        await expect(page.getByRole("menuitemradio", { name: "Sky" })).toBeVisible()
        await reviewShot(page, "13-colour", m.theme)
        await page.getByRole("menuitemradio", { name: "Sky" }).click()
      }
      await expect.poll(() => w.colours).toEqual([{ doc_uuids: [BRIEF, DECK], color: "sky" }])
      await expect(brief.locator("[data-colour-dot]")).toHaveAttribute("data-colour-dot", "sky")
      await expect(deck.locator("[data-colour-dot]")).toHaveAttribute("data-colour-dot", "sky")
      // Coloured, still chosen in the neutral tone: the sky is the dot's (shot 14).
      await expectNeutral(brief)
      await reviewShot(page, "14-coloured", m.theme)
    })

    test("a link is added, https only, and opens its document in a new tab", async ({ page }) => {
      await page.getByRole("button", { name: "More to add" }).click()
      const link = m.phone ? page.locator("[data-new-sheet]").getByRole("button", { name: "Link", exact: true }) : page.getByRole("menuitem", { name: "Link", exact: true })
      await expect(link).toBeVisible()
      await reviewShot(page, "15-new-menu", m.theme)
      await link.click()
      const dialog = page.locator("[data-add-link-dialog]")
      await expect(dialog).toBeVisible()
      const field = dialog.getByRole("textbox", { name: "Link", exact: true })
      await field.fill("http://example.com/plan")
      await dialog.getByRole("button", { name: "Add link" }).click()
      await expect(dialog.getByText("Only https:// links can be added.")).toBeVisible()
      expect(w.made).toEqual([])
      await field.fill("docs.google.com/spreadsheets/d/launch-budget/edit")
      await dialog.getByRole("textbox", { name: "Name (optional)" }).fill("Launch budget")
      await expect(dialog.locator("[data-link-provider]")).toHaveAttribute("data-link-provider", "google-sheets")
      await reviewShot(page, "16-add-link", m.theme)
      await dialog.getByRole("button", { name: "Add link" }).click()
      await expect.poll(() => w.made).toEqual([
        { doc_title: "Launch budget", space: `project:${P}`, doc_private: true, node_kind: "link", link_url: "https://docs.google.com/spreadsheets/d/launch-budget/edit" },
      ])
      const added = row(page, "Launch budget")
      await expect(added).toBeVisible({ timeout: 30_000 })
      await expect(added.locator("[data-node-mark]")).toHaveAttribute("data-provider", "google-sheets")
      await reviewShot(page, "17-link-added", m.theme)
      const tab = page.context().waitForEvent("page", { timeout: 15_000 })
      await press(added)
      const opened = await tab
      await opened.waitForLoadState("domcontentloaded")
      expect(opened.url()).toBe("https://docs.google.com/spreadsheets/d/launch-budget/edit")
      await opened.close()
      // The app stays where it was.
      await expect(page).toHaveURL(new RegExp(`/app/project/${P}`))
    })
  })

  // Riding with F1b (DOCS-LEAD-2, 21 Oct): a doc's history, its pinned
  // version's Pin a state in ink beside the one orange Restore, and naming
  // saying what a name does (c3660fb15, DESIGN-BUILD-3's review).
  test.describe(`A doc's history at ${m.mode}`, () => {
    test.use({
      viewport: { width: m.width, height: m.height },
      colorScheme: m.theme,
      ...(m.phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    })

    test("a pinned version keeps its pin in ink, and naming says what a name does", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await page.addInitScript((t) => {
        localStorage.setItem("ui-theme", t)
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem("onecamp:demo-shared-note-seen", "1")
      }, m.theme)
      const DOC = id(500)
      const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
      const newer = "<p>We ship on Friday.</p><p>Book the room, and send the invite to Acme.</p>"
      const older = "<p>We ship on Thursday.</p><p>Book the room, and send the invite.</p>"
      await stubBackend(page, testInfo, {
        [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p></p>", edit: true }),
        "/auth/token": { data: { token: "e2e-sam" } },
        "/doc/versions/v2": { msg: "Success", data: { html: newer } },
        "/doc/versions/v1": { msg: "Success", data: { html: older } },
        "/doc/versions": {
          msg: "Success",
          data: {
            versions: [
              { id: "v2", kind: "doc", pinned: false, reason: "interval", created_at: ago(12), contributors: [{ user_uuid: SAM.user_uuid }] },
              { id: "v1", kind: "doc", pinned: true, name: "Sent to Acme", reason: "saved", created_at: ago(180), contributors: [{ user_uuid: PRIYA.user_uuid }] },
            ],
            people: { [SAM.user_uuid]: { name: "Sam Rivera" }, [PRIYA.user_uuid]: { name: "Priya Shah" } },
          },
        },
      })
      await new CollabRelay().attach(page, SAM.user_full_name)
      await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator('.doc-editor .ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 60_000 })
      if (m.phone) {
        await page.getByRole("button", { name: "Document options" }).click()
        await page.getByText("Version history", { exact: true }).click()
      } else await more(page, "Version history")
      const sheet = page.locator("[data-history-sheet]")
      await expect(sheet.getByRole("listbox", { name: "Versions" })).toBeVisible({ timeout: 30_000 })
      await sheet.getByRole("option").nth(1).click()
      await expect(sheet.locator(".history-preview")).toContainText("We ship on Thursday")
      // Pinned: pressed, in the neutral press tint, its glyph in ink; Restore the one orange.
      const pin = sheet.locator('button[aria-pressed="true"]')
      await expect(pin).toHaveCount(1)
      await expect(pin).toHaveAccessibleName(m.phone ? "Unpin this version" : /Pin/)
      await reviewShot(page, "18-history-pinned", m.theme)
      // Saving a version says what its name does (a popover on a computer, a sheet of its own on a phone).
      if (m.phone) await sheet.getByRole("button", { name: "Versions", exact: true }).click()
      await page.locator("[data-save-version]").first().click()
      await expect(page.getByText("Named versions are kept until you remove the name.")).toBeVisible()
      await reviewShot(page, "19-history-naming", m.theme)
    })
  })
}
