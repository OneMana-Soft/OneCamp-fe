import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked (scripts/fluidity/fakeApp.mjs), as e2e/boardStars.spec.ts has it. Nothing leaves the machine.
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { openFiles, P as FILES_PROJECT } from "./projectFiles"
import { reviewShot, SHOT_THEMES } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// The boards list's filters (whiteboard row miro-46, to_win 1 and 3): Mine and
// Shared narrow the list and write the address; the Project picker (a popover
// on a computer, a sheet on a phone) lists the viewer's projects under their
// teams, a project sends project=<uuid> and a team's heading team=<uuid>; a
// project the server won't show lets the filter go with a line; and a
// project's Attachments tab links to its boards. On the production build, at 1280
// with a mouse and at 390 with touch.

const id = (n: number) => `b0a4d000-0000-4000-8000-0000000046${String(n).padStart(2, "0")}`
const WEBSITE = id(11)
const APP = id(12)
const GONE = id(19)
const DESIGN = id(21)
const MINE = { board_uuid: id(1), board_title: "Q4 launch", board_private: true, mine: true }
const THEIRS = { board_uuid: id(2), board_title: "Retro", board_private: false, mine: false }
const TEAM_BOARD = { board_uuid: id(3), board_title: "App journey", board_private: false, mine: false }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

/** The list's server: each read it was asked, as its parameters, and its answer by the filter's rules. */
async function open(browser: Browser, device: keyof typeof DEVICES) {
  const asked: Record<string, string>[] = []
  const context = await browser.newContext({ ...DEVICES[device] })
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the run then shows the tip; nothing here reads it */
    }
  })
  const list = (boards: (typeof MINE)[]) => ({ msg: "Success", pageCount: 1, data: { count: boards.length, boards: boards.map((b) => ({ board_uuid: b.board_uuid, board_title: b.board_title, board_private: b.board_private, board_updated_at: "" })) } })
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab: collabFor([]),
    fixtures: [
      [
        /\/board\/getBoardList$/,
        (_path: string, url: URL) => {
          const q = Object.fromEntries(url.searchParams)
          asked.push(q)
          if (q.project === GONE) return status(404, { msg: "Project not found" })
          let boards = q.project === WEBSITE ? [] : q.team === DESIGN ? [TEAM_BOARD] : [MINE, THEIRS, TEAM_BOARD]
          if (q.owner === "mine") boards = boards.filter((b) => b.mine)
          if (q.owner === "shared") boards = boards.filter((b) => !b.mine)
          return list(boards)
        },
      ],
      // The sidebar's own read names the viewer's projects and teams (useHydrateUserSidebar).
      [/\/user\/sidebarNav$/, { msg: "ok", data: { user_projects: [{ project_uuid: WEBSITE, project_name: "Website relaunch" }, { project_uuid: APP, project_name: "Mobile app" }], user_teams: [{ team_uuid: DESIGN, team_name: "Design" }] } }],
      // The viewer's projects with their teams (components/board/addWorkReads).
      [
        /\/user\/userProjectList$/,
        { msg: "ok", data: { user_projects: [{ project_uuid: WEBSITE, project_name: "Website relaunch", project_team: { team_uuid: id(22), team_name: "Marketing" } }, { project_uuid: APP, project_name: "Mobile app", project_team: { team_uuid: DESIGN, team_name: "Design" } }] } },
      ],
    ],
  })
  const page = await context.newPage()
  page.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}\n${e.stack ?? ""}`))
  return { page, asked, close: () => context.close() }
}

// Each card's title, from its name (the card is a link named "<title>, edited <when>"): its first span is the
// picture's drawn notes when a board has no thumbnail.
const titles = (page: Page) => page.locator("[data-board-uuid]").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").split(", edited ")[0]))

/** The place's chip and its Clear on one line of the filters' row: the row wraps them as one, never the × alone. */
async function expectPlaceWithClear(page: Page, place: string) {
  const chip = (await page.getByRole("button", { name: new RegExp(`^${place}`) }).boundingBox())!
  const clear = (await page.getByRole("button", { name: `Clear ${place}` }).boundingBox())!
  expect(Math.abs(chip.y + chip.height / 2 - (clear.y + clear.height / 2))).toBeLessThanOrEqual(1)
  expect(clear.x).toBeGreaterThan(chip.x + chip.width - 1)
}

/** Review shots in each theme when SHOTS_DIR is set (e2e/stubbedApp reviewShot); nothing otherwise. */
async function shotInThemes(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}
const press = (page: Page, touch: boolean, name: string | RegExp, role: "button" | "menuitemradio" = "button") => {
  const target = page.getByRole(role, { name, exact: typeof name === "string" })
  return touch ? target.tap() : target.click()
}

for (const device of ["computer", "phone"] as const) {
  const touch = device === "phone"
  test.describe(`board filters on a ${device}`, () => {
    test.describe.configure({ timeout: 180_000 })

    test("Mine and Shared narrow the list and the address; Back steps back", async ({ browser }) => {
      const { page, asked, close } = await open(browser, device)
      await page.goto("/app/board")
      await expect(page.locator("[data-board-uuid]")).toHaveCount(3, { timeout: 60_000 })
      const filters = page.getByRole("group", { name: "Filter boards" })
      await expect(filters.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true")
      if (touch) expect(overlapping(await reachesIn(page, "[data-board-filters]"))).toEqual([])

      await press(page, touch, "Mine")
      await expect(page).toHaveURL(/\/app\/board\?owner=mine$/)
      await expect.poll(() => titles(page)).toEqual(["Q4 launch"])
      expect(asked.at(-1)?.owner).toBe("mine")
      await expect(filters.getByRole("button", { name: "Mine", exact: true })).toHaveAttribute("aria-pressed", "true")

      await press(page, touch, "Shared")
      await expect(page).toHaveURL(/\/app\/board\?owner=shared$/)
      await expect.poll(() => titles(page)).toEqual(["Retro", "App journey"])

      await page.goBack()
      await expect(page).toHaveURL(/\/app\/board\?owner=mine$/)
      await expect.poll(() => titles(page)).toEqual(["Q4 launch"])
      await close()
    })

    test("the Project picker sends a project or a team, and a project's empty says how to link one", async ({ browser }) => {
      const { page, asked, close } = await open(browser, device)
      await page.goto("/app/board")
      await expect(page.locator("[data-board-uuid]")).toHaveCount(3, { timeout: 60_000 })

      await press(page, touch, /^All projects/)
      // A sheet on a phone, a popover under its button on a computer.
      const overlay = page.locator(`[data-overlay="${touch ? "sheet" : "float"}"]`)
      await expect(overlay.getByRole("menuitemradio", { name: "Website relaunch" })).toBeVisible()
      // Projects under their teams: Marketing, which the viewer isn't in, is a heading only.
      await expect(overlay.getByRole("menuitemradio", { name: /^Marketing/ })).toHaveCount(0)
      await expect(overlay.getByText("Marketing")).toBeVisible()
      await press(page, touch, "Website relaunch", "menuitemradio")
      await expect(overlay).toHaveCount(0)
      await expect(page).toHaveURL(new RegExp(`/app/board\\?project=${WEBSITE}$`))
      expect(asked.at(-1)?.project).toBe(WEBSITE)
      await expect(page.getByRole("heading", { name: "No boards linked to Website relaunch yet." })).toBeVisible()
      await expect(page.getByText("To link one, open the project's Attachments tab and choose Link a doc or board.")).toBeVisible()
      await expect(page.getByRole("button", { name: /^Website relaunch/ })).toBeVisible()
      await expectPlaceWithClear(page, "Website relaunch")
      await shotInThemes(page, "f-empty")

      // A team's heading: every board linked from the team's projects.
      await press(page, touch, /^Website relaunch/)
      await press(page, touch, /^Design/, "menuitemradio")
      await expect(page).toHaveURL(new RegExp(`/app/board\\?team=${DESIGN}$`))
      expect(asked.at(-1)?.team).toBe(DESIGN)
      expect(asked.at(-1)?.project).toBeUndefined()
      await expect.poll(() => titles(page)).toEqual(["App journey"])
      await expect(page.getByRole("button", { name: /^Design/ })).toBeVisible()
      // A short place: its Clear stays beside it, not alone on the next line (DB-123 F1, at 390).
      await expectPlaceWithClear(page, "Design")
      if (touch) expect(overlapping(await reachesIn(page, "[data-board-filters]"))).toEqual([])
      await shotInThemes(page, "f-team")

      // Mine under the team: none of the viewer's boards is linked there, and the filters stay to step back out.
      await press(page, touch, "Mine")
      await expect(page).toHaveURL(new RegExp(`/app/board\\?owner=mine&team=${DESIGN}$`))
      await expect(page.getByRole("heading", { name: "None of your boards are linked to Design's projects yet." })).toBeVisible()
      await expectPlaceWithClear(page, "Design")
      await shotInThemes(page, "f-mine-empty")
      await close()
    })

    test("a project the server won't show lets the filter go, with a line", async ({ browser }) => {
      const { page, close } = await open(browser, device)
      await page.goto(`/app/board?owner=mine&project=${GONE}`)
      await expect(page.getByText("That project isn't available.")).toBeVisible({ timeout: 60_000 })
      await expect(page).toHaveURL(/\/app\/board\?owner=mine$/)
      await expect.poll(() => titles(page)).toEqual(["Q4 launch"])
      await expect(page.getByRole("button", { name: /Try again/ })).toHaveCount(0)
      await close()
    })
  })
}

// The project's home links to its boards (to_win 1): its Attachments tab lists the boards linked to the project and opens
// them in Boards, filtered to it, on a computer and on a phone (whose tab had the rows and no way to Boards, 6 Nov).
for (const device of ["computer", "phone"] as const) {
  test(`a project's Attachments tab on a ${device} lists its boards and opens them in Boards, filtered to it`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const touch = device === "phone"
    const context = await browser.newContext({ ...DEVICES[device] })
    const page = await context.newPage()
    const asked: string[] = []
    await openFiles(page, testInfo, {
      [`/link/source/project/${FILES_PROJECT}`]: { msg: "ok", data: { docs: [], boards: [{ board_uuid: MINE.board_uuid, board_title: MINE.board_title, board_read_access: 1 }] } },
      "/board/getBoardList": (url: URL) => {
        asked.push(url.searchParams.get("project") ?? "")
        return { msg: "Success", pageCount: 1, data: { count: 1, boards: [{ board_uuid: MINE.board_uuid, board_title: MINE.board_title, board_private: true, board_updated_at: "" }] } }
      },
      "/user/sidebarNav": { msg: "ok", data: { user_projects: [{ project_uuid: FILES_PROJECT, project_name: "Website relaunch" }] } },
    })
    // The linked board's own row, then the way to all of the project's boards.
    await expect(page.getByRole("button", { name: MINE.board_title, exact: true })).toBeVisible({ timeout: 60_000 })
    const all = page.getByRole("link", { name: "See all in Boards" })
    await expect(all).toHaveAttribute("href", `/app/board?project=${FILES_PROJECT}`)
    if (touch) {
      // A finger's reach (app/phone.css F3): the link is drawn a line of text high, and its ::before takes a tap
      // across 44px around it, so a tap just above the drawn link opens it (DB-123 F3).
      const reach = await all.evaluate((el) => {
        const r = getComputedStyle(el, "::before")
        return { drawn: Math.round(el.getBoundingClientRect().height), width: parseFloat(r.width), height: parseFloat(r.height) }
      })
      expect(reach.drawn).toBeLessThan(44)
      expect(reach.width).toBeGreaterThanOrEqual(44)
      expect(reach.height).toBeGreaterThanOrEqual(44)
      const box = (await all.boundingBox())!
      await all.tap({ position: { x: box.width / 2, y: -(44 - box.height) / 2 + 2 } })
    } else await all.click()
    await expect(page).toHaveURL(new RegExp(`/app/board\\?project=${FILES_PROJECT}$`))
    await expect(page.locator("[data-board-uuid]")).toHaveCount(1, { timeout: 60_000 })
    expect(asked.at(-1)).toBe(FILES_PROJECT)
    await expect(page.getByRole("button", { name: /^Website relaunch/ })).toBeVisible()
    await context.close()
  })
}
