import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// SWR's global mutate only reaches the DEFAULT cache, and this app keeps its
// data in a custom provider's cache, so a global mutate revalidates nothing
// anyone reads (see lib/swrMutate.ts). Nine files did exactly that, and every
// live update they handled was silently lost.
const ROOTS = ["app", "components", "hooks", "lib", "services", "store"]
const IMPORT = /import\s+[^;]*\{[^}]*\bmutate\b[^}]*\}\s*from\s*["']swr["']/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : files(p)
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })
}

describe("SWR mutate", () => {
  it("is never the global one outside lib/swrMutate", () => {
    const offenders = ROOTS.flatMap((r) => files(r))
      .filter((f) => !f.endsWith("lib/swrMutate.ts"))
      .filter((f) => IMPORT.test(readFileSync(f, "utf8")))
    expect(offenders, "import { appMutate as mutate } from \"@/lib/swrMutate\" instead").toEqual([])
  })
})
