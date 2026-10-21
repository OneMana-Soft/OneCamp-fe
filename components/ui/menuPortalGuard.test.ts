import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * EVERY MENU AND SIDE MENU IS PORTALLED (18 Oct 2026).
 *
 * The board card's "Move to…" opened nothing a person could see, in every
 * browser: its side menu was drawn inside the menu it opens from, and that
 * menu clips its overflow (it scrolls) and, holding the last frame of its
 * entrance animation, is the containing block of every fixed box inside it.
 * Radix places a side menu in a fixed box beside its menu, so the clip cut
 * all of it away. It had been so since the card's menu came (7543f5208, 11
 * Oct), and for six more side menus since theirs. Portalled to the page, a
 * menu is no other menu's descendant, and nothing a menu does can clip it.
 *
 * It fails when:
 *   1. a Radix menu's Content or SubContent (dropdown, context menu, menubar)
 *      is drawn with no Portal of its library around it, the primitive's own
 *      (components/ui/dropdown-menu.tsx) among them;
 *   2. the primitive's DropdownMenuSubContent, portalled already, is wrapped
 *      in another DropdownMenuPortal (two ways to do one thing: the next
 *      side menu copies whichever it sees).
 * The baseline is zero, and each rule is shown biting on a fixture.
 */

const RADIX_MENUS = new Set(["@radix-ui/react-dropdown-menu", "@radix-ui/react-context-menu", "@radix-ui/react-menubar", "@radix-ui/react-menu"])
/** The app's own menu primitives, whose side menus come portalled. */
const PRIMITIVES = new Set(["@/components/ui/dropdown-menu", "@/components/ui/context-menu", "@/components/ui/menubar"])

type Kind = "raw-content" | "raw-portal" | "primitive-sub" | "primitive-portal" | null

export function menuPortalFindings(file: string, src: string): string[] {
  if (!/react-(?:dropdown-menu|context-menu|menubar|menu)"|components\/ui\/(?:dropdown-menu|context-menu|menubar)"/.test(src)) return []
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const namespaces = new Set<string>()
  const raw = new Map<string, string>()
  const primitive = new Map<string, string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue
    const from = st.moduleSpecifier.text
    const bindings = st.importClause.namedBindings
    if (RADIX_MENUS.has(from)) {
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) raw.set(el.name.text, (el.propertyName ?? el.name).text)
    } else if (PRIMITIVES.has(from) && bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) primitive.set(el.name.text, (el.propertyName ?? el.name).text)
    }
  }

  const kindOf = (tag: ts.JsxTagNameExpression): Kind => {
    let name: string | undefined
    if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && namespaces.has(tag.expression.text)) name = tag.name.text
    else if (ts.isIdentifier(tag) && raw.has(tag.text)) name = raw.get(tag.text)
    if (name !== undefined) {
      if (/(?:^|Menu|Menubar)(?:Sub)?Content$/.test(name)) return "raw-content"
      if (/Portal$/.test(name)) return "raw-portal"
      return null
    }
    if (ts.isIdentifier(tag) && primitive.has(tag.text)) {
      const imported = primitive.get(tag.text)!
      if (/SubContent$/.test(imported)) return "primitive-sub"
      if (/Portal$/.test(imported)) return "primitive-portal"
    }
    return null
  }

  /** The JSX elements around a node, nearest first. */
  const enclosing = (node: ts.Node): ts.JsxElement[] => {
    const out: ts.JsxElement[] = []
    for (let p = node.parent; p; p = p.parent) if (ts.isJsxElement(p) && p.openingElement !== node) out.push(p)
    return out
  }
  /** A Portal of its own: met before the menu it opens from (the menu's own Portal doesn't count). */
  const portalled = (node: ts.Node): boolean => {
    for (const el of enclosing(node)) {
      const kind = kindOf(el.openingElement.tagName)
      if (kind === "raw-portal") return true
      if (kind === "raw-content") return false
    }
    return false
  }

  const findings: string[] = []
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
    if (opening) {
      const kind = kindOf(opening.tagName)
      const line = sf.getLineAndCharacterOfPosition(opening.getStart()).line + 1
      const tag = opening.tagName.getText(sf)
      if (kind === "raw-content" && !portalled(node)) {
        findings.push(`${file}:${line}  <${tag}> is drawn where it opens, with no Portal around it: a menu that clips or holds a transform cuts it away`)
      }
      if (kind === "primitive-sub") {
        const parent = enclosing(node)[0]
        if (parent && kindOf(parent.openingElement.tagName) === "primitive-portal") {
          findings.push(`${file}:${line}  <${tag}> is portalled already; drop the <${parent.openingElement.tagName.getText(sf)}> around it`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

describe("every menu and side menu is portalled", () => {
  it("draws no menu content inside another menu or where it opens", () => {
    const root = process.cwd()
    const found = ["components", "app"].flatMap((d) => walk(join(root, d))).flatMap((f) => menuPortalFindings(relative(root, f), readFileSync(f, "utf8")))
    expect(found, found.join("\n")).toEqual([])
  })

  it("portals the primitive's side menu itself", () => {
    const src = readFileSync(join(process.cwd(), "components/ui/dropdown-menu.tsx"), "utf8")
    const body = src.slice(src.indexOf("const DropdownMenuSubContent ="), src.indexOf("DropdownMenuSubContent.displayName"))
    expect(body).toMatch(/<DropdownMenuPrimitive\.Portal>\s*<DropdownMenuPrimitive\.SubContent\b/)
  })

  it("bites: a raw side menu or menu with no Portal, and a portal around the primitive's side menu", () => {
    const rawNs = `import * as Menu from "@radix-ui/react-dropdown-menu"
export const A = () => (<Menu.Root><Menu.Portal><Menu.Content><Menu.Sub><Menu.SubTrigger>x</Menu.SubTrigger>{true && <Menu.SubContent>y</Menu.SubContent>}</Menu.Sub></Menu.Content></Menu.Portal></Menu.Root>)
export const B = () => (<Menu.Root><Menu.Content>z</Menu.Content></Menu.Root>)`
    expect(menuPortalFindings("raw.tsx", rawNs)).toEqual([
      expect.stringContaining("raw.tsx:2  <Menu.SubContent>"),
      expect.stringContaining("raw.tsx:3  <Menu.Content>"),
    ])
    const rawNamed = `import { SubContent as Side, Portal } from "@radix-ui/react-context-menu"
export const C = () => <Portal><Side /></Portal>
export const D = () => <Side />`
    expect(menuPortalFindings("named.tsx", rawNamed)).toEqual([expect.stringContaining("named.tsx:3  <Side>")])
    const primitive = `import { DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent } from "@/components/ui/dropdown-menu"
export const E = () => <DropdownMenuSub><DropdownMenuPortal><DropdownMenuSubContent /></DropdownMenuPortal></DropdownMenuSub>
export const F = () => <DropdownMenuSub><DropdownMenuSubContent /></DropdownMenuSub>`
    expect(menuPortalFindings("primitive.tsx", primitive)).toEqual([expect.stringContaining("primitive.tsx:2  <DropdownMenuSubContent> is portalled already")])
  })
})
