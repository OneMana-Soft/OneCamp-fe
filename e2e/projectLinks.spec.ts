import { expect, test, type Locator, type Page, type Request, type Route, type TestInfo } from "@playwright/test"

import { contrastRatio, rgbToHex } from "../lib/color/oklch"
import { groundBehind } from "./contrast"
import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// basecamp-16: a project's links to the tools its people use elsewhere, as
// cards the server read from their pages, with each site's icon and a preview
// picture. On a computer, the first three beside the project's name and "All";
// on a phone, a chip in the header's row; either opens the Links tool, a sheet
// on a phone. Its admins add a link by its address (the card appears as the
// server reads the page), rename one and delete one, which Undo brings back;
// a refusal is said in place in the server's words. A member reads and opens
// them, and changes nothing. Basecamp's Doors are a plain link.

const P = "9e0a0000-0000-4000-8000-0000000000b6"
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const member = { ...admin, role: "member", manage: false, manage_people: false, archive: false }
const projectOf = (isAdmin: boolean) => ({ project_uuid: P, project_name: "Q4 launch", project_is_admin: isAdmin ? 1 : 0, project_is_member: 1, project_members: [SAM], project_access: isAdmin ? admin : member })

const link = (i: number, title: string, url: string, site: string, icon: boolean, image: boolean, description = "") => ({
  id: `1b5e0000-0000-4000-8000-00000000000${i}`,
  url,
  host: new URL(url).host,
  title,
  description,
  site_name: site,
  has_icon: icon,
  has_image: image,
  created_at: "2026-11-01T07:00:00Z",
})
type Link = ReturnType<typeof link>
const LINKS = [
  link(1, "Launch designs", "https://www.figma.com/file/q4-launch", "Figma", true, true, "The launch page, the emails and the ads, in one file."),
  link(2, "Launch assets", "https://drive.google.com/drive/folders/q4-launch", "Google Drive", true, false),
  link(3, "Website repository", "https://github.com/acme/site", "GitHub", true, true, "The marketing site, built on every merge."),
  link(4, "Launch runbook", "https://wiki.acme.example/runbook", "", false, false),
]
/** The card the server keeps for a page it read: the page's own title, its site and its icon. */
const ROADMAP = link(5, "Q4 roadmap", "https://linear.app/acme/project/q4-roadmap", "Linear", true, false, "What ships this quarter.")
const DUPLICATE = "This project has a link to that address already."

// A 1x1 picture, for every kept icon and preview.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

/** The server's links as the test holds them, and what it was asked to do. */
interface Server {
  links: Link[]
  canManage: boolean
  posts: string[]
  /** Held until released: the server still reading a new link's page. */
  reading?: Promise<void>
}

async function openProject(page: Page, testInfo: TestInfo, server: Server, theme: string, query = "") {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  const project = projectOf(server.canManage)
  const deleted = new Map<string, Link>()
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: 0, inProgress: 0, inReview: 0, done: 0, canceled: 0 } },
    },
    [`/project/${P}/glance`]: { msg: "ok", data: { open: 0, done: 0, overdue: 0, due_this_week: 0 } },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    "/task/views": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    // The project's links, as business/ProjectLink answers them.
    [`/project/${P}/links`]: async (url: URL, request: Request) => {
      if (request.method() === "GET") return { msg: "ok", data: { links: server.links, can_manage: server.canManage } }
      const rest = url.pathname.slice(url.pathname.indexOf("/links") + "/links".length)
      const body = (request.postDataJSON() ?? {}) as { url?: string; title?: string }
      server.posts.push(`${rest || "/"} ${JSON.stringify(body)}`)
      if (!rest) {
        if (server.links.some((l) => l.url === body.url)) return withStatus(409, { msg: DUPLICATE })
        if (server.reading) await server.reading
        server.links = [...server.links, ROADMAP]
        return { msg: "ok", data: ROADMAP }
      }
      const [, id, what] = rest.split("/")
      if (what === "edit") server.links = server.links.map((l) => (l.id === id ? { ...l, title: body.title ?? l.title } : l))
      if (what === "delete") {
        deleted.set(id, server.links.find((l) => l.id === id)!)
        server.links = server.links.filter((l) => l.id !== id)
      }
      return { msg: what === "edit" ? "Renamed" : "Deleted" }
    },
    "/restore/link/": (url: URL) => {
      const id = url.pathname.split("/").pop()!
      server.posts.push(`restore ${id}`)
      const back = deleted.get(id)
      if (back) server.links = [...server.links, back].sort((a, b) => a.id.localeCompare(b.id))
      return { msg: "ok" }
    },
  })
  // The kept pictures: registered after the stubs, so it answers them first.
  await page.route(/\/project\/[^/]+\/links\/[^/]+\/(icon|image)$/, (route: Route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }))
  await page.goto(`/app/project/${P}?tab=list${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["on a laptop", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
  ] as const) {
    test.describe(`a project's links ${where}, ${theme}`, () => {
      test.use(use)
      const phone = use.viewport.width < 500
      const press = (target: Locator) => (phone ? target.tap() : target.click())
      const sheet = (page: Page) => page.getByRole("dialog", { name: "Links" })
      const cards = (page: Page) => sheet(page).locator("[data-project-link]")
      /** Opens the Links tool from the project's home: "All" beside the name, or the phone's chip. */
      const openFromHome = async (page: Page, count: number) => {
        if (phone) {
          const chip = page.locator("[data-project-chips] [data-project-links-chip]")
          await expect(chip).toHaveAccessibleName(`${count} links`, { timeout: 60_000 })
          // Whole on the screen beside the update and forecast chips, never cut off at its edge.
          await expect(chip).toBeInViewport({ ratio: 1 })
          const box = (await chip.boundingBox())!
          expect(box.x + box.width, "the chip keeps the screen's 16 px gutter").toBeLessThanOrEqual(page.viewportSize()!.width - 16)
          // One of the row's chips: the shared chip's own height, as tall as the update chip beside it (DB-67).
          const update = page.locator("[data-project-chips] [data-health-word]")
          await expect(update).toBeVisible()
          const updateBox = (await update.boundingBox())!
          expect(Math.round(box.height), "the links chip is as tall as the update chip").toBe(Math.round(updateBox.height))
          await expect(chip).toHaveText(String(count))
          await press(chip)
        } else {
          await press(page.locator("[data-project-links]").getByRole("button", { name: count > 3 ? `All ${count} links` : "All links" }))
        }
        await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
      }

      test("the home shows the links with their sites' icons, and the tool opens them as cards read from their pages", async ({ page }, testInfo) => {
        const server: Server = { links: LINKS, canManage: true, posts: [] }
        await openProject(page, testInfo, server, theme)
        if (!phone) {
          const strip = page.locator("header [data-project-links]")
          await expect(strip.getByRole("link")).toHaveCount(3, { timeout: 60_000 })
          const first = strip.getByRole("link", { name: "Launch designs" })
          await expect(first).toHaveAttribute("href", LINKS[0].url)
          await expect(first).toHaveAttribute("target", "_blank")
          await expect(first).toHaveAttribute("rel", /noopener/)
          // Its icon came, from the API's own address.
          await expect.poll(() => first.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1)
        }
        await reviewShot(page, "project-links-home", theme)
        await openFromHome(page, 4)
        await expect(cards(page)).toHaveCount(4)
        const designs = cards(page).filter({ hasText: "Launch designs" })
        await expect(designs.getByRole("link")).toHaveAttribute("href", LINKS[0].url)
        await expect(designs).toContainText("Figma")
        await expect(designs).toContainText("The launch page, the emails and the ads, in one file.")
        // A preview picture on the cards whose pages had one, and the link glyph for a site with no icon.
        await expect(sheet(page).locator("[data-link-preview]")).toHaveCount(2)
        const runbook = cards(page).filter({ hasText: "Launch runbook" })
        await expect(runbook).toContainText("wiki.acme.example")
        await expect(runbook.locator("[data-card-tile] img")).toHaveCount(0)
        await expect(runbook.locator("[data-card-tile] svg")).toHaveCount(1)
        // The address bar names the tool no more once it opened.
        await expect(page).not.toHaveURL(/tool=links/)
        await reviewShot(page, "project-links-sheet", theme)
      })

      test("an admin adds a link: its card comes as the server reads the page, and a refusal is said in the server's words", async ({ page }, testInfo) => {
        let readIt = () => {}
        const server: Server = { links: LINKS.slice(0, 2), canManage: true, posts: [], reading: new Promise<void>((r) => (readIt = r)) }
        await openProject(page, testInfo, server, theme)
        await openFromHome(page, 2)
        const address = sheet(page).getByRole("textbox", { name: "Link address" })
        const add = sheet(page).getByRole("button", { name: "Add link" })
        await address.fill(LINKS[1].url)
        await press(add)
        await expect(sheet(page).getByRole("alert")).toHaveText(DUPLICATE)
        await expect(cards(page)).toHaveCount(2)
        await address.fill(ROADMAP.url)
        await press(add)
        // The new card's place, at its size, while the server reads the page.
        await expect(sheet(page).getByLabel("Reading the link's page")).toBeVisible()
        await expect(sheet(page).getByRole("alert")).toHaveCount(0)
        readIt()
        await expect(cards(page)).toHaveCount(3, { timeout: 30_000 })
        const roadmap = cards(page).filter({ hasText: "Q4 roadmap" })
        await expect(roadmap).toContainText("Linear")
        await expect(roadmap.getByRole("link")).toHaveAttribute("href", ROADMAP.url)
        await expect(address).toHaveValue("")
        expect(server.posts).toEqual([`/ ${JSON.stringify({ url: LINKS[1].url, title: "" })}`, `/ ${JSON.stringify({ url: ROADMAP.url, title: "" })}`])
        await reviewShot(page, "project-links-added", theme)
      })

      test("an admin types a site without https://, as people paste one, and it goes to the server with https:// in front", async ({ page }, testInfo) => {
        const server: Server = { links: LINKS.slice(0, 2), canManage: true, posts: [] }
        await openProject(page, testInfo, server, theme)
        await openFromHome(page, 2)
        const address = sheet(page).getByRole("textbox", { name: "Link address" })
        const bare = (url: string) => url.replace(/^https:\/\//, "")
        // A refusal still comes in the server's words, never the browser's own "Please enter a URL" (V-205).
        await address.fill(bare(LINKS[1].url))
        await press(sheet(page).getByRole("button", { name: "Add link" }))
        await expect(sheet(page).getByRole("alert")).toHaveText(DUPLICATE)
        await reviewShot(page, "project-links-bare-refused", theme)
        // Enter adds it as the button does: a laptop's Return, a phone's Go.
        await address.fill(bare(ROADMAP.url))
        await address.press("Enter")
        await expect(cards(page)).toHaveCount(3, { timeout: 30_000 })
        await expect(cards(page).filter({ hasText: "Q4 roadmap" }).getByRole("link")).toHaveAttribute("href", ROADMAP.url)
        await expect(address).toHaveValue("")
        await expect(sheet(page).getByRole("alert")).toHaveCount(0)
        expect(server.posts).toEqual([`/ ${JSON.stringify({ url: LINKS[1].url, title: "" })}`, `/ ${JSON.stringify({ url: ROADMAP.url, title: "" })}`])
        await reviewShot(page, "project-links-bare-added", theme)
      })

      test("an admin adds links one after another from the keyboard: the address keeps its focus while the page is read, after the card comes, and after a refusal", async ({ page }, testInfo) => {
        let readIt = () => {}
        const server: Server = { links: LINKS.slice(0, 2), canManage: true, posts: [], reading: new Promise<void>((r) => (readIt = r)) }
        await openProject(page, testInfo, server, theme)
        await openFromHome(page, 2)
        const address = sheet(page).getByRole("textbox", { name: "Link address" })
        await address.fill(ROADMAP.url)
        await address.press("Enter")
        // Busy, never disabled: a disabled field drops its focus, and the dialog's focus trap then
        // rings the whole dialog (V-247).
        await expect(sheet(page).getByLabel("Reading the link's page")).toBeVisible()
        await expect(address).toBeFocused()
        await expect(address).toHaveAttribute("aria-busy", "true")
        await expect(address).toHaveAttribute("readonly", "")
        readIt()
        await expect(cards(page)).toHaveCount(3, { timeout: 30_000 })
        await expect(address).toHaveValue("")
        await expect(address).not.toHaveAttribute("aria-busy")
        await expect(address).toBeFocused()
        // The next one is typed straight in, and a refusal keeps it there, focused, to fix.
        await page.keyboard.type(LINKS[1].url)
        await expect(address).toHaveValue(LINKS[1].url)
        await page.keyboard.press("Enter")
        await expect(sheet(page).getByRole("alert")).toHaveText(DUPLICATE)
        await expect(address).toBeFocused()
        await expect(address).toHaveValue(LINKS[1].url)
        expect(server.posts).toEqual([`/ ${JSON.stringify({ url: ROADMAP.url, title: "" })}`, `/ ${JSON.stringify({ url: LINKS[1].url, title: "" })}`])
      })

      test("an admin renames a link and deletes one, and Undo brings it back", async ({ page }, testInfo) => {
        const server: Server = { links: LINKS, canManage: true, posts: [] }
        // ?tool=links opens the tool, as the home's strip does.
        await openProject(page, testInfo, server, theme, "&tool=links")
        await expect(cards(page)).toHaveCount(4, { timeout: 60_000 })
        await press(sheet(page).getByRole("button", { name: "Options for Launch assets" }))
        await press(page.getByRole("menuitem", { name: "Rename" }))
        const title = sheet(page).getByRole("textbox", { name: "Link title" })
        await title.fill("Brand assets")
        await press(sheet(page).getByRole("button", { name: "Save" }))
        await expect(cards(page).filter({ hasText: "Brand assets" })).toHaveCount(1)
        await expect(cards(page).filter({ hasText: "Launch assets" })).toHaveCount(0)
        await press(sheet(page).getByRole("button", { name: "Options for Launch runbook" }))
        await press(page.getByRole("menuitem", { name: "Delete" }))
        await expect(cards(page)).toHaveCount(3)
        const offered = page.locator(".toast-card").filter({ hasText: "Deleted link “Launch runbook”" })
        await expect(offered).toBeVisible({ timeout: 30_000 })
        await press(offered.getByRole("button", { name: "Undo" }))
        await expect(cards(page)).toHaveCount(4, { timeout: 30_000 })
        await expect(cards(page).filter({ hasText: "Launch runbook" })).toHaveCount(1)
        expect(server.posts).toEqual([
          `/${LINKS[1].id}/edit ${JSON.stringify({ title: "Brand assets" })}`,
          `/${LINKS[3].id}/delete {}`,
          `restore ${LINKS[3].id}`,
        ])
      })

      test("a member reads and opens the links, with no way to change them", async ({ page }, testInfo) => {
        const server: Server = { links: LINKS, canManage: false, posts: [] }
        await openProject(page, testInfo, server, theme)
        await openFromHome(page, 4)
        await expect(cards(page)).toHaveCount(4)
        await expect(cards(page).first().getByRole("link")).toHaveAttribute("href", LINKS[0].url)
        await expect(sheet(page).getByRole("textbox", { name: "Link address" })).toHaveCount(0)
        await expect(sheet(page).getByRole("button", { name: /^Options for / })).toHaveCount(0)
        await press(sheet(page).getByRole("button", { name: "Close" }).last())
        await expect(sheet(page)).toHaveCount(0)
        await reviewShot(page, "project-links-member", theme)
      })

      test("a project with no links shows none on its home, and its tool, from the project's menu, says how to start", async ({ page }, testInfo) => {
        const server: Server = { links: [], canManage: true, posts: [] }
        await openProject(page, testInfo, server, theme)
        const actions = page.getByRole("button", { name: "Project actions" }).first()
        await expect(actions).toBeVisible({ timeout: 60_000 })
        await expect(page.locator("[data-project-links], [data-project-links-chip]")).toHaveCount(0)
        await press(actions)
        await press(page.getByRole("menuitem", { name: "Links" }))
        await expect(sheet(page)).toBeVisible({ timeout: 30_000 })
        await expect(sheet(page).locator("[data-project-links-empty]")).toContainText("No links yet")
        await expect(sheet(page).getByRole("textbox", { name: "Link address" })).toBeVisible()
        await reviewShot(page, "project-links-empty", theme)
      })
    })
  }
}

// DB-69's LIVE look (1 Nov): a site draws its mark for a light page, so in dark a black one (GitHub's) vanished on the
// dark icon tile. In dark, a black mark reads at 3:1 at least on every link icon's ground: the strip, the phone's chip
// and the tool's cards. Its own runs, since SHOT_THEMES has dark only when shots are taken.
const BLACK = { r: 0, g: 0, b: 0 }
async function blackMarksRead(icons: Locator, where: string) {
  await expect(icons.first()).toBeAttached({ timeout: 60_000 })
  for (const icon of await icons.all()) {
    const ground = await groundBehind(icon)
    expect(contrastRatio(BLACK, ground), `a black mark on ${where}'s icon tile, ${rgbToHex(ground)}`).toBeGreaterThanOrEqual(3)
  }
}

for (const [where, use] of [
  ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" as const }],
  ["on a laptop", { viewport: { width: 1280, height: 860 }, colorScheme: "dark" as const }],
] as const) {
  test.describe(`a project's links in dark ${where}`, () => {
    test.use(use)
    test("a site's black mark reads on its icon's tile, on the home and in the tool", async ({ page }, testInfo) => {
      const phone = use.viewport.width < 500
      await openProject(page, testInfo, { links: LINKS, canManage: true, posts: [] }, "dark")
      const home = phone ? page.locator("[data-project-chips] [data-project-links-chip]") : page.locator("header [data-project-links]")
      await blackMarksRead(home.locator("img"), phone ? "the phone's chip" : "the strip")
      await (phone ? home.tap() : home.getByRole("button", { name: "All 4 links" }).click())
      const sheet = page.getByRole("dialog", { name: "Links" })
      await expect(sheet).toBeVisible({ timeout: 30_000 })
      await blackMarksRead(sheet.locator("[data-project-link] [data-card-tile] img"), "a card")
      await reviewShot(page, `project-links-dark-${phone ? "390" : "1280"}`, "dark")
    })
  })
}
