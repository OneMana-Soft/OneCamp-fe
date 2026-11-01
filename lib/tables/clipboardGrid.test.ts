import { describe, expect, it } from "vitest"
import { blockFromClipboard, parseHtmlTable, parseTsv, toHtmlTable, toTsv } from "@/lib/tables/clipboardGrid"

describe("clipboardGrid: blocks from Sheets and Excel", () => {
  it("reads tab-separated lines, whatever their line ends, dropping one trailing line end", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
    expect(parseTsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
    expect(parseTsv("1\r2\r")).toEqual([["1"], ["2"]])
  })

  it("keeps a quoted cell's tabs, line ends and doubled quotes", () => {
    expect(parseTsv('"two\nlines"\t"say ""hi"""\tplain\nx\t"a\tb"\ty')).toEqual([
      ["two\nlines", 'say "hi"', "plain"],
      ["x", "a\tb", "y"],
    ])
  })

  it("keeps empty cells and a lone value", () => {
    expect(parseTsv("a\t\tc")).toEqual([["a", "", "c"]])
    expect(parseTsv("1,234.50")).toEqual([["1,234.50"]])
  })

  it("reads the first table of Sheets' or Excel's HTML, line breaks and entities included", () => {
    const html =
      '<meta charset="utf-8"><google-sheets-html-origin><table><tbody>' +
      "<tr><td>Name</td><td>Q &amp; A</td></tr>\n" +
      "<tr><td>Ann<br>Lee</td><td>  12  </td></tr>" +
      "</tbody></table>"
    expect(parseHtmlTable(html)).toEqual([
      ["Name", "Q & A"],
      ["Ann\nLee", "12"],
    ])
    expect(parseHtmlTable("<p>no table</p>")).toBeNull()
  })

  it("takes the HTML table first, else the text", () => {
    expect(blockFromClipboard({ html: "<table><tr><td>h</td></tr></table>", text: "t" })).toEqual([["h"]])
    expect(blockFromClipboard({ html: "<b>x</b>", text: "a\tb" })).toEqual([["a", "b"]])
    expect(blockFromClipboard({ text: "" })).toEqual([[""]])
  })

  it("writes a block Sheets reads back cell for cell", () => {
    const b = [
      ["a", "two\nlines"],
      ['say "hi"', "x\ty"],
    ]
    expect(toTsv(b)).toBe('a\t"two\nlines"\n"say ""hi"""\t"x\ty"')
    expect(parseTsv(toTsv(b))).toEqual(b)
  })

  it("writes an escaped HTML table that reads back the same", () => {
    const b = [["<b>", "a & b"], ["one\ntwo", ""]]
    const html = toHtmlTable(b)
    expect(html).toContain("&lt;b&gt;")
    expect(html).toContain("a &amp; b")
    expect(html).toContain("one<br>two")
    expect(parseHtmlTable(html)).toEqual(b)
  })
})
