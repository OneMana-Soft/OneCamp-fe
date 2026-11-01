import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Request } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// Add from OneCamp (miro-13 2): the board's panel puts the workspace's tasks,
// docs and projects on the board as their live cards. With nothing typed it
// lists a project's open tasks, as the project's board reads them; search
// finds anything this person may open. A press lays the card in the middle of
// what the board shows (above the sheet on a phone), past what is there and
// off the board's own bars; on a computer a row is dragged to its spot. A card ringed under the pointer says
// "Click to use" in its top row, and Excalidraw's own pill never covers it.

const BOARD = "b0a4d000-0000-4000-8000-0000000000c9"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const PROJECT = "9e0d0000-0000-4000-8000-0000000000a1"
// Listed ahead of Launch (DB-61, miro-13 MUST 1): one the demo's seed refresh deleted, and one deleted since the list was read.
const RETIRED = "9e0d0000-0000-4000-8000-0000000000a2"
const GONE = "9e0d0000-0000-4000-8000-0000000000a3"
const VENUE = "7a5c0000-0000-4000-8000-0000000000c1"
const BADGES = "7a5c0000-0000-4000-8000-0000000000c2"
const TASKS: Record<string, { name: string; key: string; status: string; status_name: string }> = {
  [VENUE]: { name: "Book the venue", key: "EV-12", status: "inProgress", status_name: "In progress" },
  [BADGES]: { name: "Print badges", key: "EV-14", status: "todo", status_name: "To do" },
}

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type?: string; isDeleted?: boolean; link?: string | null; x: number; y: number; width: number; height: number }

async function open(browser: Browser, device: keyof typeof DEVICES, { empty = false, retired = false } = {}) {
  // One note in the top left corner, so the middle is clear; an empty board draws its starter card there.
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(empty ? [] : ordered(note("agenda", 40, 40, "Agenda"))) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const searched: string[] = []
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The camera at the board's origin, so the note stays in its corner and the middle is empty.
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the camera then frames the note */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab,
    fixtures: [
      ...boardFixtures([board], USERS.sam, USERS.sam),
      [
        /\/user\/userProjectList$/,
        {
          msg: "ok",
          data: {
            user_projects: [
              ...(retired
                ? [
                    { project_uuid: RETIRED, project_name: "Q4 launch-retired", project_deleted_at: "2026-10-31T14:37:21Z" },
                    { project_uuid: GONE, project_name: "Customer onboarding" },
                  ]
                : []),
              { project_uuid: PROJECT, project_name: "Launch" },
            ],
          },
        },
      ],
      [
        /\/project\/taskListForKanban\//,
        {
          msg: "ok",
          data: {
            project_uuid: PROJECT,
            project_name: "Launch",
            project_tasks_in_progress: [],
            project_tasks_todo: [{ task_uuid: BADGES, task_name: "Print badges", task_status: "todo", task_key: "EV-14" }],
            project_tasks_done: [{ task_uuid: "7a5c0000-0000-4000-8000-0000000000c9", task_name: "Pick a date", task_status: "done", task_key: "EV-2" }],
          },
        },
      ],
      [
        /\/search\/unifiedSearch$/,
        (_path: string, _url: URL, req: Request) => {
          searched.push(JSON.parse(req.postData() ?? "{}").global_search_text)
          return {
            msg: "ok",
            data: {
              page: [
                { type: "task", task: { task_id: VENUE, task_name: "Book the venue", task_status: "inProgress", task_project_name: "Launch" } },
                { type: "channel", channel: { ch_id: "c1", ch_name: "general" } },
              ],
              has_more: false,
            },
          }
        },
      ],
      [
        /\/entities$/,
        (_path: string, _url: URL, req: Request) => {
          const refs = (JSON.parse(req.postData() ?? "{}").refs ?? []) as { kind: string; id: string }[]
          return {
            msg: "ok",
            data: refs.map((r) => {
              const t = r.kind === "task" ? TASKS[r.id] : undefined
              if (t) return { kind: "task", id: r.id, access: "ok", data: { ...t, can_edit: true, done: false, project_id: PROJECT } }
              if (r.kind === "project" && r.id === PROJECT) return { kind: "project", id: PROJECT, access: "ok", data: { name: "Launch" } }
              if (r.kind === "project" && r.id === GONE) return { kind: "project", id: GONE, access: "gone" }
              return { kind: r.kind, id: r.id, access: "none" }
            }),
          }
        },
      ],
    ],
  })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const cards = () => [...(collab.doc(NAME).getMap("elements").values() as Iterable<Shared>)].filter((e) => !e.isDeleted && e.type === "embeddable")
  return { context, page, cards, searched, origin: new URL(page.url()).origin }
}

const overlap = (a: Shared, b: Shared) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test("a project's task dragged onto the board and a task found by search pressed are cards; a card under the pointer says so itself (computer)", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "computer")
  await b.page.getByRole("button", { name: "Add from OneCamp" }).click()
  const panel = b.page.locator("[data-add-work]")
  await expect(panel).toBeVisible()

  // With nothing typed: the project's open tasks under their status, never its done ones.
  const badges = panel.getByRole("button", { name: /Print badges/ })
  await expect(badges).toBeVisible({ timeout: 15_000 })
  await expect(panel.getByText("To do")).toBeVisible()
  await expect(panel.getByText("Pick a date")).toHaveCount(0)

  // Dragged to a spot on the board: its card is there, on the shared board.
  const canvas = b.page.locator(".excalidraw canvas.interactive")
  const c = await canvas.boundingBox()
  if (!c) throw new Error("the canvas isn't on the page")
  await badges.dragTo(canvas, { targetPosition: { x: 300, y: 500 } })
  await expect.poll(() => b.cards().map((e) => e.link), { timeout: 10_000 }).toEqual([`${b.origin}/app/task/${BADGES}`])
  const dropped = b.cards()[0]
  expect(Math.abs(dropped.x + dropped.width / 2 - 300)).toBeLessThan(4)
  expect(Math.abs(dropped.y + dropped.height / 2 - 500)).toBeLessThan(4)
  await expect(badges).toContainText("On the board")
  // The card laid is selected, and Excalidraw's style panel (strokes, fills, the link editor) means nothing for a live
  // card: while only cards are selected the board marks itself and shows none, over the card just dropped (DB-56 MUST 1).
  const stylePanel = b.page.locator(".excalidraw .App-menu__left")
  await expect(b.page.locator("[data-cards-selected]")).toHaveCount(1)
  await expect(stylePanel).toBeHidden()

  // Found by search, and pressed: its card in the middle of the view; a channel has no card, so it isn't offered.
  await panel.getByRole("searchbox", { name: "Search tasks, docs and projects" }).fill("venue")
  const venue = panel.getByRole("button", { name: /Book the venue/ })
  await expect(venue).toBeVisible({ timeout: 10_000 })
  await expect(panel.getByText("general")).toHaveCount(0)
  expect(b.searched).toContain("venue")
  await venue.click()
  await expect.poll(() => b.cards().length, { timeout: 10_000 }).toBe(2)
  const laid = b.cards().find((e) => e.link === `${b.origin}/app/task/${VENUE}`)!
  expect(Math.abs(laid.x + laid.width / 2 - c.width / 2)).toBeLessThan(4)
  // The middle is taken by the card dragged there, and so is the spot below it; two down is under the board's own
  // bars at its foot. The nearest spot the board shows whole is above the dragged card.
  expect(laid.y + laid.height).toBeLessThanOrEqual(dropped.y)
  await expect(venue).toContainText("On the board")
  await expect(b.page.locator("[data-cards-selected]")).toHaveCount(1)
  await expect(stylePanel).toBeHidden()

  // The card reads the task live. It is laid selected, and Excalidraw opens its link popup over a selected linked
  // element at the pointer's first move onto it: a card is its own link, so the popup stays shut, as its badge does.
  const card = b.page.locator('[data-board-card="task"]', { hasText: "Book the venue" })
  await expect(card).toHaveAttribute("data-card-state", "ok", { timeout: 15_000 })
  const box = await card.boundingBox()
  if (!box) throw new Error("the card isn't drawn")
  await b.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  const popup = b.page.locator(".excalidraw-hyperlinkContainer")
  await expect(popup).toHaveCount(1)
  await expect(popup).toBeHidden()
  // Moving on over its middle, it is ringed and says "Click to use" beside its key, and Excalidraw's own pill never
  // covers its name.
  await b.page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 2, { steps: 2 })
  await expect(card).toHaveAttribute("data-card-pointer", "hover")
  await expect(card.getByText("Click to use")).toBeVisible()
  await expect(b.page.locator(".excalidraw__embeddable-hint")).toBeHidden()
  await expect(card.getByText("Book the venue")).toBeVisible()
  await b.context.close()
})

test("on a new, empty board, a task let go on the starter card is laid right there, and the starter card is gone (computer)", async ({ browser }) => {
  test.setTimeout(90_000)
  const b = await open(browser, "computer", { empty: true })
  await b.page.getByRole("button", { name: "Add from OneCamp" }).click()
  const badges = b.page.locator("[data-add-work]").getByRole("button", { name: /Print badges/ })
  await expect(badges).toBeVisible({ timeout: 15_000 })

  // "Start with a template" fills the middle of an empty board, which is where a first drop lands.
  const starter = b.page.locator("[data-empty-canvas]")
  await expect(starter).toBeVisible()
  const over = await starter.boundingBox()
  const canvas = await b.page.locator(".excalidraw canvas.interactive").boundingBox()
  const from = await badges.boundingBox()
  if (!over || !canvas || !from) throw new Error("the starter card, the canvas or the row isn't on the page")
  const to = { x: over.x + over.width / 2, y: over.y + over.height / 2 }

  // A person's drag: the row picked up, carried across the board and let go on the starter card.
  await b.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await b.page.mouse.down()
  await b.page.mouse.move(to.x, to.y, { steps: 12 })
  await b.page.mouse.up()

  // Its card is on the shared board, centred where it was let go (the camera sits at the board's origin).
  await expect.poll(() => b.cards().map((e) => e.link), { timeout: 10_000 }).toEqual([`${b.origin}/app/task/${BADGES}`])
  const dropped = b.cards()[0]
  expect(Math.abs(dropped.x + dropped.width / 2 - (to.x - canvas.x))).toBeLessThan(4)
  expect(Math.abs(dropped.y + dropped.height / 2 - (to.y - canvas.y))).toBeLessThan(4)
  // The board has something on it now, so the starter card has gone.
  await expect(starter).toHaveCount(0)
  await b.context.close()
})

for (const device of ["computer", "phone"] as const)
  test(`a deleted project listed first, and one deleted since, are passed over: the next one's tasks show, never "Loading tasks…" for good (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device, { retired: true })
    const press = (l: Locator) => (device === "phone" ? l.tap() : l.click())
    if (device === "phone") {
      await press(b.page.getByRole("button", { name: "Board options" }))
      await press(b.page.getByRole("menuitem", { name: "Add from OneCamp" }))
    } else await press(b.page.getByRole("button", { name: "Add from OneCamp" }))
    const panel = b.page.locator("[data-add-work]")
    await expect(panel.getByRole("region", { name: "Launch's open tasks" })).toBeVisible({ timeout: 15_000 })
    await expect(panel.getByRole("button", { name: /Print badges/ })).toBeVisible()
    await expect(panel.getByText("Loading tasks…")).toHaveCount(0)
    // Neither is offered: the deleted one never was, and the one whose own read said "gone" is dropped.
    await press(panel.getByRole("combobox", { name: "Project" }))
    await expect(b.page.getByRole("option")).toHaveText(["Launch"])
    await b.context.close()
  })

test("on a phone, a press puts the card above the sheet, and the next one never lands on it (phone)", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "phone")
  await b.page.getByRole("button", { name: "Board options" }).tap()
  await b.page.getByRole("menuitem", { name: "Add from OneCamp" }).tap()
  const panel = b.page.locator("[data-add-work]")
  await expect(panel).toBeVisible()
  const canvas = await b.page.locator(".excalidraw canvas.interactive").boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")

  const badges = panel.getByRole("button", { name: /Print badges/ })
  await expect(badges).toBeVisible({ timeout: 15_000 })
  await badges.tap()
  await expect.poll(() => b.cards().map((e) => e.link), { timeout: 10_000 }).toEqual([`${b.origin}/app/task/${BADGES}`])
  // In the half of the board the sheet leaves in view.
  const first = b.cards()[0]
  expect(first.y + first.height / 2).toBeLessThan(canvas.height / 2)

  await panel.getByRole("searchbox", { name: "Search tasks, docs and projects" }).fill("venue")
  const venue = panel.getByRole("button", { name: /Book the venue/ })
  await expect(venue).toBeVisible({ timeout: 10_000 })
  await venue.tap()
  await expect.poll(() => b.cards().length, { timeout: 10_000 }).toBe(2)
  const [a, z] = b.cards()
  expect(overlap(a, z)).toBe(false)
  await expect(venue).toContainText("On the board")
  await b.context.close()
})
