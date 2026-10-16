import { readFileSync } from "node:fs"
import path from "node:path"
import { inflateSync } from "node:zlib"
import { expect, test } from "@playwright/test"

/**
 * Export as PDF (docs programme A7, P11) is the browser printing the doc page
 * through the print stylesheet, with no server. This prints a page built like
 * the doc page (a sidebar, a header and a toast around the scroll box that
 * holds the doc's title and body) to a PDF in Chromium, and reads the PDF's
 * text back: the doc is in it as real text, over as many pages as it runs
 * to, and the app around it is not.
 */

const PRINT_CSS = readFileSync(path.join(__dirname, "..", "components", "minimal-tiptap", "styles", "partials", "print.css"), "utf8")

const BODY = Array.from({ length: 70 }, (_, i) => `<p>Paragraph ${i + 1} of the plan.</p>`).join("")

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px/1.5 sans-serif }
  .shell { display: flex; height: 100vh; overflow: hidden }
  aside { width: 240px; flex: none }
  main { flex: 1; display: flex; flex-direction: column; overflow: hidden }
  .doc-scroll { flex: 1; min-height: 0; overflow-y: auto }
  .doc-measure { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column }
  textarea { border: 0; resize: none; font: 600 32px/1.2 sans-serif; width: 100% }
</style><style>${PRINT_CSS}</style></head><body>
<div class="shell">
  <aside>Sidebar channels</aside>
  <main>
    <header>Header with Share</header>
    <div class="doc-scroll"><div class="doc-measure">
      <div data-doc-title-block><textarea data-doc-title rows="1">Launch plan</textarea></div>
      <div class="minimal-tiptap-editor doc-editor"><div class="ProseMirror"><h1>Goals</h1>${BODY}<p>The last words.</p></div></div>
    </div></div>
  </main>
</div>
<div role="status">A toast saying saved</div>
</body></html>`

/** The PDF's text: each text object's glyphs, read through every font's ToUnicode map. */
function pdfTexts(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1")
  const streams: string[] = []
  const re = /(?<!end)stream\r?\n/g
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const start = m.index + m[0].length
    const end = raw.indexOf("endstream", start)
    if (end < 0) break
    try {
      streams.push(inflateSync(pdf.subarray(start, end)).toString("latin1"))
    } catch {
      streams.push(raw.slice(start, end))
    }
    re.lastIndex = end
  }
  const maps: Map<string, string>[] = []
  for (const s of streams.filter((s) => s.includes("beginbfchar") || s.includes("beginbfrange"))) {
    const map = new Map<string, string>()
    const hexText = (h: string) => String.fromCodePoint(...(h.match(/.{4}/g) || []).map((x) => parseInt(x, 16)))
    for (const block of s.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
      for (const [, from, to] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(from.toUpperCase(), hexText(to))
    }
    for (const block of s.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
      for (const [, lo, hi, to] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const width = lo.length
        for (let g = parseInt(lo, 16), i = 0; g <= parseInt(hi, 16); g++, i++) {
          map.set(g.toString(16).toUpperCase().padStart(width, "0"), String.fromCodePoint(parseInt(to, 16) + i))
        }
      }
    }
    maps.push(map)
  }
  const texts: string[] = []
  for (const s of streams) {
    for (const bt of s.match(/BT[\s\S]*?ET/g) || []) {
      const glyphs = (bt.match(/<([0-9A-Fa-f]+)>/g) || []).map((h) => h.slice(1, -1).toUpperCase()).join("")
      const ids = glyphs.match(/.{4}/g) || []
      for (const map of maps) texts.push(ids.map((g) => map.get(g) ?? "").join(""))
    }
  }
  return texts
}

const squash = (s: string) => s.replace(/\s+/g, "")

test("a doc prints alone, as real text, over as many pages as it runs to", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium makes the PDF")
  await page.setContent(PAGE)
  await page.emulateMedia({ media: "print" })
  await expect(page.locator("aside")).toBeHidden()
  await expect(page.locator("header")).toBeHidden()
  await expect(page.locator("[role=status]")).toBeHidden()
  await expect(page.locator("[data-doc-title]")).toBeVisible()

  const pdf = await page.pdf({ format: "A4" })
  const text = squash(pdfTexts(pdf).join("\n"))
  expect(text).toContain(squash("Goals"))
  expect(text).toContain(squash("Paragraph 1 of the plan."))
  expect(text).toContain(squash("The last words."))
  expect(text).not.toContain("Sidebar")
  expect(text).not.toContain("toast")
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) || []
  expect(pages.length).toBeGreaterThan(1)
})
