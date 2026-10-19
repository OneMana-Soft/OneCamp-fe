import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Every sheet and dialog the UI manager can show (a key of uiSlice's state)
// is opened from somewhere: its key is named by the code that opens it. A key
// nothing names is one no person can reach: the task options sheet, with
// "People" and "Teams" rows that did nothing (DRAWERS, 17 Oct), the team
// member dialog the team sheet's "teamMembers" had replaced, and two upload
// states never shown. The baseline is none.

const ROOT = process.cwd()

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("the UI manager's sheets and dialogs", () => {
  it("are each opened from somewhere", () => {
    const slice = readFileSync(join(ROOT, "store/slice/uiSlice.ts"), "utf8")
    const keys = [...slice.matchAll(/^\s+([A-Za-z0-9_]+): SingleUIState;/gm)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(50)
    // Where a key is declared, shown and closed is not where it is opened.
    const code = ["app", "components", "hooks", "lib", "store", "services", "context"]
      .flatMap((d) => sources(join(ROOT, d)))
      .filter((f) => !/(store\/slice\/uiSlice\.ts|components\/ui\/UnifiedUIManager\.tsx)$/.test(f))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
    const unopened = keys.filter((k) => !new RegExp(`['"\`]${k}['"\`]`).test(code))
    expect(unopened, "nothing opens these: open each from where it belongs, or take it out").toEqual([])
  })
})
