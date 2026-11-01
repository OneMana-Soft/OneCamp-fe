import { expect, test, type Browser, type BrowserContextOptions, type Request } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// Cards on the board (miro-13): a task's link pasted on a board is its card,
// stored on the shared board as an embeddable that keeps the link. The card
// reads the task live as this reader may see it (POST /entities): its status,
// key, name and who has it; someone who may change it ticks it done in place,
// with the project's own request. A link to a site the docs don't frame stays
// a link.

const BOARD = "b0a4d000-0000-4000-8000-0000000000c8"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const TASK = "7a5c0000-0000-4000-8000-0000000000c1"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type?: string; isDeleted?: boolean; link?: string | null; customData?: { kind?: string } }

async function open(browser: Browser, device: keyof typeof DEVICES) {
  // One note in the top left corner, so the board isn't empty (an empty board draws its starter card in the middle).
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(ordered(note("agenda", 40, 40, "Agenda"))) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const ticks: unknown[] = []
  const reads: string[] = []
  let status = { status: "inProgress", status_name: "In progress", done: false }
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The camera at the board's origin, so the note stays in its corner and the middle is empty.
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the camera then frames the note, and the paste says so */
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
        /\/entities$/,
        (_path: string, _url: URL, req: Request) => {
          const refs = (JSON.parse(req.postData() ?? "{}").refs ?? []) as { kind: string; id: string }[]
          reads.push(...refs.map((r) => `${r.kind}:${r.id}`))
          return {
            msg: "ok",
            data: refs.map((r) =>
              r.kind === "task" && r.id === TASK
                ? { kind: "task", id: TASK, access: "ok", data: { name: "Book the venue", key: "EV-12", can_edit: true, project_id: "p1", assignee: { uuid: "u9", name: "Riya Shah" }, ...status } }
                : { kind: r.kind, id: r.id, access: "none" },
            ),
          }
        },
      ],
      [
        /\/task\/updateTaskStatus$/,
        (_path: string, _url: URL, req: Request) => {
          const body = JSON.parse(req.postData() ?? "{}")
          ticks.push(body)
          status = { status: "done", status_name: "Done", done: true }
          return { msg: "ok" }
        },
      ],
    ],
  })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const all = () => [...(collab.doc(NAME).getMap("elements").values() as Iterable<Shared>)].filter((e) => !e.isDeleted)
  // A paste lands on the board as a person's does: after a press on the canvas, with the pointer over it
  // (Excalidraw takes a paste only while it has the focus and the canvas is under the pointer).
  const paste = async (text: string, dy = 0) => {
    const c = await page.locator(".excalidraw canvas.interactive").boundingBox()
    if (!c) throw new Error("the canvas isn't on the page")
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2 + dy
    if (device === "phone") await page.touchscreen.tap(x, y)
    else await page.mouse.click(x, y)
    await page.mouse.move(x, y)
    await page.evaluate((t) => {
      const data = new DataTransfer()
      data.setData("text/plain", t)
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, text)
  }
  return { context, page, all, paste, ticks, reads }
}

for (const device of ["computer", "phone"] as const) {
  test(`a task's link pasted on the board is its card, live, and ticked done in place (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device)
    const origin = new URL(b.page.url()).origin
    await b.paste(`${origin}/app/task/${TASK}`)

    // One card on the shared board: an embeddable that keeps the task's link.
    const cards = () => b.all().filter((e) => e.type === "embeddable")
    await expect.poll(() => cards().map((e) => [e.link, e.customData?.kind]), { timeout: 10_000 }).toEqual([[`${origin}/app/task/${TASK}`, "card"]])
    const card = b.page.locator('[data-board-card="task"]')
    await expect(card).toHaveAttribute("data-card-state", "ok", { timeout: 15_000 })
    for (const words of ["In progress", "EV-12", "Book the venue", "Riya Shah"]) await expect(card).toContainText(words)
    expect(b.reads).toContain(`task:${TASK}`)

    // A press on the card's middle opens it; then its tick marks the task done, with the list's own request.
    const box = await card.boundingBox()
    if (!box) throw new Error("the card isn't drawn")
    if (device === "phone") await b.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    else await b.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const tick = card.getByRole("button", { name: "Mark Book the venue done" })
    if (device === "phone") await tick.tap()
    else await tick.click()
    await expect.poll(() => b.ticks, { timeout: 10_000 }).toEqual([{ task_status: "done", task_uuid: TASK, task_project_uuid: "p1" }])
    await expect(card).toContainText("Done", { timeout: 10_000 })
    await expect(card.getByRole("button", { name: "Open Book the venue again" })).toBeVisible()

    // Text that isn't only OneCamp links pastes as before: no second card.
    await b.paste("https://unknown.example.org/page", 160)
    await b.page.waitForTimeout(500)
    expect(cards()).toHaveLength(1)
    await b.context.close()
  })
}
