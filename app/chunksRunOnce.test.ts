import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

// A segment's chunks ran twice on every client navigation (Next 16.3.8 with
// Turbopack, 21 Oct 2026). The router decodes the page's server payload and
// Turbopack's runtime loads each client chunk it names with a plain
// <script src> in <head>. The payload also carries the segment's own
// <script src async> tags, which React hoists into <head> as resources, and
// React looks for an existing copy only as script[async][src="…"]. It never
// found Turbopack's tag, so it added a second one: the browser took the file
// from its cache (or fetched it again with the cache off) and evaluated it a
// second time. Module factories ran once (the runtime keeps the first), but
// every chunk was compiled and run again: 7 chunks (92 KB) on opening
// Settings, 18 (336 KB) on a phone's tree-to-doc open (FLUIDITY-LEAD-7).
// Next 16.4.2 and 16.5.0-canary.21 still carry both halves.
//
// patches/next@16.3.8.patch makes React's lookup match any <script> with that
// src, in each React DOM client build Next ships. This guard fails when Next
// is upgraded without carrying the patch over (pnpm drops a patch whose
// version no longer matches), and e2e/chunksRunOnce.spec.ts proves the
// behaviour on a production build.

const ROOT = join(__dirname, "..")
const nextDir = dirname(createRequire(join(ROOT, "package.json")).resolve("next/package.json"))

/** Every React DOM build in Next that runs in the browser and hoists scripts. */
const CLIENT_BUILDS = ["react-dom", "react-dom-experimental"].flatMap((pkg) =>
  ["react-dom-client.production.js", "react-dom-client.development.js", "react-dom-profiling.profiling.js", "react-dom-profiling.development.js"].map((file) =>
    join(nextDir, "dist/compiled", pkg, "cjs", file),
  ),
)

describe("a chunk Turbopack loaded on a client navigation", () => {
  it("is found by React's script lookup, async or not, in every React DOM client build Next ships", () => {
    const missing = CLIENT_BUILDS.filter((file) => !existsSync(file))
    expect(missing, "React DOM client builds this guard expects in next/dist/compiled").toEqual([])
    for (const file of CLIENT_BUILDS) {
      const source = readFileSync(file, "utf8")
      const name = file.slice(nextDir.length + 1)
      expect(source, `${name}: React still looks only for script[async] (patches/next@16.3.8.patch not applied)`).not.toContain('"script[async]" + key')
      expect(source, `${name}: the lookup matches any <script> with the src`).toMatch(/function getScriptSelectorFromKey\(key\) \{\s*(\/\/[^\n]*\n\s*)*return "script" \+ key;\s*\}/)
    }
  })

  it("is patched for the Next this repo runs, and no other", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
    const version = JSON.parse(readFileSync(join(nextDir, "package.json"), "utf8")).version
    expect(pkg.dependencies.next, "package.json pins next exactly").toBe(version)
    expect(pkg.pnpm.patchedDependencies[`next@${version}`]).toBe(`patches/next@${version}.patch`)
  })
})
