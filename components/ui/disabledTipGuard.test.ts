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
 * (the app's tooltip, portalled to the page), loaded lazily by Button and
 * Switch (disabledReason) and TaskCheck.
 *
 * It fails when:
 *   1. a stylesheet draws a reason itself: attr(data-disabled-reason), or a
 *      ::before or ::after on [data-disabled-reason];
 *   2. a component hands a reason to the interaction layer (ix(…, {
 *      disabledReason }) or a data-disabled-reason attribute) and doesn't
 *      load DisabledTip: the attribute would say why to nobody;
 *   3. a CSS tip (data-tip, work-tip) carries a disabled reason;
 *   4. Button, TaskCheck or Switch stops drawing its reason through DisabledTip, or
 *      hands DisabledTip its control to draw: the control must be drawn at
 *      once and stay the same node as the tip's code lands, or a pointer or
 *      focus already on it is lost (22 Oct 2026, e2e/disabledTip.spec.ts:70);
 *   5. Button, which server components draw (it has no "use client"), calls
 *      a hook they lack: the build's prerender failed on React.useRef
 *      (22 Oct 2026), so its control is found by a useId tag instead.
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
const LAZY_TIP = /lazyPiece\(\(\) => import\("@\/components\/ui\/disabledTip"\)\)/
/** A control draws that one piece (components/ui/disabledTipPiece), never a lazy tip of its own. */
const TIP_PIECE = /import \{ DisabledTipPiece as Tip \} from "@\/components\/ui\/disabledTipPiece"/

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

/** Hooks a server component lacks (React's server build has use, useId, useMemo, useCallback, useDebugValue). */
const CLIENT_HOOK = /\bReact\.(useRef|useState|useEffect|useLayoutEffect|useInsertionEffect|useImperativeHandle|useReducer|useContext|useSyncExternalStore|useTransition|useDeferredValue|useOptimistic|useActionState)\b|\b(useRef|useState|useEffect|useLayoutEffect|useImperativeHandle|useReducer|useContext|useSyncExternalStore)\(/

/** What a file without "use client" calls that a server component can't. */
export function serverFindings(file: string, src: string): string[] {
  if (/^\s*["']use client["']/.test(src)) return []
  const m = CLIENT_HOOK.exec(src)
  return m ? [`${file}  has no "use client" and calls ${m[1] ?? m[2]}: a server component drawing it fails`] : []
}

export function sourceFindings(file: string, src: string): string[] {
  if (/(^|\/)(lib\/ui\/interactive|components\/ui\/disabledTip)\.tsx?$/.test(file)) return []
  const out: string[] = []
  const lines = src.split("\n")
  const handsReason = ixWithReason(file, src) || /["']?data-disabled-reason["']?\s*[=:]/.test(src)
  if (handsReason && !TIP_PIECE.test(src)) out.push(`${file}  hands a disabled reason to the interaction layer but draws no DisabledTip`)
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

  it("Button, TaskCheck and Switch draw their control at once, and their reason through DisabledTip beside it, lazily", () => {
    const button = readFileSync(join(ROOT, "components/ui/button.tsx"), "utf8")
    expect(readFileSync(join(ROOT, "components/ui/disabledTipPiece.tsx"), "utf8")).toMatch(LAZY_TIP)
    expect(button).toMatch(TIP_PIECE)
    expect(button).toMatch(/<>\{button\}\{reason && <React\.Suspense><Tip control=\{tipId\} reason=\{reason\} \/><\/React\.Suspense>\}<\/>/)
    const check = readFileSync(join(ROOT, "components/task/TaskCheck.tsx"), "utf8")
    expect(check).toMatch(TIP_PIECE)
    expect(check).toMatch(/<>\{check\}\{disabled && disabledReason && <Suspense><Tip control=\{ref\} reason=\{disabledReason\} \/><\/Suspense>\}<\/>/)
    const toggle = readFileSync(join(ROOT, "components/ui/switch.tsx"), "utf8")
    expect(toggle).toMatch(TIP_PIECE)
    expect(toggle).toMatch(/<>\{toggle\}\{reason && <React\.Suspense><Tip control=\{tipId\} reason=\{reason\} \/><\/React\.Suspense>\}<\/>/)
    for (const src of [button, check, toggle]) {
      // Never the tip's child, nor its fallback: the chunk landing would draw the control again.
      expect(src).not.toMatch(/<Tip\b[^>]*>\s*\{(?:button|check|toggle)\}|fallback=\{(?:button|check|toggle)\}/)
      // And never statically: that would put the tooltip on every route's first load.
      expect(src).not.toMatch(/from "(?:@\/components\/ui|\.)\/(?:disabledTip|tooltip)"/)
    }
  })

  it("Button stays drawable by a server component: no hook one lacks, its control tagged for the tip by useId", () => {
    const button = readFileSync(join(ROOT, "components/ui/button.tsx"), "utf8")
    expect(serverFindings("components/ui/button.tsx", button)).toEqual([])
    expect(button).toMatch(/const tipId = React\.useId\(\)/)
    expect(button).toMatch(/data-tip-control=\{reason && tipId\}/)
    // Bites: the first try held a ref.
    expect(serverFindings("b.tsx", `export const B = () => { const own = React.useRef(null); return <b ref={own} /> }`)).toEqual([expect.stringContaining("calls useRef")])
    expect(serverFindings("c.tsx", `"use client"\nexport const C = () => { const own = React.useRef(null); return <b ref={own} /> }`)).toEqual([])
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
    expect(sourceFindings("c.tsx", `import { DisabledTipPiece as Tip } from "@/components/ui/disabledTipPiece"\nexport const C = () => <Tip reason={why}><b {...ix("button", { disabledReason: why })} /></Tip>`)).toEqual([])
    expect(sourceFindings("e.tsx", `const Tip = lazyPiece(() => import("@/components/ui/disabledTip"))\nexport const E = () => <b {...ix("button", { disabledReason: why })} />`)).toEqual([expect.stringContaining("e.tsx  hands a disabled reason")])
    expect(sourceFindings("d.tsx", `const tip = x\nexport const D = () => <b data-tip={disabled ? disabledReason : tip} />`)).toEqual([expect.stringContaining("d.tsx:2  a CSS tip")])
  })
})
