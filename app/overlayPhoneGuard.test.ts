import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { resolve as resolveImport } from "../scripts/fluidity/reach.mjs"

/**
 * ONE SHEET RULE (20 Oct 2026; design/drawers-v3/ANALYSIS.md §5.4, §5.6).
 *
 * Whether an overlay opens as a phone's sheet is decided in one place:
 * components/ui/overlayMode's useSheetMode (SHEET_QUERY: a phone's width, or a
 * coarse pointer at most 500px tall, a phone held sideways). Fourteen
 * components chose by isMobile, usePhone or a width query of their own, so a
 * phone in landscape, 844px wide, got their popovers, menus and dialogs: the
 * green room's backgrounds, a doc row's menu, the recordings' dates, a date
 * chip's day, the template picker, the doc AI bar and its panel, a doc's icon
 * and cover, the page chrome's dialogs, version history, pausing
 * notifications, a person's card, the block menu and a board card's menu.
 * isMobile and its kin still choose layouts (sizes, columns, which bar),
 * never whether a sheet opens.
 *
 * It fails when a sheet (components/ui/drawer's Drawer, or a component that
 * renders one and nothing floating) is chosen by a reading of the screen
 * other than useSheetMode:
 *   1. in a condition over it: if, ?:, &&, an early return before it, or a
 *      ?: that picks the Drawer itself as a value;
 *   2. in a condition over the call that opens it (its open state's setter);
 *   3. through a prop that decides it, passed such a reading where it's used.
 * The baseline is zero, and stays so.
 */

const ROOT = join(__dirname, "..")
const DIRS = ["app", "components", "hooks", "lib"]
/** Where the sheet itself is made. */
const OWN = new Set(["components/ui/drawer.tsx"])

/** The rule's own names: what is chosen through these is chosen by the rule. */
const RULE = new Set(["useSheetMode", "SHEET_QUERY"])
/** Readings of the screen that aren't the rule. */
const SCREEN = new Set(["isMobile", "isTablet", "isDesktop", "useMedia", "usePhone", "PHONE_QUERY", "useWide", "useShellBand", "innerWidth", "innerHeight", "outerWidth"])
/** A media query of a component's own: "(max-width: 639px)". */
const QUERY = /\(\s*(?:max|min)-(?:width|height)\s*:/
/** The floating overlays a sheet stands in for. */
const FLOATS = new Set(["Popover", "Dialog", "DropdownMenu", "AlertDialog", "Sheet", "HoverCard", "ContextMenu"])

/** A file who may be choosing, open for reading. */
type Source = { rel: string; sf: ts.SourceFile; imports: Set<string> }
const loaded = new Map<string, Source | null>()

function parse(rel: string, text: string): Source {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  // Every file it imports, by import or import(): where its components may come from.
  const imports = new Set<string>()
  const visit = (n: ts.Node) => {
    const spec = ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) ? n.arguments[0].text : null
    const file = spec ? resolveImport(spec, rel) : null
    if (file) imports.add(file)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { rel, sf, imports }
}

function load(rel: string): Source | null {
  if (!loaded.has(rel)) loaded.set(rel, existsSync(join(ROOT, rel)) ? parse(rel, readFileSync(join(ROOT, rel), "utf8")) : null)
  return loaded.get(rel)!
}

type Binding =
  | { kind: "var"; decl: ts.VariableDeclaration; whole: boolean }
  | { kind: "fn"; decl: ts.FunctionDeclaration }
  | { kind: "param"; fn: ts.SignatureDeclaration; prop: string | null }
  | { kind: "import"; spec: string; name: string }

/** Whether `name` binds `id`: true for the name itself, the element for a part of a pattern. */
function binds(name: ts.BindingName, id: string): ts.BindingElement | true | null {
  if (ts.isIdentifier(name)) return name.text === id ? true : null
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue
    const hit = binds(el.name, id)
    if (hit === true) return el
    if (hit) return hit
  }
  return null
}

/** What `id` names where `from` stands: the nearest declaration in scope. */
function lookup(id: string, from: ts.Node): Binding | null {
  for (let n: ts.Node | undefined = from; n; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      for (const p of n.parameters) {
        const hit = binds(p.name, id)
        if (!hit) continue
        const key = hit === true ? null : hit.propertyName ?? hit.name
        return { kind: "param", fn: n, prop: key && ts.isIdentifier(key) ? key.text : null }
      }
    }
    const statements = ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : null
    for (const st of statements ?? []) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          const hit = binds(d.name, id)
          if (hit) return { kind: "var", decl: d, whole: hit === true }
        }
      } else if (ts.isFunctionDeclaration(st) && st.name?.text === id) return { kind: "fn", decl: st }
      else if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause) {
        const c = st.importClause
        if (c.name?.text === id) return { kind: "import", spec: st.moduleSpecifier.text, name: "default" }
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
          for (const el of c.namedBindings.elements) if (el.name.text === id) return { kind: "import", spec: st.moduleSpecifier.text, name: (el.propertyName ?? el.name).text }
        }
      }
    }
  }
  return null
}

/** A component's name, for its uses: its function's, or the variable it is kept in (through forwardRef and memo). */
function componentName(fn: ts.Node): string | null {
  if (ts.isFunctionDeclaration(fn)) return fn.name?.text ?? null
  let p = fn.parent
  while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) p = p.parent
  return p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) ? p.name.text : null
}

/** Hooks whose value is made of what they're given; any other hook's value is its own, whatever it was given. */
const PASSING = new Set(["useState", "useMemo", "useCallback", "useRef", "useReducer", "useSyncExternalStore", "useDeferredValue"])

/** The readings of the screen a value comes from, followed through the names it is made of in its file. */
function readings(node: ts.Node, out = new Set<string>(), seen = new Set<ts.Node>()): Set<string> {
  if (seen.has(node)) return out
  seen.add(node)
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const parent = n.parent
      // A property's own name reads nothing of its own (media.isMobile reads isMobile).
      if (ts.isPropertyAccessExpression(parent) && parent.name === n) {
        if (SCREEN.has(n.text)) out.add(n.text)
        return
      }
      if ((ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent) || ts.isMethodDeclaration(parent)) && parent.name === n) return
      if (RULE.has(n.text)) return
      if (SCREEN.has(n.text)) {
        out.add(n.text)
        return
      }
      const b = lookup(n.text, n)
      if (b?.kind === "var" && b.decl.initializer) readings(b.decl.initializer, out, seen)
      else if (b?.kind === "fn" && b.decl.body) readings(b.decl.body, out, seen)
      return
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && QUERY.test(n.text)) {
      out.add(`"${n.text}"`)
      return
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ""
      if (/^use[A-Z]/.test(name) && !PASSING.has(name)) return visit(callee)
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

/** The props a condition names itself (a component's first parameter, taken apart), with their component. */
function propsIn(cond: ts.Node): Array<{ name: string; prop: string }> {
  const out: Array<{ name: string; prop: string }> = []
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
      const b = lookup(n.text, n)
      const name = b?.kind === "param" ? componentName(b.fn) : null
      if (b?.kind === "param" && b.prop && name && /^[A-Z]/.test(name) && b.fn.parameters[0] && binds(b.fn.parameters[0].name, n.text)) out.push({ name, prop: b.prop })
      return
    }
    if (ts.isFunctionLike(n)) return
    ts.forEachChild(n, visit)
  }
  visit(cond)
  return out
}

/** What decides whether `node` is drawn or run: the conditions over it, and the early returns before it. */
function gates(node: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = []
  let child: ts.Node = node
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (ts.isConditionalExpression(p) && child !== p.condition) out.push(p.condition)
    else if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === p.right) out.push(p.left)
    else if (ts.isIfStatement(p) && child !== p.expression) out.push(p.expression)
    if (ts.isBlock(p) || ts.isSourceFile(p)) {
      for (const st of p.statements) {
        if (st === child) break
        if (ts.isIfStatement(st) && returns(st.thenStatement)) out.push(st.expression)
      }
    }
  }
  return out
}

function returns(n: ts.Node): boolean {
  if (ts.isReturnStatement(n)) return true
  if (ts.isFunctionLike(n)) return false
  return !!ts.forEachChild(n, (c) => (returns(c) ? true : undefined))
}

const opening = (n: ts.Node): ts.JsxOpeningLikeElement | null => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null)
const lastName = (tag: string) => tag.slice(tag.lastIndexOf(".") + 1)

/** The body of the component `name` means where `at` stands, in this file or one it imports (two files deep). */
function definition(name: string, at: ts.Node, src: Source, depth = 0): { body: ts.Node; src: Source } | null {
  const b = lookup(name, at)
  if (b?.kind === "fn" && b.decl.body) return { body: b.decl.body, src }
  if (b?.kind === "var" && b.whole && b.decl.initializer) return fromValue(b.decl.initializer, src, depth)
  if (b?.kind === "import") return fromModule(b.spec, b.name, src, depth)
  return null
}

function fromModule(spec: string, name: string, src: Source, depth: number): { body: ts.Node; src: Source } | null {
  if (depth >= 2) return null
  const file = resolveImport(spec, src.rel)
  const other = file ? load(file) : null
  if (!other) return null
  for (const st of other.sf.statements) {
    if (name === "default" && ts.isExportAssignment(st)) return fromValue(st.expression, other, depth + 1)
    if (name === "default" && ts.isFunctionDeclaration(st) && st.body && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return { body: st.body, src: other }
  }
  return name === "default" ? null : definition(name, other.sf, other, depth + 1)
}

/** A component kept in a value: a function, forwardRef(fn) or memo(fn), or lazy() and dynamic() of a module's export. */
function fromValue(value: ts.Expression, src: Source, depth: number): { body: ts.Node; src: Source } | null {
  let e = value
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return { body: e.body, src }
  if (ts.isIdentifier(e)) return definition(e.text, e, src, depth)
  if (!ts.isCallExpression(e)) return null
  let spec: string | null = null
  let pick = "default"
  const find = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) spec = n.arguments[0].text
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "m") pick = n.name.text
    ts.forEachChild(n, find)
  }
  find(e)
  if (spec) return fromModule(spec, pick, src, depth)
  const fn = e.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a) || ts.isIdentifier(a))
  return fn ? fromValue(fn, src, depth) : null
}

/** The tags a body draws, each with where it stands. */
function tagsIn(body: ts.Node): ts.JsxOpeningLikeElement[] {
  const out: ts.JsxOpeningLikeElement[] = []
  const visit = (n: ts.Node) => {
    const o = opening(n)
    if (o) out.push(o)
    ts.forEachChild(n, visit)
  }
  visit(body)
  return out
}

/** A name for components/ui/drawer's Drawer where it stands. */
function isDrawerName(id: ts.Identifier): boolean {
  const b = lookup(id.text, id)
  return id.text === "Drawer" && b?.kind === "import" && b.spec === "@/components/ui/drawer"
}

/** components/ui/drawer's Drawer, or vaul's root. */
function isDrawer(el: ts.JsxOpeningLikeElement): boolean {
  const tag = el.tagName.getText()
  const head = tag.split(".")[0]
  const b = lookup(head, el)
  if (b?.kind !== "import") return false
  return (tag === "Drawer" && b.spec === "@/components/ui/drawer") || (b.spec === "vaul" && /\.Root$/.test(tag))
}

const sheets = new Map<ts.Node, boolean>()
/** A sheet: the Drawer, or a component that draws one and nothing floating. */
function isSheet(el: ts.JsxOpeningLikeElement, src: Source): boolean {
  if (isDrawer(el)) return true
  const tag = el.tagName.getText()
  if (!/^[A-Z]\w*$/.test(tag)) return false
  const def = definition(tag, el, src)
  if (!def) return false
  if (!sheets.has(def.body)) {
    const tags = tagsIn(def.body)
    sheets.set(def.body, tags.some(isDrawer) && !tags.some((t) => FLOATS.has(t.tagName.getText())))
  }
  return sheets.get(def.body)!
}

/** The state a sheet's `open` reads: useState's setter, by the declaration that makes it. */
function setters(el: ts.JsxOpeningLikeElement): Array<{ name: string; decl: ts.VariableDeclaration }> {
  const open = el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === "open")
  if (!open?.initializer || !ts.isJsxExpression(open.initializer) || !open.initializer.expression) return []
  const out: Array<{ name: string; decl: ts.VariableDeclaration }> = []
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const b = lookup(n.text, n)
      const decl = b?.kind === "var" ? b.decl : null
      const init = decl?.initializer
      if (decl && init && ts.isArrayBindingPattern(decl.name) && ts.isCallExpression(init) && /(^|\.)useState$/.test(init.expression.getText())) {
        const setter = decl.name.elements[1]
        if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) out.push({ name: setter.name.text, decl })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(open.initializer.expression)
  return out
}

type Finding = { file: string; why: string }
type Wanted = { file: string; name: string; prop: string }

const line = (src: Source, n: ts.Node) => src.sf.getLineAndCharacterOfPosition(n.getStart()).line + 1

/** One file's findings, and the props whose uses decide a sheet. */
function scanFile(src: Source, wanted: Wanted[]): Finding[] {
  const findings: Finding[] = []
  const judge = (what: string, at: ts.Node, conditions: ts.Expression[]) => {
    for (const c of conditions) {
      const screen = readings(c)
      if (screen.size) findings.push({ file: src.rel, why: `${src.rel}:${line(src, at)}: ${what} by ${[...screen].join(", ")}, not useSheetMode` })
      for (const p of propsIn(c)) wanted.push({ file: src.rel, ...p })
    }
  }
  const visit = (n: ts.Node) => {
    const o = opening(n)
    if (o && isSheet(o, src)) {
      const tag = o.tagName.getText()
      judge(`a sheet (${tag}) chosen`, o, gates(n))
      for (const set of setters(o)) {
        const calls: ts.CallExpression[] = []
        const find = (m: ts.Node) => {
          if (ts.isCallExpression(m) && ts.isIdentifier(m.expression) && m.expression.text === set.name) {
            const b = lookup(set.name, m)
            if (b?.kind === "var" && b.decl === set.decl) calls.push(m)
          }
          ts.forEachChild(m, find)
        }
        find(src.sf)
        for (const call of calls) {
          const arg = call.arguments[0]?.getText()
          if (arg === "false" || arg === "null" || arg === "undefined") continue
          judge(`a sheet (${tag}) opened (${set.name})`, call, gates(call))
        }
      }
    }
    // A root chosen as a value: `const Root = phone ? Drawer : Popover`.
    if (ts.isConditionalExpression(n) && [n.whenTrue, n.whenFalse].some((e) => ts.isIdentifier(e) && isDrawerName(e))) judge("a sheet (Drawer) chosen as a value", n, [n.condition, ...gates(n)])
    ts.forEachChild(n, visit)
  }
  visit(src.sf)
  return findings
}

/** Where a component that is passed whether to be a sheet is used: what each use passes. */
function scanUses(users: (name: string) => Source[], wanted: Wanted[]): Finding[] {
  const findings: Finding[] = []
  const done = new Set<string>()
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i]
    const key = `${w.file}:${w.name}:${w.prop}`
    if (done.has(key)) continue
    done.add(key)
    for (const src of users(w.name)) {
      if (src.rel !== w.file && !src.imports.has(w.file)) continue
      const visit = (n: ts.Node) => {
        const o = opening(n)
        if (o && lastName(o.tagName.getText()) === w.name) {
          const a = o.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === w.prop)
          const value = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined
          if (value) {
            const screen = readings(value)
            if (screen.size) findings.push({ file: src.rel, why: `${src.rel}:${line(src, o)}: <${w.name} ${w.prop}={…}> decides a sheet by ${[...screen].join(", ")}, not useSheetMode` })
            for (const p of propsIn(value)) wanted.push({ file: src.rel, ...p })
          }
        }
        ts.forEachChild(n, visit)
      }
      visit(src.sf)
    }
  }
  return findings
}

/** `sources` choose; `users` may use what they make (all of them, unless told). */
function scan(sources: Source[], users: (name: string) => Source[] = () => sources): Finding[] {
  const wanted: Wanted[] = []
  const findings = sources.flatMap((s) => scanFile(s, wanted))
  return [...findings, ...scanUses(users, wanted)]
}

function files(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.tsx$/.test(e.name) && !/\.(test|spec)\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

/** A file that may choose a sheet some other way, with why. Empty: keep it so. */
const BASELINE: Record<string, string> = {}

function scanAll(): Finding[] {
  const rels = DIRS.flatMap((d) => files(d)).filter((f) => !OWN.has(f) && !f.startsWith("lib/testing/"))
  const text = new Map(rels.map((r) => [r, readFileSync(join(ROOT, r), "utf8")]))
  // Only a file that names the Drawer, or a component of a file that imports it, can draw a sheet: the rest aren't parsed.
  const names = new Set(["Drawer"])
  for (const [rel, t] of text) {
    if (!/from ["'](?:@\/components\/ui\/drawer|vaul)["']/.test(t)) continue
    for (const m of t.matchAll(/(?:function|const)\s+([A-Z]\w*)/g)) names.add(m[1])
    names.add(rel.replace(/^.*\//, "").replace(/\.tsx$/, ""))
  }
  const named = new RegExp(`[<.](?:${[...names].join("|")})\\b`)
  const sources = rels.filter((r) => named.test(text.get(r)!)).map(load).filter((s): s is Source => !!s)
  const users = (name: string) => rels.filter((r) => text.get(r)!.includes(name)).map(load).filter((s): s is Source => !!s)
  return scan(sources, users).filter((f) => !BASELINE[f.file])
}

/** What the guard finds in a source of its own, as `rel`. */
const findingsIn = (rel: string, text: string) => scan([parse(rel, text)]).map((f) => f.why)

const HEAD = `import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useMedia } from "@/context/MediaQueryContext"
import { usePhone } from "@/hooks/usePhone"
import { useSheetMode } from "@/components/ui/overlayMode"
`

describe("the one sheet rule", () => {
  it("bites on each way a sheet was chosen by the layout's width", () => {
    const planted = {
      "an if on isMobile": `export function A() { const { isMobile } = useMedia(); if (isMobile) return <Drawer open><DrawerContent /></Drawer>; return <Popover open><PopoverContent /></Popover> }`,
      "a ternary on usePhone": `export function A() { const phone = usePhone(); return phone ? <Drawer open /> : <Popover open /> }`,
      "an early return on isDesktop": `export function A() { const { isDesktop } = useMedia(); if (isDesktop) return <Popover open />; return <Drawer open /> }`,
      "a width query read once": `function isPhone() { return window.matchMedia("(max-width: 639px)").matches }
export function A() { const [phone] = React.useState(isPhone); return <>{phone && <Drawer open />}</> }`,
      "a sheet of its own, chosen by width": `function MenuSheet() { return <Drawer open /> }
export function A() { const { isMobile } = useMedia(); return isMobile ? <MenuSheet /> : <Popover open /> }`,
      "its open state set by width": `export function A() { const { isDesktop } = useMedia(); const [open, setOpen] = React.useState(false); const ask = () => (isDesktop ? openPanel() : setOpen(true)); return <Drawer open={open} /> }`,
      "a prop passed the width": `function Save({ compact }: { compact?: boolean }) { return compact ? <Drawer open /> : <Popover open /> }
export function A() { const { isMobile } = useMedia(); return <Save compact={isMobile} /> }`,
      "a root chosen as a value": `export function A() { const { isMobile } = useMedia(); const Root = isMobile ? Drawer : Popover; return <Root open /> }`,
    }
    for (const [how, body] of Object.entries(planted)) {
      expect(findingsIn("components/planted.tsx", HEAD + body), how).toHaveLength(1)
    }
  })

  it("lets the rule choose, and anything else decide what is in a sheet", () => {
    const fine = [
      `export function A() { const sheet = useSheetMode(); return sheet ? <Drawer open /> : <Popover open /> }`,
      `export function A({ open }: { open: boolean }) { const sheet = useSheetMode(); const { isMobile } = useMedia(); if (!sheet) return <Popover open={open} />; return <Drawer open={open}><DrawerContent className={isMobile ? "p-3" : "p-4"} /></Drawer> }`,
      `function Save({ compact }: { compact?: boolean }) { return compact ? <Drawer open /> : <Popover open /> }
export function A() { const sheet = useSheetMode(); return <Save compact={sheet} /> }`,
      `export function A() { const sheet = useSheetMode(); const { isMobile } = useMedia(); const [open, setOpen] = React.useState(false); const ask = () => (sheet ? setOpen(true) : openPanel()); return <>{isMobile ? <span /> : null}<Drawer open={open} /></> }`,
      `export function A() { const sheet = useSheetMode(); const Root = sheet ? Drawer : Popover; return <Root open /> }`,
    ]
    for (const body of fine) expect(findingsIn("components/planted.tsx", HEAD + body)).toEqual([])
  })

  it("would see the pause menu go back to isMobile", () => {
    const rel = "components/notifications/PauseNotificationsDialog.tsx"
    const source = readFileSync(join(ROOT, rel), "utf8")
    expect(findingsIn(rel, source), "the pause menu, as it is").toEqual([])
    const planted = source.replace("const sheet = useSheetMode()", "const { isMobile: sheet } = useMedia()")
    expect(planted).not.toBe(source)
    expect(findingsIn(rel, planted).join("\n")).toMatch(/a sheet \(Drawer\) chosen by useMedia/)
  })

  it("every sheet is chosen by useSheetMode", () => {
    expect(scanAll().map((f) => f.why), "choose it with useSheetMode (components/ui/overlayMode); isMobile may still choose its layout").toEqual([])
  })

  it("keeps no baseline entry that has nothing left to excuse", () => {
    const stale = Object.keys(BASELINE).filter((rel) => {
      const src = load(rel)
      return !src || scan([src]).length === 0
    })
    expect(stale).toEqual([])
  })
})
