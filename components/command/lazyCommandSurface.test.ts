import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"
import { reach } from "../../scripts/fluidity/reach.mjs"

// The command surface shows nothing until a command answers, and its runner,
// Block Kit cards and command service were about 29 KB of source on every
// conversation page. Every composer takes it through LazyCommandSurface.

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe("the command surface loads after the conversation draws", () => {
  it("is imported eagerly by nothing but its lazy wrapper", () => {
    const eager = ["app", "components", "hooks", "lib"]
      .flatMap((d) => sources(d))
      .filter((f) => f !== path.join("components", "command", "LazyCommandSurface.tsx"))
      .filter((f) => /^\s*import\s[^;]*from\s+["']@\/components\/command\/CommandSurface["']/m.test(readFileSync(f, "utf8")))
    expect(eager).toEqual([])
  })

  // Its catalog is read beside it, as a part of its own: read by the wrapper,
  // the catalog's hook brought the command service with it, and each thread
  // page went about 4 KB over its ceiling (23 Oct).
  it("brings none of the surface's code, its catalog's included, into its wrapper", () => {
    const eager = [...reach("components/command/LazyCommandSurface.tsx").keys()]
    expect(eager.filter((f) => f.startsWith("components/command/") || f.startsWith("services/commandService"))).toEqual([
      "components/command/LazyCommandSurface.tsx",
    ])
  })
})
