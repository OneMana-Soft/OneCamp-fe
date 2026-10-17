import ts from "typescript"

/**
 * Where small touch controls stand side by side without a touch group (app/
 * phone.css F3b), read from a component's source. A control's reach under a
 * finger (F3) runs past a small control's edges, so two set closer than 44px
 * less their size overlap, and the later takes the earlier's taps. A row of
 * them is a touch group (data-touch-group), or spaced for a finger by its own
 * gap (gap-4 and up, or pointer-coarse:gap-4 and up). Read by
 * app/touchGroups.test.ts. Pure.
 *
 * A small control here is a square one that reaches past its edges: Button
 * at size icon-sm or icon-xs (or icon drawn at size-5 to size-7), and any
 * element with data-touch-target or the shell's icon-button class drawn at
 * those sizes. Hub tools are 44px under a finger (app/hub.css) and never
 * reach past their edges, and a text button is wider than a finger's reach.
 */

const SMALL_SIZE = /(?:^|\s)(?:size-[567]|h-[567]\s+w-[567]|w-[567]\s+h-[567])(?:\s|$)/
const SPACED = /(?:^|\s)(?:pointer-coarse:)?gap(?:-x)?-(?:4|5|6|7|8|9|10|11|12|14|16)(?:\s|$)/

function attr(el: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name)
}

/** An attribute's string value, as written ("…" or {"…"}); undefined when it is an expression. */
function text(a: ts.JsxAttribute | undefined): string | undefined {
  const v = a?.initializer
  if (!v) return a ? "" : undefined
  if (ts.isStringLiteral(v)) return v.text
  if (ts.isJsxExpression(v) && v.expression && (ts.isStringLiteral(v.expression) || ts.isNoSubstitutionTemplateLiteral(v.expression))) return v.expression.text
  return undefined
}

function opening(node: ts.Node): ts.JsxOpeningLikeElement | undefined {
  if (ts.isJsxElement(node)) return node.openingElement
  if (ts.isJsxSelfClosingElement(node)) return node
  return undefined
}

/**
 * Wrappers that draw nothing of their own around their trigger: a menu, a
 * tooltip, a popover or a dialog whose trigger is the control itself.
 */
const TRANSPARENT = /^(?:DropdownMenu|DropdownMenuTrigger|Tooltip|TooltipTrigger|Popover|PopoverTrigger|Dialog|DialogTrigger|Drawer|DrawerTrigger|HoverCard|HoverCardTrigger|ContextMenu|ContextMenuTrigger)$/

/** Whether a JSX node is a small control that reaches past its edges (inside a wrapper that draws nothing, too). */
function isSmallControl(node: ts.Node): boolean {
  const el = opening(node)
  if (!el) return false
  const tag = el.tagName.getText()
  if (TRANSPARENT.test(tag)) return ts.isJsxElement(node) && node.children.some((c) => kindOf(c) === "control")
  const cls = text(attr(el, "className")) ?? ""
  if (tag === "Button") {
    const size = text(attr(el, "size"))
    return size === "icon-sm" || size === "icon-xs" || (size === "icon" && SMALL_SIZE.test(cls))
  }
  return (attr(el, "data-touch-target") !== undefined || /(?:^|\s)shell-icon-btn(?:\s|$)/.test(cls)) && SMALL_SIZE.test(cls)
}

/** A child as a run sees it: a control, nothing (space), or something between controls. */
function kindOf(child: ts.JsxChild): "control" | "space" | "other" {
  if (ts.isJsxText(child)) return child.text.trim() ? "other" : "space"
  if (ts.isJsxExpression(child)) {
    const e = child.expression
    if (!e) return "space"
    // {open && <Button …/>} and {a ? <Button …/> : <Button …/>}: a control where it shows.
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return isSmallControl(e.right) ? "control" : "other"
    if (ts.isConditionalExpression(e)) return isSmallControl(e.whenTrue) || isSmallControl(e.whenFalse) ? "control" : "other"
    if (ts.isParenthesizedExpression(e) && isSmallControl(e.expression)) return "control"
    return "other"
  }
  return isSmallControl(child) ? "control" : "other"
}

/** Every row of two or more small controls side by side that is neither a touch group nor spaced for a finger: "file:line". */
export function crowdedRows(src: string, file: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      let run = 0
      let crowded = false
      for (const child of node.children) {
        const k = kindOf(child)
        if (k === "space") continue
        run = k === "control" ? run + 1 : 0
        if (run >= 2) crowded = true
      }
      const el = node.openingElement
      const grouped = attr(el, "data-touch-group") !== undefined || SPACED.test(text(attr(el, "className")) ?? "")
      if (crowded && !grouped) out.push(`${file}:${sf.getLineAndCharacterOfPosition(el.getStart()).line + 1}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}
