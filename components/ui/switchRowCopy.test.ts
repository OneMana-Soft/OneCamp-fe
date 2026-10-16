import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// A switch's helper line is read beside the switch, whatever its state. "Off,
// others see you as offline even while you're here." under a switch that was
// on read as the current state, and contradicted it (QA SH-03, 14 Oct 2026).
// A helper says what the switch does, or begins "When off".

const ROOT = join(__dirname, "../..")

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(path)
  }
  return out
}

describe("a switch's helper line", () => {
  it("never begins with a bare Off or On, which reads as the switch's state", () => {
    const found: string[] = []
    for (const file of [...sources(join(ROOT, "components")), ...sources(join(ROOT, "app"))]) {
      const src = readFileSync(file, "utf8")
      if (!src.includes("SwitchRow")) continue
      for (const m of src.matchAll(/description=["{`]+\s*(On|Off)[,.]/g)) found.push(`${file.slice(ROOT.length + 1)}: ${m[0]}`)
    }
    expect(found).toEqual([])
  })
})
