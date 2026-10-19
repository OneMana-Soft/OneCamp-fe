import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import postcss, { type ChildNode, type Rule } from "postcss"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * THE INTERACTION LAYER'S GUARD (INTERACTION_SPEC.md §9.4). app/interaction.css
 * draws hover, press, selected, focus, disabled, reveal and drag for every
 * component that opts in (data-interactive, lib/ui/interactive.ts). This holds
 * the app to it. It fails when:
 *
 *   1. an element on the layer also carries its own state fill (hover:bg-,
 *      active:bg-, data-[state=…]:bg-, aria-…:bg-): two state systems;
 *   2. a weight sits behind a selected variant (data-[state=active]:font-…):
 *      the layer sets the selected weight on a [data-label] that reserves it;
 *   3. transition-all (or transition: all) appears anywhere;
 *   4. outline-none removes focus with nothing in its place;
 *   5. something revealed on hover isn't revealed on focus too;
 *   6. a DndContext doesn't come through lib/ui/dnd.ts (its sensors, the
 *      keyboard among them, and its spoken words);
 *   7. an HTML5 draggable has no keyboard way to move it;
 *   8. a disabled control sits in a tooltip's trigger, where it can never
 *      show (aria-disabled and data-disabled-reason say why instead);
 *   9. a raw :hover rule in a stylesheet sits outside @media (hover: hover),
 *      where it sticks after a tap on a phone;
 *  10. the 60% tap flash (a:active, button:active opacity) is back.
 *
 * Each rule is shown biting on a fixture, so it keeps working once the app is
 * clean. BASELINE holds what later adoption steps (§9.5) still owe, by file:
 * a count may only go down, and the test says when one has.
 */

const ROOT = process.cwd()
const SOURCE_DIRS = ["components", "app", "hooks", "lib"]

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, ext, out)
    else if (ext.test(name) && !/\.(test|spec)\./.test(name) && !name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

const SOURCES = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d), /\.tsx?$/)).map((f) => ({ file: relative(ROOT, f), src: readFileSync(f, "utf8") }))
const STYLESHEETS = ["app", "components"].flatMap((d) => walk(join(ROOT, d), /\.css$/)).map((f) => ({ file: relative(ROOT, f), src: readFileSync(f, "utf8") }))

type Finding = string

// ---------------------------------------------------------------------------
// Reading class lists out of TSX

/** Every string in an expression, joined: a className's classes, wherever they sit in cn(), a ternary or a template. */
function strings(node: ts.Node): string {
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    else if (ts.isTemplateExpression(n)) {
      out.push(n.head.text)
      for (const span of n.templateSpans) {
        visit(span.expression)
        out.push(span.literal.text)
      }
      return
    }
    n.forEachChild(visit)
  }
  visit(node)
  return out.join(" ")
}

const parsed = new Map<string, ts.SourceFile>()
/** One parse per file and source, shared by the rules. */
function parse(file: string, src: string) {
  const key = `${file}\0${src.length}`
  let sf = parsed.get(key)
  if (!sf || sf.text !== src) {
    sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    parsed.set(key, sf)
  }
  return sf
}

type Tag = ts.JsxOpeningElement | ts.JsxSelfClosingElement
const isClassAttr = (name: string) => /^(class|className|[a-z]\w*ClassName)$/.test(name)
const attrsOf = (el: Tag) => el.attributes.properties
const attrOf = (el: Tag, name: string) => attrsOf(el).find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name)
const classesOf = (el: Tag) =>
  attrsOf(el)
    .filter((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && isClassAttr(a.name.getText()) && !!a.initializer)
    .map((a) => strings(a.initializer!))
    .join(" ")
const lineOf = (sf: ts.SourceFile, node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

function eachTag(sf: ts.SourceFile, fn: (el: Tag) => void) {
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) fn(n)
    n.forEachChild(visit)
  }
  visit(sf)
}

/** Class strings outside JSX: a class constant, a cva() or cn() call at the top of a file. */
function eachClassConstant(sf: ts.SourceFile, fn: (node: ts.Node, text: string) => void) {
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer
      const isClassCall = ts.isCallExpression(init) && /^(cva|cn|clsx)$/.test(init.expression.getText(sf))
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init) || isClassCall) fn(n, strings(init))
    }
    n.forEachChild(visit)
  }
  visit(sf)
}

// ---------------------------------------------------------------------------
// The rules, each over one file's text, so a fixture can run them too.

/** The primitives of §9.5 step 1: on the layer, with no state fill of their own anywhere in them. */
const ADOPTED = [
  "components/ui/button.tsx",
  "components/ui/toggle.tsx",
  "components/ui/toggle-group.tsx",
  "components/ui/tabs.tsx",
  "components/ui/chip.tsx",
  "components/ui/badge.tsx",
  "components/ui/dropdown-menu.tsx",
  "components/ui/select.tsx",
  "components/ui/command.tsx",
  "components/ui/CommandList.tsx",
  "components/ui/checkbox.tsx",
  "components/ui/switch.tsx",
  "components/ui/radio-group.tsx",
  "components/ui/listRow.tsx",
  "components/ui/hubRow.tsx",
  "components/ui/sectionTabs.tsx",
  "components/ui/segmentedControl.tsx",
  "components/ui/dialog.tsx",
  "components/ui/sheet.tsx",
  "components/ui/slider.tsx",
]

/** The primitives' tags: a class a caller passes them joins an element on the layer. */
const LAYER_TAGS = new Set([
  "Button", "Toggle", "ToggleGroupItem", "TabsTrigger", "DropdownMenuItem", "DropdownMenuCheckboxItem", "DropdownMenuRadioItem",
  "DropdownMenuSubTrigger", "SelectItem", "CommandItem", "Checkbox", "Switch", "RadioGroupItem", "HubToolButton", "ListRow",
])

/** A state fill: a background behind a state variant. A toggle's checked fill is its own drawing, not a state system. */
const STATE_FILL = /(?:^|\s)(?:[^\s:]+:)*(?:hover|active|focus|focus-visible|data-\[(?:state|selected|highlighted|pressed|active)[^\]]*\]|data-(?:highlighted|selected|active|disabled)|aria-[\w-]+|aria-\[[^\]]+\])(?:\/[\w-]+)?:(?:(?!after:|before:)[^\s:]+:)*bg-[^\s]+/g
const TOGGLE_FILL = /data-\[state=(?:checked|unchecked|indeterminate)\]:(?:[^\s:]+:)*bg-/

function stateFills(text: string, toggle: boolean): string[] {
  return [...text.matchAll(STATE_FILL)].map((m) => m[0].trim()).filter((c) => !(toggle && TOGGLE_FILL.test(c)))
}

function rule1(file: string, src: string): Finding[] {
  const sf = parse(file, src)
  const out: Finding[] = []
  const adopted = ADOPTED.includes(file)
  // A toggle primitive draws its own checked fill, on itself or its thumb.
  const toggleFile = adopted && /\bix\("toggle"\)/.test(src)
  eachTag(sf, (el) => {
    const kind = attrOf(el, "data-interactive")?.initializer
    const spread = attrsOf(el).some((a) => ts.isJsxSpreadAttribute(a) && /\bix\(/.test(a.expression.getText(sf)))
    const tag = el.tagName.getText(sf)
    if (!kind && !spread && !LAYER_TAGS.has(tag) && !adopted) return
    const toggle = toggleFile || /toggle/.test(kind?.getText(sf) ?? "") || /\bix\("toggle"/.test(el.getText(sf)) || ["Checkbox", "Switch", "RadioGroupItem"].includes(tag)
    for (const c of stateFills(classesOf(el), toggle)) out.push(`${file}:${lineOf(sf, el)} <${tag}> ${c}`)
  })
  if (adopted) {
    eachClassConstant(sf, (node, text) => {
      for (const c of stateFills(text, toggleFile)) out.push(`${file}:${lineOf(sf, node)} ${c}`)
    })
  }
  return out
}

const SELECTED_WEIGHT = /(?:^|\s)(?:[^\s:]+:)*(?:data-\[state=(?:active|on|checked)\]|data-\[selected=true\]|data-\[active\]|aria-selected|aria-current|aria-pressed|aria-checked|aria-\[(?:selected|current|pressed|checked)[^\]]*\]):(?:[^\s:]+:)*font-[^\s]+/g

function rule2(file: string, src: string): Finding[] {
  if (!/\.tsx?$/.test(file)) return []
  const sf = parse(file, src)
  const out: Finding[] = []
  const check = (node: ts.Node, text: string) => {
    for (const m of text.matchAll(SELECTED_WEIGHT)) out.push(`${file}:${lineOf(sf, node)} ${m[0].trim()}`)
  }
  eachTag(sf, (el) => check(el, classesOf(el)))
  eachClassConstant(sf, check)
  return [...new Set(out)]
}

const ALL = /(?:^|[\s"'`])transition-all(?=[\s"'`]|$)|transition(?:-property)?\s*:\s*all\b|transitionProperty\s*:\s*["'`]all/

function rule3(file: string, src: string): Finding[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
  return code.split("\n").flatMap((l, i) => (ALL.test(l) ? [`${file}:${i + 1} ${l.trim().slice(0, 100)}`] : []))
}

const NONE = /(?:^|\s)(?:[^\s:]+:)*outline-none(?=\s|$)/
const REPLACED = /(?:^|\s)(?:[^\s:]+:)*(?:focus|focus-visible|focus-within|group-focus-visible|peer-focus-visible|\[&:focus(?:-visible|-within)?[^\]\s]*\])(?:\/[\w-]+)?:(?:[^\s:]+:)*(?:ring(?!-offset)|outline-(?!none)|shadow|inset-ring|focus-halo)|(?:^|\s)(?:focus-halo|field-surface|composer-card)(?=\s|$)/
const WITHIN = /(?:^|\s)(?:[^\s:]+:)*focus-within(?:\/[\w-]+)?:(?:[^\s:]+:)*(?:ring(?!-offset)|outline-(?!none)|shadow|inset-ring|focus-halo)|(?:^|\s)has-\[:focus-visible\]:|(?:^|\s)(?:focus-halo|field-surface|composer-card)(?=\s|$)/
/** Classes whose stylesheet draws focus for what is inside them (a search pill, the composer...) or on themselves. */
const CSS_WITHIN = new Set(
  STYLESHEETS.flatMap(({ src }) => [...src.matchAll(/\.([\w-]+)(?:\[[^\]]*\])?:(?:focus-within|focus-visible|focus)\b/g)].map((m) => m[1])),
)
/** Elements nothing can focus (no tabIndex of their own): an outline-none on them changes nothing. */
const INERT_TAGS = new Set(["div", "span", "p", "li", "ul", "ol", "section", "header", "footer", "nav", "main", "aside", "td", "tr", "table", "form", "label", "b", "i", "em", "strong", "small", "figure", "kbd"])
/** Fields and controls whose focus shows somewhere this file can't see, with the reason. */
const FIELD_FOCUS: Array<[file: string, snippet: string, why: string]> = [
  ["components/ui/command.tsx", "flex h-10 w-full rounded-md bg-transparent py-3", "the palette's and a combobox's search: focus stays in it while its list is open"],
  ["components/docEditor/BlockMenuPopover.tsx", "h-full min-w-0 flex-1 bg-transparent text-ui text-ink", "the block menu's search, focused as the menu opens and kept there while it is"],
  ["components/docEditor/technical/LanguagePicker.tsx", "h-full w-full bg-transparent text-ui-sm text-ink", "the language picker's search, focused as the picker opens"],
  ["components/minimal-tiptap/extensions/math/MathEditor.tsx", "doc-math-field", "the equation box, focused as its popover opens; .doc-math-field draws its own ring (code.css)"],
  ["components/table/gridCells.tsx", "peer h-full w-full bg-transparent text-ui text-ink", "a cell's editor: the cell rings itself while it holds focus (table.css .v3-grid td:focus-within)"],
  ["components/table/gridCells.tsx", "outline-none", "a grid cell: the cell rings itself while it holds focus (table.css .v3-grid td:focus-within)"],
  ["components/table/cellPickers.tsx", "h-7 w-full bg-transparent text-ui text-ink", "a select cell's search, focused as its list opens"],
  ["components/table/cellPickers.tsx", "h-7 min-w-0 flex-1 bg-transparent text-ui font-normal", "a relation's search, focused as its picker opens"],
  ["components/task/taskRowParts.tsx", "h-8 min-w-0 flex-1 bg-transparent text-sm", "a picker's filter, focused as the picker opens"],
  ["components/ui/zonePicker.tsx", "h-8 w-full rounded-md bg-transparent px-2 text-ui text-ink", "the time zones' search, focused as their popover opens (the booking page's and the Event Form's)"],
  ["components/calendar/quickCreateCard.tsx", "relative w-full bg-transparent text-body text-ink", "the quick-create card's title, focused as the card opens"],
  ["components/docEditor/SelectionBar.tsx", "h-7 w-56 rounded-md bg-transparent px-2 text-ui-sm", "the link box that replaces the selection bar's buttons, focused as it opens"],
  ["components/calendar/form/eventForm.tsx", "w-full bg-transparent font-display text-title-2", "the Event Form's borderless title, focused as the dialog or the panel's edit opens"],
  ["components/task/taskCreateForm.tsx", "w-full bg-transparent px-4 py-1 text-title-2", "the dialog's borderless title, focused as the dialog opens"],
  ["components/ai/DocAiBar.tsx", "h-10 min-w-0 flex-1 bg-transparent text-ui text-ink", "the doc AI bar's prompt, focused as the bar opens and kept there while it is"],
]
const FIELD_TAGS = new Set(["input", "textarea", "select", "Input", "Textarea", "CommandPrimitive.Input"])
/** Focus-trapping surfaces: they take focus only to hand it on, and draw none of their own. */
const SURFACE = /^(?:Dialog|AlertDialog|Sheet|Drawer|Popover|DropdownMenu|HoverCard|Tooltip|Menu|Select|ContextMenu)(?:Primitive|Primitives)?\.?Content$|^(?:DialogPrimitive|AlertDialogPrimitive|SheetPrimitive|DrawerPrimitive|PopoverPrimitive|DropdownMenuPrimitive|ToastPrimitives)\.(?:Content|Viewport)$/
/** A tiptap editor's own class, or its wrapper's: its caret, and the composer's halo round it, show where typing goes. */
const EDITOR_ATTR = /^(?:editorClassName|editorContentClassName)$/
const EDITOR_TAGS = new Set(["EditorContent"])

/**
 * The tags a class constant dresses, when dressing them is all it does: every
 * use of its name sits in a tag's class attribute (className={x}, or
 * cn(x, …) there). Empty when it goes anywhere else (another prop, a call,
 * an export), and the constant is judged on its own.
 */
function wornBy(sf: ts.SourceFile, decl: ts.VariableDeclaration): Array<[el: Tag, attr: string]> {
  if (!ts.isIdentifier(decl.name) || ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Export) return []
  const name = decl.name.text
  const scope = decl.parent.parent.parent
  const out: Array<[Tag, string]> = []
  let elsewhere = false
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && n.text === name && n !== decl.name) {
      const p = n.parent
      // Only a name like it: a property, an attribute or a key called that.
      const lookalike = ((ts.isPropertyAccessExpression(p) || ts.isJsxAttribute(p) || ts.isPropertyAssignment(p)) && p.name === n)
      if (!lookalike) {
        let at: ts.Node = p
        while (!ts.isJsxAttribute(at) && at !== scope && at.parent) at = at.parent
        if (ts.isJsxAttribute(at) && isClassAttr(at.name.getText(sf))) out.push([at.parent.parent as Tag, at.name.getText(sf)])
        else elsewhere = true
      }
    }
    n.forEachChild(visit)
  }
  visit(scope)
  return elsewhere ? [] : out
}

function rule4(file: string, src: string, cssWithin: Set<string> = CSS_WITHIN): Finding[] {
  const sf = parse(file, src)
  const out: Finding[] = []
  const withinAncestor = (el: Tag) => {
    for (let p: ts.Node | undefined = el.parent; p; p = p.parent) {
      if (!ts.isJsxElement(p)) continue
      const cls = classesOf(p.openingElement)
      if (WITHIN.test(cls) || cls.split(/\s+/).some((c) => cssWithin.has(c))) return true
    }
    return false
  }
  /** Where an outline-none on this tag takes nothing away, or its focus shows somewhere else. */
  const excused = (el: Tag, attr: string, text: string) => {
    const tag = el.tagName.getText(sf)
    if (SURFACE.test(tag) || EDITOR_TAGS.has(tag) || EDITOR_ATTR.test(attr)) return true
    const tabIndex = attrOf(el, "tabIndex")?.initializer?.getText(sf) ?? ""
    if (/-1/.test(tabIndex)) return true
    if (INERT_TAGS.has(tag) && !tabIndex && !attrOf(el, "contentEditable")) return true
    const field = FIELD_TAGS.has(tag) || !!attrOf(el, "contentEditable")
    return field && (withinAncestor(el) || FIELD_FOCUS.some(([f, snippet]) => f === file && text.includes(snippet)))
  }
  eachTag(sf, (el) => {
    for (const a of attrsOf(el)) {
      if (!ts.isJsxAttribute(a) || !a.initializer || !isClassAttr(a.name.getText(sf))) continue
      const text = strings(a.initializer)
      if (!NONE.test(text) || REPLACED.test(text) || excused(el, a.name.getText(sf), text)) continue
      out.push(`${file}:${lineOf(sf, el)} <${el.tagName.getText(sf)}> ${text.replace(/\s+/g, " ").slice(0, 90)}`)
    }
  })
  eachClassConstant(sf, (node, text) => {
    if (!NONE.test(text) || REPLACED.test(text)) return
    if (FIELD_FOCUS.some(([f, snippet]) => f === file && text.trim() === snippet)) return
    // A constant worn by tags and nothing else is judged on them, as their
    // own classes would be: a field's classes kept in a constant (a cell's
    // text box and text area share theirs) are still a field's.
    const worn = ts.isVariableDeclaration(node) ? wornBy(sf, node) : []
    if (worn.length && worn.every(([el, attr]) => REPLACED.test(classesOf(el)) || excused(el, attr, text))) return
    out.push(`${file}:${lineOf(sf, node)} ${text.replace(/\s+/g, " ").slice(0, 90)}`)
  })
  return out
}

const HOVER_REVEAL = /group-hover(?:\/[\w-]+)?:(?:opacity-100|visible|block|flex|inline-flex|inline-block|grid|pointer-events-auto)|(?<![\w:-])hover:opacity-100/
const HIDDEN = /(?:^|\s)(?:(?:sm|md|lg|xl):)?(?:opacity-0|invisible|hidden|pointer-events-none)(?=\s|$)/
const FOCUS_REVEAL = /group-focus-within(?:\/[\w-]+)?:|group-focus-visible(?:\/[\w-]+)?:|group-has-\[:focus-visible\](?:\/[\w-]+)?:|(?<![\w-])focus(?:-visible|-within)?:(?:opacity-100|visible|block|flex|inline-flex|inline-block|grid|pointer-events-auto)/

/** Shown on hover only on purpose, each with its reason. */
const HOVER_ONLY: Array<[file: string, snippet: string, why: string]> = [
  ["components/task/taskRowParts.tsx", "inline-block shrink-0 rounded-full border border-dashed border-line-3 opacity-0", "an empty assignee's ring, decoration; the row's own focus opens the panel that assigns"],
  ["components/ai/AiScheduleDialog.tsx", "shrink-0 text-2xs text-muted-foreground opacity-0", "a check glyph on a slot row, which is the button"],
  ["components/ai/RescheduleDialog.tsx", "shrink-0 opacity-0 pointer-events-none transition-opacity", "a check glyph on a slot row, which is the button"],
  ["components/attachments/videoPlayer.tsx", "w-20 hidden group-hover:block", "the volume slider; the keyboard's volume is the player's keys"],
  ["components/fileUpload/AudioPlayer.tsx", "w-20 hidden group-hover:block", "the volume slider; the keyboard's volume is the player's keys"],
  ["components/project/timeline/TimelineBar.tsx", "cursor-crosshair", "the handle that draws a dependency, a pointer gesture; the panel adds one by keyboard"],
  ["components/project/ProjectsOverview.tsx", "opacity-0 group-hover/h:opacity-100", "a sort chevron on a column header, which is the button and says its sort"],
  ["components/task/TaskCheck.tsx", "pointer-events-none absolute inset-0 opacity-0", "a pointer's preview of the check on the status glyph, which is the button"],
  ["components/calendar/weekView.tsx", "cursor-ns-resize", "an event's resize grips, a pointer gesture; Alt+Shift+arrows resize by keyboard (§4)"],
  ["components/tree/TreeRow.tsx", "hidden group-hover:flex", "the chevron that opens a branch, which the tree's → and ← keys do for the keyboard"],
  ["components/minimal-tiptap/extensions/callout/components/callout-view.tsx", "absolute -top-3 right-2 flex gap-0.5 rounded-[10px] bg-pop p-1", "a callout's kinds as discs for a pointer; the icon's picker holds them for the keyboard and a touch screen (D11)"],
]

function rule5(file: string, src: string): Finding[] {
  if (!file.endsWith(".tsx")) return []
  const sf = parse(file, src)
  const out: Finding[] = []
  const check = (node: ts.Node, cls: string) => {
    if (!HOVER_REVEAL.test(cls) || !HIDDEN.test(cls) || FOCUS_REVEAL.test(cls)) return
    if (HOVER_ONLY.some(([f, snippet]) => f === file && cls.includes(snippet))) return
    out.push(`${file}:${lineOf(sf, node)} ${cls.replace(/\s+/g, " ").slice(0, 90)}`)
  }
  // An element's classes are one list (cn's strings together); so is a class constant.
  eachTag(sf, (el) => check(el, classesOf(el)))
  eachClassConstant(sf, check)
  return out
}

function rule6(file: string, src: string): Finding[] {
  if (!src.includes("<DndContext")) return []
  const sf = parse(file, src)
  const out: Finding[] = []
  const fromDnd = /from\s+["']@\/lib\/ui\/dnd["']/.test(src)
  const setup = new Set([...src.matchAll(/const\s+(\w+)\s*=\s*useDndSetup\(/g)].map((m) => m[1]))
  if (/\buseSensors?\(/.test(src)) out.push(`${file} makes its own sensors: take them from useDndSetup (lib/ui/dnd)`)
  eachTag(sf, (el) => {
    if (el.tagName.getText(sf) !== "DndContext") return
    const shared = fromDnd && attrsOf(el).some((a) => ts.isJsxSpreadAttribute(a) && setup.has(a.expression.getText(sf)))
    if (!shared) out.push(`${file}:${lineOf(sf, el)} a DndContext without {...useDndSetup(...)}: no shared sensors, keyboard or spoken words`)
  })
  return out
}

/** Where an HTML5 drag's keyboard way lives, when it isn't on the element: [file, where, what it says]. */
const KEYBOARD_MOVES: Array<[file: string, where: string, path: RegExp]> = [
  // The doc tree moves a row with Alt+Shift+arrows (D12), from the row's key handler.
  ["components/tree/TreeRow.tsx", "components/tree/TreeView.tsx", /e\.altKey && e\.shiftKey && e\.key\.startsWith\("Arrow"\)/],
  ["components/tree/TreeView.tsx", "components/tree/TreeView.tsx", /e\.altKey && e\.shiftKey && e\.key\.startsWith\("Arrow"\)/],
  // A choice's option moves with Alt+↑/↓ on its name (TB-15), the box the
  // keyboard reaches; the grip beside it is the pointer's, hidden from it.
  ["components/fields/OptionsEditor.tsx", "components/fields/OptionsEditor.tsx", /reorder && e\.altKey && \(e\.key === "ArrowUp" \|\| e\.key === "ArrowDown"\)/],
]

const ARROWS = /Arrow(?:Left|Right|Up|Down)|startsWith\("Arrow"\)/

function rule7(file: string, src: string): Finding[] {
  if (!file.endsWith(".tsx") || !/\bdraggable\b/.test(src)) return []
  const sf = parse(file, src)
  const out: Finding[] = []
  eachTag(sf, (el) => {
    const d = attrOf(el, "draggable")
    if (!d || (d.initializer && /^\{\s*false\s*\}$/.test(d.initializer.getText(sf)))) return
    // A key handler is a way to move only if it takes the arrows: one that opens on Enter isn't.
    const keys = attrOf(el, "onKeyDown")?.initializer?.getText(sf) ?? ""
    if ((keys && ARROWS.test(/^\{\s*[\w.]+\s*\}$/.test(keys) ? src : keys)) || /Move to…|"Move to"/.test(src)) return
    if (KEYBOARD_MOVES.some(([f, where, path]) => f === file && path.test(readFileSync(join(ROOT, where), "utf8")))) return
    out.push(`${file}:${lineOf(sf, el)} <${el.tagName.getText(sf)} draggable> has no keyboard way to move it`)
  })
  return out
}

function rule8(file: string, src: string): Finding[] {
  if (!file.endsWith(".tsx") || !src.includes("TooltipTrigger")) return []
  const sf = parse(file, src)
  const out: Finding[] = []
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === "TooltipTrigger" && attrOf(n.openingElement, "asChild")) {
      const child = n.children.find((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c))
      const tag = child && (ts.isJsxElement(child) ? child.openingElement : (child as ts.JsxSelfClosingElement))
      const dis = tag && attrOf(tag, "disabled")
      if (tag && dis && !/^\{\s*false\s*\}$/.test(dis.initializer?.getText(sf) ?? "")) out.push(`${file}:${lineOf(sf, tag)} <${tag.tagName.getText(sf)} disabled> in a tooltip's trigger`)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return out
}

/** D14 (PG2-06): no native date or time box in app code; DateField and TimeField stand in. */
function rule11(file: string, src: string): Finding[] {
  if (!file.endsWith(".tsx") || !/\btype=\{?["'`](?:date|time)["'`]/.test(src)) return []
  const sf = parse(file, src)
  const out: Finding[] = []
  eachTag(sf, (el) => {
    const type = attrOf(el, "type")?.initializer?.getText(sf).replace(/[{}"'`\s]/g, "")
    if (type === "date" || type === "time") out.push(`${file}:${lineOf(sf, el)} <${el.tagName.getText(sf)} type="${type}">`)
  })
  return out
}

function gatedByHover(node: ChildNode): boolean {
  type Up = { type: string; parent?: unknown; name?: string; params?: string }
  for (let p: Up | undefined = node.parent; p; p = p.parent as Up | undefined) {
    if (p.type === "atrule" && p.name === "media" && /\((?:any-)?hover:\s*hover\)/.test(p.params ?? "")) return true
  }
  return false
}

function rule9(file: string, css: string): Finding[] {
  const out: Finding[] = []
  postcss.parse(css, { from: file }).walkRules((r: Rule) => {
    if (/:hover\b/.test(r.selector) && !gatedByHover(r)) out.push(`${file}:${r.source?.start?.line} ${r.selector.replace(/\s+/g, " ").slice(0, 90)}`)
  })
  return out
}

function rule10(file: string, css: string): Finding[] {
  const out: Finding[] = []
  postcss.parse(css, { from: file }).walkRules((r: Rule) => {
    if (!r.selectors.some((s) => /(?:^|[\s>+~,])(?:a|button):active\b/.test(s))) return
    if (r.nodes.some((d) => (d.type === "decl" && d.prop === "opacity") || (d.type === "atrule" && d.name === "apply" && /\bopacity-/.test(d.params)))) {
      out.push(`${file}:${r.source?.start?.line} ${r.selector.replace(/\s+/g, " ")}`)
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// The tree

/**
 * What later steps of §9.5 still owe, by rule and file, with the step that
 * owns it. A count may only go down; a file that is clean leaves the list.
 */
const BASELINE: Record<string, Record<string, number>> = {
  rule6: {
    // Step 3 (work): the board keeps its own sensors, keyboard move and voice
    // until its cards move onto lib/ui/dnd.ts (INTERACTION_SPEC §5.2).
    "components/kanbanComponents/TaskBoard.tsx": 2,
    // Step 4 (content): TABLES-FE moved the table's board off HTML5 drag onto
    // @dnd-kit, with the project board's sensors, its Space and arrows move
    // (D12) and words (lib/board), on beta, where lib/ui/dnd.ts isn't yet. It
    // moves onto lib/ui/dnd.ts with the project board, as they share lib/board.
    "components/table/DataTableBoard.tsx": 2,
  },
}

const RULES: Record<string, { run: (file: string, src: string) => Finding[]; css?: boolean; say: string }> = {
  rule1: { run: rule1, say: "two state systems on one element: drop the state fill, the layer draws it" },
  rule2: { run: rule2, say: "a weight behind a selected variant: give the label data-label (lib/ui/interactive withLabel) and let the layer set it" },
  rule3: { run: rule3, say: "transition-all: name the properties" },
  rule4: { run: rule4, say: "outline-none with nothing in its place: drop it (the layer's ring shows), or draw a focus-visible ring or a focus-within halo" },
  rule5: { run: rule5, say: "revealed on hover only: reveal on focus too (group-focus-within:, focus-visible:, or the layer's data-reveal and data-tools)" },
  rule6: { run: rule6, say: "a DndContext outside lib/ui/dnd.ts: spread useDndSetup(...)" },
  rule7: { run: rule7, say: "an HTML5 draggable with no keyboard path: a Move to… item or an arrow-key handler" },
  rule8: { run: rule8, say: "disabled inside a tooltip's trigger: use aria-disabled and data-disabled-reason (Button's disabledReason)" },
  rule9: { run: rule9, css: true, say: "a raw :hover outside @media (hover: hover): it sticks after a tap" },
  rule10: { run: (f, s) => (f === "app/globals.css" ? rule10(f, s) : []), css: true, say: "the 60% tap flash is back: phone.css F2 is the one press response" },
  rule11: { run: rule11, say: "a native date or time box (D14): DateField or TimeField (components/ui/date-field)" },
}

function findings(rule: string): Finding[] {
  const { run, css } = RULES[rule]
  return (css ? STYLESHEETS : SOURCES).flatMap(({ file, src }) => run(file, src))
}

const fileOf = (f: Finding) => f.split(/:\d|\s/)[0]

describe("the interaction layer's guard (INTERACTION_SPEC §9.4)", () => {
  for (const rule of Object.keys(RULES)) {
    it(`${rule}: ${RULES[rule].say}`, () => {
      const base = BASELINE[rule] ?? {}
      const all = findings(rule)
      const counts: Record<string, number> = {}
      for (const f of all) counts[fileOf(f)] = (counts[fileOf(f)] ?? 0) + 1
      const over = all.filter((f) => (counts[fileOf(f)] ?? 0) > (base[fileOf(f)] ?? 0))
      if (process.env.IX_GUARD_LIST) console.log(`${rule}\n${over.join("\n")}`)
      expect(over, `${RULES[rule].say}:\n${over.join("\n")}`).toEqual([])
      const owed = Object.entries(base).filter(([file, n]) => (counts[file] ?? 0) < n)
      expect(owed, `fewer than the baseline holds now: lower ${rule}'s count for ${owed.map(([f]) => f).join(", ")}`).toEqual([])
    })
  }
})

describe("each rule bites (fixtures)", () => {
  it("1: a state fill on an element of the layer, and in an adopted primitive", () => {
    expect(rule1("x.tsx", `<button data-interactive="row" className="hover:bg-hover px-2" />`)).toHaveLength(1)
    expect(rule1("x.tsx", `<Button className={cn("data-[state=open]:bg-press")} />`)).toHaveLength(1)
    expect(rule1("x.tsx", `<button {...ix("chip")} className="aria-pressed:bg-brand" />`)).toHaveLength(1)
    expect(rule1("components/ui/button.tsx", `const v = cva("hover:bg-[color-mix(in_oklab,var(--brand)_92%,black)]")`)).toHaveLength(1)
    expect(rule1("x.tsx", `<button data-interactive="row" className="hover:text-foreground bg-raised" />`)).toEqual([])
    expect(rule1("x.tsx", `<Switch className="data-[state=checked]:bg-primary" />`)).toEqual([])
    expect(rule1("x.tsx", `<div className="hover:bg-hover" />`)).toEqual([])
  })

  it("2: a weight behind a selected variant", () => {
    expect(rule2("x.tsx", `<Tab className="data-[state=active]:font-semibold" />`)).toHaveLength(1)
    expect(rule2("x.tsx", `const t = "aria-[current=page]:font-medium"`)).toHaveLength(1)
    expect(rule2("x.tsx", `<Tab className="data-[state=active]:text-foreground font-medium" />`)).toEqual([])
  })

  it("3: transition-all, in classes, styles and stylesheets, but not in a comment", () => {
    expect(rule3("x.tsx", `<div className="transition-all duration-200" />`)).toHaveLength(1)
    expect(rule3("x.css", `.a { transition: all 140ms ease; }`)).toHaveLength(1)
    expect(rule3("x.tsx", `const s = { transitionProperty: "all" }`)).toHaveLength(1)
    expect(rule3("x.css", `/* never transition-all */ .a { transition: opacity 1s }`)).toEqual([])
  })

  it("4: outline-none with nothing in its place", () => {
    expect(rule4("x.tsx", `<button className="outline-none focus-visible:bg-hover" />`, new Set())).toHaveLength(1)
    expect(rule4("x.tsx", `const FOCUS = "outline-none"`, new Set())).toHaveLength(1)
    expect(rule4("x.tsx", `<input className="bg-transparent outline-none" />`, new Set())).toHaveLength(1)
    expect(rule4("x.tsx", `<button className="outline-none focus-visible:ring-2 focus-visible:ring-brand" />`, new Set())).toEqual([])
    expect(rule4("x.tsx", `<div className="focus-within:ring-2"><input className="outline-none" /></div>`, new Set())).toEqual([])
    expect(rule4("x.tsx", `<label className="pill"><input className="outline-none" /></label>`, new Set(["pill"]))).toEqual([])
    expect(rule4("x.tsx", `<DialogContent className="outline-none" />`, new Set())).toEqual([])
  })

  it("4: a class constant is judged on the tags that wear it, and only them", () => {
    const halo = (worn: string) => `const box = cn("bg-transparent outline-none", big && "text-lg");\n<div className="focus-within:ring-2">${worn}</div>`
    expect(rule4("x.tsx", halo(`<input className={box} /><textarea className={cn(box, "resize-none")} />`), new Set())).toEqual([])
    expect(rule4("x.tsx", halo(`<input className={box} /><button className={box} />`), new Set())).toHaveLength(1)
    expect(rule4("x.tsx", halo(`<input className={box} /><Field inputStyle={box} />`), new Set())).toHaveLength(1)
    expect(rule4("x.tsx", `export const box = "outline-none";\n<div className="focus-within:ring-2"><input className={box} /></div>`, new Set())).toHaveLength(1)
    expect(rule4("x.tsx", `const box = "outline-none";\n<input className={cn(box, "focus-visible:ring-2")} />`, new Set())).toEqual([])
  })

  it("5: revealed on hover and not on focus", () => {
    expect(rule5("x.tsx", `<span className="opacity-0 group-hover:opacity-100" />`)).toHaveLength(1)
    expect(rule5("x.tsx", `<span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" />`)).toEqual([])
  })

  it("6: a DndContext of its own", () => {
    expect(rule6("x.tsx", `const s = useSensors(useSensor(MouseSensor)); <DndContext sensors={s}>`)).toHaveLength(2)
    expect(rule6("x.tsx", `import { useDndSetup } from "@/lib/ui/dnd"\nconst dnd = useDndSetup(words); <DndContext {...dnd} {...drag.handlers}>`)).toEqual([])
  })

  it("7: an HTML5 draggable without a keyboard path", () => {
    expect(rule7("x.tsx", `<div draggable onDragStart={go} />`)).toHaveLength(1)
    expect(rule7("x.tsx", `const move = (e) => e.key === "ArrowLeft" && by(-1); <div draggable onDragStart={go} onKeyDown={move} />`)).toEqual([])
    expect(rule7("x.tsx", `<div draggable onDragStart={go} onKeyDown={(e) => e.key === "Enter" && open()} />`)).toHaveLength(1)
    expect(rule7("x.tsx", `<img draggable={false} />`)).toEqual([])
  })

  it("8: disabled in a tooltip's trigger", () => {
    expect(rule8("x.tsx", `<TooltipTrigger asChild><Button disabled={busy}>Go</Button></TooltipTrigger>`)).toHaveLength(1)
    expect(rule8("x.tsx", `<TooltipTrigger asChild><Button aria-disabled={busy}>Go</Button></TooltipTrigger>`)).toEqual([])
  })

  it("9: a raw :hover outside @media (hover: hover)", () => {
    expect(rule9("x.css", `.a:hover { color: red }`)).toHaveLength(1)
    expect(rule9("x.css", `.a, .b:hover { color: red }`)).toHaveLength(1)
    expect(rule9("x.css", `@media (hover: hover) { .a:hover { color: red } }`)).toEqual([])
    expect(rule9("x.css", `@utility u { @media (hover: hover) { &:hover { color: red } } }`)).toEqual([])
  })

  it("10: the tap flash", () => {
    expect(rule10("app/globals.css", `@layer base { a:active, button:active { @apply opacity-60 md:opacity-100; } }`)).toHaveLength(1)
    expect(rule10("app/globals.css", `.x:active { opacity: .5 }`)).toEqual([])
  })

  it("11: a native date or time box", () => {
    expect(rule11("x.tsx", `<Input id="t" type="time" value={t} />`)).toHaveLength(1)
    expect(rule11("x.tsx", `<input type={"date"} />`)).toHaveLength(1)
    expect(rule11("x.tsx", `<input type="text" />`)).toEqual([])
    expect(rule11("x.tsx", `<TimeField id="t" value={t} onChange={setT} />`)).toEqual([])
  })
})
