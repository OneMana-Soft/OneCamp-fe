import { expect, test, type Browser, type Locator, type TestInfo } from "@playwright/test"
import * as Y from "yjs"
import { SAM, docInfo, reviewShot, stubBackend } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { TableServer } from "./tables/tableServer"
import { barFits, coversSelection } from "./floatingBars"

// design-22 item 4 (CODE-REVIEWER-343's FIX): under a finger every FloatingBar
// is 44 px with 44 px items (app/phone.css F3c). The bars outside the board
// hold that too: each inside the screen, each item taking its own tap, and
// nothing they act on hidden. At 390 (a phone) and 768 (an upright tablet,
// where the picture and selection bars show), with touch, light and dark.
// Docs & Files' bulk bar at 768 lives in its own world (docs/docsFiles.spec.ts).
test.describe.configure({ timeout: 180_000 })

type Screen = { width: number; height: number }
const PHONE = { width: 390, height: 844 }
const NARROW = { width: 360, height: 780 }
const TABLET = { width: 768, height: 1024 }
const DOC = "7a1d2c3b-4a59-4687-9a0b-1c2d3e4f5a6c"
// A 64 x 32 picture: narrower than its bar, the case that spilt past the column.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAATklEQVR4nO3PUQkAIBTAwBfHiEY0liH8OITBAtxm7fN1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjx2AQvZQKZEMqCeAAAAAElFTkSuQmCC"
const LINK = "https://example.com/launch/plans/the-quarter-in-one-page"
const PLAN = "The launch plan for the quarter, in one page, for everyone."

type Seed = (frag: Y.XmlFragment) => void
/** A paragraph of runs, each with its marks. */
const para = (...runs: [string, Record<string, unknown>?][]): Seed => (frag) => {
  const p = new Y.XmlElement("paragraph")
  const t = new Y.XmlText()
  let at = 0
  for (const [text, marks] of runs) {
    t.insert(at, text, marks ?? {})
    at += text.length
  }
  p.insert(0, [t])
  frag.insert(frag.length, [p])
}
const picture: Seed = (frag) => {
  const i = new Y.XmlElement("image")
  i.setAttribute("src", PNG)
  i.setAttribute("alt", "Board")
  frag.insert(frag.length, [i])
}

/** The doc as the collab relay holds it (its Y doc is what the editor draws; doc_body alone renders empty). */
async function openDoc(browser: Browser, testInfo: TestInfo, screen: Screen, theme: "light" | "dark", edit: boolean, body: string, ...seeds: Seed[]) {
  const relay = new CollabRelay()
  const frag = relay.doc(DOC).getXmlFragment("default")
  for (const seed of seeds) seed(frag)
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: screen, isMobile: true, hasTouch: true, colorScheme: theme })
  const page = await context.newPage()
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: body, edit }),
    "/user/profile": { msg: "ok", data: SAM },
    "/auth/token": { data: { token: `e2e-${SAM.user_name}` } },
  })
  await relay.attach(page, SAM.user_full_name)
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const pm = page.locator(".doc-editor .ProseMirror").first()
  await expect(pm).toBeVisible({ timeout: 90_000 })
  await expect(pm).toContainText("launch", { timeout: 60_000 })
  return { page, pm, close: () => context.close() }
}

/** Chooses `n` characters from the needle, as a finger's hold would; n 0 puts the caret two characters into it. */
async function choose(pm: Locator, n: number, needle = "launch") {
  const ok = await pm.evaluate(
    (el, a) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let t: Node | null
      while ((t = walker.nextNode())) if ((t.textContent ?? "").includes(a.needle)) break
      if (!t) return false
      const at = t.textContent!.indexOf(a.needle)
      const r = document.createRange()
      r.setStart(t, a.n === 0 ? at + 2 : at)
      if (a.n === 0) r.collapse(true)
      else r.setEnd(t, Math.min(at + a.n, t.textContent!.length))
      const s = window.getSelection()!
      s.removeAllRanges()
      s.addRange(r)
      document.dispatchEvent(new Event("selectionchange"))
      return true
    },
    { n, needle },
  )
  expect(ok, `a text node holding "${needle}"`).toBe(true)
}

for (const theme of ["light", "dark"] as const) {
  test(`at 390 with touch, ${theme}: a reader's Comment bar takes a finger, clear of the words chosen`, async ({ browser }, testInfo) => {
    const { page, pm, close } = await openDoc(browser, testInfo, PHONE, theme, false, `<p>${PLAN}</p>`, para([PLAN]))
    await expect(pm).toHaveAttribute("contenteditable", "false")
    await pm.tap({ position: { x: 20, y: 10 } })
    await choose(pm, 15)
    const bar = page.getByRole("toolbar", { name: "Comment on the selection" })
    const r = await barFits(page, bar, `reader-comment-390-${theme}`)
    expect(await coversSelection(page, r.bar), "the Comment bar is clear of the words chosen").toBe(false)
    await reviewShot(page, "floatingBars-390-comment", theme)
    await bar.getByRole("button", { name: "Comment" }).tap()
    await expect(page.getByRole("textbox", { name: "Comment on the selected text" })).toBeVisible({ timeout: 15_000 })
    await close()
  })

  for (const screen of [NARROW, PHONE]) {
    test(`at ${screen.width} with touch, ${theme}: the link bar stays on the screen and Remove link takes a finger`, async ({ browser }, testInfo) => {
      const { page, pm, close } = await openDoc(
        browser,
        testInfo,
        screen,
        theme,
        true,
        `<p>Read the launch notes at <a href="${LINK}">the quarter plan</a> before Friday.</p>`,
        para(["Read the launch notes at "], ["the quarter plan", { link: { href: LINK, target: "_blank", rel: "noopener noreferrer nofollow", class: null } }], [" before Friday."]),
      )
      await pm.tap({ position: { x: 20, y: 10 } })
      await choose(pm, 0, "quarter plan")
      const bar = page.locator("[data-link-bubble]")
      await barFits(page, bar, `link-${screen.width}-${theme}`, [pm.getByText("the quarter plan").first()])
      await reviewShot(page, `floatingBars-${screen.width}-link`, theme)
      await bar.getByRole("button", { name: "Remove link" }).tap()
      await expect(pm.locator("a", { hasText: "the quarter plan" })).toHaveCount(0)
      await expect(pm).toContainText("the quarter plan")
      await close()
    })
  }

  test(`at 768 with touch, ${theme}: the picture bar on a small picture stays in the column, every item taking its own tap`, async ({ browser }, testInfo) => {
    const { page, pm, close } = await openDoc(browser, testInfo, TABLET, theme, true, `<p>The launch board.</p><img src="${PNG}" alt="Board">`, para(["The launch board."]), picture)
    const img = pm.locator("img").first()
    await expect(img).toBeVisible({ timeout: 30_000 })
    await img.tap()
    const bar = page.getByRole("toolbar", { name: "Picture" })
    await barFits(page, bar, `picture-768-${theme}`)
    await reviewShot(page, "floatingBars-768-picture", theme)
    // Its first item, at the bar's left, takes the finger: the picture moves to the column's left, the bar with it.
    await bar.getByRole("button", { name: "Align left" }).tap()
    await expect(pm.locator("[data-image-align='left']")).toHaveCount(1)
    await barFits(page, bar, `picture-768-left-${theme}`)
    await close()
  })

  test(`at 768 with touch, ${theme}: the doc's selection bar takes a finger, clear of the words chosen`, async ({ browser }, testInfo) => {
    const { page, pm, close } = await openDoc(browser, testInfo, TABLET, theme, true, `<p>${PLAN}</p>`, para([PLAN]))
    await pm.tap({ position: { x: 20, y: 10 } })
    await choose(pm, 15)
    const r = await barFits(page, page.locator("[data-doc-selection-bar]"), `selection-768-${theme}`)
    expect(await coversSelection(page, r.bar), "the selection bar is clear of the words chosen").toBe(false)
    await close()
  })

  test(`at 390 with touch, ${theme}: a table's selection bar takes a finger, and the rows end with room for all of it`, async ({ browser }, testInfo) => {
    const fields = [
      { id: "item", name: "Item", type: "text" },
      { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
      { id: "cost", name: "Cost", type: "number" },
    ]
    const server = new TableServer(fields, Array.from({ length: 30 }, (_, i) => ({ item: `Line ${i}`, stage: i % 2 ? "Done" : "To do", cost: i * 10 })))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: PHONE, hasTouch: true, isMobile: true, colorScheme: theme })
    // Three fields: a phone could show the list; this reader keeps the grid, where the room is made.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    const box = page.getByRole("checkbox", { name: /^Select row / }).first()
    await expect(box).toBeVisible({ timeout: 60_000 })
    await box.tap()
    const r = await barFits(page, page.getByRole("toolbar", { name: "Selected rows" }), `rows-390-${theme}`, [box])
    // The rows' end room (table.css) is the bar's own height and a gap each side: the last row stops above it.
    const room = page.locator("[data-float-room]")
    await expect(room).toHaveCount(1)
    expect(Math.round((await room.boundingBox())!.height), "the rows' end room holds the 44 px bar and its gaps").toBe(r.bar.h + 16)
    await reviewShot(page, "floatingBars-390-rows", theme)
    await close()
  })
}
