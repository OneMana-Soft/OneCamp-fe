import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import { crowdedRows } from "@/lib/ui/touchGroups"

/**
 * SMALL CONTROLS SIDE BY SIDE ARE A TOUCH GROUP (app/phone.css F3b).
 *
 * A control's reach under a finger (F3) runs 8px past a 28px control's
 * edges, so two set closer than 16px overlapped, and the later in the page
 * took the earlier's taps: on the booking page a tap 23-27px into Previous
 * month went to Next month, and the phone calendar's month arrows, an event's
 * Edit, More and Close, and the mini month's arrows were the same
 * (REVIEW-FE-SHELL, 15 Oct 2026). One rule spaces them under a finger, a row
 * of small controls being a touch group (data-touch-group); this finds a row
 * that isn't one. e2e/touchTargets.spec.ts taps one at 390.
 */
const ROOT = process.cwd()

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("small controls side by side", () => {
  it("are a touch group, or spaced for a finger, in every row", () => {
    const crowded = ["app", "components"].flatMap((d) => sources(join(ROOT, d))).flatMap((f) => crowdedRows(readFileSync(f, "utf8"), relative(ROOT, f)))
    expect(crowded, "add data-touch-group (its value the controls' size when not 28) to the row").toEqual([])
  })

  it("stand 44px less their size apart under a finger, one rule over the row's own gap", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    const rule = css.slice(css.indexOf("F3b."))
    // The gap is --touch-gap, which a group's own space above can use too.
    expect(rule).toMatch(/@media \(pointer: coarse\) \{\s*\[data-touch-group\] \{\s*--touch-gap: calc\(var\(--m-hit\) - 28px\);\s*gap: var\(--touch-gap\);/)
    for (const size of [32, 24, 20]) expect(rule).toMatch(new RegExp(`\\[data-touch-group="${size}"\\] \\{\\s*--touch-gap: calc\\(var\\(--m-hit\\) - ${size}px\\);`))
    // Unlayered (at the top level, where this file's layered rules are
    // indented), so it wins over the row's own gap utility.
    expect(css).toMatch(/\n\/\* F3b\. [\s\S]*?\*\/\n@media \(pointer: coarse\) \{\n  \[data-touch-group\] \{/)
  })
})

describe("a crowded row", () => {
  const row = (attrs: string, ...children: string[]) => `export const R = () => <div ${attrs}>${children.join("")}</div>`
  const icon = (label: string, size = "icon-sm") => `<Button variant="ghost" size="${size}" aria-label="${label}"><X /></Button>`

  it("is two small controls side by side in a row neither grouped nor spaced", () => {
    expect(crowdedRows(row('className="flex gap-0.5"', icon("Previous"), icon("Next")), "a.tsx")).toEqual(["a.tsx:1"])
    expect(crowdedRows(row('className="flex"', icon("Previous", "icon-xs"), icon("Next", "icon-xs")), "a.tsx")).toEqual(["a.tsx:1"])
  })

  it("is not one grouped, or spaced for a finger by its own gap", () => {
    expect(crowdedRows(row('className="flex gap-0.5" data-touch-group=""', icon("Previous"), icon("Next")), "a.tsx")).toEqual([])
    expect(crowdedRows(row('className="flex gap-4"', icon("Previous"), icon("Next")), "a.tsx")).toEqual([])
    expect(crowdedRows(row('className="flex gap-1 pointer-coarse:gap-4"', icon("Previous"), icon("Next")), "a.tsx")).toEqual([])
  })

  it("sees a control inside a menu's or a tooltip's trigger, and one that shows on a condition", () => {
    const more = `<DropdownMenu><DropdownMenuTrigger asChild>${icon("More")}</DropdownMenuTrigger><DropdownMenuContent /></DropdownMenu>`
    expect(crowdedRows(row('className="flex"', icon("Edit"), more), "a.tsx")).toEqual(["a.tsx:1"])
    expect(crowdedRows(row('className="flex"', icon("Edit"), `{open && ${icon("Close")}}`), "a.tsx")).toEqual(["a.tsx:1"])
  })

  it("is not text buttons, nor controls with something between them", () => {
    expect(crowdedRows(row('className="flex"', `<Button size="xs">Cancel</Button>`, `<Button size="xs">Save</Button>`), "a.tsx")).toEqual([])
    expect(crowdedRows(row('className="flex"', icon("Previous"), "<span>Oct 2026</span>", icon("Next")), "a.tsx")).toEqual([])
  })
})
