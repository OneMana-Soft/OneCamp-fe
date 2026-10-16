import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { CHANGE_ATTR, renderDiff } from "./index"
import { forgetMadeVersions } from "../preview/materialize"

// Every block the doc has, from the codec's shared fixtures (testdata/codec,
// A7): a version compared with itself shows nothing, and a version with one
// word changed shows one block changed, wherever that block sits (a callout's
// paragraph, a toggle's, a checklist item's, a quote's).

const dir = join(__dirname, "../../../../testdata/codec")
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ name: f, html: readFileSync(join(dir, f), "utf8") }))
  .filter((f) => f.html.trim())

afterEach(forgetMadeVersions)

async function diff(before: string, after: string) {
  const box = document.createElement("div")
  const stats = await renderDiff(box, before, after)
  return { box, stats }
}

/** The fixture with one word changed in its first text of three words or more. */
function oneWordChanged(html: string): string | null {
  const t = document.createElement("template")
  t.innerHTML = html
  const walker = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text
    const block = text.parentElement?.closest("p, h1, h2, h3, h4, h5, h6, li")
    if (!block || text.parentElement?.closest("pre, code, a, span[data-type]")) continue
    const m = /[A-Za-z]{3,}/.exec(text.data)
    if (!m || (block.textContent ?? "").trim().split(/\s+/).length < 3) continue
    text.data = text.data.slice(0, m.index) + "Zebra" + text.data.slice(m.index + m[0].length)
    return t.innerHTML
  }
  return null
}

describe("the diff over every block the doc has", () => {
  it("finds the fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(10)
  })

  for (const f of fixtures) {
    it(`shows nothing for ${f.name} compared with itself`, async () => {
      const { box, stats } = await diff(f.html, f.html)
      expect(box.querySelectorAll(`[${CHANGE_ATTR}]`)).toHaveLength(0)
      expect(stats).toMatchObject({ added: 0, removed: 0, changed: 0 })
    })

    const edited = oneWordChanged(f.html)
    if (edited)
      it(`shows the one word changed in ${f.name}`, async () => {
        const { box, stats } = await diff(f.html, edited)
        expect(stats.changed).toBe(1)
        expect(stats.added + stats.removed).toBe(0)
        expect(box.querySelector("ins.history-ins")?.textContent).toBe("Zebra")
      })
  }
})
