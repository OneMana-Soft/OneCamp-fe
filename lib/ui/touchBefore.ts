import ts from "typescript"
import postcss from "postcss"

/**
 * Where a touch target also draws with ::before (app/phone.css F3), read from
 * the source. Under a coarse pointer every [data-touch-target] and
 * .shell-icon-btn gets a ::before as its 44 px reach: absolute, with an
 * inset, and unlayered. So whatever the element drew with its own ::before (a
 * Tailwind before: class, or a stylesheet's ::before on one of its classes or
 * data attributes) loses its place and size on a phone. The calendar's today
 * ring sat off its day this way (22 Oct). Draw it with ::after instead. Read
 * by app/touchBeforeGuard.test.ts. Pure.
 *
 * A touch target is:
 * - an element written with data-touch-target or the shell-icon-btn class;
 * - one of the base controls that sets data-touch-target itself (a component
 *   in components/ui whose top element writes it: Button, Switch, a radio, a
 *   tab...). One that writes it on an element inside (a sheet's close button)
 *   isn't one; that element is read as written.
 * A component given data-touch-target by its caller (DayCell, by the phone's
 * week strip) draws what its own file draws.
 */

export interface Source {
  file: string
  text: string
}

/** A class that draws with ::before, under any variants: before:…, hover:before:…, data-[x]:before:…. */
const BEFORE_CLASS = /(?:^|[\s"'`{(,])(?:[\w-]+(?:\[[^\]]*\])?:)*before:\S/
export const drawsBefore = (classes: string) => BEFORE_CLASS.test(classes)

const tsx = (s: Source) => ts.createSourceFile(s.file, s.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function opening(node: ts.Node): ts.JsxOpeningLikeElement | undefined {
  if (ts.isJsxElement(node)) return node.openingElement
  if (ts.isJsxSelfClosingElement(node)) return node
  return undefined
}

/** The names a file declares at its top, with the text that declares each. */
function declarations(sf: ts.SourceFile): Map<string, ts.Node> {
  const out = new Map<string, ts.Node>()
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) out.set(st.name.text, st)
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.set(d.name.text, d)
  }
  return out
}

/** The function a declaration names, through forwardRef(…) or memo(…) around it. */
function declaredFunction(node: ts.Node): ts.SignatureDeclaration | undefined {
  let n: ts.Node | undefined = ts.isVariableDeclaration(node) ? node.initializer : node
  while (n && ts.isCallExpression(n)) n = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a) || ts.isCallExpression(a))
  return n && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) ? n : undefined
}

/**
 * The elements a component renders at its top: what it returns, through
 * parentheses, either side of a ?: or the end of an &&, a fragment's children,
 * and a const the body names (Button returns <>{button}…</>).
 */
function rootElements(fn: ts.SignatureDeclaration): ts.JsxOpeningLikeElement[] {
  const out: ts.JsxOpeningLikeElement[] = []
  const body = (fn as ts.FunctionLikeDeclarationBase).body
  const locals = new Map<string, ts.Expression>()
  if (body && ts.isBlock(body)) {
    for (const st of body.statements) {
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) locals.set(d.name.text, d.initializer)
    }
  }
  const take = (e: ts.Node | undefined) => {
    if (!e) return
    if (ts.isParenthesizedExpression(e) || ts.isJsxExpression(e)) take(e.expression)
    else if (ts.isConditionalExpression(e)) [e.whenTrue, e.whenFalse].forEach(take)
    else if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) take(e.right)
    else if (ts.isJsxFragment(e)) e.children.forEach(take)
    else if (ts.isIdentifier(e)) take(locals.get(e.text))
    else {
      const el = opening(e)
      if (el) out.push(el)
    }
  }
  if (body && !ts.isBlock(body)) take(body)
  const returns = (n: ts.Node) => {
    if (ts.isReturnStatement(n)) take(n.expression)
    else if (!ts.isFunctionLike(n)) ts.forEachChild(n, returns)
  }
  if (body && ts.isBlock(body)) ts.forEachChild(body, returns)
  return out
}

const writesTouchTarget = (el: ts.JsxOpeningLikeElement) => el.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === "data-touch-target")

/** The base controls that write data-touch-target themselves, on their top element: the one a caller styles. */
export function touchPrimitives(sources: Source[]): Set<string> {
  const out = new Set<string>()
  for (const s of sources) {
    if (!s.file.startsWith("components/ui/") || !s.text.includes("data-touch-target")) continue
    for (const [name, node] of declarations(tsx(s))) {
      const fn = /^[A-Z]/.test(name) ? declaredFunction(node) : undefined
      if (fn && rootElements(fn).some(writesTouchTarget)) out.add(name)
    }
  }
  return out
}

/** Every string constant declared at a file's top (DAY_CELL_TODAY…), by name. */
function constants(sources: Source[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of sources) {
    for (const [name, node] of declarations(tsx(s))) {
      const init = ts.isVariableDeclaration(node) ? node.initializer : undefined
      if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) out.set(name, init.text)
    }
  }
  return out
}

/** The class text an expression can give: its strings, and the constants it names. */
function classText(node: ts.Node | undefined, consts: Map<string, string>): string {
  if (!node) return ""
  const parts: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) parts.push(n.text)
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) parts.push(n.text)
    else if (ts.isIdentifier(n) && consts.has(n.text)) parts.push(consts.get(n.text)!)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return parts.join(" ")
}

/** Where a component used in a file is declared: the file it is imported from, or this one. */
function fileOf(sf: ts.SourceFile, name: string, files: Map<string, Source>): Source | undefined {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const names = st.importClause?.namedBindings
    const named = names && ts.isNamedImports(names) ? names.elements.map((e) => e.name.text) : []
    if (st.importClause?.name?.text !== name && !named.includes(name)) continue
    const spec = st.moduleSpecifier.text
    const dir = sf.fileName.split("/").slice(0, -1).join("/")
    const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? normalise(`${dir}/${spec}`) : undefined
    if (!base) return undefined
    return [".tsx", ".ts", "/index.tsx", "/index.ts"].map((x) => files.get(base + x)).find(Boolean)
  }
  return declarations(sf).has(name) ? files.get(sf.fileName) : undefined
}

function normalise(path: string): string {
  const out: string[] = []
  for (const p of path.split("/")) {
    if (p === "..") out.pop()
    else if (p !== "." && p !== "") out.push(p)
  }
  return out.join("/")
}

/**
 * The classes and data attributes a stylesheet draws ::before on, each with
 * where. F3's own reach (on data-touch-target and .shell-icon-btn) isn't one.
 */
export function stylesheetBefore(sheets: Source[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const sheet of sheets) {
    postcss.parse(sheet.text).walkRules((rule) => {
      for (const sel of rule.selectors) {
        if (!/::?before\b/.test(sel) || /data-touch-target|shell-icon-btn/.test(sel)) continue
        // The compound the ::before belongs to: from the last combinator before it.
        for (const m of sel.matchAll(/([^\s>+~]*?)::?before\b/g)) {
          for (const c of m[1].matchAll(/\.([\w-]+)/g)) out.set(`.${c[1]}`, `${sheet.file}: ${sel}`)
          // An attribute with a value is keyed with it: [data-press="row"].
          for (const a of m[1].matchAll(/\[([\w-]+)(?:[~|^$*]?=\s*"?([^"\]]*)"?)?\]/g)) out.set(a[2] === undefined ? `[${a[1]}]` : `[${a[1]}="${a[2]}"]`, `${sheet.file}: ${sel}`)
        }
      }
    })
  }
  return out
}

/** Every touch target that also draws with ::before, said in a line each. */
export function touchBefore(sources: Source[], sheets: Source[]): string[] {
  const files = new Map(sources.map((s) => [s.file, s]))
  const primitives = touchPrimitives(sources)
  const consts = constants(sources)
  const cssBefore = stylesheetBefore(sheets)
  const out: string[] = []
  for (const s of sources) {
    if (!s.file.startsWith("components/ui/")) continue
    const decls = declarations(tsx(s))
    for (const [name, node] of decls) {
      if (!primitives.has(name)) continue
      // Its own text and what it names in its file: Button draws through buttonVariants.
      const named = new Set<string>()
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text !== name && decls.has(n.text)) named.add(n.text)
        ts.forEachChild(n, visit)
      }
      visit(node)
      if (drawsBefore([node, ...[...named].map((n) => decls.get(n)!)].map((n) => n.getText()).join("\n"))) out.push(`${s.file}: ${name}, a base control, draws with before:`)
    }
  }
  for (const s of sources) {
    if (!s.text.includes("data-touch-target") && !s.text.includes("shell-icon-btn") && ![...primitives].some((p) => s.text.includes(`<${p}`))) continue
    const sf = tsx(s)
    const visit = (node: ts.Node) => {
      const el = opening(node)
      if (el) {
        const tag = el.tagName.getText()
        const attrs = el.attributes.properties.filter(ts.isJsxAttribute)
        const named = (n: string) => attrs.find((a) => a.name.getText() === n)
        const classes = classText(named("className")?.initializer, consts)
        const given = !!named("data-touch-target")
        if (given || primitives.has(tag) || /(?:^|\s)shell-icon-btn(?:\s|$)/.test(classes)) {
          const at = `${s.file}:${sf.getLineAndCharacterOfPosition(el.getStart()).line + 1} <${tag}>`
          if (drawsBefore(classes)) out.push(`${at} draws with before: in its className`)
          if (given && /^[A-Z]/.test(tag) && !primitives.has(tag)) {
            const own = fileOf(sf, tag, files)
            if (own && drawsBefore(own.text)) out.push(`${at} is given data-touch-target, and ${own.file} draws with before:`)
          }
          const keys = [...classes.split(/\s+/).filter((c) => c && !c.includes(":")).map((c) => `.${c}`), ...attrs.map((a) => `[${a.name.getText()}]`)]
          // A valued key matches the values the attribute can take: the strings
          // its expression names, or any value where it names none.
          for (const a of attrs) {
            const values = classText(a.initializer, consts).split(" ").filter(Boolean)
            for (const [k] of cssBefore) {
              const m = k.match(/^\[([\w-]+)="(.*)"\]$/)
              if (m && m[1] === a.name.getText() && (!values.length || values.includes(m[2]))) keys.push(k)
            }
          }
          for (const k of keys) if (cssBefore.has(k)) out.push(`${at} has ${k}, and ${cssBefore.get(k)} draws ::before on it`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}
