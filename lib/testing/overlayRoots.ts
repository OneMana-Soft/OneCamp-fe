import ts from "typescript"

/**
 * The overlays a UI library draws, read from its readable build (miro-40 H1,
 * CR-185's N1), so a guard can hold every one to a rule, and one a new version
 * adds can't slip past a list kept by hand (app/excalidrawSheetsGuard.test.ts:
 * each docks as the app's sheet on a phone, or is named as never shown).
 *
 * A root is an element the library draws as an overlay: a Radix
 * Popover.Content, an element with role="dialog", or what it renders through
 * createPortal. Its classes are the ones written on it. One that passes its
 * caller's className on is a root per caller, with that caller's classes, or,
 * where the caller writes none, those of the first element inside the caller.
 * One that writes none takes those of the first element inside it, following a
 * component to the element it returns. `inside` holds the classes on the
 * elements it draws itself, its surface (a dialog's box inside its backdrop):
 * not a component's it calls, nor what a caller hands it to hold.
 *
 * It reads the JSX calls of an esbuild build (jsx/jsxs, numbered), one file at
 * a time: a component is found in the file that calls it.
 */
export interface OverlayRoot {
  /** What it is and where: its kind, the component that draws it, and the caller that names it. */
  where: string
  classes: string[]
  inside: string[]
}

type Element = ts.CallExpression
type Classes = { classes: string[]; passed: boolean }

const ELEMENT = /^jsxs?\d*$/
const POPOVER = "@radix-ui/react-popover"

const isElement = (node: ts.Node): node is Element =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ELEMENT.test(node.expression.text) && node.arguments.length >= 2

function prop(el: Element, name: string): ts.Expression | undefined {
  const props = el.arguments[1]
  if (!ts.isObjectLiteralExpression(props)) return undefined
  for (const p of props.properties)
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) return p.initializer
  return undefined
}

/** The classes a className expression writes; `passed` when it hands on a value from outside (a caller's className). */
function classesOf(e: ts.Expression | undefined, out: Classes = { classes: [], passed: false }): Classes {
  if (!e) return out
  const words = (text: string) => out.classes.push(...text.split(/\s+/).filter(Boolean))
  if (ts.isStringLiteralLike(e)) words(e.text)
  else if (ts.isTemplateExpression(e)) {
    words(e.head.text)
    for (const span of e.templateSpans) {
      words(span.literal.text)
      classesOf(span.expression, out)
    }
  } else if (ts.isCallExpression(e)) for (const a of e.arguments) classesOf(a, out)
  else if (ts.isConditionalExpression(e)) for (const branch of [e.whenTrue, e.whenFalse]) classesOf(branch, out)
  else if (ts.isBinaryExpression(e)) classesOf(e.right, out)
  else if (ts.isParenthesizedExpression(e)) classesOf(e.expression, out)
  else if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) out.passed = true
  // An object of modifiers ({ active: on }) names a state, never the overlay.
  return out
}

function firstElement(e: ts.Expression | undefined): Element | undefined {
  if (!e) return undefined
  if (isElement(e)) return e
  if (ts.isArrayLiteralExpression(e)) {
    for (const x of e.elements) {
      const found = firstElement(x)
      if (found) return found
    }
    return undefined
  }
  if (ts.isConditionalExpression(e)) return firstElement(e.whenTrue) ?? firstElement(e.whenFalse)
  if (ts.isBinaryExpression(e)) return firstElement(e.right)
  if (ts.isParenthesizedExpression(e)) return firstElement(e.expression)
  return undefined
}

/** A component's function, under memo or forwardRef. */
function functionOf(e: ts.Expression | undefined): ts.SignatureDeclaration | undefined {
  if (!e) return undefined
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e
  if (ts.isCallExpression(e)) return functionOf(e.arguments[0])
  if (ts.isParenthesizedExpression(e)) return functionOf(e.expression)
  return undefined
}

/** The element a component returns: its first return of one, outside the functions inside it. */
function returned(fn: ts.SignatureDeclaration): Element | undefined {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return firstElement(fn.body)
  let found: Element | undefined
  const visit = (node: ts.Node): void => {
    if (found || (node !== fn && ts.isFunctionLike(node))) return
    if (ts.isReturnStatement(node)) found = firstElement(node.expression)
    else ts.forEachChild(node, visit)
  }
  ts.forEachChild(fn, visit)
  return found
}

export function overlayRoots(code: string, file = "bundle.js"): OverlayRoot[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const popovers = new Set<string>()
  const contents = new Set<string>()
  const components = new Map<string, ts.SignatureDeclaration>()
  const elements: Element[] = []
  const portals: Element[] = []
  for (const s of source.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === POPOVER) {
      const bound = s.importClause?.namedBindings
      if (bound && ts.isNamespaceImport(bound)) popovers.add(bound.name.text)
      else if (bound) for (const n of bound.elements) if ((n.propertyName ?? n.name).text === "Content") contents.add(n.name.text)
    } else if (ts.isFunctionDeclaration(s) && s.name) components.set(s.name.text, s)
    else if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations) {
        const fn = ts.isIdentifier(d.name) ? functionOf(d.initializer) : undefined
        if (fn) components.set((d.name as ts.Identifier).text, fn)
      }
  }
  const visit = (node: ts.Node): void => {
    if (isElement(node)) elements.push(node)
    else if (ts.isCallExpression(node) && /(^|\.)createPortal\d*$/.test(node.expression.getText(source))) {
      const el = firstElement(node.arguments[0])
      if (el) portals.push(el)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  const typeOf = (el: Element) => el.arguments[0]
  const isPopover = (el: Element) => {
    const t = typeOf(el)
    return ts.isPropertyAccessExpression(t) ? t.name.text === "Content" && ts.isIdentifier(t.expression) && popovers.has(t.expression.text) : ts.isIdentifier(t) && contents.has(t.text)
  }
  const isDialog = (el: Element) => {
    const role = prop(el, "role")
    return !!role && ts.isStringLiteralLike(role) && role.text === "dialog"
  }
  /** The top-level declaration a node sits in: the component that draws it. */
  const ownerOf = (node: ts.Node): string => {
    let at = node
    while (at.parent && at.parent !== source) at = at.parent
    if (ts.isFunctionDeclaration(at)) return at.name?.text ?? "?"
    if (ts.isVariableStatement(at)) return at.declarationList.declarations[0]?.name.getText(source) ?? "?"
    return "?"
  }
  /** The classes on `el`, or on the first element inside it, following a component to what it returns. */
  const surface = (el: Element | undefined, depth = 0): string[] => {
    if (!el || depth > 8) return []
    const own = classesOf(prop(el, "className")).classes
    if (own.length) return own
    const t = typeOf(el)
    const fn = ts.isIdentifier(t) ? components.get(t.text) : undefined
    if (fn) return surface(returned(fn), depth + 1)
    return surface(firstElement(prop(el, "children")), depth + 1)
  }
  /** The classes on the elements `el` draws itself: not inside a component it calls. */
  const drawn = (el: Element): string[] => {
    const out: string[] = []
    const visit = (node: ts.Node): void => {
      if (isElement(node)) {
        out.push(...classesOf(prop(node, "className")).classes)
        if (node !== el && ts.isIdentifier(typeOf(node)) && components.has((typeOf(node) as ts.Identifier).text)) return
      }
      ts.forEachChild(node, visit)
    }
    visit(el)
    return [...new Set(out)]
  }

  const roots: OverlayRoot[] = []
  const seen = new Set<Element>()
  const kinds = (el: Element) => [isPopover(el) && "Popover.Content", isDialog(el) && 'role="dialog"', portals.includes(el) && "createPortal"].filter(Boolean).join(", ")
  for (const el of [...elements, ...portals]) {
    if (seen.has(el) || !(isPopover(el) || isDialog(el) || portals.includes(el))) continue
    seen.add(el)
    const owner = ownerOf(el)
    const own = classesOf(prop(el, "className"))
    const where = `${kinds(el)} in ${owner}`
    const callers = own.passed ? elements.filter((c) => ts.isIdentifier(typeOf(c)) && (typeOf(c) as ts.Identifier).text === owner) : []
    if (!callers.length) {
      roots.push({ where, classes: own.classes.length ? own.classes : surface(firstElement(prop(el, "children"))), inside: drawn(el) })
      continue
    }
    for (const c of callers) {
      const theirs = classesOf(prop(c, "className")).classes
      const named = theirs.length ? theirs : surface(firstElement(prop(c, "children")))
      roots.push({ where: `${where}, from ${ownerOf(c)}`, classes: [...new Set([...own.classes, ...named])], inside: drawn(el) })
    }
  }
  return roots
}
