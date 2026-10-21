import { describe, expect, it } from "vitest"
import { markKeywords } from "./markKeywords"

describe("markKeywords", () => {
  it("marks a keyword as a whole word in any case", () => {
    expect(markKeywords("<p>The BUDGET is ready</p>", ["budget"])).toBe(
      '<p>The <mark class="keyword-hit">BUDGET</mark> is ready</p>',
    )
  })

  it("leaves a keyword inside a longer word alone", () => {
    expect(markKeywords("<p>Budgetary matters</p>", ["budget"])).toBe("<p>Budgetary matters</p>")
  })

  it("marks a phrase and each of several keywords", () => {
    expect(markKeywords("<p>q4 plan and the launch</p>", ["Q4 plan", "launch"])).toBe(
      '<p><mark class="keyword-hit">q4 plan</mark> and the <mark class="keyword-hit">launch</mark></p>',
    )
  })

  it("never touches tags, attributes, mentions, links or code", () => {
    const html =
      '<p><a href="/budget">budget</a> <span data-type="mention" data-label="budget">@budget</span> <code>budget</code> <span class="budget">x</span></p>'
    expect(markKeywords(html, ["budget"])).toBe(html)
  })

  it("reads entities as their characters and keeps regex characters literal", () => {
    expect(markKeywords("<p>R&amp;D on v1.2, not v1x2</p>", ["r&d", "v1.2"])).toBe(
      '<p><mark class="keyword-hit">R&amp;D</mark> on <mark class="keyword-hit">v1.2</mark>, not v1x2</p>',
    )
  })

  it("keeps marking after a line break inside a link", () => {
    expect(markKeywords('<p><a href="/x">a<br>b</a> budget</p>', ["budget"])).toBe(
      '<p><a href="/x">a<br>b</a> <mark class="keyword-hit">budget</mark></p>',
    )
  })

  it("is a no-op with no keywords", () => {
    expect(markKeywords("<p>budget</p>", [])).toBe("<p>budget</p>")
    expect(markKeywords("<p>budget</p>", undefined)).toBe("<p>budget</p>")
  })
})
