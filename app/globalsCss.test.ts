import { readFileSync } from "node:fs"
import postcss, { type ChildNode } from "postcss"
import { describe, expect, it } from "vitest"

// Every v3 wave appended blocks to the end of globals.css, and a merge once
// dropped one closing brace: the next wave's keyframes were swallowed into a
// utility and never parsed. This holds the stylesheets the app imports to
// parsing whole, with no declaration loose at the top and every keyframe
// made only of steps, and every --animate-* token naming a keyframe that
// exists (integration of the v3 waves, 11 Oct).
const SHEETS = ["app/globals.css", "app/themes.css", "app/content.css", "app/hub.css", "app/phone.css", "components/calendar/calendar.css"]
const STEP = /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/

function walk(nodes: ChildNode[] | undefined, fn: (n: ChildNode) => void) {
  for (const n of nodes ?? []) {
    fn(n)
    if ("nodes" in n) walk(n.nodes as ChildNode[], fn)
  }
}

describe("the app's stylesheets", () => {
  it.each(SHEETS)("%s parses, with balanced braces", (f) => {
    expect(() => postcss.parse(readFileSync(f, "utf8"), { from: f })).not.toThrow()
  })

  it.each(SHEETS)("%s has no orphan declarations or stray rules inside keyframes", (f) => {
    const root = postcss.parse(readFileSync(f, "utf8"), { from: f })
    const orphans = root.nodes.filter((n) => n.type === "decl").map((n) => `${f}:${n.source?.start?.line}`)
    expect(orphans).toEqual([])
    const stray: string[] = []
    walk(root.nodes, (n) => {
      if (n.type === "atrule" && /keyframes$/.test(n.name)) {
        for (const step of n.nodes ?? []) {
          if (step.type === "rule" && !STEP.test(step.selector.trim())) stray.push(`${f}:${step.source?.start?.line} ${step.selector}`)
          if (step.type === "atrule") stray.push(`${f}:${step.source?.start?.line} @${step.name}`)
        }
      }
    })
    expect(stray).toEqual([])
  })

  it("names only keyframes that exist in its --animate-* tokens", () => {
    const names = new Set<string>()
    for (const f of SHEETS) {
      walk(postcss.parse(readFileSync(f, "utf8")).nodes, (n) => {
        if (n.type === "atrule" && /keyframes$/.test(n.name)) names.add(n.params.trim())
      })
    }
    // tw-animate-css brings its own (enter, exit, accordion-*).
    const missing = [...readFileSync("app/globals.css", "utf8").matchAll(/--animate-[\w-]+:\s*([\w-]+)\s/g)]
      .map((m) => m[1])
      .filter((k) => !names.has(k) && !["enter", "exit", "accordion-down", "accordion-up", "collapsible-down", "collapsible-up", "spin", "ping", "pulse", "bounce"].includes(k))
    expect(missing).toEqual([])
  })
})
