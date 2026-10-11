import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve, relative } from "node:path"

/**
 * ONE RENDERED STROKE (design v3, §3.12). Every Lucide icon draws a 1.25px
 * line whatever its size, which in Lucide's 24-unit box is stroke-width =
 * 30 / size: 12px 2.4, 14px 2.1, 16px 1.875, 18px 1.67, 20px 1.5.
 *
 * globals.css draws it for every registry icon with a non-scaling stroke, so
 * the rule holds at any size a class gives. A strokeWidth prop on an icon
 * can therefore only ever say 30 / size; anything else is a second weight
 * on the screen (strokes ran from 1.12 to 1.33px on one screen before v3).
 * The size is read from the icon's own size prop or its size-N, h-N or
 * h-[Npx] class; an icon with a strokeWidth and no readable size fails too,
 * since nobody can check it.
 */
const root = resolve(__dirname, "../..")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}

/** The names a file imports from the icon registry (or straight from lucide-react). */
function iconNames(src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:@\/lib\/icons|lucide-react)["']/g)) {
    for (const part of m[1].split(",")) {
      const local = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()
      if (local) names.add(local)
    }
  }
  return names
}

/** The icon's size in px, from its size prop or its classes, or null. */
export function sizeOf(attrs: string): number | null {
  const prop = /\bsize=\{?["']?(\d+(?:\.\d+)?)/.exec(attrs)
  if (prop) return Number(prop[1])
  const arbitrary = /(?:^|[\s"'`])(?:size|h)-\[(\d+(?:\.\d+)?)px\]/.exec(attrs)
  if (arbitrary) return Number(arbitrary[1])
  const step = /(?:^|[\s"'`])(?:size|h)-(\d+(?:\.\d+)?)(?=[\s"'`]|$)/.exec(attrs)
  if (step) return Number(step[1]) * 4
  return null
}

/** Every strokeWidth on a registry icon in a source, with what it should be. */
export function strokeOffences(src: string): string[] {
  const icons = iconNames(src)
  const out: string[] = []
  for (const m of src.matchAll(/<([A-Z]\w*|[a-z]\w*\.[iI]con)\b((?:[^<>]|=>)*?)\/?>/g)) {
    const [, tag, attrs] = m
    // A registry icon by name, or one passed in as data (link.icon, ch.icon).
    if (!icons.has(tag) && !/\.[iI]con$/.test(tag)) continue
    const sw = /\bstrokeWidth=\{?["']?(\d+(?:\.\d+)?)/.exec(attrs)
    if (!sw) continue
    const size = sizeOf(attrs)
    const want = size ? 30 / size : null
    if (want === null || Math.abs(Number(sw[1]) - want) > 0.05) {
      out.push(`<${tag} strokeWidth=${sw[1]}> at ${size ?? "an unknown size"}${want ? `, wants ${+want.toFixed(3)}` : ""}`)
    }
  }
  return out
}

describe("icon stroke", () => {
  it("draws every Lucide icon at one 1.25px stroke, whatever its size", () => {
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
    expect(css).toMatch(/svg\.lucide \{\s*stroke-width: 1\.25px;\s*\}/)
    expect(css).toMatch(/svg\.lucide :is\(path, line, polyline, polygon, circle, rect, ellipse\) \{\s*vector-effect: non-scaling-stroke;/)
  })

  it("reads an icon's size and the stroke it owes", () => {
    expect(strokeOffences(`import { Check } from "@/lib/icons"\n<Check className="h-4 w-4" strokeWidth={1.875} />`)).toEqual([])
    expect(strokeOffences(`import { Check } from "@/lib/icons"\n<Check className="size-3.5" strokeWidth={2.1} />`)).toEqual([])
    expect(strokeOffences(`import { Check } from "@/lib/icons"\n<Check size={20} strokeWidth={1.5} />`)).toEqual([])
    expect(strokeOffences(`import { Check } from "@/lib/icons"\n<Check className="h-4 w-4" strokeWidth={1.75} />`)).toHaveLength(1)
    expect(strokeOffences(`import { Check } from "@/lib/icons"\n<Check strokeWidth={2} />`)).toHaveLength(1)
    expect(strokeOffences(`<link.icon className="h-4 w-4" strokeWidth={1.75} />`)).toHaveLength(1)
    // Not an icon: a drawn svg keeps whatever stroke it was drawn with.
    expect(strokeOffences(`<circle strokeWidth="6" />`)).toEqual([])
  })

  it("has no strokeWidth on an icon that is not 30 / size", () => {
    const files = ["components", "app"].flatMap((d) => walk(resolve(root, d)))
    expect(files.length).toBeGreaterThan(100)
    const offenders = files.flatMap((f) => strokeOffences(readFileSync(f, "utf8")).map((o) => `${relative(root, f)}: ${o}`))
    expect(offenders, `a second icon weight on screen:\n${offenders.join("\n")}`).toEqual([])
  })
})
