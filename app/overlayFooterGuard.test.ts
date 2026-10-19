import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import ts from "typescript"

/**
 * THE OVERLAY FOOTER GUARD (design/drawers-v3/ANALYSIS.md §5.6). Every
 * surface over the page keeps its actions in its footer, where they stay in
 * view, never at the end of what scrolls: the status menu's Set status sat
 * inside the popover's scroller, 34px under the fold of a 480px window and
 * 324px down on a phone in landscape with the keyboard up (the owner, 18 Oct:
 * "why are we not using DrawerFooter beside having ugly scroll bar").
 *
 *   1. An overlay's primary action (a filled or destructive Button, a submit,
 *      an AlertDialogAction) renders inside a footer part (DialogFooter,
 *      DrawerFooter, SheetFooter, AlertDialogFooter, OverlayFooter) or a
 *      content's `footer` slot.
 *   2. A content root that holds a footer carries no overflow of its own:
 *      the body scrolls (components/ui/overlay), never the root the footer
 *      is pinned to.
 *
 * Read from the source with TypeScript's parser: each overlay content element
 * in app/ and components/ (outside components/ui), what it renders, and the
 * names it renders from this file or a file it imports (two files deep). The
 * overlays not yet moved are PENDING, by area: the list may only shrink. A
 * file that keeps the rules must leave it, and no file may join it.
 */

const ROOT = join(__dirname, "..")
const CONTENT = new Set(["DialogContent", "DrawerContent", "SheetContent", "PopoverContent", "AlertDialogContent"])
const FOOTERS = new Set(["DialogFooter", "DrawerFooter", "SheetFooter", "AlertDialogFooter", "PopoverFooter", "OverlayFooter"])
const PRIMARY_VARIANTS = new Set(["default", "destructive", "dangerSolid", "danger-solid"])

/**
 * Overlays whose actions still sit in what scrolls, or whose root still
 * scrolls under its footer: moved area by area (ANALYSIS.md §5.8, stage 3).
 * The list may only shrink.
 */
const PENDING: Record<string, string[]> = {
  "admin and settings": [
    "components/admin/AgentEditDialog.tsx",
    "components/admin/ApiTokensCard.tsx",
    "components/admin/AppsCard.tsx",
    "components/admin/DataSourceEditDialog.tsx",
    "components/admin/ImportInviteDialog.tsx",
    "components/admin/ImportPlanDialog.tsx",
    "components/admin/MarketplaceCard.tsx",
    "components/admin/McpServerEditDialog.tsx",
    "components/admin/SkillLibraryDialog.tsx",
    "components/admin/SlackImportPlanDialog.tsx",
    "components/admin/WorkflowEditDialog.tsx",
    "components/profile/ChangePasswordSection.tsx",
    "components/profile/TwoFactorSection.tsx",
  ],
  ai: [
    "components/ai/AiScheduleDialog.tsx",
    "components/ai/ComposerAIButton.tsx",
    "components/ai/ExtractTasksDialog.tsx",
    "components/ai/ReleaseNotesDialog.tsx",
    "components/ai/SaveToMemoryButton.tsx",
    "components/ai/SocialComposeDialog.tsx",
  ],
  calendar: ["components/calendar/quickCreateCard.tsx"],
  "tasks and projects": [
    "components/dialog/createTaskDialog.tsx",
    "components/goals/GoalDialog.tsx",
    "components/project/ProjectFieldsDialog.tsx",
    "components/project/ProjectFormsDialog.tsx",
    "components/project/ProjectRatesDialog.tsx",
    "components/project/ProjectShareDialog.tsx",
    "components/project/ProjectStatusesDialog.tsx",
    "components/project/ProjectsWorkload.tsx",
    "components/task/TaskDependencies.tsx",
    "components/task/taskRepeatField.tsx",
  ],
  "docs and tables": [
    "app/app/templates/page.tsx",
    "components/docEditor/history/HistorySheet.tsx",
    "components/docTemplates/TemplatePicker.tsx",
    "components/marketplace/PublishTemplateDialog.tsx",
  ],
  "chat and people": [
    "components/dialog/channelCheckInsDialog.tsx",
    "components/drawers/messageActionSheet.tsx",
    "components/messages/scheduledMessagesBar.tsx",
    "components/messages/scheduleSendButton.tsx",
    "components/notifications/PauseNotificationsDialog.tsx",
  ],
}

type Parsed = { sf: ts.SourceFile; local: Map<string, ts.Node | { alias: string }>; imports: Map<string, { spec: string; name: string }>; rel: string }
const parsed = new Map<string, Parsed | null>()

function parse(rel: string): Parsed | null {
  if (parsed.has(rel)) return parsed.get(rel)!
  const full = join(ROOT, rel)
  const entry = existsSync(full) ? parseSource(rel, readFileSync(full, "utf8")) : null
  parsed.set(rel, entry)
  return entry
}

/** A file's overlays and the names they may render, from its text. */
function parseSource(rel: string, source: string): Parsed {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const local = new Map<string, ts.Node | { alias: string }>()
  const imports = new Map<string, { spec: string; name: string }>()
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) local.set(node.name.text, node.initializer)
    if (ts.isFunctionDeclaration(node) && node.body) {
      if (node.name) local.set(node.name.text, node.body)
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) local.set("default", node.body)
    }
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) local.set("default", { alias: node.expression.text })
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const c = node.importClause
      if (c?.name) imports.set(c.name.text, { spec: node.moduleSpecifier.text, name: "default" })
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) imports.set(el.name.text, { spec: node.moduleSpecifier.text, name: (el.propertyName ?? el.name).text })
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)
  return { sf, local, imports, rel }
}

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? join(dirname(from), spec) : null
  if (!base) return null
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx")]) if (existsSync(join(ROOT, c))) return c
  return null
}

/** What a component name used in `ctx` renders: its body, in this file or the one it is imported from (outside components/ui). */
function component(name: string, ctx: Parsed, depth: number): { node: ts.Node; ctx: Parsed } | null {
  const here = ctx.local.get(name)
  if (here && !("alias" in here)) return { node: here, ctx }
  const imp = ctx.imports.get(name)
  if (!imp || depth >= 2) return null
  const file = resolveSpec(imp.spec, ctx.rel)
  if (!file || file.startsWith("components/ui/")) return null
  const other = parse(file)
  if (!other) return null
  let target = other.local.get(imp.name)
  if (target && "alias" in target) target = other.local.get(target.alias)
  return target && !("alias" in target) ? { node: target, ctx: other } : null
}

const tagOf = (n: ts.JsxOpeningLikeElement) => n.tagName.getText()
const opening = (n: ts.Node): ts.JsxOpeningLikeElement | null => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null)
function attr(el: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name)
}
function literal(el: ts.JsxOpeningLikeElement, name: string): string | null | undefined {
  const a = attr(el, name)
  if (!a) return undefined
  if (!a.initializer) return "true"
  return ts.isStringLiteral(a.initializer) ? a.initializer.text : null
}

/** A primary action: a filled or destructive Button (not an icon one), a submit, an AlertDialogAction. */
function isPrimary(el: ts.JsxOpeningLikeElement): boolean {
  const tag = tagOf(el)
  if (tag === "AlertDialogAction") return true
  if (literal(el, "type") === "submit") return tag === "Button" || tag === "button"
  if (tag !== "Button") return false
  const variant = literal(el, "variant")
  const size = literal(el, "size") ?? ""
  return (variant === undefined || (variant !== null && PRIMARY_VARIANTS.has(variant))) && !/^icon/.test(size)
}

type Finding = { file: string; why: string }

/**
 * Widgets that carry an action of their own wherever they sit, read as a
 * whole and never as the overlay's footer: the composer's Send.
 */
const WIDGETS = new Set(["components/textInput/textInput.tsx"])

/** Boxes that hold a content's parts without being one: a form, a provider, a fragment. */
const PASS_THROUGH = new Set(["form", "Form", "React.Fragment", "Fragment"])

function scanContent(rel: string, root: ts.Node, el: ts.JsxOpeningLikeElement, ctx: Parsed): Finding[] {
  const findings: Finding[] = []
  const line = ctx.sf.getLineAndCharacterOfPosition(el.getStart()).line + 1
  const seen = new Set<string>()
  let footers = 0
  // `level`: how many boxes down from the content root, a form or a fragment
  // not counted. A component from another file is read only as the root's own
  // child (a dialog's form, written in a file of its own); deeper in, it is a
  // widget with actions of its own (a composer's Send, a settings section's
  // switch), not the overlay's.
  const walk = (n: ts.Node, inFooter: boolean, c: Parsed, depth: number, level: number) => {
    const o = opening(n)
    let f = inFooter
    let next = level
    if (o) {
      const tag = tagOf(o)
      if (!PASS_THROUGH.has(tag)) next = level + 1
      if (FOOTERS.has(tag)) {
        footers++
        f = true
      }
      if (isPrimary(o) && !f) {
        const at = c.sf.getLineAndCharacterOfPosition(o.getStart()).line + 1
        findings.push({ file: rel, why: `${rel}:${line}: a primary action in what scrolls (${c.rel}:${at})` })
      }
      if (/^[A-Z]/.test(tag) && !FOOTERS.has(tag) && !CONTENT.has(tag)) {
        const found = component(tag, c, depth)
        const crosses = !!found && found.ctx !== c
        const key = found ? `${found.ctx.rel}:${tag}` : ""
        if (found && !seen.has(key) && (!crosses || next <= 1) && !WIDGETS.has(found.ctx.rel)) {
          seen.add(key)
          walk(found.node, f, found.ctx, depth + (crosses ? 1 : 0), crosses ? 0 : next)
        }
      }
      // Its attributes, then what it holds.
      for (const a of o.attributes.properties) if (ts.isJsxAttribute(a) && a.initializer) walk(a.initializer, f, c, depth, next)
      if (ts.isJsxElement(n)) for (const ch of n.children) walk(ch, f, c, depth, next)
      return
    }
    if (ts.isJsxExpression(n) && n.expression) {
      const ids: string[] = []
      const grab = (e: ts.Node) => {
        if (ts.isIdentifier(e)) ids.push(e.text)
        else if (!ts.isJsxElement(e) && !ts.isJsxSelfClosingElement(e) && !ts.isArrowFunction(e) && !ts.isFunctionExpression(e)) ts.forEachChild(e, grab)
      }
      grab(n.expression)
      for (const id of ids) {
        const target = c.local.get(id)
        const key = `${c.rel}:${id}`
        if (target && !("alias" in target) && !seen.has(key) && /</.test(target.getText())) {
          seen.add(key)
          walk(target, f, c, depth, level)
        }
      }
    }
    ts.forEachChild(n, (ch) => walk(ch, f, c, depth, level))
  }
  // The footer slot first, so what it holds is known as the footer's; then the
  // root's other attributes (a header slot) and what it holds.
  const slot = attr(el, "footer")
  if (slot?.initializer) {
    footers++
    walk(slot.initializer, true, ctx, 0, 1)
  }
  for (const a of el.attributes.properties) if (ts.isJsxAttribute(a) && a !== slot && a.initializer) walk(a.initializer, false, ctx, 0, 1)
  if (ts.isJsxElement(root)) for (const ch of root.children) walk(ch, false, ctx, 0, 0)
  // 2. A root holding a footer doesn't scroll itself.
  const cls = attr(el, "className")?.initializer?.getText() ?? ""
  if (footers && /\boverflow-(y-)?(auto|scroll)\b/.test(cls)) findings.push({ file: rel, why: `${rel}:${line}: a ${tagOf(el)} with a footer scrolls itself (${cls.slice(0, 80)})` })
  return findings
}

function files(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue
      out.push(...files(p))
    } else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) out.push(p)
  }
  return out
}

function scanAll(): Finding[] {
  const findings: Finding[] = []
  for (const rel of [...files("app"), ...files("components")].filter((f) => !f.startsWith("components/ui/"))) {
    const ctx = parse(relative(ROOT, join(ROOT, rel)))
    if (!ctx) continue
    const visit = (n: ts.Node) => {
      const o = opening(n)
      if (o && CONTENT.has(tagOf(o))) findings.push(...scanContent(rel, n, o, ctx))
      ts.forEachChild(n, visit)
    }
    visit(ctx.sf)
  }
  return findings
}

/** What the guard finds in a file's text: its own check, run on a planted copy. */
function findingsIn(rel: string, source: string): string[] {
  const ctx = parseSource(rel, source)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    const o = opening(n)
    if (o && CONTENT.has(tagOf(o))) out.push(...scanContent(rel, n, o, ctx).map((f) => f.why))
    ts.forEachChild(n, visit)
  }
  visit(ctx.sf)
  return out
}

describe("overlay footers", () => {
  const findings = scanAll()
  const pending = new Set(Object.values(PENDING).flat())

  it("keep every overlay's primary action in its footer, and no root with a footer scrolls itself", () => {
    const fresh = findings.filter((f) => !pending.has(f.file)).map((f) => f.why)
    expect(fresh, "move the action into the overlay's footer part (DialogFooter, OverlayFooter, the footer slot …) and let the body scroll").toEqual([])
  })

  it("lets the pending list only shrink: a file that keeps the rules leaves it", () => {
    const failing = new Set(findings.map((f) => f.file))
    expect([...pending].filter((f) => !failing.has(f)), "these keep the rules now: take them off PENDING").toEqual([])
  })

  it("would see a Set status planted in the status menu's body", () => {
    const source = readFileSync(join(ROOT, "components/dialog/updateUserStatusDialog.tsx"), "utf8")
    expect(findingsIn("components/dialog/updateUserStatusDialog.tsx", source), "the status menu, as it is").toEqual([])
    const planted = source.replace("<OverlayBody>{contents}</OverlayBody>", "<OverlayBody>{contents}<Button onClick={onSave}>Set status</Button></OverlayBody>")
    expect(planted).not.toBe(source)
    expect(findingsIn("components/dialog/updateUserStatusDialog.tsx", planted).join("\n")).toMatch(/a primary action in what scrolls/)
    const scrolling = source.replace('className="hub-pop w-[360px]', 'className="hub-pop max-h-[var(--radix-popover-content-available-height)] overflow-y-auto w-[360px]')
    expect(scrolling).not.toBe(source)
    expect(findingsIn("components/dialog/updateUserStatusDialog.tsx", scrolling).join("\n")).toMatch(/with a footer scrolls itself/)
  })
})
