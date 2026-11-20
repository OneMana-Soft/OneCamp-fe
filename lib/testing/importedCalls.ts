import { dirname, join, normalize } from "node:path"
import ts from "typescript"

/**
 * Where a guard finds the calls of one export of a module in a file, under
 * whatever name the file gives it (V-978's CR-311): next/dynamic for the
 * boundary guard, lazyDialog for the confirm's. A file can name an export in
 * four ways, and a guard that knew only the first let the others through:
 *   import dynamic from "next/dynamic"            dynamic(...)
 *   import { default as dyn } from "next/dynamic"  dyn(...)
 *   import * as next from "next/dynamic"           next.default(...)
 *   import { lazyDialog as dialog } from "..."     dialog(...)
 */

/** A file parsed as the guards read it: TSX for .tsx, TS otherwise (so `<T>x` parses). */
export function parseSource(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

/** "file:line" of a node, the line 1-based. */
export function lineOf(sf: ts.SourceFile, n: ts.Node): string {
  return `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
}

/** What a specifier in `file` names: a repo path with no ending for "@/x" and "./x", else the package as written. */
export function specPath(file: string, spec: string): string {
  const path = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? normalize(join(dirname(file), spec)) : spec
  return path.replace(/\.(tsx?|jsx?|mjs)$/, "")
}

/** A string an import names: a string literal, or a template literal with nothing put into it. */
export function literalText(n: ts.Node | undefined): string | null {
  return n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null
}

export interface ImportedCall {
  call: ts.CallExpression
  /**
   * What its first argument is: the argument itself, or, when it's passed by
   * name, that name's declaration in the same file (`const load = ...`'s
   * initializer, or `function load() {...}`); undefined when there's none.
   */
  loader: ts.Node | undefined
  /** The name the first argument was passed by, if it was. */
  loaderName?: string
}

/** The declaration of `name` at the file's top level: a const's initializer, or a function. */
export function declarationOf(sf: ts.SourceFile, name: string): ts.Node | undefined {
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name?.text === name) return s
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer
  }
  return undefined
}

/** Each call of `name` (an export's name, "default" for a default export) from `module` (a specPath) in a file. */
export function importedCalls(sf: ts.SourceFile, module: string, name: string): ImportedCall[] {
  const direct = new Set<string>()
  const spaces = new Set<string>()
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || specPath(sf.fileName, s.moduleSpecifier.text) !== module) continue
    const clause = s.importClause
    if (!clause || clause.isTypeOnly) continue
    if (name === "default" && clause.name) direct.add(clause.name.text)
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) spaces.add(bindings.name.text)
    if (bindings && ts.isNamedImports(bindings))
      for (const e of bindings.elements) if (!e.isTypeOnly && (e.propertyName ?? e.name).text === name) direct.add(e.name.text)
  }
  if (direct.size === 0 && spaces.size === 0) return []
  const calls: ImportedCall[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression
      const ours =
        (ts.isIdentifier(callee) && direct.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && spaces.has(callee.expression.text) && callee.name.text === name)
      if (ours) {
        const first = n.arguments[0]
        calls.push(first && ts.isIdentifier(first) ? { call: n, loader: declarationOf(sf, first.text), loaderName: first.text } : { call: n, loader: first })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return calls
}
