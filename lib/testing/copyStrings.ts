import { relative } from "node:path"

import ts from "typescript"

import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * The copy people read, as the copy guards see it (copyRules, visibleCopy,
 * britishSpelling, glossaryGuard): every JSX text, string literal and template
 * piece in the source that ships, and every string in the English messages.
 * Comments and identifiers are never read, so they may say what they like.
 */

/** The folders whose source holds the copy. */
export const COPY_DIRS = ["app", "components", "hooks", "lib", "services", "store", "context"]

/** The English messages. */
export const EN_MESSAGES = "lib/utils/i18n/locales/en/en.json"

/** The source files under COPY_DIRS that ship (.ts and .tsx; no tests, specs or declarations), as repo paths. */
export function copyFiles(): string[] {
  return sourceFiles(COPY_DIRS, /\.tsx?$/).filter((f) => !f.endsWith(".d.ts"))
}

export interface CopyText {
  /** The text as written, between its quotes. */
  text: string
  node: ts.Node
  sf: ts.SourceFile
}

export function parse(file: string, src: string): ts.SourceFile {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

/** Every JSX text, string literal and template piece in one file, in source order. */
export function copyTexts(file: string, src: string): CopyText[] {
  const sf = parse(file, src)
  const out: CopyText[] = []
  const visit = (node: ts.Node) => {
    let text: string | null = null
    if (ts.isJsxText(node)) text = node.text
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text
    if (text !== null) out.push({ text, node, sf })
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** "file:line" for a text, the file as given relative to the repo. */
export function lineOf({ node, sf }: CopyText): string {
  return `${relative(process.cwd(), sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
}

/** Attributes whose value the code reads and no one sees (data-tip is a tooltip, so it is copy). */
const CODE_ATTRS = /^(className|class|key|href|id|src|data-(?!tip$)[\w-]+)$/
/** One lowercase token joined by separators, or a path: a storage key, a route, an address ("onecamp-doc-backlinks-hidden:", "/doc/backlinks/"). */
const KEY = /^(?:\/\S*|https?:\/\/\S*|[a-z0-9]+(?:[-_.:/][a-z0-9]*)+)$/

/**
 * A string the code reads and no person does: a module path, an object's key,
 * a type, a storage key or a route, or the value of a class, key, href, id or
 * data-* attribute. An aria-label, a title, a placeholder or a data-tip is
 * copy (someone sees it or a screen reader says it).
 */
export function isCode({ text, node, sf }: CopyText): boolean {
  if (ts.isJsxText(node)) return false
  if (KEY.test(text)) return true
  const p = node.parent
  if (!p) return false
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true
  if (ts.isCallExpression(p) && (p.expression.kind === ts.SyntaxKind.ImportKeyword || p.expression.getText(sf) === "require")) return true
  if (ts.isLiteralTypeNode(p)) return true
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === node) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
  let attr: ts.Node | undefined = p
  if (attr && ts.isJsxExpression(attr)) attr = attr.parent
  if (attr && ts.isJsxAttribute(attr)) return CODE_ATTRS.test(attr.name.getText(sf))
  return false
}

/** Every string in a messages file, as its key path and its text. */
export function messageTexts(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }]
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => messageTexts(v, path ? `${path}.${k}` : k))
  return []
}
