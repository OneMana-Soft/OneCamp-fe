import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * ONE FIELD ROUND A GLYPH (SHADCN-AUDIT SA-2). Twenty-three search boxes and
 * link fields put their glyph over the text by hand: an icon at absolute
 * left-2.5, left-3, left-3.5 or left-5 beside an input padded past it, each
 * with its own height, halo and Clear. The shared InputGroup and SearchInput
 * (components/ui) are that field now. This fails when a wrapper outside
 * components/ui holds a text field and, beside it, a glyph placed absolutely
 * over it: build it with InputGroup (InputGroupAddon) or SearchInput instead.
 */
const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith(".tsx") && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

const FIELD = /^(?:input|textarea|Input|Textarea)$/
/** An icon from the registry (a capitalised tag), or a kbd, placed absolutely at a side of the box. */
const PLACED = /(?:^|\s)absolute(?:\s|$)/
const SIDE = /(?:^|\s)(?:left|right|start|end|inset-y)-/

function classesOf(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): string {
  const attr = el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "className")
  if (!attr?.initializer) return ""
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n)) out.push(n.text)
    n.forEachChild(visit)
  }
  visit(attr.initializer)
  return out.join(" ")
}

const tagOf = (el: ts.JsxChild) => (ts.isJsxElement(el) ? el.openingElement : ts.isJsxSelfClosingElement(el) ? el : null)

/** Wrappers holding a field and a glyph placed over it, as "file:line". */
export function placedGlyphs(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n)) {
      const kids = n.children.map(tagOf).filter((k): k is ts.JsxOpeningElement | ts.JsxSelfClosingElement => !!k)
      const field = kids.some((k) => FIELD.test(k.tagName.getText(sf)))
      const glyph = kids.find((k) => {
        const name = k.tagName.getText(sf)
        if (FIELD.test(name) || !/^(?:[A-Z]\w*|kbd)$/.test(name)) return false
        const cls = classesOf(k, sf)
        return PLACED.test(cls) && SIDE.test(cls)
      })
      if (field && glyph) out.push(`${file}:${sf.getLineAndCharacterOfPosition(glyph.getStart(sf)).line + 1} <${glyph.tagName.getText(sf)}>`)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return out
}

/** Fields that still place their own glyph, by file; a count may only go down. */
const BASELINE: Record<string, number> = {}

describe("a field's glyph is an addon of the field (InputGroup)", () => {
  it("has no glyph placed by hand over a field outside components/ui", () => {
    const found = ["app", "components"]
      .flatMap((d) => walk(join(ROOT, d)))
      .map((f) => relative(ROOT, f))
      .filter((f) => !f.startsWith("components/ui/"))
      .flatMap((f) => placedGlyphs(f, readFileSync(join(ROOT, f), "utf8")))
    const counts: Record<string, number> = {}
    for (const f of found) counts[f.split(":")[0]] = (counts[f.split(":")[0]] ?? 0) + 1
    const over = found.filter((f) => (counts[f.split(":")[0]] ?? 0) > (BASELINE[f.split(":")[0]] ?? 0))
    expect(over, `build the field with InputGroup or SearchInput (components/ui):\n${over.join("\n")}`).toEqual([])
  })

  it("bites: a glyph placed over an input, and not a glyph laid out beside one", () => {
    expect(placedGlyphs("x.tsx", `<div className="relative"><Search className="absolute left-2.5 size-4" /><Input className="pl-8" /></div>`)).toHaveLength(1)
    expect(placedGlyphs("x.tsx", `<label className="relative"><Link2 className="pointer-events-none absolute left-3 top-2.5" /><input /></label>`)).toHaveLength(1)
    expect(placedGlyphs("x.tsx", `<div className="relative"><Input /><kbd className="kbd absolute right-2">/</kbd></div>`)).toHaveLength(1)
    expect(placedGlyphs("x.tsx", `<div className="flex gap-2"><Search className="size-4" /><Input /></div>`)).toEqual([])
    expect(placedGlyphs("x.tsx", `<InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput /></InputGroup>`)).toEqual([])
  })
})

/**
 * THE FIELD'S CLEAR IS ITS OWN. The search field names its × "Clear search";
 * an empty state beside it that offered "Clear search" too gave a screen
 * reader two buttons of one name, doing one thing (b18j, 18 Oct: the members
 * list, the apps, the models, the audit log and the mail inbox). Where the
 * shared field is drawn, the empty state's offer is named for where it takes
 * you ("Show everyone", "Show all apps"). The baseline is none.
 */
const SHARED_FIELD = /from "@\/components\/(?:ui\/search-input|search\/searchField|ui\/lazy-search-input)"/
/** "Clear search" said by a file that draws the shared field, other than as a label of its own: "file:line". */
function secondClears(file: string, src: string): string[] {
  if (!SHARED_FIELD.test(src)) return []
  const out: string[] = []
  // What the file says, not its notes (comments blanked, lines kept).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1")
  code.split("\n").forEach((line, i) => {
    if (/Clear search/.test(line.replace(/aria-label="Clear search"/g, ""))) out.push(`${file}:${i + 1}`)
  })
  return out
}

describe("a search field's Clear search", () => {
  it("is the only one of that name where the shared field is drawn", () => {
    const found = ["app", "components"]
      .flatMap((d) => walk(join(ROOT, d)))
      .map((f) => relative(ROOT, f))
      .filter((f) => !f.startsWith("components/ui/"))
      .flatMap((f) => secondClears(f, readFileSync(join(ROOT, f), "utf8")))
    expect(found, "name the empty state's offer for where it takes you (Show everyone), not Clear search").toEqual([])
  })

  it("bites: an offer named Clear search beside the shared field, and not one beside a field of its own", () => {
    const shared = `import { SearchInput } from "@/components/ui/search-input"\n<><SearchInput value={q} onValueChange={setQ} /><Button onClick={() => setQ("")}>Clear search</Button></>`
    expect(secondClears("x.tsx", shared)).toEqual(["x.tsx:2"])
    expect(secondClears("x.tsx", shared.replace("Clear search", "Show everyone"))).toEqual([])
    expect(secondClears("x.tsx", `<><input /><Button>Clear search</Button></>`)).toEqual([])
    expect(secondClears("x.tsx", `import { SearchInput } from "@/components/ui/search-input"\n// its own Clear search is the × in it\n/* Clear search */`)).toEqual([])
  })
})

/**
 * AN INPUT GROUP READS ITS TEXT OFF ITS OWN CHILDREN. InputGroup carries its
 * text's invalid and disabled (data-invalid, data-disabled), for the field's
 * look, from the InputGroupInput among its children (components/ui/input-group,
 * textOf). A text wrapped in another element, or drawn away from its group (a
 * variable, a helper's return), would lose those states without a word: each
 * InputGroupInput sits in an InputGroup's own children, a condition round it
 * allowed.
 */
export function strayTexts(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const hostOf = (n: ts.Node): string | null => {
    let at = n.parent
    while (at && (ts.isJsxExpression(at) || ts.isParenthesizedExpression(at) || ts.isConditionalExpression(at) || ts.isBinaryExpression(at))) at = at.parent
    return at && ts.isJsxElement(at) ? at.openingElement.tagName.getText(sf) : null
  }
  const visit = (n: ts.Node) => {
    const el = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null
    if (el && el.tagName.getText(sf) === "InputGroupInput" && hostOf(n) !== "InputGroup") out.push(`${file}:${sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1}`)
    n.forEachChild(visit)
  }
  visit(sf)
  return out
}

describe("an input group's text", () => {
  it("is one of its group's own children everywhere it is drawn", () => {
    const found = ["app", "components"]
      .flatMap((d) => walk(join(ROOT, d)))
      .map((f) => relative(ROOT, f))
      .flatMap((f) => strayTexts(f, readFileSync(join(ROOT, f), "utf8")))
    expect(found, "draw InputGroupInput as a child of its InputGroup, so the group carries its states:\n" + found.join("\n")).toEqual([])
  })

  it("bites: a text wrapped in another element or drawn apart, and not one under a condition", () => {
    expect(strayTexts("x.tsx", `<InputGroup><InputGroupAddon /><InputGroupInput aria-invalid /></InputGroup>`)).toEqual([])
    expect(strayTexts("x.tsx", `<InputGroup>{open ? <InputGroupInput /> : null}{busy && (<InputGroupInput />)}</InputGroup>`)).toEqual([])
    expect(strayTexts("x.tsx", `<InputGroup><div><InputGroupInput /></div></InputGroup>`)).toEqual(["x.tsx:1"])
    expect(strayTexts("x.tsx", `const text = <InputGroupInput disabled />`)).toEqual(["x.tsx:1"])
  })
})
