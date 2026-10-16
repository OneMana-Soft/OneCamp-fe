import { describe, expect, it } from "vitest"
import { carryBlockIds, ID_CARRIER, ID_MARK, parseTopLevel, restoreBlockIds } from "./blocks"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"

describe("a version's top-level blocks", () => {
  it("splits blocks, whole, in order", () => {
    const html = '<h2 data-block-id="a">Plan</h2><p data-block-id="b">Ship <strong>Thursday</strong></p><ul data-block-id="c"><li><p>One</p></li></ul>'
    const blocks = parseTopLevel(html)
    expect(blocks.map((b) => b.tag)).toEqual(["h2", "p", "ul"])
    expect(blocks[1].html).toBe('<p data-block-id="b">Ship <strong>Thursday</strong></p>')
  })

  it("keeps a quoted '>' or '<' inside its tag, skips comments, and handles void and self-closing tags", () => {
    const html = '<!-- saved --><pre data-x="a > b"><code>if (a &lt; b) {}</code></pre><div data-type="diff" data-diff="-old <x>"></div><hr><img src="/x.png"/><p>Last</p>'
    const blocks = parseTopLevel(html)
    expect(blocks.map((b) => b.tag)).toEqual(["pre", "div", "hr", "img", "p"])
    expect(blocks[0].html).toContain("if (a &lt; b)")
    expect(blocks[1].html).toBe('<div data-type="diff" data-diff="-old <x>"></div>')
  })

  it("drops whitespace between blocks and keeps loose text as its own block", () => {
    const blocks = parseTopLevel("\n  <p>One</p>\n loose words <p>Two</p>  ")
    expect(blocks.map((b) => [b.tag, b.html])).toEqual([
      ["p", "<p>One</p>"],
      ["#text", "loose words"],
      ["p", "<p>Two</p>"],
    ])
  })

  it("nests blocks of the same name without ending early, and keeps a block left open", () => {
    const blocks = parseTopLevel("<div><div>in</div>still</div><blockquote><p>open")
    expect(blocks.map((b) => b.html)).toEqual(["<div><div>in</div>still</div>", "<blockquote><p>open"])
  })

  it("is empty for an empty body", () => {
    expect(parseTopLevel("")).toEqual([])
    expect(parseTopLevel("   ")).toEqual([])
  })
})

describe("a block's id through the sanitiser", () => {
  it("rides in the carrier at every depth, and comes back as data-block-id", () => {
    const html = '<ul data-block-id="list"><li data-block-id="item"><p data-block-id="para">One</p></li></ul>'
    const carried = carryBlockIds(html)
    expect(carried).not.toContain("data-block-id")
    expect(carried).toContain(`${ID_CARRIER}="${ID_MARK}para"`)
    const t = document.createElement("template")
    t.innerHTML = sanitizeRichHtml(carried)
    const ul = t.content.firstElementChild!
    restoreBlockIds(ul)
    expect(ul.getAttribute("data-block-id")).toBe("list")
    expect(ul.querySelector("li")!.getAttribute("data-block-id")).toBe("item")
    expect(ul.querySelector("p")!.getAttribute("data-block-id")).toBe("para")
    expect(ul.querySelector(`[${ID_CARRIER}]`)).toBeNull()
  })

  it("never touches text, or a mention's own label", () => {
    // A doc about our own HTML: the words are text, not an attribute.
    const html = '<p data-block-id="a">Write data-block-id="x" in a tag</p><p data-block-id="b"><span data-type="mention" data-id="u" data-label="Maya">@Maya</span></p>'
    const carried = carryBlockIds(html)
    expect(carried).toContain('Write data-block-id="x" in a tag')
    expect(carried).toContain('data-label="Maya"')
    const t = document.createElement("template")
    t.innerHTML = sanitizeRichHtml(carried)
    for (const el of Array.from(t.content.children)) restoreBlockIds(el)
    const [first, second] = Array.from(t.content.children)
    expect(first.textContent).toBe('Write data-block-id="x" in a tag')
    expect(second.getAttribute("data-block-id")).toBe("b")
    expect(second.querySelector("span")!.getAttribute("data-label")).toBe("Maya")
  })

  it("leaves a body without ids as it is", () => {
    const html = "<p>Old</p><ul><li><p>body</p></li></ul>"
    expect(carryBlockIds(html)).toBe(html)
  })
})
