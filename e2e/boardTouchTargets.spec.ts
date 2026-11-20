import { expect, test, type Locator, type Page } from "@playwright/test"
import { frame, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"
import { openBoard, type OpenBoard } from "./boardOpen"
import { boxOf, overlap, type Box } from "./boxes"
import { missed, settle } from "./touchTarget"

// EVERY CONTROL ON A BOARD TAKES A FINGER (V-1106, design-22 "Whiteboard against Miro"). On a phone with touch, a
// finger 21 px out from a control's centre on any side still lands on it: the facilitation bar's Facilitation
// options, Find and replace's fields, toggles and steps, and the Library's buttons.
// (Version history, Share, Templates and Viewed by are held to the same probe in boardPhoneBar.spec.ts.) A mouse
// keeps today's sizes: nothing grows at 1280. And on an empty board a comment's thread stands over the "Start with
// a template" card (V-1107). And every other sheet and bar a finger meets on a board (V-1175): the notes bar's More
// (Excalidraw's font buttons) and Tags (its field), the Frames sheet's grips, Share,
// Layers, Save as template and a new comment, each control scrolled to first, as a finger scrolls a sheet to it.
const PHONE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2, viewport: { width: 390, height: 844 } }
// A native radio or checkbox is drawn by its label (Excalidraw's own take no pointer), so the label is what a finger
// meets; a disabled control takes no tap (a lone layer's Hide and Move), so it isn't held to one.
const CONTROLS =
  ":is(button, input:not([type=radio], [type=checkbox]), select, textarea, a[href], [role=switch], [role=combobox], [role=tab], [role=checkbox], label:has(> input:is([type=radio], [type=checkbox]))):not(:disabled)"
const DRAWER = '[data-vaul-drawer][data-state="open"]'
/** Two frames round the notes and the box, so the Frames sheet has rows to reorder. */
const FRAMED = () =>
  ordered([
    frame("ideas", "Ideas", [{ x: 40, y: 140, width: 340, height: 180 }]),
    frame("plan", "Plan", [{ x: 60, y: 420, width: 160, height: 100 }]),
    ...note("venue", 40, 140, "Book the venue"),
    ...note("recap", 200, 140, "Send the recap"),
    shape("box", "rectangle", 60, 420, 160, 100),
  ])

/** Board options' item, from the phone's cluster (a tap) or the computer's toolbar's More (a click). */
async function boardMenu(page: Page, item: string, phone: boolean) {
  if (phone) await page.locator("[data-board-phone-actions]").getByRole("button", { name: "Board options" }).tap()
  else await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
  const entry = page.getByRole("menuitem", { name: item, exact: true })
  await (phone ? entry.tap() : entry.click())
}

/** Find and replace, open with a match ("Book" finds "Book the venue") and a replacement, so its steps are live. */
async function findWithMatch(page: Page, phone: boolean) {
  await boardMenu(page, "Find and replace", phone)
  const find = page.getByRole("textbox", { name: "Find on board" })
  await find.fill("Book")
  await page.getByRole("textbox", { name: "Replace with" }).fill("Hire")
  await expect(page.getByRole("button", { name: "Next match" })).toBeEnabled()
  return find
}

/** The board's Library (Excalidraw's sidebar on its library tab). */
async function library(page: Page, phone: boolean) {
  await boardMenu(page, "Library", phone)
  const sheet = page.locator(".excalidraw .default-sidebar")
  await expect(sheet.getByText("Browse libraries")).toBeVisible()
  return sheet
}

/** A tap on a note: the notes bar comes up beside it. */
async function notesBar(page: Page, canvas: Box) {
  await page.touchscreen.tap(canvas.x + 120, canvas.y + 200)
  const bar = page.locator("[data-notes-bar]")
  await expect(bar).toBeVisible()
  return bar
}

/** Where a computer's click lands on the first note (the canvas's 120, 200, as a phone's tap). */
async function noteAt(page: Page): Promise<[number, number]> {
  const c = await boxOf(page.locator(".excalidraw").first())
  return [c.x + 120, c.y + 200]
}

/** The rest of the board's sheets (V-1175): how a finger opens each, and the sheet it opens. */
const SHEETS: [string, (page: Page, canvas: Box) => Promise<Locator>, OpenBoard?][] = [
  ["the notes bar's More, Excalidraw's font buttons too", async (page, canvas) => {
    await (await notesBar(page, canvas)).getByRole("button", { name: /^More/ }).tap()
    return page.locator(".App-bottom-bar > .Island").filter({ has: page.locator(".App-mobile-menu") })
  }],
  ["the notes bar's Tags, its Add a tag field too", async (page, canvas) => {
    await (await notesBar(page, canvas)).getByRole("button", { name: "Tags", exact: true }).tap()
    return page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: "Add a tag" }) })
  }],
  ["the Frames sheet, its rows' grips too", async (page) => {
    await boardMenu(page, "Frames", true)
    return page.locator("[data-frames-panel][data-v3-sheet]")
  }, { elements: FRAMED() }],
  ["Share, its switches, Copy link and Done too", async (page) => {
    await page.locator("[data-board-phone-actions]").getByRole("button", { name: "Share board" }).tap()
    const share = page.getByRole("dialog", { name: /Share/ })
    await expect(share.getByLabel("Add people", { exact: true })).toBeVisible()
    return share
  }],
  ["the Layers sheet's rows, two layers so each row's controls are live", async (page) => {
    await boardMenu(page, "Layers", true)
    const sheet = page.getByRole("dialog", { name: "Layers" })
    await sheet.getByRole("button", { name: "New layer" }).tap()
    await page.keyboard.press("Enter")
    await expect(sheet.getByRole("button", { name: /^Move .+ (up|down)$/ }).nth(3)).toBeVisible()
    return sheet
  }],
  ["Save as template", async (page) => {
    await boardMenu(page, "Save as template", true)
    const sheet = page.getByRole("dialog").filter({ has: page.getByLabel("Template name") })
    await sheet.getByLabel("Template name").fill("Launch")
    return sheet
  }],
  ["a new comment", async (page, canvas) => {
    await page.getByRole("button", { name: "Add a comment" }).tap()
    await page.touchscreen.tap(canvas.x + 280, canvas.y + 120)
    const composer = page.locator(`${DRAWER}[data-board-comment]`)
    await composer.getByRole("textbox").fill("Bring the banners")
    return composer
  }],
]

/** The box of `control`, rounded, as "WxH". */
async function size(control: Locator) {
  const b = await boxOf(control)
  return `${Math.round(b.width)}x${Math.round(b.height)}`
}

test.describe("on a phone, 390x844 with touch", () => {
  test.use(PHONE)

  test("the facilitation bar's every control takes a finger, Facilitation options too", async ({ page }) => {
    await openBoard(page, { voting: true })
    const bar = page.getByRole("toolbar", { name: "Facilitation" })
    await expect(bar.getByRole("button", { name: "Facilitation options" })).toBeVisible()
    await settle(bar)
    expect(await missed(bar, CONTROLS), "the facilitation bar").toEqual([])
  })

  test("Find and replace's fields, toggles and steps each take a finger", async ({ page }) => {
    await openBoard(page)
    await findWithMatch(page, true)
    const sheet = page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: "Find on board" }) })
    await settle(sheet)
    expect(await missed(sheet, CONTROLS), "Find and replace").toEqual([])
  })

  test("the Library's buttons take a finger", async ({ page }) => {
    await openBoard(page)
    const sheet = await library(page, true)
    await settle(sheet)
    expect(await missed(sheet, CONTROLS, { scroll: true }), "the Library").toEqual([])
  })

  for (const [what, open, board] of SHEETS) {
    test(`${what}: every control takes a finger`, async ({ page }) => {
      const canvas = await openBoard(page, board)
      const sheet = await open(page, canvas)
      await expect(sheet).toBeVisible()
      await settle(sheet)
      expect(await missed(sheet, CONTROLS, { scroll: true }), what).toEqual([])
    })
  }
})

test.describe("on a computer, 1280 with a mouse", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // A mouse keeps today's sizes: what a finger grows to (44, app/phone.css F3d and the Library's rule) is a phone's
  // alone. (At 1280 the facilitation bar draws no Facilitation options; its segment icons share F3d's rule with Find's.)
  const FINE: [string, (page: Page) => Promise<string[]>][] = [
    ["Find and replace", async (page) => {
      const find = await findWithMatch(page, false)
      const sizes = [`field ${Math.round((await boxOf(find)).height)}`]
      for (const name of ["Match case", "Whole word", "Previous match", "Next match"]) sizes.push(await size(page.getByRole("button", { name, exact: true })))
      return sizes
    }],
    ["the Library", async (page) => [`browse ${Math.round((await boxOf((await library(page, false)).getByText("Browse libraries"))).height)}`]],
    ["the notes bar's fonts and Tags", async (page) => {
      await page.mouse.click(...(await noteAt(page)))
      const bar = page.locator("[data-notes-bar]")
      await bar.getByRole("button", { name: /^More/ }).click()
      const sizes = [await size(page.getByRole("button", { name: "Hand-drawn" }))]
      await bar.getByRole("button", { name: "Tags", exact: true }).click()
      return [...sizes, `tag field ${Math.round((await boxOf(page.getByRole("textbox", { name: "Add a tag" }))).height)}`]
    }],
    ["the Frames sheet's grips", async (page) => {
      await page.getByRole("button", { name: "Frames", exact: true }).click()
      return [await size(page.getByRole("button", { name: /^Move Ideas/ }))]
    }],
  ]
  const TODAY: Record<string, string[]> = {
    "Find and replace": ["field 32", "28x28", "28x28", "28x28", "28x28"],
    "the Library": ["browse 36"],
    "the notes bar's fonts and Tags": ["32x32", "tag field 20"],
    "the Frames sheet's grips": ["20x32"],
  }
  for (const [what, measure] of FINE) {
    test(`${what} keeps its sizes`, async ({ page }) => {
      await openBoard(page, what.includes("Frames") ? { elements: FRAMED() } : {})
      expect(await measure(page), `${what} under a mouse`).toEqual(TODAY[what])
    })
  }

  test("on an empty board a comment's thread stands over the template card (V-1107)", async ({ page }) => {
    const body = "Can the launch move a week?"
    const message = { id: "m1", authorId: "guest-g9", authorName: "Guest: Priya", body, createdAt: Date.now() }
    await openBoard(page, { elements: [], comments: [{ id: "p1", x: 420, y: 300, resolved: false, createdAt: Date.now(), authorId: "guest-g9", authorName: "Guest: Priya", messages: [message] }] })
    const card = page.locator("[data-empty-canvas]")
    await expect(card.getByText("Start with a template")).toBeVisible()
    await page.getByRole("button", { name: "Comment by Guest: Priya" }).click()
    const thread = page.locator("div.content-float").filter({ hasText: body })
    await expect(thread).toBeVisible()
    await settle(thread)
    const [t, c] = [await boxOf(thread), await boxOf(card)]
    expect(overlap(t, c), `the thread lies over the card: ${JSON.stringify({ t, c })}`).not.toBeNull()
    const onTop = await thread.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && el.contains(hit)
    })
    expect(onTop, "the thread's middle is the thread's, not the card's").toBe(true)
    // and at rest it is whole: no card shows through it (the walk's frame caught its 180 ms fade-in, content-float)
    const surface = await thread.evaluate((el) => `${getComputedStyle(el).opacity} ${getComputedStyle(el).backgroundColor}`)
    expect(surface, "an opaque thread").toMatch(/^1 rgb\(/)
  })
})
