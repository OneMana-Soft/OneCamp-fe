import { expect, test, type Locator, type Page, type Route } from "@playwright/test"

import { holdUntil } from "../sheetLayout"
import { docInfo, reviewShot, SHOT_THEMES, stubBackend } from "../stubbedApp"
import { CollabRelay, networkDies } from "./collabRelay"

// V-64b (S1, data loss): the doc editor draws some of its pieces with code
// fetched on first use: the "@" list, a block's view (a bookmark, a poll, an
// embed), the link bar, a fresh doc's template picker. With the network dead
// while the device still says it's online, that code can't come. A piece
// drawn through a plain React.lazy threw its failure to the page's error
// boundary: "Something broke on this page" took the doc's place, Try again
// threw again (React.lazy keeps the failure), and what was typed lived only in
// that page's memory.
//
// Each piece now waits for its code inside its own room: while the code can't
// come it says so there, calmly, and asks again when it's next used. The
// editor stays, every key stays, and the lines reach the relay once the
// network is back, at 1280 and on a phone.
//
// One test per piece, each on a fresh doc, so each piece's red and green
// shows on its own: a run stops at its first failure. The docs home, whose
// list comes the same way, has a test of its own. With SHOTS_DIR set, each
// calm state is saved for design review, in both themes.

const FRESH = "0b64b0b6-4b0b-4b64-8b64-b64b64b64b64"
const LINE = "Typed with the network gone."
const URL = "https://example.com/v64b"
const MENTION = "https://example.com/v64b-plan"
const OTHER = "0c64c0c6-4c0c-4c64-8c64-c64c64c64c64"
const DAY = "2026-11-03"
const TABLE = "0d64d0d6-4d0d-4d64-8d64-d64d64d64d64"
const AT = "2026-10-29T09:00:00.000Z"
/** A table's bundle as GET /tables/{id} answers it: one row in one text field. */
const TABLE_BUNDLE = {
  table: { id: TABLE, name: "Launch budget", visibility: "workspace", created_at: AT, updated_at: AT },
  fields: [{ id: "item", table_id: TABLE, name: "Item", type: "text", config: "{}", position: 0 }],
  views: [],
  rows: [{ id: "0e64e0e6-4e0e-4e64-8e64-e64e64e64e64", table_id: TABLE, values: JSON.stringify({ item: "Venue" }), position: 0, created_at: AT, updated_at: AT }],
  can_manage: false,
  mqtt_topic: "",
  row_count: 1,
}

/** What a piece whose code can't come says in its place (lib/lazy/pieceUnavailable). */
const unavailable = (what: string) => `Couldn't load ${what}. Check your connection, then try again.`

type Press = (target: Locator, at?: { x: number; y: number }) => Promise<void>

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 640

/** For design review (SHOTS_DIR): the page as the piece left it, in both themes. */
async function shots(page: Page, name: string) {
  if (!process.env.SHOTS_DIR) return
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/**
 * Only the app's own code stops coming, while its server still answers: what a
 * piece reads comes, the code it draws with doesn't (a file a weak network
 * drops). Given words, only the files that carry them stop, and the rest of
 * the page's code comes; a probe of a file that stopped fails too. Returns the
 * code's return.
 */
async function codeStopsComing(page: Page, carrying?: string) {
  const dead = new Set<string>()
  const drop = async (route: Route) => {
    const path = route.request().url().split("?")[0]
    if (!carrying || dead.has(path)) return route.abort("internetdisconnected")
    const response = await route.fetch()
    if (!(await response.text()).includes(carrying)) return route.fulfill({ response })
    dead.add(path)
    return route.abort("internetdisconnected")
  }
  await page.route("**/_next/static/**", drop)
  return () => page.unroute("**/_next/static/**", drop)
}

/** The doc is still there, in one piece, with what was typed: no crash page took its place. */
async function stillTheDoc(page: Page, body: Locator, typed: string[], why: string) {
  // Longer than a failed chunk takes to be asked about (no answer: at once; the probe's timeout: 4 s).
  await page.waitForTimeout(4_500)
  await expect(page.getByText("Something broke on this page"), `${why}: no crash page`).toHaveCount(0)
  await expect(body, `${why}: the editor is still there`).toBeVisible()
  for (const t of typed) await expect(body, `${why}: "${t}" is still in the doc`).toContainText(t)
}

/**
 * A line typed into the fresh doc, the caret put where a person types: on the
 * line itself. Its left gutter holds the block's handle, drawn on hover, and a
 * press there is the handle's.
 */
async function typeALine(page: Page, body: Locator, press: Press) {
  await press(body.locator("p").first())
  await page.keyboard.type(LINE, { delay: 20 })
  await expect(body).toContainText(LINE, { timeout: 10_000 })
}

/** Pastes HTML where the caret is, as the browser's paste event carries it. */
async function pasteHtml(body: Locator, html: string) {
  await body.evaluate((el, h) => {
    const data = new DataTransfer()
    data.setData("text/html", h)
    data.setData("text/plain", h.replace(/<[^>]+>/g, ""))
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, html)
}

/** The browser says it's back online: a piece that failed asks again. */
const online = (body: Locator) => body.page().evaluate(() => window.dispatchEvent(new Event("online")))

/** A link mention's room either side, its chip's and its plain link's (MENTION_ROOM, px-0.5): 2 px. */
const ROOM = 2

/**
 * How a link reads (its ink and underline) beside how the doc's link mark reads under the same rule (typography.css
 * a.link): one drawn next to the editor's lines, not in them, where the editor would take it for typing.
 */
const linkLook = (link: Locator) =>
  link.evaluate((a) => {
    const look = (el: Element) => {
      const s = getComputedStyle(el)
      return { ink: s.color, line: s.textDecorationLine, lineInk: s.textDecorationColor, offset: s.textUnderlineOffset }
    }
    const lines = document.createElement("div")
    lines.className = "ProseMirror"
    lines.innerHTML = '<a class="link" href="#">a link</a>'
    a.closest(".minimal-tiptap-editor")!.append(lines)
    const links = look(lines.firstElementChild!)
    lines.remove()
    return { mine: look(a), links }
  })

/** How far, in px, what a link mention draws first (its plain words, or its chip's icon) stands off the letter before it. */
const roomBefore = (first: Locator) =>
  first.evaluate((el) => {
    const letters = document.createTreeWalker(el.closest("p")!, NodeFilter.SHOW_TEXT)
    let before: Text | null = null
    for (let n = letters.nextNode(); n && !el.contains(n) && !(el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); n = letters.nextNode()) {
      if (n.textContent) before = n as Text
    }
    const at = document.createRange()
    at.setStart(before!, before!.length - 1)
    at.setEnd(before!, before!.length)
    const end = at.getBoundingClientRect().right
    if (el.firstChild?.nodeType !== Node.TEXT_NODE) return el.getBoundingClientRect().left - end
    at.setStart(el.firstChild, 0)
    at.setEnd(el.firstChild, 1)
    return at.getBoundingClientRect().left - end
  })

/**
 * Each piece used for the first time with the network dead (use: what it typed, to be found at the relay once the
 * network is back), and what it does once the network is back (back).
 */
const PIECES: {
  name: string
  /** Only the app's code stops coming, not the network: what the piece reads still comes. */
  dies?: "code"
  use: (page: Page, body: Locator, press: Press) => Promise<string[]>
  back?: (body: Locator, press: Press) => Promise<void>
}[] = [
  {
    name: "the template picker",
    use: async (page, body, press) => {
      await press(page.getByRole("button", { name: "More templates…" }))
      // An overlay that can't open says so in a toast, which goes in 6 s: seen (and shot) first.
      await expect(page.getByText("Couldn't open templates").first(), "the template picker: says it couldn't open").toBeVisible()
      await shots(page, "v64b-template-toast")
      await stillTheDoc(page, body, [], "the template picker")
      await typeALine(page, body, press)
      return [LINE]
    },
  },
  {
    name: "the @ list",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.type(" @sa", { delay: 40 })
      await stillTheDoc(page, body, [LINE], "the @ list")
      // The list says so in its own place (a phone's sheet), with a way to ask again.
      const failed = page.locator("[data-load-failed-row]").filter({ hasText: unavailable("the list") })
      await expect(failed, "the @ list: says so in its place").toBeVisible()
      await expect(failed.getByRole("button", { name: "Try again" })).toBeVisible()
      await shots(page, "v64b-mention-row")
      await page.keyboard.press("Escape")
      return [LINE]
    },
  },
  {
    name: "a bookmark's block",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.press("End")
      await page.keyboard.press("Enter")
      await page.keyboard.type("/bookmark", { delay: 40 })
      await expect(page.locator("[data-slash-menu]").getByRole("option", { name: /^Bookmark/ })).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press("Enter")
      await stillTheDoc(page, body, [LINE], "a bookmark's block")
      // The block says so in its own place, in the shared failed row, with a way to ask again.
      const failed = body.locator("[data-node-unavailable]")
      await expect(failed, "a bookmark's block: says so in its place").toBeVisible()
      await expect(failed).toContainText(unavailable("this block"))
      await expect(failed.getByRole("button", { name: "Try again" })).toBeVisible()
      await shots(page, "v64b-bookmark-row")
      return [LINE]
    },
    // Asked again (the device never went offline, so no 'online' event comes), it draws once its code comes.
    back: async (body, press) => {
      const failed = body.locator("[data-node-unavailable]")
      await press(failed.getByRole("button", { name: "Try again" }))
      await expect(body.locator("[data-bookmark]"), "a bookmark's block: drawn once its code comes").toBeVisible({ timeout: 15_000 })
      await expect(failed).toHaveCount(0)
    },
  },
  {
    name: "a link mention",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.press("End")
      await pasteHtml(body, ` <a data-type="link-mention" href="${MENTION}" data-title="The plan">The plan</a> `)
      await stillTheDoc(page, body, [LINE], "a link mention")
      // Its chip's code can't come: the link it stands for, inline and still working, takes its place.
      const plain = body.locator(`a[href="${MENTION}"]`)
      await expect(plain, "a link mention: the plain link").toBeVisible()
      await expect(plain).toHaveText("The plan")
      await expect(plain).toHaveAttribute("target", "_blank")
      await expect(body.locator("[data-link-mention]")).toHaveCount(0)
      // It reads as the doc's other links do, and stands off the word before it by the chip's own room.
      const look = await linkLook(plain)
      expect(look.mine, "a link mention: the plain link reads as the doc's links").toEqual(look.links)
      expect(look.mine.line, "a link mention: the plain link is underlined").toBe("underline")
      expect(await roomBefore(plain), "a link mention: the plain link keeps the chip's room").toBeCloseTo(ROOM, 0)
      await shots(page, "v64b-link-mention-plain")
      return [LINE, MENTION]
    },
    back: async (body) => {
      await online(body)
      const chip = body.locator("[data-link-mention] a")
      await expect(chip, "a link mention: the chip once back").toBeVisible({ timeout: 15_000 })
      // The chip takes the room the plain link kept: the words before it stay where they were.
      expect(await roomBefore(chip.locator("> span").first()), "a link mention: the chip's room is the plain link's").toBeCloseTo(ROOM, 0)
    },
  },
  {
    name: "a reference chip",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.press("End")
      await pasteHtml(body, ` <span data-type="entityMention" data-id="doc:${OTHER}" data-label="Roadmap">@Roadmap</span> `)
      await stillTheDoc(page, body, [LINE], "a reference chip")
      // The live chip's code can't come: the plain chip, its label in the reference's ink, still opens it.
      const plain = body.locator('[role="link"][data-label="Roadmap"]')
      await expect(plain, "a reference chip: the plain chip").toBeVisible()
      await expect(plain).toContainText("Roadmap")
      await expect(body.locator("[data-entity-chip]")).toHaveCount(0)
      await shots(page, "v64b-reference-plain")
      return [LINE, OTHER]
    },
    back: async (body) => {
      await online(body)
      await expect(body.locator('[data-entity-chip="doc"]'), "a reference chip: the live chip once back").toBeVisible({ timeout: 15_000 })
    },
  },
  {
    name: "the link bar",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.press("End")
      await page.keyboard.press("Enter")
      await page.keyboard.type(`${URL} `, { delay: 20 })
      await expect(body.locator(`a[href^="${URL}"]`)).toBeVisible({ timeout: 10_000 })
      await press(body.locator(`a[href^="${URL}"]`), { x: 12, y: 6 })
      await stillTheDoc(page, body, [LINE, URL], "the link bar")
      return [LINE, URL]
    },
  },
  {
    name: "the block menu",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      const toast = page.getByText("Couldn't open block options").first()
      // A computer opens it with ⌘/ (as the handle's ⋮⋮ does), a phone with a long-press on the block.
      if (onPhone(page)) await holdUntil(page, body.locator("p").first(), toast)
      else await page.keyboard.press("Control+/")
      await expect(toast, "the block menu: says it couldn't open").toBeVisible()
      // The keys go back to the doc on a computer.
      if (!onPhone(page)) await expect(body).toBeFocused()
      await shots(page, "v64b-block-menu-toast")
      await stillTheDoc(page, body, [LINE], "the block menu")
      return [LINE]
    },
  },
  {
    name: "a date's picker",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.press("End")
      await pasteHtml(body, ` <time data-type="date-mention" datetime="${DAY}">${DAY}</time> `)
      const chip = body.locator("[data-date-chip]")
      await expect(chip, "a date's picker: the date is in the doc").toBeVisible()
      await press(chip)
      await expect(page.getByText("Couldn't open the date picker").first(), "a date's picker: says it couldn't open").toBeVisible()
      await shots(page, "v64b-date-toast")
      await stillTheDoc(page, body, [LINE], "a date's picker")
      await expect(chip).toBeVisible()
      return [LINE, DAY]
    },
  },
  {
    name: "a table embed's grid",
    dies: "code",
    use: async (page, body, press) => {
      await typeALine(page, body, press)
      await page.keyboard.press("End")
      await pasteHtml(body, `<div data-type="table-embed" data-table-id="${TABLE}"></div>`)
      await stillTheDoc(page, body, [LINE], "a table embed's grid")
      // Its rows came; the grid's code can't: the embed says so in its place, under the table's name, with a way to ask again.
      const failed = body.locator("[data-load-failed-row]").filter({ hasText: unavailable("this table") })
      await expect(failed, "a table embed's grid: says so in its place").toBeVisible()
      await expect(failed.getByRole("button", { name: "Try again" })).toBeVisible()
      await expect(body.getByText("Launch budget")).toBeVisible()
      await shots(page, "v64b-table-embed-row")
      return [LINE, TABLE]
    },
    back: async (body, press) => {
      const failed = body.locator("[data-load-failed-row]")
      await press(failed.getByRole("button", { name: "Try again" }))
      await expect(body.locator("[data-table-grid]"), "a table embed's grid: drawn once its code comes").toContainText("Venue", { timeout: 15_000 })
      await expect(failed).toHaveCount(0)
    },
  },
]

for (const [form, use] of [
  ["computer", { viewport: { width: 1280, height: 900 } }],
  ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`a fresh doc's pieces used for the first time with the network dead (${form})`, () => {
    test.use(use)

    for (const piece of PIECES) {
      test(`${piece.name} keeps the doc, and what was typed reaches the relay once the network is back`, async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        const relay = new CollabRelay()
        await stubBackend(page, testInfo, {
          [`/doc/getDocInfo/${FRESH}`]: docInfo({ doc_uuid: FRESH, doc_title: "Fresh", doc_body: "", edit: true }),
          [`/tables/${TABLE}`]: { msg: "ok", data: TABLE_BUNDLE },
          "/auth/token": { data: { token: "e2e-sam" } },
        })
        await relay.attach(page, "Sam")
        await page.goto(`/app/doc/${FRESH}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
        const body = page.getByRole("textbox", { name: "Fresh" })
        await expect(body).toBeVisible({ timeout: 30_000 })
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
        await expect.poll(() => relay.received.some((m) => m.doc.includes(FRESH) && m.type === 0), { timeout: 30_000 }).toBe(true)

        let navigations = 0
        page.on("framenavigated", (f) => {
          if (f === page.mainFrame()) navigations++
        })
        const networkReturns = piece.dies === "code" ? await codeStopsComing(page) : await networkDies(page, relay)
        expect(await page.evaluate(() => navigator.onLine), "the device still says it is online").toBe(true)
        const press: Press = async (target, at) => {
          const position = at ? { position: at } : undefined
          if (form === "phone") await target.tap(position)
          else await target.click(position)
        }

        const typed = await piece.use(page, body, press)
        expect(navigations, "the page never reloaded").toBe(0)

        await networkReturns()
        const sent = () => [...relay.docs.values()].map((d) => d.getXmlFragment("default").toString()).join("\n")
        for (const t of typed) await expect.poll(sent, { timeout: 60_000 }).toContain(t)
        // What was typed is still on the page too (a link's address or a chip's id is in the doc, not its text).
        await expect(body).toContainText(LINE)
        await piece.back?.(body, press)
        expect(navigations).toBe(0)
      })
    }
  })

  test.describe(`the docs home with its list's code not coming (${form})`, () => {
    test.use(use)

    test("says the list couldn't load in the list's place, and draws it once asked again", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await stubBackend(page, testInfo, {
        "/doc/list": { msg: "ok", data: { scope: "recent", count: 0, docs: [] } },
        "/auth/token": { data: { token: "e2e-sam" } },
      })
      // The list comes with code of its own, asked for as the page draws (the words only it says mark that file):
      // that one file never comes, while the rest of the page's code does.
      const codeReturns = await codeStopsComing(page, "Pages didn't open")
      let loads = 0
      page.on("domcontentloaded", () => loads++)
      await page.goto("/app/doc", { waitUntil: "domcontentloaded", timeout: 60_000 })
      const failed = page.getByText("Couldn't load your docs")
      await expect(failed, "the docs home: says so in the list's place").toBeVisible({ timeout: 30_000 })
      await expect(page.getByText("Check your connection, then try again.")).toBeVisible()
      await expect(page.getByText("Something broke on this page")).toHaveCount(0)
      await expect(page.getByLabel("Search docs")).toHaveCount(0)
      await shots(page, "v64b-docs-home-error")
      await codeReturns()
      const retry = page.getByRole("button", { name: "Try again" })
      if (onPhone(page)) await retry.tap()
      else await retry.click()
      // The list's search came with it: two controls carry its name, of which a phone shows one; neither was there before.
      await expect(page.getByLabel("Search docs").filter({ visible: true }).first(), "the docs home: the list once its code comes").toBeVisible({ timeout: 15_000 })
      await expect(failed).toHaveCount(0)
      expect(loads, "the page never reloaded").toBe(1)
    })
  })
}
