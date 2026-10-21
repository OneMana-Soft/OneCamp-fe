// The page tree (fluid-06) on workspace.mjs's tree of about 2,000 pages: the
// sidebar's Docs section on a computer, the Pages sheet from the docs home on a
// phone. Its first rows on a cold tab (a computer's sidebar draws them with
// the app) or the sheet opened (a phone); the Handbook opened by its chevron,
// after the pointer rests on its row (its children are read on the press);
// closed and opened again (from the cache); "Show N more" at the top; the
// long tree scrolled; moved through by its keys (a computer); and a doc opened
// from it. Budgets: pages-budgets.json (FLUIDITY-LEAD-3, 21 Oct 2026).
import { collabFor } from "../fakeApp.mjs"
import { docFromBlocks, launchPlanBlocks } from "../fakeCollab.mjs"
import { PAGE_TREE, calendarFixtures, chatFixtures, pageFixtures, shellFixtures, workFixtures, workSidebar } from "../workspace.mjs"
import { HOME } from "./shell.mjs"

// The pages a step opens are real docs: a body, and a live copy.
const plan = docFromBlocks(launchPlanBlocks(), { epoch: "TREE" })
const DOCS = PAGE_TREE.opens.map((p) => ({ id: p.id, title: p.title, html: plan.html, update: plan.update, levels: { sam: "full" } }))

const TREE = '[data-doc-tree="workspace"] [role="tree"]'
const row = (p) => `${TREE} [role="treeitem"][data-tree-id="${p.id}"]`
const kids = (p) => `${TREE} [role="treeitem"][data-tree-parent="${p.id}"]`
// A level's "Show N more": the top level's is the tree's own child, a page's
// is in the group after its row.
const MORE = /^Show \d+ more$/
// The doc's text drawn: its snapshot, or the editor (docs.mjs's "body").
const DOC_BODY = { sel: "[data-doc-snapshot], .doc-editor .ProseMirror", re: "We launch on the last Tuesday", path: "/app/doc/" }
const MAIN = "[data-split-view='-1'], [data-app-scroller]"

const group = {
  name: "pages",
  fixtures: () => [...pageFixtures(), ...shellFixtures(), ...calendarFixtures(), ...workFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  docs: DOCS,
  collab: collabFor(DOCS),
  async run(h) {
    const { page } = h
    const M = { pageTreePages: PAGE_TREE.pages }
    const H = PAGE_TREE.handbook

    if (!h.phone) {
      // ---- a cold tab to Home, until the sidebar draws the tree's first row ----
      const cold = await h.step("treeCold", {
        act: () => h.goto("/app/home"),
        ready: () => h.ready({ sel: `${TREE} [role="treeitem"]` }, { fromNav: true, timeout: 60000 }),
        nav: true,
        settle: 2500,
      })
      M.pageTreeColdMs = cold?.ready
      M.pageTreeColdKB = cold?.netReady?.scriptKB
    } else {
      // ---- the docs home, then its Pages sheet ----
      await h.goto("/app/home")
      await h.ready(HOME, { fromNav: true, timeout: 60000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await h.push("/app/doc")
      const pages = page.getByRole("button", { name: "Pages", exact: true }).first()
      await pages.waitFor({ timeout: 30000 })
      await page.waitForTimeout(1500)
      const sheet = await h.step("pagesSheetOpen", {
        act: () => h.press(pages),
        ready: () => h.ready({ sel: `[data-pages-sheet] ${TREE} [role="treeitem"]` }, { timeout: 20000 }),
        frames: true,
        settle: 1200,
      })
      M.pagesSheetOpenMs = sheet?.ready
      M.pagesSheetOpenInpMs = sheet?.inp
      M.pagesSheetOpenRenders = sheet?.renders
      M.pagesSheetFrameP95Ms = sheet?.frames?.p95
    }

    // ---- the Handbook opened by its chevron: on a computer the pointer rests
    // on its row first (the chevron shows on hover, and the row prefetches
    // what it prefetches), a finger taps it ----
    const handbook = page.locator(row(H)).first()
    const chevron = page.locator(`${row(H)} [data-tree-toggle]`).first()
    await handbook.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {})
    const openHandbook = async () => {
      if (!h.phone) {
        await handbook.hover({ timeout: 15000 })
        await page.waitForTimeout(150)
      }
      await h.press(chevron)
    }
    const expand = await h.step("treeExpand", {
      act: openHandbook,
      ready: () => h.ready({ sel: kids(H) }, { timeout: 20000 }),
      settle: 1200,
    })
    M.treeExpandMs = expand?.ready
    M.treeExpandInpMs = expand?.inp
    M.treeExpandRenders = expand?.renders

    // ---- closed, and opened again: its children come from the cache ----
    if (h.wants("treeExpandAgain")) {
      await h.press(chevron).catch(() => {})
      await page.locator(kids(H)).first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(600)
    }
    const again = await h.step("treeExpandAgain", {
      act: openHandbook,
      ready: () => h.ready({ sel: kids(H) }, { timeout: 20000 }),
      settle: 1000,
    })
    M.treeExpandAgainMs = again?.ready
    M.treeExpandAgainInpMs = again?.inp
    M.treeExpandAgainRenders = again?.renders

    // ---- "Show N more" at the top of the workspace's pages ----
    const more = page.locator(`${TREE} > button`).filter({ hasText: MORE }).first()
    const last = PAGE_TREE.top[PAGE_TREE.top.length - 1]
    const showMore = await h.step("treeShowMore", {
      act: async () => {
        if (!h.phone) {
          await more.hover({ timeout: 15000 })
          await page.waitForTimeout(150)
        }
        await h.press(more)
      },
      ready: () => h.ready({ sel: row(last) }, { timeout: 20000 }),
      settle: 1200,
    })
    M.treeShowMoreMs = showMore?.ready
    M.treeShowMoreInpMs = showMore?.inp
    M.treeShowMoreRenders = showMore?.renders

    // ---- the Handbook's 120 pages shown too (not timed), for a long tree ----
    if (h.wants("treeScroll") || h.wants("treeKeys")) {
      const inside = page.locator(`${row(H)} + [role="group"] > button`).filter({ hasText: MORE }).first()
      if (await inside.isVisible().catch(() => false)) {
        await h.press(inside)
        await h.ready({ sel: kids(H), min: 100 }, { timeout: 20000 }).catch(() => {})
        await page.waitForTimeout(800)
      }
      M.treeRows = await page.locator(`${TREE} [role="treeitem"]`).count().catch(() => null)
      M.treeDomNodes = await page.evaluate(() => document.querySelectorAll("*").length).catch(() => null)
    }

    // ---- the long tree scrolled down and back: a wheel on a computer, a
    // finger on a phone (which stops short of the top: past it, a finger
    // pulls the sheet down) ----
    const scroller = h.wants("treeScroll") ? await h.scrollerOf(page.locator(row(H))) : null
    const scroll = await h.step("treeScroll", {
      act: async () => {
        await h.scroll(scroller, { dy: 3000 })
        await h.scroll(scroller, { dy: h.phone ? -2000 : -3000 })
      },
      frames: true,
      settle: 600,
    })
    M.treeScrollFrameP95Ms = scroll?.frames?.p95
    M.treeScrollDroppedPct = scroll?.frames?.droppedPct
    M.treeScrollRenders = scroll?.renders

    // ---- down the tree by its keys, the pointer out of the way (a computer) ----
    if (!h.phone && h.wants("treeKeys")) {
      const first = page.locator(`${TREE} [role="treeitem"]`).first()
      await first.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {})
      await page.mouse.move(1100, 880)
      await first.focus().catch(() => {})
      await page.waitForTimeout(400)
      const keys = await h.step("treeKeys", {
        act: async () => {
          for (let i = 0; i < 12; i++) {
            await page.keyboard.press("ArrowDown")
            await page.waitForTimeout(90)
          }
        },
        typed: 12,
        settle: 500,
      })
      M.treeKeyP95Ms = keys?.keyP95
      M.rendersPerTreeKey = keys?.rendersPerKey
    }

    // ---- a doc opened from the tree: the pointer rests on its row (what the
    // tree prefetches the doc on) and clicks; a finger taps it, and the sheet goes ----
    const target = PAGE_TREE.opens[0]
    const docRow = page.locator(row(target)).first()
    if (h.wants("treeDocOpen")) await docRow.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {})
    const open = await h.step("treeDocOpen", {
      act: async () => {
        if (!h.phone) {
          await docRow.hover({ timeout: 15000 })
          await page.waitForTimeout(150)
        }
        await h.press(docRow)
      },
      ready: () => h.ready(DOC_BODY, { timeout: 30000 }),
      blank: MAIN,
      settle: 1500,
    })
    M.treeDocOpenMs = open?.ready
    M.treeDocOpenInpMs = open?.inp
    M.treeDocOpenLongMs = open?.longMs
    M.treeDocOpenRenders = open?.renders
    M.treeDocOpenKB = open?.netReady?.scriptKB
    return M
  },
}

export default group
