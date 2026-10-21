import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * A DISABLED CONTROL SAYS WHY IN THE PORTALLED TOOLTIP (18 Oct 2026).
 *
 * The reason was a CSS ::after centred above its control (bbe10852e, the
 * interaction layer; TaskCheck's through work-tip), so any clip around the
 * control cut it: the new-task dialog's Attach read "a project first", and the
 * top row of a read-only list "project's members can change it", in Chromium,
 * Firefox and WebKit. A reason is now drawn by components/ui/disabledTip.tsx
 * (the app's tooltip, portalled to the page), loaded lazily by Button
 * (disabledReason) and TaskCheck.
 *
 * It fails when:
 *   1. a stylesheet draws a reason itself: attr(data-disabled-reason), or a
 *      ::before or ::after on [data-disabled-reason];
 *   2. a component hands a reason to the interaction layer (ix(…, {
 *      disabledReason }) or a data-disabled-reason attribute) and doesn't
 *      load DisabledTip: the attribute would say why to nobody;
 *   3. a CSS tip (data-tip, work-tip) carries a disabled reason;
 *   4. Button or TaskCheck stops drawing its reason through DisabledTip.
 * The baseline is zero, and each rule is shown biting on a fixture.
 */

export function cssFindings(file: string, src: string): string[] {
  const out: string[] = []
  src.split("\n").forEach((line, i) => {
    if (/attr\(\s*data-disabled-reason\s*\)/.test(line)) out.push(`${file}:${i + 1}  draws a reason with attr(data-disabled-reason)`)
    else if (/\[data-disabled-reason\][^{,]*::?(?:after|before)\b/.test(line)) out.push(`${file}:${i + 1}  draws a reason in a pseudo-element`)
  })
  return out
}

/** The tip, loaded when a control first needs it: no first load carries a tooltip for a control that may never be disabled. */
const LAZY_TIP = /lazy\(\(\) => import\("(?:@\/components\/ui|\.)\/disabledTip"\)\)/

/** An ix(kind, { disabledReason }) call: its options carry a reason. */
function ixWithReason(file: string, src: string): boolean {
  if (!/\bix\(/.test(src) || !/\bdisabledReason\b/.test(src)) return false
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  let found = false
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "ix") {
      const opts = n.arguments[1]
      if (opts && ts.isObjectLiteralExpression(opts) && opts.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "disabledReason")) found = true
    }
    if (!found) n.forEachChild(visit)
  }
  visit(sf)
  return found
}

export function sourceFindings(file: string, src: string): string[] {
  if (/(^|\/)(lib\/ui\/interactive|components\/ui\/disabledTip)\.tsx?$/.test(file)) return []
  const out: string[] = []
  const lines = src.split("\n")
  const handsReason = ixWithReason(file, src) || /["']?data-disabled-reason["']?\s*[=:]/.test(src)
  if (handsReason && !LAZY_TIP.test(src)) out.push(`${file}  hands a disabled reason to the interaction layer but draws no DisabledTip`)
  lines.forEach((line, i) => {
    if (/data-tip=\{[^}]*\b[dD]isabledReason\b/.test(line)) out.push(`${file}:${i + 1}  a CSS tip (data-tip) carries a disabled reason`)
  })
  return out
}

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, ext, out)
    else if (ext.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

const ROOT = process.cwd()
const DIRS = ["app", "components", "hooks", "lib"]

describe("a disabled control says why in the portalled tooltip", () => {
  it("no stylesheet draws a reason", () => {
    const found = DIRS.flatMap((d) => walk(join(ROOT, d), /\.css$/)).flatMap((f) => cssFindings(relative(ROOT, f), readFileSync(f, "utf8")))
    expect(found, found.join("\n")).toEqual([])
  })

  it("every reason handed to the layer is drawn by DisabledTip, never by a CSS tip", () => {
    const found = DIRS.flatMap((d) => walk(join(ROOT, d), /\.tsx?$/)).flatMap((f) => sourceFindings(relative(ROOT, f), readFileSync(f, "utf8")))
    expect(found, found.join("\n")).toEqual([])
  })

  it("Button and TaskCheck draw their reason through DisabledTip, lazily", () => {
    const button = readFileSync(join(ROOT, "components/ui/button.tsx"), "utf8")
    expect(button).toMatch(LAZY_TIP)
    expect(button).toMatch(/reason \? <React\.Suspense fallback=\{button\}><Tip reason=\{reason\}>\{button\}<\/Tip><\/React\.Suspense> : button/)
    const check = readFileSync(join(ROOT, "components/task/TaskCheck.tsx"), "utf8")
    expect(check).toMatch(LAZY_TIP)
    expect(check).toMatch(/disabled && disabledReason \? <Suspense fallback=\{check\}><Tip reason=\{disabledReason\}>\{check\}<\/Tip><\/Suspense> : check/)
    // And never statically: that would put the tooltip on every route's first load.
    for (const src of [button, check]) expect(src).not.toMatch(/from "(?:@\/components\/ui|\.)\/(?:disabledTip|tooltip)"/)
  })

  it("bites: a pseudo-element tip, a reason with no DisabledTip, a reason in data-tip", () => {
    const css = `[data-disabled-reason]::after {\n  content: attr(data-disabled-reason);\n}\n[data-disabled-reason]:hover::before { opacity: 1 }\n[data-disabled-reason] { position: relative }`
    expect(cssFindings("x.css", css)).toEqual([
      expect.stringContaining("x.css:1  draws a reason in a pseudo-element"),
      expect.stringContaining("x.css:2  draws a reason with attr"),
      expect.stringContaining("x.css:4  draws a reason in a pseudo-element"),
    ])
    expect(sourceFindings("a.tsx", `export const A = () => <b {...ix("button", {\n  disabledReason: why,\n})} />`)).toEqual([expect.stringContaining("a.tsx  hands a disabled reason")])
    expect(sourceFindings("b.tsx", `export const B = () => <b data-disabled-reason={why} />`)).toEqual([expect.stringContaining("b.tsx  hands a disabled reason")])
    expect(sourceFindings("c.tsx", `const Tip = lazy(() => import("@/components/ui/disabledTip"))\nexport const C = () => <Tip reason={why}><b {...ix("button", { disabledReason: why })} /></Tip>`)).toEqual([])
    expect(sourceFindings("d.tsx", `const tip = x\nexport const D = () => <b data-tip={disabled ? disabledReason : tip} />`)).toEqual([expect.stringContaining("d.tsx:2  a CSS tip")])
  })
})
