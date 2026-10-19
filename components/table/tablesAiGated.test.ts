import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Tables' AI entry points, held to components/ai's rule
// (aiEntryPointsGated.test.ts): a control that asks the AI renders only where
// AI is on. "Fill with AI…", "Fill again" and Generate showed on a workspace
// with AI off, and on the edition without it, where each click could only
// fail (the tables W0 audit, 41933f8d's row).

const ROOT = join(__dirname, "..", "..")
const DIRS = ["components/table", "components/guest", "app/app/tables"]
// What asks a table's AI for something.
const ASKS_AI = /\b(fillTableAIColumn|generateTable)\s*\(/

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sources(full, acc)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

const askers = DIRS.flatMap((d) => sources(join(ROOT, d))).filter((f) => ASKS_AI.test(readFileSync(f, "utf8")))

describe("tables' AI entry points", () => {
  // The column menu's Fill with AI ships in both editions; the record's Fill
  // again and the list's Generate in the AI edition.
  it("are found, the column menu's among them", () => {
    // Its pages are a chunk of their own (columnMenu/ColumnMenuBody).
    expect(askers.map((f) => f.slice(ROOT.length + 1))).toContain("components/table/columnMenu/ColumnMenuBody.tsx")
  })

  it.each(askers.map((f) => [f.slice(ROOT.length + 1), f]))("%s draws its AI controls only where AI is on", (_, file) => {
    expect(readFileSync(file, "utf8")).toMatch(/useAIAvailable\s*\(/)
  })
})
