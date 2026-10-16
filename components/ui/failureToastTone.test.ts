import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// A toast that says something failed wears the error tile. Without
// variant "destructive" or tone "error" it drew the success check: "Couldn't
// add the reaction. Try again" came with a green tick (QA F-14).

const ROOT = join(__dirname, "..", "..")
const FAILED = /^(Couldn.t|Can.t|Could not|Failed|Didn.t|Not saved|Something went wrong|Unable|That didn.t)/

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

/** Every toast({ … }) literal in a file, as its object's source. */
function toastLiterals(src: string): string[] {
  const found: string[] = []
  for (const m of src.matchAll(/\btoast\(\s*\{/g)) {
    let i = m.index! + m[0].length
    let depth = 1
    while (i < src.length && depth) {
      if (src[i] === "{") depth++
      else if (src[i] === "}") depth--
      i++
    }
    found.push(src.slice(m.index! + m[0].length - 1, i))
  }
  return found
}

describe("a toast that says something failed", () => {
  it("wears the error tile, never the success check", () => {
    const bad: string[] = []
    for (const file of ["app", "components", "hooks", "lib"].flatMap((d) => sources(d))) {
      for (const literal of toastLiterals(readFileSync(join(ROOT, file), "utf8"))) {
        const title = literal.match(/title:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/)
        const words = title && (title[1] ?? title[2] ?? title[3])
        if (!words || !FAILED.test(words)) continue
        if (/variant:\s*["']destructive["']|tone:\s*["']error["']/.test(literal)) continue
        bad.push(`${relative(ROOT, join(ROOT, file))}: ${words}`)
      }
    }
    expect(bad).toEqual([])
  })
})
