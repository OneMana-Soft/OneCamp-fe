import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * A responsive class names a breakpoint that exists.
 *
 * Tailwind ignores a prefix it doesn't know, silently. The Admins and
 * Invitations tabs labelled their add buttons `hidden xs:inline`, and there
 * is no xs breakpoint here, so on every screen the label stayed hidden and
 * phones showed a bare "+" with no name. The breakpoints are Tailwind's sm,
 * md, lg, xl and 2xl, and 3xl and 4xl from app/globals.css.
 */
const root = resolve(__dirname, "..")
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

describe("responsive classes", () => {
  it("only name breakpoints that exist", () => {
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
    expect(css).not.toMatch(/--breakpoint-xs:/)
    const unknown = /(?:^|[\s"'`(])((?:xs|[5-9]xl)):[a-z[-]/g
    const found: string[] = []
    for (const file of [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]) {
      const src = readFileSync(file, "utf8")
      for (const m of src.matchAll(unknown)) found.push(`${file.slice(root.length + 1)}: ${m[1]}:`)
    }
    expect(found).toEqual([])
  })
})
