import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// A full-screen height is 100dvh, never 100vh. On a phone 100vh is the
// viewport with the browser's toolbars hidden, so a box that tall runs under
// them while they show: the guest board's and the guest call's controls, the
// app's loading screen centred too low, a full-screen viewer's bottom edge.
// Fractions (max-h-[85vh] on a dialog) still fit and are left alone.

const ROOTS = ["app", "components"]
const FULL_VH = /(?<![\w-])(?:min-|max-)?h-screen\b|(?:min-|max-)?h-\[100vh\]|:\s*100vh\b|"100vh"/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|css)$/.test(p) && !p.includes(".test.") ? [p] : []
  })
}

describe("full-screen heights", () => {
  it("use dvh, never vh", () => {
    const found: string[] = []
    for (const file of ROOTS.flatMap(files)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$|\/\*.*?\*\/|^\s*\*.*$/g, "")
          if (FULL_VH.test(code)) found.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`)
        })
    }
    expect(found, `use h-dvh, min-h-dvh or 100dvh:\n${found.join("\n")}`).toEqual([])
  })
})
