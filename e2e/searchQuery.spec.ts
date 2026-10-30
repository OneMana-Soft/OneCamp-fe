import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { radioChecks } from "./menuReach"
import { SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// The search page on the one grammar (docs C2-1), in a real browser with
// every request answered here: the count line and each kind's chip from the
// server's totals, the filter chips writing their modifier into the text and
// taking it out, the server's notes, Show more sending the page's own cursor
// for the same search, and a failed search's Try again; on a computer and on
// a phone with touch, in both themes when SHOTS_DIR is set.

const id = (n: number) => `${n.toString(16).padStart(8, "0")}-6b7c-4d8e-9f0a-1b2c3d4e5f60`
const docHit = (n: number) => ({ type: "doc", doc: { doc_uuid: id(n), doc_title: `Budget review ${n}`, created_date: 1791614952 - n } })
const taskHit = { type: "task", task: { task_id: id(50), task_name: "Close the budget", task_status: "todo", task_project_id: id(60), task_project_name: "Q4 launch", created_date: 1791614952 } }
// An event as the server finds it (gcal-13): a weekly meeting, 29 Oct 09:00-09:30 UTC, found by its notes.
const eventHit = {
  type: "event",
  event: { event_uuid: id(70), event_title: "Design review", event_location: "Room 4", event_repeats: true, event_start: 1793264400, event_end: 1793266200, event_calendar_id: id(71), created_date: 1791614952 },
  highlight: { event_notes: ["Bring the <mark>budget</mark> mocks"] },
}

type Sent = { q: string; kinds?: string[]; sort?: string; after?: string }

function answer(sent: Sent[]) {
  return (_url: URL, request: { postDataJSON(): unknown }) => {
    const body = request.postDataJSON() as Sent
    sent.push(body)
    const later = body.after === "page-2"
    // A chip's kinds are a search of their own, as the server answers one: the Docs chip gets docs only.
    const docsOnly = !!body.kinds?.length && !body.kinds.includes("task")
    const first = docsOnly ? [docHit(1), docHit(2), docHit(3)] : [docHit(1), docHit(2), taskHit]
    const rest = docsOnly ? [docHit(4), docHit(5)] : [docHit(3), docHit(4), docHit(5)]
    return {
      data: {
        page: later ? rest : first,
        totals: { doc: 5, task: 1 },
        total: 6,
        has_more: !later,
        next: later ? undefined : "page-2",
        // As the server says it: files left out only of a search with a date in it.
        notes: /\b(on|during|before|after):/.test(body.q)
          ? [{ code: "unfiltered", span: [0, 0], level: "note", message: "Files can't be filtered by date yet, so they're left out." }]
          : [],
        query: { runs: true, issues: [], text: body.q },
      },
    }
  }
}

const NO_ONE = { data: { query: "budget", considered: 0, you_hidden: false, people: [] } }

async function open(page: Page, testInfo: TestInfo, search: unknown, whoKnows: unknown = NO_ONE, query = "budget") {
  await stubBackend(page, testInfo, {
    "/query/search": search,
    "/people/who-knows/me": { data: { listed: true } },
    "/people/who-knows": whoKnows,
  })
  await page.goto(`/app/search?query=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const results = (page: Page) => page.locator("[data-search-results]")

const knower = (n: number, name: string) => ({
  id: id(n), name, score: 9 - n, wrote: 2, created: 0, posted: 0, assigned: 1, commented: 1,
  evidence: [{ kind: "doc", id: id(1), title: "Budget review 1", role: "wrote" }],
})
const KNOWERS = [knower(1, "Maya Chen"), knower(2, "Priya Nair"), knower(3, "Leo Grant")]

for (const theme of SHOT_THEMES) {
  for (const s of [
    { name: "a computer", viewport: { width: 1280, height: 860 }, touch: false },
    { name: "a phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    test.describe(`the grammar's search page on ${s.name}, ${theme}`, () => {
      test.use({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } })
      const press = async (page: Page, target: ReturnType<Page["locator"]>) => (s.touch ? target.tap() : target.click())

      test("counts from the server, kind chips, and Show more on the same search", async ({ page }, testInfo) => {
        const sent: Sent[] = []
        await open(page, testInfo, answer(sent), NO_ONE, "budget after:2026-10-01")
        // The count names the words alone, on one line at either width: the date is a chip of its own.
        await expect(page.locator("[data-search-count]")).toHaveText("6 results for “budget”", { timeout: 30_000 })
        expect((await page.locator("[data-search-count]").boundingBox())!.height).toBeLessThanOrEqual(24)
        const chips = page.getByRole("tablist", { name: "Show results from" })
        await expect(chips.getByRole("tab", { name: /Docs\s*5/ })).toBeVisible()
        await expect(chips.getByRole("tab", { name: /Tasks\s*1/ })).toBeVisible()
        await expect(page.locator("[data-search-notes]")).toContainText("Files can't be filtered by date yet")
        await expect(page.locator("[data-query-filters]").getByRole("button", { name: /^Remove / })).toHaveCount(1)
        await expect(page.locator("[data-query-filters]").locator("[data-query-filter]")).toHaveCount(2)
        await reviewShot(page, "search-query", theme)

        await press(page, page.getByRole("button", { name: "Show more" }))
        await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0)
        const more = sent.find((b) => b.after === "page-2")
        expect(more, "Show more sent the page's cursor").toBeTruthy()
        expect({ q: more?.q, kinds: more?.kinds ?? [], sort: more?.sort ?? "best" }).toEqual({ q: sent[0].q, kinds: sent[0].kinds ?? [], sort: sent[0].sort ?? "best" })
        // All shows three of each kind. The docs' Show all is the Docs chip: a search of its own,
        // from its first page (a cursor belongs to the search it came from), with its own Show more.
        await press(page, results(page).getByRole("button", { name: "Show all 5 docs" }))
        await expect(chips.getByRole("tab", { name: /Docs\s*5/ })).toHaveAttribute("aria-selected", "true")
        await expect(results(page).getByText("Budget review 3")).toBeVisible()
        const docs = sent.find((b) => !!b.kinds?.length && !b.kinds.includes("task"))
        expect(docs?.after, "the Docs chip starts from its first page").toBeUndefined()
        await press(page, page.getByRole("button", { name: "Show more" }))
        await expect(results(page).getByText("Budget review 5")).toBeVisible()
        const docsMore = sent.find((b) => b.after === "page-2" && !!b.kinds?.length)
        expect(docsMore?.kinds, "the Docs chip's Show more keeps its kinds").toEqual(docs?.kinds)
        await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0)
        await reviewShot(page, "search-query-more", theme)
      })

      // The shared radio item (meet-18) where a phone has a radio menu: the
      // chosen order carries the app's one check, and a tap or a click sends another.
      test("the sort menu marks the chosen order with the app's check, and another is sent", async ({ page }, testInfo) => {
        const sent: Sent[] = []
        await open(page, testInfo, answer(sent))
        await expect(page.locator("[data-search-count]")).toBeVisible({ timeout: 30_000 })
        await press(page, page.getByRole("button", { name: "sorted by best match" }))
        const menu = page.getByRole("menu")
        await radioChecks(menu)
        await reviewShot(page, "search-sort-menu", theme)
        await press(page, menu.getByRole("menuitemradio", { name: "Newest" }))
        await expect.poll(() => sent.at(-1)?.sort).toBe("newest")
        await expect(page.getByRole("button", { name: "sorted by newest" })).toBeVisible()
      })

      // gcal-13: an event the reader may open is found like anything else: the
      // Events chip with the server's count, a row that leads with the calendar
      // glyph and says it repeats, when and where, the passage of its notes it
      // matched in, and a link to the event's own page. The chip is a search
      // of events alone.
      test("an event is found: its chip, its row and its link to the event", async ({ page }, testInfo) => {
        const sent: Sent[] = []
        await open(page, testInfo, (_url: URL, request: { postDataJSON(): unknown }) => {
          const body = request.postDataJSON() as Sent
          sent.push(body)
          const eventsOnly = !!body.kinds?.length
          return {
            data: {
              page: eventsOnly ? [eventHit] : [docHit(1), eventHit],
              totals: eventsOnly ? { event: 1 } : { doc: 1, event: 1 },
              total: eventsOnly ? 1 : 2,
              has_more: false,
              notes: [],
              query: { runs: true, issues: [], text: body.q },
            },
          }
        })
        await expect(page.locator("[data-search-count]")).toHaveText("2 results for “budget”", { timeout: 30_000 })
        const chips = page.getByRole("tablist", { name: "Show results from" })
        await expect(chips.getByRole("tab", { name: /Events\s*1/ })).toBeVisible()
        const row = results(page).locator("[data-search-row=event]")
        await expect(row).toHaveCount(1)
        await expect(row.locator("[data-search-lead=event] svg")).toBeVisible()
        await expect(row).toContainText(/Repeating event · \w{3} \d{1,2} \w{3}, .+ · Room 4/)
        await expect(row.locator("[data-search-snippet] mark")).toHaveText("budget")
        await expect(row.getByRole("link", { name: "Design review" })).toHaveAttribute("href", `/app/calendar/event/${id(70)}`)
        await reviewShot(page, "search-event", theme)
        await press(page, chips.getByRole("tab", { name: /Events\s*1/ }))
        await expect.poll(() => sent.at(-1)?.kinds).toEqual(["event"])
        await expect(chips.getByRole("tab", { name: /Events\s*1/ })).toHaveAttribute("aria-selected", "true")
        await expect(results(page).locator("[data-search-row]")).toHaveCount(1)
        await reviewShot(page, "search-event-chip", theme)
      })

      test("a date filter is written into the search and taken out again", async ({ page }, testInfo) => {
        const sent: Sent[] = []
        await open(page, testInfo, answer(sent))
        await expect(page.locator("[data-search-count]")).toBeVisible({ timeout: 30_000 })
        await press(page, page.locator("[data-query-filter=date]"))
        await press(page, page.getByRole("option", { name: "Past 7 days" }))
        await expect(page.getByRole("searchbox", { name: "Search" }).or(page.getByRole("textbox", { name: "Search" }))).toHaveValue("budget during:past_7_days")
        await expect.poll(() => sent.at(-1)?.q).toBe("budget during:past_7_days")
        const remove = page.locator("[data-query-filters]").getByRole("button", { name: /^Remove / })
        await expect(remove).toHaveCount(1)
        await expect(page.locator("[data-query-filter=date]")).toHaveCount(0)
        await reviewShot(page, "search-query-filter", theme)
        await press(page, remove)
        // Back to the first search: its answer is the one already held, so nothing is sent again.
        await expect(page.getByRole("searchbox", { name: "Search" }).or(page.getByRole("textbox", { name: "Search" }))).toHaveValue("budget")
        await expect(page.locator("[data-search-count]")).toHaveText("6 results for “budget”")
        await expect(page.locator("[data-query-filter=date]")).toBeVisible()
      })

      // Who knows arrives after the results: its slot is held from the first
      // frame, so the first result stays where it was drawn, and whatever it
      // says fits the slot: three people, no one yet, the note that you're
      // hidden over two people, or a failure in one row with Try again in
      // view (DESIGN-BUILD-16, main, 25 Oct).
      const states: { said: string; shot: string; answer?: { you_hidden: boolean; people: unknown[] }; shows: (strip: Locator) => Promise<void> }[] = [
        { said: "three people", shot: "people", answer: { you_hidden: false, people: KNOWERS }, shows: (strip) => expect(strip.locator("[data-who-knows-person]")).toHaveCount(3) },
        { said: "no one yet", shot: "no-one", answer: { you_hidden: false, people: [] }, shows: (strip) => expect(strip.getByText(/No one yet/)).toBeVisible() },
        {
          said: "you're hidden, over two people",
          shot: "hidden",
          answer: { you_hidden: true, people: KNOWERS },
          shows: async (strip) => {
            await expect(strip.getByText(/You're hidden from Who knows/)).toBeVisible()
            await expect(strip.locator("[data-who-knows-person]")).toHaveCount(2)
          },
        },
        { said: "a failure", shot: "failed", shows: (strip) => expect(strip.getByRole("button", { name: /Try again/ })).toBeInViewport({ ratio: 1 }) },
      ]
      for (const who of states) {
        test(`the first result doesn't move when Who knows fills in (${who.said})`, async ({ page }, testInfo) => {
          let release: () => void = () => {}
          const held = new Promise<void>((r) => (release = r))
          await open(page, testInfo, answer([]), async (url: URL) => {
            await held
            return who.answer ? { data: { query: url.searchParams.get("q"), considered: 9, ...who.answer } } : withStatus(503, { msg: "down" })
          })
          const first = results(page).getByRole("link", { name: "Budget review 1" })
          await expect(first).toBeVisible({ timeout: 30_000 })
          const before = (await first.boundingBox())!.y
          release()
          const strip = page.locator("[data-who-knows-strip]")
          await who.shows(strip)
          expect((await first.boundingBox())!.y, "the first result stayed put").toBe(before)
          // What it says fits the held slot: nothing scrolls inside it, so nothing is cut.
          const body = strip.locator("[data-who-knows-body]")
          expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0)
          await reviewShot(page, `search-who-knows-${who.shot}`, theme)
        })
      }

      // The grammar (the filter chips' chunk) can arrive after the results. A
      // search without a colon has no filter, so Who knows' place is already
      // above the first result when it draws, and the grammar moves nothing.
      test("the first result doesn't move when the grammar arrives after the results", async ({ page }, testInfo) => {
        let grammarHere: () => void = () => {}
        const grammar = new Promise<void>((r) => (grammarHere = r))
        let release: () => void = () => {}
        const held = new Promise<void>((r) => (release = r))
        // The grammar's chunk is the only one that names "unclosed_quote".
        await page.route(/\/_next\/static\/chunks\/.+\.js/, async (route) => {
          const response = await route.fetch()
          const body = await response.text()
          if (body.includes("unclosed_quote")) await grammar
          await route.fulfill({ response, body })
        })
        await open(page, testInfo, answer([]), async (url: URL) => {
          await held
          return { data: { query: url.searchParams.get("q"), considered: 9, you_hidden: false, people: KNOWERS } }
        })
        const first = results(page).getByRole("link", { name: "Budget review 1" })
        await expect(first).toBeVisible({ timeout: 30_000 })
        const strip = page.locator("[data-who-knows-strip]")
        await expect(strip, "Who knows' place, held before the grammar is here").toBeVisible()
        const before = (await first.boundingBox())!.y
        grammarHere()
        await expect(page.locator("[data-query-filter=date]")).toBeVisible()
        release()
        await expect(strip.locator("[data-who-knows-person]")).toHaveCount(3)
        expect((await first.boundingBox())!.y, "the first result stayed put").toBe(before)
        // The chunk route may still be fetching as the page closes (wA26's gate,
        // under load: route.fetch after the page closed). Let it go quietly.
        await page.unrouteAll({ behavior: "ignoreErrors" })
      })

      test("a failed search says so and tries again", async ({ page }, testInfo) => {
        let fail = true
        const sent: Sent[] = []
        const ok = answer(sent)
        await open(page, testInfo, (url: URL, request: { postDataJSON(): unknown }) => (fail ? withStatus(503, { msg: "down" }) : ok(url, request)))
        const again = page.locator("[data-search-error]").getByRole("button", { name: /Try again/ })
        await expect(again).toBeVisible({ timeout: 30_000 })
        await expect(page.locator("[data-search-count]")).toHaveCount(0)
        await reviewShot(page, "search-query-error", theme)
        fail = false
        await press(page, again)
        await expect(page.locator("[data-search-count]")).toHaveText("6 results for “budget”")
      })
    })
  }
}
