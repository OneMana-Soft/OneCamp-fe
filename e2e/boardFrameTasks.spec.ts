import { expect, test, type Browser, type BrowserContextOptions, type Request } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// A retro's actions become tasks from their frame (miro-19 4): select the
// Actions frame, Make tasks, leave the template's prompt unticked, choose a
// project. One request makes them, and each note links to its task for
// everyone on the board.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f7"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const PROJECT = { project_uuid: "0c0a0000-0000-4000-8000-0000000000a1", project_name: "Launch" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; isDeleted?: boolean; link?: string | null; customData?: { taskUuid?: string } }

async function open(browser: Browser, device: keyof typeof DEVICES) {
  const notes = [...note("venue", 140, 160, "Book the venue"), ...note("recap", 340, 160, "Send the recap"), ...note("prompt", 540, 160, "Who does what by when?")]
  const actions = frame("actions", "Actions", notes.filter((e) => e.type === "rectangle"))
  for (const e of notes) e.frameId = "actions"
  const board = { uuid: BOARD, title: "Sprint retro", levels: LEVELS, update: boardDoc(ordered([actions, ...notes])) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const sent: { project_uuid: string; tasks: { task_name: string }[] }[] = []
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The camera at the board's origin, so the frame's name is where it was drawn.
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the frame's name is then elsewhere, and the test says so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab,
    fixtures: [
      ...boardFixtures([board], USERS.sam, USERS.sam),
      [/\/project\/projectListByAdminUID$/, { msg: "ok", data: [PROJECT] }],
      [
        /\/task\/createTasks$/,
        (_path: string, _url: URL, req: Request) => {
          const body = JSON.parse(req.postData() ?? "{}")
          sent.push(body)
          return { msg: "ok", data: { made: body.tasks.map((_: unknown, i: number) => `7a5c0000-0000-4000-8000-00000000000${i}`) } }
        },
      ],
    ],
  })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const shared = (id: string) => collab.doc(NAME).getMap("elements").get(id) as Shared | undefined
  return { context, page, sent, shared }
}

for (const device of ["computer", "phone"] as const) {
  test(`a retro's actions become tasks from their frame, the prompt left out (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device)
    const press = device === "phone" ? "tap" : "click"
    // The frame's name, drawn just above its top left corner (the frame starts at 130, 150).
    const canvas = await b.page.locator(".excalidraw").first().boundingBox()
    if (!canvas) throw new Error("the canvas isn't on the page")
    if (device === "phone") await b.page.touchscreen.tap(canvas.x + 140, canvas.y + 140)
    else await b.page.mouse.click(canvas.x + 140, canvas.y + 140)

    const bar = b.page.locator("[data-frame-bar]")
    await bar.getByRole("button", { name: "Make 3 tasks" })[press]()
    const dialog = b.page.getByRole("dialog")
    await dialog.getByRole("combobox", { name: "Project" })[press]()
    await b.page.getByRole("option", { name: "Launch" })[press]()
    // Every note in the frame comes ticked; the prompt left out, two are made.
    await dialog.getByRole("checkbox", { name: "Who does what by when?" })[press]()
    await expect(dialog.getByRole("button", { name: "Make 2 tasks" })).toBeEnabled()
    // None ticked, nothing to make.
    await dialog.getByRole("checkbox", { name: "Book the venue" })[press]()
    await dialog.getByRole("checkbox", { name: "Send the recap" })[press]()
    await expect(dialog.getByRole("button", { name: "Make tasks" })).toBeDisabled()
    await dialog.getByRole("checkbox", { name: "Book the venue" })[press]()
    await expect(dialog.getByRole("button", { name: "Make a task" })).toBeEnabled()
    await dialog.getByRole("checkbox", { name: "Send the recap" })[press]()
    await dialog.getByRole("button", { name: "Make 2 tasks" })[press]()

    await expect(dialog).toBeHidden({ timeout: 10_000 })
    expect(b.sent).toEqual([{ project_uuid: PROJECT.project_uuid, tasks: [{ task_name: "Book the venue" }, { task_name: "Send the recap" }] }])
    // Each note links to its task on the shared board; the prompt stays a note.
    await expect.poll(() => b.shared("venue")?.customData?.taskUuid, { timeout: 5_000 }).toBe("7a5c0000-0000-4000-8000-000000000000")
    expect(b.shared("recap")?.link).toBe("/app/task/7a5c0000-0000-4000-8000-000000000001")
    expect(b.shared("prompt")?.customData?.taskUuid).toBeUndefined()
    // Every note in the frame is a task or left out: the bar offers one more, the prompt.
    await expect(bar.getByRole("button", { name: "Make a task" })).toBeVisible()
    await b.context.close()
  })
}
