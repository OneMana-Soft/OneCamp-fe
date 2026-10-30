import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@/lib/testing/sourceFiles"

// A chunk loaded once by hand was written ten ways. Some forgot a failed load
// and some never did, so one chunk that didn't come stuck until a reload: a
// combobox's menu, a person's hover card, a sub-page's trash. A load made once
// at a module's level takes lib/lazy/once, which asks once and asks again
// after a failure (once.test.ts). By hand it was kept in each of these shapes:
// `x ??= import(...)` (or ||=), `x = x ?? import(...)`, and
// `if (!x) x = import(...)`, on one line or over a block. A React ref's load
// (`ref.current ??= import(...)`) lives and dies with its component, so it stays.
const HAND_ROLLED = [/(\?\?|\|\|)=\s*\(?\s*import\(/, /(?<![\w$.]|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*=\s*(?:\1\s*(?:\?\?|\|\|)\s*)?\(?\s*import\(/]
const A_REFS = /\.current\s*(\?\?|\|\|)=/

/** A load kept by hand that isn't a chunk loaded once, by file and name, with why. */
const NOT_A_LOAD: Record<string, { name: string; why: string }> = {
  "lib/auth/sessionRefresh.ts": {
    name: "inflight",
    why: "one refresh run at a time, let go when it ends: once() would keep a run that succeeded",
  },
}

/** The hand-kept loads on a file's lines, as "file:line". */
export function handRolled(file: string, src: string): string[] {
  const own = NOT_A_LOAD[file]
  return src.split("\n").flatMap((line, i) => {
    if (A_REFS.test(line) || !HAND_ROLLED.some((re) => re.test(line))) return []
    if (own && new RegExp(`(?<![\\w$.])${own.name}\\s*=`).test(line)) return []
    return [`${file}:${i + 1}`]
  })
}

describe("loading a chunk once", () => {
  it("takes lib/lazy/once, never a load kept by hand", () => {
    const found = sourceFiles(["app", "components", "hooks", "lib", "services"], /\.tsx?$/).flatMap((file) => handRolled(file, readFileSync(file, "utf8")))
    expect(found, "load the chunk with once() from lib/lazy/once").toEqual([])
  })

  it("sees each shape a load was kept in by hand, and lets a ref's and a single flight's be", () => {
    const shapes = [
      "x ??= import('./a')",
      "x ||= (import('./a'))",
      "x = x ?? import('./a')",
      "if (!x) x = import('./a').then((m) => m.a)",
      "    loading = import('./a').then(",
    ]
    expect(shapes.map((s) => handRolled("lib/a.ts", s).length)).toEqual([1, 1, 1, 1, 1])
    const left = ["const m = await import('./a')", "ref.current ??= import('./a')", "const load = () => import('./a')", "let p = import('./a')"]
    expect(left.flatMap((s) => handRolled("lib/a.ts", s))).toEqual([])
    expect(handRolled("lib/auth/sessionRefresh.ts", '  inflight = import("./sessionRefreshRun")')).toEqual([])
  })
})
