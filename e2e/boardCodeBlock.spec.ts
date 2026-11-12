import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"

// Code blocks on a board (miro-17): an editor makes one from the board's tools (a phone's Board options), its title,
// language and code in the app's dialog (a sheet on a phone). It is one embeddable on the shared board that keeps its
// code in customData, drawn with its lines numbered and coloured as a doc's code is, with a copy button; its Edit
// button changes it in place. Someone who may only view the board reads and copies it, and has no Edit.

const BOARD = "b0a4d000-0000-4000-8000-0000000000d7"
const NAME = boardDocName(BOARD)

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type?: string; isDeleted?: boolean; link?: string | null; version?: number; customData?: Record<string, unknown> }

async function open(browser: Browser, device: keyof typeof DEVICES, who: "sam" | "vic", seeded: unknown[] = []) {
  const levels = { sam: "edit", vic: "view" }
  // One note in the top left corner, so the board isn't empty (an empty board draws its starter card in the middle).
  const board = { uuid: BOARD, title: "Launch plan", levels, update: boardDoc(ordered([...note("agenda", 40, 40, "Agenda"), ...seeded] as never)) }
  const collab = collabFor([{ id: NAME, update: board.update, levels }])
  const context = await browser.newContext(DEVICES[device])
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the camera then frames what is on the board */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS[who], docs: [], collab, fixtures: boardFixtures([board], USERS[who], USERS.sam) })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const all = () => [...(collab.doc(NAME).getMap("elements").values() as Iterable<Shared>)].filter((e) => !e.isDeleted)
  const blocks = () => all().filter((e) => e.type === "embeddable" && e.customData?.kind === "code")
  const press = async (l: Locator) => (device === "phone" ? l.tap() : l.click())
  // A press on a block's middle lets its buttons work, as a card's does.
  const use = async (l: Locator) => {
    const box = await l.boundingBox()
    if (!box) throw new Error("the code block isn't drawn")
    if (device === "phone") await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  return { context, page, blocks, press, use }
}

const lineTexts = (page: Page) => page.locator("[data-board-code] [data-code-text]").allTextContents()

for (const device of ["computer", "phone"] as const) {
  test(`an editor makes a code block from the board's tools, copies it and edits it in place (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device, "sam")
    const { page } = b

    if (device === "phone") {
      await b.press(page.getByRole("button", { name: "Board options" }))
      await b.press(page.getByRole("menuitem", { name: "Code block" }))
    } else await b.press(page.getByRole("button", { name: "Code block" }))
    const dialog = page.getByRole("dialog", { name: "Add a code block" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("textbox", { name: "Title" }).fill("greet.ts")
    await b.press(dialog.getByRole("combobox", { name: "Language" }))
    await b.press(page.getByRole("option", { name: "TypeScript", exact: true }))
    await dialog.getByRole("textbox", { name: "Code" }).fill("// says hi\nconst greet = (name: string) => `hi ${name}`\n\nexport default greet")
    await b.press(dialog.getByRole("button", { name: "Add code block" }))
    await expect(dialog).toBeHidden()

    // One code block on the shared board, keeping its code, language and title; drawn numbered and coloured.
    await expect
      .poll(() => b.blocks().map((e) => [e.customData?.title, e.customData?.language, e.customData?.code]), { timeout: 10_000 })
      .toEqual([["greet.ts", "typescript", "// says hi\nconst greet = (name: string) => `hi ${name}`\n\nexport default greet"]])
    const block = page.getByRole("group", { name: "Code: greet.ts" })
    await expect(block).toBeVisible({ timeout: 15_000 })
    await expect(block).toContainText("TypeScript")
    await expect(block.locator("[data-code-n]")).toHaveText(["1", "2", "3", "4"])
    await expect(block.locator(".hljs-keyword").first()).toHaveText("const")
    await expect(block.locator(".hljs-comment").first()).toHaveText("// says hi")
    const firstVersion = b.blocks()[0].version ?? 0

    // Its buttons work once it is in use: Copy puts its code on the clipboard.
    await b.use(block)
    await b.press(block.getByRole("button", { name: "Copy code" }))
    await expect(block.getByRole("button", { name: "Copied" })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("// says hi\nconst greet = (name: string) => `hi ${name}`\n\nexport default greet")

    // Edit opens the same dialog with the block as it stands; Save changes it in place.
    await b.press(block.getByRole("button", { name: "Edit code" }))
    const editing = page.getByRole("dialog", { name: "Edit code block" })
    await expect(editing).toBeVisible()
    await expect(editing.getByRole("textbox", { name: "Code" })).toHaveValue(/^\/\/ says hi/)
    await editing.getByRole("textbox", { name: "Code" }).fill("export const answer = 42")
    await b.press(editing.getByRole("button", { name: "Save" }))
    await expect(editing).toBeHidden()
    await expect.poll(() => b.blocks().map((e) => [e.customData?.code, e.customData?.language]), { timeout: 10_000 }).toEqual([["export const answer = 42", "typescript"]])
    expect(b.blocks()[0].version ?? 0).toBeGreaterThan(firstVersion)
    await expect.poll(() => lineTexts(page), { timeout: 10_000 }).toEqual(["export const answer = 42"])
    await b.context.close()
  })
}

test("someone who may only view a board reads and copies a code block, with no Edit and no Code block tool", async ({ browser }) => {
  test.setTimeout(120_000)
  const app = new URL(String(test.info().project.use.baseURL)).origin
  const seeded = {
    ...shape("k1", "embeddable", 320, 200, 420, 160),
    roundness: { type: 3 },
    link: `${app}/app/code-block`,
    customData: { kind: "code", code: "def add(a, b):\n    return a + b", language: "python", title: "add.py" },
  }
  const b = await open(browser, "computer", "vic", [seeded])
  const { page } = b
  const block = page.getByRole("group", { name: "Code: add.py" })
  await expect(block).toBeVisible({ timeout: 15_000 })
  await expect(block).toContainText("Python")
  expect(await lineTexts(page)).toEqual(["def add(a, b):", "    return a + b"])
  await expect(block.locator(".hljs-keyword").first()).toHaveText("def")
  await expect(page.getByRole("button", { name: "Code block" })).toHaveCount(0)

  await b.use(block)
  await expect(block.getByRole("button", { name: "Edit code" })).toHaveCount(0)
  await b.press(block.getByRole("button", { name: "Copy code" }))
  await expect(block.getByRole("button", { name: "Copied" })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("def add(a, b):\n    return a + b")
  await b.context.close()
})

// A share link's guest (GuestBoardViewer, the shared canvas's own drawing) reads a code block as a member does: its
// lines numbered and coloured, a copy button and no Edit. A block left on Auto colours by the guess on its first lines
// and keeps prose that no grammar knows as its text (V-564: it drew one empty line).
const GUEST_BOARD = "b0a4d000-0000-4000-8000-0000000000d8"
const GUEST_TOKEN = "guest-link-code"

for (const device of ["computer", "phone"] as const) {
  test(`a share link's guest reads and copies a board's code blocks, Auto ones too, with no Edit (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const app = new URL(String(test.info().project.use.baseURL)).origin
    const code = (id: string, y: number, height: number, customData: Record<string, unknown>) => ({
      ...shape(id, "embeddable", 20, y, 340, height),
      roundness: { type: 3 },
      link: `${app}/app/code-block`,
      customData: { kind: "code", ...customData },
    })
    const fn = "def total(lines):\n    return sum(l.price * l.qty for l in lines)\n\n"
    const long = `${fn.repeat(Math.ceil(6_000 / fn.length))}def tail_marker():\n    return None`
    const update = boardDoc([
      code("k1", 0, 120, { code: "def add(a, b):\n    return a + b", language: "python", title: "add.py" }),
      code("k2", 140, 100, { code: "Meeting notes\nbuy milk", language: null, title: "notes" }),
      code("k3", 260, 160, { code: long, language: null, title: "totals" }),
    ] as never)
    const name = boardDocName(GUEST_BOARD)
    const collab = collabFor([{ id: name, update, levels: { guest: "view" } }])
    const context = await browser.newContext(DEVICES[device])
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const session = { collab_token: "guest", document_name: name, resource_type: "board", resource_id: GUEST_BOARD, capability: "view", title: "Code review", workspace_name: "Acme" }
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab, fixtures: [[new RegExp(`/guest/collab/${GUEST_TOKEN}$`), { msg: "ok", data: session }]] })
    const page = await context.newPage()
    await page.goto(`/guest/b/${GUEST_TOKEN}`)
    await expect(page.locator('[data-guest-board][data-board-elements="3"]')).toBeAttached({ timeout: 30_000 })

    const named = page.getByRole("group", { name: "Code: add.py" })
    await expect(named).toBeVisible({ timeout: 15_000 })
    await expect(named).toContainText("Python")
    await expect.poll(() => named.locator("[data-code-text]").allTextContents()).toEqual(["def add(a, b):", "    return a + b"])
    await expect(named.locator(".hljs-keyword").first()).toHaveText("def")
    // Auto, and prose: its own text, uncoloured.
    const prose = page.getByRole("group", { name: "Code: notes" })
    await expect.poll(() => prose.locator("[data-code-text]").allTextContents()).toEqual(["Meeting notes", "buy milk"])
    await expect(prose.locator('[class*="hljs-"]')).toHaveCount(0)
    // Auto, and long: coloured to its last line.
    const totals = page.getByRole("group", { name: "Code: totals" })
    await expect(totals.locator(".hljs-title").filter({ hasText: /^tail_marker$/ })).toHaveCount(1, { timeout: 10_000 })
    // A guest edits nothing: no Edit, no tools.
    await expect(page.getByRole("button", { name: "Edit code" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Code block" })).toHaveCount(0)

    // A press on a block's middle lets its buttons work, as a card's does.
    const box = (await named.boundingBox())!
    if (device === "phone") await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const copy = named.getByRole("button", { name: "Copy code" })
    if (device === "phone") await copy.tap()
    else await copy.click()
    await expect(named.getByRole("button", { name: "Copied" })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("def add(a, b):\n    return a + b")
    await context.close()
  })
}
