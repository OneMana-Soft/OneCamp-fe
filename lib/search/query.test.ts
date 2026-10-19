import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { addModifier, fieldAt, format, modifierText, parse, removeSpan, setModifier, type Syntax, type SyntaxNode } from "./query"

// The golden cases the server's parser is held to (business/SearchQuery,
// parse_test.go), copied byte for byte into testdata/searchquery: every text
// must parse to the same tree here as there, spans, issues and tokens
// included, and write back as the same canonical text.
const fixtures = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "testdata", "searchquery", "parse.json"), "utf8")) as {
  cases: { name: string; text: string; syntax: Syntax; canonical: string }[]
}

/** A tree without its places. */
function shape(n: SyntaxNode | undefined): unknown {
  if (!n) return undefined
  const rest: Partial<SyntaxNode> = { ...n }
  delete rest.span
  delete rest.children
  return n.children ? { ...rest, children: n.children.map(shape) } : rest
}

/** Sort keys without their places. */
const sortShape = (keys: Syntax["sorts"]) => (keys ?? []).map((k) => ({ field: k.field, quoted: k.quoted, desc: k.desc }))

describe("the typing twin parses the golden cases as the server does", () => {
  it("holds every case", () => {
    expect(fixtures.cases.length).toBeGreaterThan(80)
  })
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const got = parse(c.text)
      expect(got).toEqual(c.syntax)
      expect(format(got)).toBe(c.canonical)
      // Writing a tree back and reading it again gives the same tree.
      const again = parse(format(got))
      expect(shape(again.root)).toEqual(shape(got.root))
      expect(sortShape(again.sorts)).toEqual(sortShape(got.sorts))
    })
  }
})

describe("chips write their tokens into the text", () => {
  it("writes a modifier, quoting a value with spaces", () => {
    expect(modifierText("from", "@sam")).toBe("from:@sam")
    expect(modifierText("in", "Product handbook")).toBe('in:"Product handbook"')
    expect(modifierText("title", "<3")).toBe('title:"<3"')
  })

  it("sets one value, replacing the field's modifiers at the top", () => {
    expect(setModifier("launch type:doc plan", "type", "task")).toBe("launch plan type:task")
    expect(setModifier("launch", "from", "@ana")).toBe("launch from:@ana")
    // A modifier inside brackets is the person's own: left as it is.
    expect(setModifier("(type:doc OR x) y", "type", "task")).toBe("(type:doc OR x) y type:task")
  })

  it("adds a value beside the ones there", () => {
    expect(addModifier("in:#launch", "in", "#design")).toBe("in:#launch in:#design")
  })

  it("removes a chip's own stretch and tidies the spaces", () => {
    const text = "launch from:@sam  plan"
    const clause = parse(text).root!.children![1]
    expect(removeSpan(text, clause.span)).toBe("launch plan")
  })

  it("knows which field the caret is in", () => {
    expect(fieldAt("launch from:", 12)).toEqual({ field: "from", value: "", span: [12, 12] })
    expect(fieldAt("from:@sa plan", 7)).toEqual({ field: "from", value: "@sa", span: [5, 8] })
    expect(fieldAt('"Stage":do', 10)).toEqual({ field: "Stage", value: "do", span: [8, 10] })
    expect(fieldAt("due < friday", 9)).toBeNull() // compare form isn't a modifier
    expect(fieldAt("launch plan", 3)).toBeNull()
  })
})
