import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked (scripts/fluidity/fakeApp.mjs): its places keep
// the stars given and the boards opened, as the server's do. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// Starred and recent boards (whiteboard row miro-46, to_win 2): Star board in
// a board's More puts it in Starred at once (the sidebar on a computer, the
// More sheet on a phone, which has no sidebar), its row opens the board, and
// Unstar board takes it away; a board someone opened shows under Recent boards.
// A star is the person's own: a viewer stars too.

const A = "b0a4d000-0000-4000-8000-0000000046a1"
const B = "b0a4d000-0000-4000-8000-0000000046b2"
const TITLES: Record<string, string> = { [A]: "Q4 launch", [B]: "Retro" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Req = { method(): string; postData(): string | null }

async function open(browser: Browser, device: keyof typeof DEVICES, who: "sam" | "vic") {
  const levels = { sam: "edit", vic: "view" }
  const boards = [A, B].map((uuid, i) => ({ uuid, title: TITLES[uuid], levels, update: boardDoc(ordered([...note(`n${i}`, 120, 160, `${TITLES[uuid]} notes`)])) }))
  const collab = collabFor(boards.map((b) => ({ id: boardDocName(b.uuid), update: b.update, levels })))
  // The person's places, as the server keeps them: stars in the order given, and what they opened, newest first.
  const stars: string[] = []
  let opened: string[] = []
  const place = (uuid: string, kind: string) => ({ kind, resource_kind: "board", resource_uuid: uuid, position: "", title: TITLES[uuid], href: `/app/board/${uuid}` })
  const context = await browser.newContext({ ...DEVICES[device] })
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the run then shows the tip; nothing here reads it */
    }
  })
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS[who],
    docs: [],
    collab,
    fixtures: [
      ...boardFixtures(boards, USERS[who], USERS.sam),
      [/\/places\/recent$/, () => ({ msg: "ok", data: { places: opened.slice(0, 5).map((u) => place(u, "recent")) } })],
      [
        /\/places$/,
        (_path: string, url: URL, req: Req) => {
          if (req.method() === "POST") {
            const id = (JSON.parse(req.postData() ?? "{}") as { resource_uuid?: string }).resource_uuid ?? ""
            if (!stars.includes(id)) stars.push(id)
            return { msg: "ok", data: place(id, "star") }
          }
          if (req.method() === "DELETE") {
            const id = url.searchParams.get("resource_uuid") ?? ""
            stars.splice(stars.indexOf(id) >>> 0, stars.includes(id) ? 1 : 0)
            return { msg: "ok" }
          }
          return { msg: "ok", data: { places: stars.map((u) => place(u, "star")) } }
        },
      ],
      // The sidebar's own read carries the stars beside the profile (useHydrateUserSidebar).
      [/\/user\/sidebarNav$/, () => ({ msg: "ok", data: {}, starred: stars.map((u) => place(u, "star")) })],
      [
        /\/board\/recordView$/,
        (_path: string, _url: URL, req: Req) => {
          const id = (JSON.parse(req.postData() ?? "{}") as { board_uuid?: string }).board_uuid ?? ""
          opened = [id, ...opened.filter((u) => u !== id)]
          return { msg: "ok" }
        },
      ],
    ],
  })
  const page = await context.newPage()
  page.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}\n${e.stack ?? ""}`))
  return { page, stars, close: () => context.close() }
}

/** Opens a board and waits for its canvas, so its view is recorded and its More is the board's. */
async function board(page: Page, uuid: string) {
  await page.goto(`/app/board/${uuid}`)
  await expect(page.locator(".excalidraw canvas.interactive")).toBeVisible({ timeout: 60_000 })
}

test.describe("starred and recent boards", () => {
  test.describe.configure({ timeout: 180_000 })

  test("on a computer: star from More, the sidebar's row opens the board, unstar takes it away, an opened board is recent", async ({ browser }) => {
    const { page, stars, close } = await open(browser, "computer", "sam")
    await board(page, A)
    const more = page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true })
    await more.click()
    await page.getByRole("menuitem", { name: "Star board" }).click()
    const starred = page.getByRole("complementary", { name: "Sidebar" }).getByRole("region", { name: "Starred" })
    // In Starred at once, the current row on its own board, with the boards' icon.
    await expect(starred.getByRole("link", { name: "Q4 launch" })).toHaveAttribute("aria-current", "page")
    await expect(starred.getByRole("link", { name: "Q4 launch" }).locator("svg.lucide-layout-dashboard")).toHaveCount(1)
    await expect.poll(() => stars.slice()).toEqual([A])

    // Another board: the first one is under Recent boards, and Starred's row opens it.
    await board(page, B)
    const recent = page.getByRole("complementary", { name: "Sidebar" }).getByRole("region", { name: "Recent boards" })
    await expect(recent.getByRole("link", { name: "Q4 launch" })).toHaveAttribute("href", `/app/board/${A}`)
    await expect(recent.getByRole("link", { name: "Retro" })).toBeVisible()
    await page.getByRole("complementary", { name: "Sidebar" }).getByRole("region", { name: "Starred" }).getByRole("link", { name: "Q4 launch" }).click()
    await expect(page).toHaveURL(new RegExp(`/app/board/${A}$`))
    await expect(page.locator(".excalidraw canvas.interactive")).toBeVisible({ timeout: 60_000 })

    // Unstar: the row goes, and so does the section with nothing left in it.
    await more.click()
    await page.getByRole("menuitem", { name: "Unstar board" }).click()
    await expect(page.getByRole("complementary", { name: "Sidebar" }).getByRole("region", { name: "Starred" })).toHaveCount(0)
    await expect.poll(() => stars.slice()).toEqual([])
    await close()
  })

  test("on a phone, as a viewer: star from Board options, the More sheet's row opens the board, unstar takes it away", async ({ browser }) => {
    const { page, stars, close } = await open(browser, "phone", "vic")
    await board(page, A)
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Star board" }).tap()
    await expect.poll(() => stars.slice()).toEqual([A])

    // The phone has no sidebar: its More sheet (a drawer) carries Starred and Recent boards.
    await page.goto("/app/home")
    await page.getByRole("button", { name: "Open menu" }).tap()
    const sheet = page.getByRole("dialog")
    // At rest, Work's doors show whole: the places come after them (DESIGN-BUILD-119 F1).
    await expect(sheet.getByRole("button", { name: "Tables", exact: true })).toBeInViewport({ ratio: 1 })
    await expect(sheet.getByText("Starred", { exact: true })).toBeVisible()
    await expect(sheet.getByText("Recent boards", { exact: true })).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Q4 launch" })).toHaveCount(2)
    await sheet.getByRole("button", { name: "Q4 launch" }).first().tap()
    await expect(page).toHaveURL(new RegExp(`/app/board/${A}$`))
    await expect(page.locator(".excalidraw canvas.interactive")).toBeVisible({ timeout: 60_000 })

    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Unstar board" }).tap()
    await expect.poll(() => stars.slice()).toEqual([])
    await page.goto("/app/home")
    await page.getByRole("button", { name: "Open menu" }).tap()
    await expect(page.getByRole("dialog").getByText("Recent boards", { exact: true })).toBeVisible()
    await expect(page.getByRole("dialog").getByText("Starred", { exact: true })).toHaveCount(0)
    await close()
  })
})
