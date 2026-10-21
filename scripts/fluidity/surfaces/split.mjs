// Split view's feel on fixtures (SPLIT-LEAD, 20 Oct 2026; release-1010/design/
// split/ANALYSIS.md): a pane carried by its bar across the page (the shared
// drag, lib/ui/dnd: the ghost and the drop line move on transforms; on the
// drop the views take their new CSS order and travel there by FLIP), and a
// seam dragged (react-resizable-panels: a flex-grow, so a layout, a move).
// The page is Home with two docs beside it. Budgets: split-budgets.json.
import { collabFor } from "../fakeApp.mjs"
import { docFromBlocks, launchPlanBlocks } from "../fakeCollab.mjs"
import { chatFixtures, workFixtures } from "../workspace.mjs"

const id = (n) => `d0c00000-0000-4000-8000-${String(n).padStart(12, "0")}`
const docs = ["Q4 launch plan", "Launch notes"].map((title, i) => {
  const d = docFromBlocks(launchPlanBlocks(), { epoch: `SPLIT${i}` })
  return { id: id(901 + i), title, html: d.html, update: d.update, levels: { sam: "full" } }
})
const [A, B] = docs.map((d) => `doc:${d.id}`)
const sheet = (k) => `[data-split-sheet="${k}"]`
const handle = (k) => `[data-split-handle="${k}"] [data-drag-handle]`

/** 60 moves 16 ms apart from `from` to `to`, with a little wander, as a hand carries. */
async function carry(page, from, to) {
  for (let i = 1; i <= 60; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 60, from.y + ((to.y - from.y) * i) / 60 + Math.sin(i / 5) * 12)
    await page.waitForTimeout(16)
  }
}

const group = {
  name: "split",
  docs,
  collab: collabFor(docs),
  fixtures: () => [...workFixtures(), ...chatFixtures()],
  async run(h) {
    const { page } = h
    const M = {}
    // The layout a browser kept: the two docs beside the page.
    await h.context.addInitScript((layout) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        if (!sessionStorage.getItem("oc_split_layout")) localStorage.setItem("oc_split_layout", layout)
      } catch {
        /* storage blocked */
      }
    }, JSON.stringify({ panes: docs.map((d) => ({ kind: "doc", id: d.id })), order: [], sizes: {} }))
    await h.goto("/app/home")
    await h.ready({ sel: "[data-split-view='0']" }, { fromNav: true, timeout: 90000 })
    await h.ready({ sel: "[data-split-view='1']" }, { fromNav: true, timeout: 90000 })
    await page.locator(handle(B)).waitFor({ state: "attached", timeout: 60000 })
    await page.waitForTimeout(2000)

    // ---- a pane carried by its bar to the page's left, timed from the
    // release until it sits there ----
    if (!h.phone && h.wants("splitPaneDrag")) {
      const bar = await page.locator(handle(B)).boundingBox()
      const main = await page.locator(sheet("main")).boundingBox()
      const r = await h.step("splitPaneDrag", {
        act: async () => {
          if (!bar || !main) throw new Error("no pane bar or page")
          const x0 = bar.x + 80
          const y0 = bar.y + bar.height / 2
          await page.mouse.move(x0, y0)
          await page.mouse.down()
          await page.mouse.move(x0 + 12, y0)
          await page.waitForSelector(".split-ghost", { timeout: 5000 })
          await carry(page, { x: x0 + 12, y: y0 }, { x: main.x + main.width * 0.08, y: y0 + 200 })
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.mouse.up()
        },
        ready: () =>
          h.until(
            ([b]) => {
              const p = document.querySelector(`[data-split-sheet="${b}"]`)?.getBoundingClientRect()
              const m = document.querySelector('[data-split-sheet="main"]')?.getBoundingClientRect()
              return !!p && !!m && p.left < m.left && !document.querySelector(".split-ghost")
            },
            [B],
            { timeout: 10000 },
          ),
        frames: true,
        settle: 800,
      })
      M.splitPaneDragFrameP95Ms = r?.frames?.p95
      M.splitPaneDragDroppedPct = r?.frames?.droppedPct
      M.splitPaneDragLayouts = r?.layouts
      M.splitPaneDragRenders = r?.renders
      M.splitPaneDropMs = r?.ready
    }

    // ---- the seam between the first two views, dragged 360px and back ----
    if (!h.phone && h.wants("splitSeamDrag")) {
      const seam = await page.getByRole("separator", { name: "Resize views 1 and 2" }).boundingBox()
      const r = await h.step("splitSeamDrag", {
        act: async () => {
          if (!seam) throw new Error("no seam")
          const x0 = seam.x + seam.width / 2
          const y0 = seam.y + seam.height / 2
          await page.mouse.move(x0, y0)
          await page.mouse.down()
          await carry(page, { x: x0, y: y0 }, { x: x0 + 180, y: y0 })
          await carry(page, { x: x0 + 180, y: y0 }, { x: x0 - 180, y: y0 })
          await page.mouse.up()
        },
        frames: true,
        settle: 600,
      })
      M.splitSeamDragFrameP95Ms = r?.frames?.p95
      M.splitSeamDragDroppedPct = r?.frames?.droppedPct
      M.splitSeamDragLayouts = r?.layouts
      M.splitSeamDragRenders = r?.renders
    }
    return M
  },
}

export default group
