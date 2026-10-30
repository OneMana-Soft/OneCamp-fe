import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note } from "../scripts/fluidity/fakeBoard.mjs"

// A board saved as a template for the workspace (whiteboard W-1b, miro-19 3):
// More › Save as template keeps what a person sees on it, and every board's
// picker offers it first, under Your team's, laying a copy with new ids. On a
// phone the save is a sheet with its action pinned.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f3"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type: string; isDeleted?: boolean; name?: string; frameId?: string | null }
type Saved = { id: string; kind: string; name: string; description: string; payload: string; author_name: string; created_by: string; created_at: string; updated_at: string }
type Element = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; containerId?: string | null; backgroundColor?: string; customData?: { kind?: string } }

/**
 * The marketplace, faked: a save is kept, listed with a drawing of it as
 * business/Marketplace lists one (listedBoardPayload), and read in full.
 */
function fakeTemplates() {
  const saved: Saved[] = []
  const listed = (t: Saved) => {
    const p = JSON.parse(t.payload) as { title: string; elements: Element[] }
    const seen = p.elements.filter((e) => !e.isDeleted)
    const preview = seen
      .filter((e) => !(e.type === "text" && e.containerId))
      .map((e) => ({
        type: e.type,
        x: Math.round(e.x),
        y: Math.round(e.y),
        w: Math.round(e.width),
        h: Math.round(e.height),
        ...(e.backgroundColor && e.backgroundColor !== "transparent" ? { fill: e.backgroundColor } : {}),
        ...(e.customData?.kind === "note" ? { note: true } : {}),
      }))
    return { ...t, payload: JSON.stringify({ title: p.title, count: seen.length, preview }) }
  }
  const fixtures: Array<[RegExp, (path: string, url: URL, req: { method(): string; postDataJSON(): unknown }) => unknown]> = [
    [
      /\/marketplace\/templates\/[^/]+$/,
      (path) => {
        const t = saved.find((x) => x.id === path.split("/").pop())
        return t ? { msg: "ok", data: t } : undefined
      },
    ],
    [
      /\/marketplace\/templates$/,
      (_path, url, req) => {
        if (req.method() === "POST") {
          const body = req.postDataJSON() as { kind: string; name: string; description: string; payload: unknown }
          const t: Saved = { id: `t-${saved.length + 1}`, kind: body.kind, name: body.name, description: body.description, payload: JSON.stringify(body.payload), author_name: "Sam Rivera", created_by: "u", created_at: "", updated_at: "" }
          saved.push(t)
          return { msg: "ok", data: listed(t) }
        }
        return { msg: "ok", data: url.searchParams.get("kind") === "board" ? saved.map(listed) : [] }
      },
    ],
  ]
  return { saved, fixtures }
}

async function open(browser: Browser, device: keyof typeof DEVICES, market: ReturnType<typeof fakeTemplates>) {
  const n1 = note("n1", 0, 0, "Shipped on time")
  const n2 = note("n2", 220, 0, "Fast reviews")
  const board = { uuid: BOARD, title: "Kickoff", levels: LEVELS, update: boardDoc([...n1, ...n2, frame("f1", "Went well", [...n1, ...n2])]) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows; the test reads past it */
    }
  })
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab,
    fixtures: [...market.fixtures, ...boardFixtures([board], USERS.sam, USERS.sam)] as never,
  })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const elements = () => (Array.from(collab.doc(NAME).getMap("elements").values()) as Shared[]).filter((e) => !e.isDeleted)
  return { context, page, elements }
}

test.describe("a board saved as a template", () => {
  test("is offered first under Your team's on any board, and lays a copy of itself", async ({ browser }) => {
    test.setTimeout(120_000)
    const market = fakeTemplates()
    const { context, page, elements } = await open(browser, "computer", market)
    await expect.poll(() => elements().length, { timeout: 10_000 }).toBe(5)

    // The board's own More, in its name's cluster (Excalidraw has a "More tools" of its own).
    await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
    await page.getByRole("menuitem", { name: "Save as template" }).click()
    const dialog = page.getByRole("dialog", { name: "Save as a template" })
    const name = dialog.getByRole("textbox", { name: "Template name" })
    await expect(name).toHaveValue("Kickoff")
    await name.fill("Team retro")
    await expect(dialog.locator("[data-template-contents]")).toHaveText("5 things from the board.")
    await dialog.getByRole("button", { name: "Save template" }).click()
    await expect(dialog).toBeHidden()
    expect(market.saved.map((t) => t.name)).toEqual(["Team retro"])
    const sent = JSON.parse(market.saved[0].payload) as { title: string; elements: Element[] }
    expect(sent.title).toBe("Team retro")
    expect(sent.elements.map((e) => e.id).sort()).toEqual(["f1", "n1", "n1-label", "n2", "n2-label"])

    // The board's picker offers it first, under Your team's, drawn from its layout.
    await page.getByRole("button", { name: "Templates" }).click()
    await expect(page.getByRole("button", { name: "Your team's" })).toBeVisible()
    await expect(page.getByRole("option").first()).toContainText("Team retro")
    await expect(page.locator('[data-board-template-preview="team:t-1"] svg rect').first()).toBeAttached()
    await page.getByRole("option", { name: /Team retro/ }).click()
    // A copy: new ids, its notes in its own frame.
    await expect.poll(() => elements().length, { timeout: 5_000 }).toBe(10)
    const frames = elements().filter((e) => e.type === "frame")
    expect(frames.map((f) => f.name)).toEqual(["Went well", "Went well"])
    const copy = frames.find((f) => f.id !== "f1")!
    expect(elements().filter((e) => e.frameId === copy.id)).toHaveLength(4)
    await context.close()
  })

  test("on a phone, saving is a sheet with its action pinned in reach", async ({ browser }) => {
    test.setTimeout(120_000)
    const market = fakeTemplates()
    const { context, page } = await open(browser, "phone", market)
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Save as template" }).tap()
    const sheet = page.locator("[data-v3-sheet]").filter({ hasText: "Save as a template" })
    await expect(sheet).toBeVisible()
    const save = sheet.getByRole("button", { name: "Save template" })
    // A phone's sheet slides up, so its action is read where it stops: in
    // the window, whole, never under the fold.
    await expect
      .poll(async () => {
        const b = await save.boundingBox()
        return b ? b.y + b.height : Infinity
      }, { timeout: 10_000 })
      .toBeLessThanOrEqual(844)
    const box = (await save.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.y).toBeGreaterThanOrEqual(0)
    await save.tap()
    await expect(sheet).toBeHidden()
    expect(market.saved).toHaveLength(1)
    await context.close()
  })

  // The shared Textarea (components/ui/textarea): no grip at its corner, and
  // as tall as what is typed in it, so nothing scrolls inside it.
  test("on a phone, what a template is for has no grip and grows with its words", async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page } = await open(browser, "phone", fakeTemplates())
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Save as template" }).tap()
    const about = page.getByRole("textbox", { name: "What it's for" })
    await expect(about).toBeVisible()
    const size = () =>
      about.evaluate((el: HTMLTextAreaElement) => ({ resize: getComputedStyle(el).resize, height: el.offsetHeight, inside: el.scrollHeight - el.clientHeight }))
    const rest = await size()
    expect(rest.resize, "a grip at its corner").toBe("none")
    await about.fill(Array.from({ length: 8 }, (_, i) => `Step ${i + 1} of the retro`).join("\n"))
    const long = await size()
    expect(long.height, "it grows with its lines").toBeGreaterThan(rest.height)
    expect(long.inside, "its lines scroll inside it").toBeLessThanOrEqual(1)
    await about.fill("")
    expect((await size()).height, "it shrinks back to its rows").toBe(rest.height)
    await context.close()
  })
})
