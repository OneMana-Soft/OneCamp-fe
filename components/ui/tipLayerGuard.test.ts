import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * EVERY data-tip LABEL IS THE PAGE'S ONE CHIP (18 Oct 2026).
 *
 * The app's light labels (work-tip, actionTip.ts) were each control's CSS
 * ::after, and whatever clipped the control cut them: a board column's status
 * lost its top to the board's scroller, a card's priority its start to the
 * card, the list's top check its start to the list, the composer's first tool
 * its start to the conversation (UI-REGRESS-2's hover pass, Chromium, Firefox
 * and WebKit). components/ui/tipLayer.tsx draws them all now, at the page's
 * end, and the app's providers load it in a chunk of its own.
 *
 * It fails when a stylesheet or a class draws a label from data-tip again
 * (attr(data-tip)), or when the providers stop loading the layer, or load it
 * with the first screen. Each rule bites on a fixture.
 */

export function drawsTip(file: string, src: string): string[] {
  const out: string[] = []
  src.split("\n").forEach((line, i) => {
    if (/attr\(\s*data-tip\s*\)/.test(line)) out.push(`${file}:${i + 1}  draws a label from data-tip; the page's chip (components/ui/tipLayer.tsx) draws it`)
  })
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(css|tsx?|scss)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

const ROOT = process.cwd()

describe("every data-tip label is the page's one chip", () => {
  it("no stylesheet or class draws a label from data-tip", () => {
    const found = ["app", "components", "hooks", "lib"].flatMap((d) => walk(join(ROOT, d))).flatMap((f) => drawsTip(relative(ROOT, f), readFileSync(f, "utf8")))
    expect(found, found.join("\n")).toEqual([])
  })

  it("the app's providers load the layer, in a chunk of its own", () => {
    const src = readFileSync(join(ROOT, "app/app/ClientProviders.tsx"), "utf8")
    expect(src).toMatch(/const TipLayer = dynamic\(\(\) => import\("@\/components\/ui\/tipLayer"\)/)
    expect(src).toMatch(/<TipLayer \/>/)
    expect(src).not.toMatch(/from "@\/components\/ui\/tipLayer"/)
  })

  it("bites: a ::after from data-tip, in a stylesheet or a class", () => {
    expect(drawsTip("a.css", ".x::after {\n  content: attr(data-tip);\n}")).toEqual([expect.stringContaining("a.css:2")])
    expect(drawsTip("b.ts", 'export const T = "after:content-[attr(data-tip)] after:absolute"')).toEqual([expect.stringContaining("b.ts:1")])
    expect(drawsTip("c.tsx", '<b data-tip="x" className="work-tip" />')).toEqual([])
  })
})
