import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * `{items && count && <Row/>}` renders a literal "0" when count is 0: React
 * prints numbers. It put a stray 0 under a freshly sent channel message whose
 * first reply had not arrived. Conditions that end in a count or a length must
 * compare (`count > 0`), never stand alone.
 */
const root = resolve(__dirname, "..")
const CHAINED = /\{[^{}\n]*&&\s*[a-zA-Z_][a-zA-Z0-9_.?!]*(Count|_count|\.length)\s*&&/g
const BARE = /\{\s*[a-zA-Z_][a-zA-Z0-9_.?!]*(Count|_count|\.length)\s*&&/g

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = resolve(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(f, out)
    } else if (f.endsWith(".tsx") && !f.includes(".test.")) out.push(f)
  }
  return out
}

describe("numbers are never rendered by a && condition", () => {
  it("has no count or length standing alone in a JSX condition", () => {
    const hits: string[] = []
    for (const f of [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]) {
      const src = readFileSync(f, "utf8")
      for (const re of [CHAINED, BARE]) {
        for (const m of src.matchAll(re)) hits.push(`${f.slice(root.length + 1)}: ${m[0].slice(0, 100)}`)
      }
    }
    expect(hits, "compare instead: (count ?? 0) > 0").toEqual([])
  })
})
