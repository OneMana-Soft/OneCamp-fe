import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"

// A crafted element never reaches a board's scene (V-547). Excalidraw draws an
// "iframe" element as a live page made from the element's own HTML, with
// scripts, forms and popups that leave its sandbox: to every viewer, a page of
// its writer's choosing. One a crafted client wrote is dropped wherever it
// comes from (a stored board, a change over the socket, a paste), for a
// member and for a guest on a shared link, and a member's tab never writes
// one back.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f7"
const NAME = boardDocName(BOARD)
const TOKEN = "guest-link-crafted"
const LEVELS = { sam: "edit" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type: string; isDeleted?: boolean }
type Doc = { getMap: (name: string) => { set: (k: string, v: unknown) => void } }

const HTML = '<form><input name="password" placeholder="Your password"><button>Sign in</button></form>'
/** What a crafted client writes, where a person looks: a live page, the frame that makes one, and a type no board has. */
const crafted = (id: string, x: number, y: number) => [
  { ...shape(id, "iframe", x, y, 200, 120), customData: { generationData: { status: "done", html: HTML } } },
  shape(`${id}-frame`, "magicframe", x, y + 130, 200, 60),
  shape(`${id}-odd`, "script", x, y + 200, 60, 60),
]
const stored = () => boardDoc(ordered([...note("n1", 40, 40, "Agenda"), ...crafted("x1", 40, 240)]))

/** No page of an element's making: none of Excalidraw's embeds, and no frame made from HTML. */
async function expectNoPage(page: Page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await expect(page.locator(".excalidraw__embeddable-container")).toHaveCount(0)
  expect(page.frames().filter((f) => f.url() === "about:srcdoc")).toHaveLength(0)
}

async function member(browser: Browser, device: keyof typeof DEVICES) {
  const collab = collabFor([{ id: NAME, update: stored(), levels: LEVELS }])
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The camera at the board's origin, so what was written lies in view.
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the camera then frames the note */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: stored() }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [], collab, fixtures: boardFixtures([board], USERS.sam, USERS.sam) as never })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  const all = () => [...(collab.doc(NAME).getMap("elements").values() as Iterable<Shared>)].filter((e) => !e.isDeleted)
  return { context, page, collab, all }
}

for (const [device, use] of Object.entries(DEVICES) as [keyof typeof DEVICES, BrowserContextOptions][]) {
  test(`a member's board draws no crafted page: stored, sent or pasted (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page, collab, all } = await member(browser, device)
    // Stored: the note's two elements, and nothing of what was written beside it.
    const canvas = page.locator('[data-board-canvas][data-board-synced="true"]')
    await expect(canvas).toHaveAttribute("data-board-elements", "2", { timeout: 30_000 })
    await expectNoPage(page)

    // Sent: a crafted client's change, with a shape of a teammate's, arrives as one merge; only the shape is drawn.
    const merges = Number((await canvas.getAttribute("data-board-remote")) ?? "0")
    collab.edit(NAME, (doc: Doc) => {
      for (const e of [...crafted("x2", 260, 240), shape("s2", "ellipse", 260, 40)]) doc.getMap("elements").set(e.id, e)
    })
    await expect(canvas).toHaveAttribute("data-board-remote", String(merges + 1))
    await expectNoPage(page)

    // Pasted: Excalidraw's own clipboard with a live page and a box in it lays the box alone, and writes only that.
    // The canvas's middle, which is empty: on a phone its last rows lie under the board's dock (Generate with AI).
    const c = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    if (device === "phone") await page.touchscreen.tap(x, y)
    else await page.mouse.click(x, y)
    await page.mouse.move(x, y)
    const before = all().length
    const clip = JSON.stringify({ type: "excalidraw/clipboard", elements: [...crafted("x3", 0, 0), shape("box", "rectangle", 0, 300, 120, 80)], files: {} })
    await page.evaluate((t) => {
      const data = new DataTransfer()
      data.setData("text/plain", t)
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, clip)
    await expect.poll(() => all().length, { timeout: 10_000 }).toBe(before + 1)
    expect(all().filter((e) => e.type === "rectangle").length).toBe(2)
    expect(all().filter((e) => ["iframe", "magicframe", "script"].includes(e.type)).map((e) => e.id).sort()).toEqual(
      ["x1", "x1-frame", "x1-odd", "x2", "x2-frame", "x2-odd"],
    )
    await expectNoPage(page)
    await context.close()
  })

  test(`a guest on a shared link sees no crafted page: stored or sent (${device})`, async ({ browser }) => {
    test.setTimeout(90_000)
    const collab = collabFor([{ id: NAME, update: stored(), levels: { guest: "view" } }])
    const context = await browser.newContext(use)
    const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Launch plan", workspace_name: "Acme" }
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] as never })
    const page = await context.newPage()
    await page.goto(`/guest/b/${TOKEN}`)
    const board = page.locator("[data-guest-board]")
    await expect(board).toHaveAttribute("data-board-elements", "2", { timeout: 30_000 })
    await expectNoPage(page)
    collab.edit(NAME, (doc: Doc) => {
      for (const e of [...crafted("x2", 260, 240), shape("s2", "ellipse", 260, 40)]) doc.getMap("elements").set(e.id, e)
    })
    await expect(board).toHaveAttribute("data-board-elements", "3")
    await expectNoPage(page)
    await context.close()
  })
}
