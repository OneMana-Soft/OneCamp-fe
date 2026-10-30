import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * A MENU ROW IS components/ui/dropdown-menu's.
 *
 * Its rows carry what every menu needs, as one primitive: the shared row
 * states (ix), and a pointer that hasn't moved left alone (lib/ui/stillPointer:
 * a side menu opened by keyboard closed under a resting mouse, 24 Oct 2026).
 * The shell's profile, workspace and More menus drew 20 rows straight from
 * Radix and had neither. Outside components/ui a file may use Radix's menu
 * Root, Trigger, Content and the rest, but not its rows.
 */
const ROWS = ["Item", "SubTrigger", "CheckboxItem", "RadioItem"]

/** Each Radix menu row a file draws, as "file: Name". */
function rawRows(file: string, text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/import\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+["']@radix-ui\/react-(?:dropdown-menu|context-menu|menu)["']/g)) {
    if (m[1]) for (const r of text.matchAll(new RegExp(`<${m[1]}\\.(${ROWS.join("|")})\\b`, "g"))) out.push(`${file}: ${m[1]}.${r[1]}`)
    if (m[2]) for (const name of m[2].split(",").map((s) => s.trim().split(/\s+as\s+/)[0])) if (ROWS.includes(name)) out.push(`${file}: ${name}`)
  }
  return out
}

describe("a menu row", () => {
  it("is components/ui/dropdown-menu's, never Radix's own, outside components/ui", () => {
    const found = sourceFiles(["app", "components", "lib"], /\.tsx?$/)
      .filter((f) => !f.startsWith("components/ui/"))
      .flatMap((f) => rawRows(f, readFileSync(f, "utf8")))
    expect([...new Set(found)]).toEqual([])
  })
})
