import { describe, expect, it } from "vitest"

import { bareUrl, campColours, inkFor, markdownSignals } from "./pasteRules"

// R6: Markdown becomes blocks only with two or more block signals, so a line
// of prose that starts with "-" stays itself.
describe("Markdown signals", () => {
  it.each([
    ["# T\n- a\n- b\n> q", 4],
    ["- one\n- two", 2],
    ["1. first\n2) second", 2],
    ["```js\nconst a = 1\n```", 2],
    ["| a | b |\n|---|:-:|\n| 1 | 2 |", 2],
    ["---", 1],
    ["# Only a heading", 1],
    ["- a dash at the start of a sentence", 1],
    ["Just prose, with a - dash and #hash in it.", 0],
    ["```\nan open fence never closed", 0],
    ["#notaheading\n-not a list", 0],
  ])("%j has %i", (text, n) => {
    expect(markdownSignals(text)).toBe(n)
  })

  it("counts nothing inside a fence", () => {
    expect(markdownSignals("```\n# not a heading\n- not a list\n```")).toBe(2)
  })
})

describe("a bare URL", () => {
  it("is one web address alone", () => {
    expect(bareUrl("  https://example.com/a?b=c#d \n")).toBe("https://example.com/a?b=c#d")
    for (const t of ["see https://example.com", "https://a.com https://b.com", "ftp://example.com", "javascript:alert(1)", "example.com", "https://"]) {
      expect(bareUrl(t), t).toBeNull()
    }
  })
})

// L12: pasted colours come onto the doc's palette, or go.
describe("pasted colours", () => {
  it.each([
    ["#ff0000", "berry"],
    ["rgb(230, 126, 34)", "sun"],
    ["#2e8b57", "moss"],
    ["teal", "lake"],
    ["#1a73e8", "sky"],
    ["hsl(270, 60%, 50%)", "dusk"],
    ["#808080", "gray"],
    ["#000000", null],
    ["rgb(255,255,255)", null],
    ["#202124", null],
    ["inherit", null],
  ])("%s is %s", (css, ink) => {
    expect(inkFor(css)).toBe(ink)
  })

  it("names text colours and backgrounds, drops the other app's default ink, and names the doc's own", () => {
    const html =
      '<p><span style="color: rgb(255, 0, 0)">red</span> <span style="color:#000">black</span> ' +
      '<span style="background-color: #fff2cc">yellow back</span> <span style="color: var(--camp-sky-ink)">ours</span></p>'
    const out = campColours(html)
    // By name, in the doc's stored form (N15, B2): no CSS colour stays in.
    expect(out).toContain('<span data-color="berry">red</span>')
    expect(out).toContain('<mark data-color="sun">yellow back</mark>')
    expect(out).toContain('<span style="">black</span>')
    expect(out).toContain('<span data-color="sky">ours</span>')
    expect(out).not.toMatch(/color:/)
    expect(campColours("<p>no colour</p>")).toBe("<p>no colour</p>")
  })
})
