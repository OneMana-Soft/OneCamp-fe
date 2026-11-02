import { createRequire } from "node:module"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Esc skips a layer that is closing (data-state="closed") in every Radix
// overlay of the app, by a patch to @radix-ui/react-dismissable-layer
// (patches/@radix-ui__react-dismissable-layer@1.1.11.patch; what it does is
// components/ui/closingLayerEscape.test.tsx). pnpm patches one release only, so
// an upgrade that moves an overlay's copy off 1.1.11 would drop the patch
// without a word, and a patch that stops applying would leave Radix's own line.
// Either fails here: re-check the patch against the new release, then move the
// pin and this test together.
const NAME = "@radix-ui/react-dismissable-layer"
const PIN = "1.1.11"
const PATCH = `patches/@radix-ui__react-dismissable-layer@${PIN}.patch`

const app = createRequire(import.meta.url)
/** The root of the copy of `name` the app reaches through `chain`, each package loading the next (focusScopePin.test.ts). */
const copyOf = (name: string, ...chain: string[]) => {
  const from = chain.reduce((at, pkg) => createRequire(at.resolve(pkg)), app)
  return realpathSync(path.dirname(path.dirname(from.resolve(name))))
}

/** Each file a patch changes, with the lines it adds (blank ones aside). */
function addedLines(patch: string): Map<string, string[]> {
  const files = new Map<string, string[]>()
  let file = ""
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ b/")) files.set((file = line.slice("+++ b/".length)), [])
    else if (line.startsWith("+") && !line.startsWith("+++") && line.slice(1).trim()) files.get(file)?.push(line.slice(1))
  }
  return files
}

describe("the dismissable-layer patch (Esc skips a closing layer)", () => {
  it("is named in package.json for exactly 1.1.11", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    expect(pkg.pnpm.patchedDependencies[`${NAME}@${PIN}`]).toBe(PATCH)
    expect(existsSync(path.join(process.cwd(), PATCH))).toBe(true)
  })

  it("is in the copy every overlay of the app loads, at 1.1.11", () => {
    const copies = new Set([
      copyOf(NAME, "@radix-ui/react-dialog"),
      copyOf(NAME, "@radix-ui/react-alert-dialog", "@radix-ui/react-dialog"),
      copyOf(NAME, "vaul", "@radix-ui/react-dialog"),
      copyOf(NAME, "@radix-ui/react-popover"),
      copyOf(NAME, "@radix-ui/react-dropdown-menu", "@radix-ui/react-menu"),
      copyOf(NAME, "@radix-ui/react-select"),
      copyOf(NAME, "@radix-ui/react-toast"),
      copyOf(NAME, "@radix-ui/react-tooltip"),
    ])
    const changed = addedLines(readFileSync(path.join(process.cwd(), PATCH), "utf8"))
    expect([...changed.keys()], "the patch changes both builds").toEqual(["dist/index.js", "dist/index.mjs"])
    for (const dir of copies) {
      expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version, `${dir}: the patched release`).toBe(PIN)
      for (const [file, lines] of changed) {
        const src = readFileSync(path.join(dir, file), "utf8")
        expect(lines.filter((line) => !src.includes(line)), `${dir}/${file}: every line the patch adds`).toEqual([])
      }
    }
  })
})
