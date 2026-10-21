// Tables on fixtures (fluid-07): a table of 10,000 rows and one of 100,000
// opened, every row read in ("Load all", as today's page holds them), the grid
// scrolled down and across, a cell edited to its commit, and a formula worked
// out again after the number it reads changed. Budgets: tables-budgets.json.
// The table is the tables programme's synthetic one (design/tables-vs-airtable/
// perf-harness/lib.mjs), moved into workspace.mjs.
import { TABLES, TABLE_COL, chatFixtures, tableFixtures, workSidebar } from "../workspace.mjs"

const GRID = "[data-table-grid]"
const ROWS = "[data-table-grid] tbody tr[data-index], [data-table-list] [data-row-id], [data-table-list] li"

const group = {
  name: "tables",
  fixtures: () => [...tableFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  async run(h) {
    const { page } = h
    const M = {}
    for (const t of TABLES) {
      const tag = t.rows >= 100_000 ? "100k" : "10k"
      // ---- open the table, cold, until its first rows show ----
      const open = await h.step(`table${tag}Open`, {
        act: () => h.goto(`/app/tables/${t.id}`),
        ready: () => h.ready({ sel: ROWS, path: "/app/tables/" }, { fromNav: true, timeout: 60000 }),
        nav: true,
        settle: 1500,
      })
      M[`table${tag}OpenMs`] = open?.ready
      M[`table${tag}OpenLongMs`] = open?.longMs
      M[`table${tag}OpenKB`] = open?.net?.scriptKB

      // ---- every row read in, as the page offers it ----
      const all = page.getByRole("button", { name: /Load all/ }).or(page.locator("[data-rows-shown] button")).first()
      if (await all.isVisible().catch(() => false)) {
        const load = await h.step(`table${tag}LoadAll`, {
          act: () => h.press(all),
          ready: () => h.ready({ gone: "[data-rows-shown]" }, { timeout: 180000 }),
          settle: 1500,
        })
        M[`table${tag}LoadAllMs`] = load?.ready
        M[`table${tag}LoadAllLongMs`] = load?.longMs
      }
      M[`table${tag}DomNodes`] = await page.evaluate(() => document.querySelectorAll("*").length).catch(() => null)

      // ---- the grid scrolled down a long way and back, then across ----
      // The box the rows scroll in: the grid on a computer, the list's on a phone.
      const grid = await h.scrollerOf(page.locator(ROWS))
      const scroll = await h.step(`table${tag}Scroll`, {
        act: async () => {
          await h.scroll(grid, { dy: 6000 })
          await h.scroll(grid, { dy: -3000 })
          if (!h.phone) await h.scroll(grid, { dx: 1200 })
        },
        frames: true,
        settle: 600,
      })
      M[`table${tag}ScrollFrameP95Ms`] = scroll?.frames?.p95
      M[`table${tag}ScrollDroppedPct`] = scroll?.frames?.droppedPct
      M[`table${tag}ScrollLongMs`] = scroll?.longMs
      M[`table${tag}ScrollRenders`] = scroll?.renders

      if (h.phone) continue
      await grid.evaluate((el) => {
        el.scrollTop = 0
        el.scrollLeft = 0
      })
      await page.waitForTimeout(500)

      // ---- a cell edited to its commit: Notes on the third row ----
      const notes = page.locator(`${GRID} [data-cell="2:${TABLE_COL.Notes}"]`).first()
      await notes.click({ timeout: 10000 }).catch(() => {})
      await page.keyboard.press("End")
      await page.keyboard.type(" checked", { delay: 40 })
      const commit = await h.step(`table${tag}Commit`, {
        act: async () => {
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.keyboard.press("Enter")
        },
        // Committed: the cell holds the text and no longer edits.
        ready: () => h.ready({ sel: `${GRID} [data-cell="2:${TABLE_COL.Notes}"]`, text: "checked" }, { timeout: 15000 }),
        settle: 1500,
      })
      M[`table${tag}CommitInpMs`] = commit?.inp
      M[`table${tag}CommitLongMs`] = commit?.longMs
      M[`table${tag}CommitRenders`] = commit?.renders
      M[`table${tag}CommitKB`] = commit?.net ? commit.net.otherKB : null

      // ---- a formula worked out again: Amount on the fourth row, Total follows ----
      const amount = page.locator(`${GRID} [data-cell="3:${TABLE_COL.Amount}"]`).first()
      const totalSel = `${GRID} tbody tr[data-index="3"] [data-cell="3:${TABLE_COL.Total}"]`
      await amount.click({ timeout: 10000 }).catch(() => {})
      await page.keyboard.press("Control+a")
      await page.keyboard.type("1234.5", { delay: 40 })
      const formula = await h.step(`table${tag}Formula`, {
        act: async () => {
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.keyboard.press("Enter")
        },
        // Qty on row 3 is (3 % 7) + 1 = 4: Total reads 4,938.
        ready: () => h.ready({ sel: totalSel, re: "4[,.\\s\u202f]?938" }, { timeout: 15000 }),
        settle: 1500,
      })
      M[`table${tag}FormulaMs`] = formula?.ready
      M[`table${tag}FormulaLongMs`] = formula?.longMs
    }
    return M
  },
}

export default group
