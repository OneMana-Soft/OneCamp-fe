import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * A meaning written as text uses its -ink cut: text-success-ink,
 * text-warning-ink, text-info-ink, text-danger-ink. The fills (success,
 * warning, info, destructive) are for dots, bars, tints and solid surfaces;
 * as small text on the page the light success and warning fills scored 4.27:1
 * and 4.10:1, under AA. paletteContrast.test.ts measures the inks.
 */
const root = resolve(__dirname, "..")
const FILL_AS_TEXT = /(?<![\w-])text-(success|warning|info|destructive)(?![\w-])/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full)
    }
  }
  return out
}

describe("status colour as text", () => {
  it("is the -ink cut, never the fill", () => {
    const offenders: string[] = []
    for (const top of ["app", "components", "hooks", "lib"]) {
      for (const file of walk(join(root, top))) {
        const src = readFileSync(file, "utf8")
        for (const m of src.matchAll(FILL_AS_TEXT)) offenders.push(`${file.slice(root.length + 1)}: ${m[0]}`)
      }
    }
    expect(offenders, `Use text-success-ink, text-warning-ink, text-info-ink or text-danger-ink:\n${offenders.join("\n")}`).toEqual([])
  })

  it("is not the faint step on the timeline's done tasks, which is under AA", () => {
    const bar = readFileSync(join(root, "components/project/timeline/TimelineBar.tsx"), "utf8")
    expect(bar).toContain('done ? "text-muted-foreground line-through"')
    expect(bar).not.toMatch(/text-faint-foreground line-through/)
  })
})
