import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// One way to hide a number field's stepper (DB-29, airtable-02): the browser's
// up and down arrows are taken off by globals.css's no-spinner utility, never
// by a copy of its rules in a component's classes. A copy of its three rules
// (the textfield appearance and the two webkit spin buttons) anywhere fails.

const ROOT = join(__dirname, "..")
const DIRS = ["app", "components", "hooks", "lib", "context", "store"]

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe("a number field's stepper", () => {
  it("is hidden by one utility, globals.css's no-spinner", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    expect(css).toMatch(/@utility no-spinner \{[^}]*appearance: textfield;[\s\S]*?::-webkit-inner-spin-button[\s\S]*?::-webkit-outer-spin-button/)
    const copies = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .filter((path) => /\[appearance:textfield\]|::-webkit-(inner|outer)-spin-button\]/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path))
    expect(copies).toEqual([])
  })

  // DB-30's should-fix (29 Oct): twelve other number fields still showed it, as
  // the utility went on one field at a time. Every number field hides it now:
  // globals.css's base layer gives input[type="number"] the utility, so no
  // component names it, and a new number field can't be left out.
  it("is hidden on every number field by globals.css's base layer, which no component repeats", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    expect(css).toMatch(/@layer base \{[^@]*?input\[type="number"\] \{\s*@apply no-spinner;\s*\}/)
    const repeats = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .filter((path) => /\bno-spinner\b/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path))
    expect(repeats).toEqual([])
  })
})
