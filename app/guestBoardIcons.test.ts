import { describe, expect, it } from "vitest"

import { chainOf, sourceOf, walk } from "../scripts/fluidity/reach.mjs"

// A board link's page (/guest/b, miro-33) and the icons the task route holds.
// Turbopack batches modules by the chunk groups that hold them: an icon the
// task route shares that joins guest/b's first load splits the task route's
// batches anew, and every task-route visitor downloads a second copy of them
// (~50 KB raw, proven by a membership diff on 14 Nov). A piece of the page's
// own is no way out: a new chunk group holding them splits the same batches.
// The link's role tag is words only, so guest/b's first load names none of
// them. This walks the page's static imports and fails,
// naming the file and its chain, on a named import of one of them.
const PAGE = "app/guest/b/[token]/page.tsx"
const ICONS_FROM = new Set(["@/lib/icons", "lucide-react"])
const namedImportRe = /^\s*import\s+(?!type\b)\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm

function iconsReached(entry: string, icons: string[]): string[] {
  const { files } = walk([entry]) as { files: Map<string, string | null> }
  const hits: string[] = []
  for (const file of files.keys()) {
    for (const [, names, from] of sourceOf(file).matchAll(namedImportRe)) {
      if (!ICONS_FROM.has(from)) continue
      for (const name of (names as string).split(",").map((n) => n.trim().split(/\s+as\s+/)[0])) {
        if (icons.includes(name)) hits.push(`${name} in ${file}: ${chainOf(files, file)}`)
      }
    }
  }
  return hits
}

const ROLE_ICONS = ["MessageSquare", "Pencil"]

describe("a board link's page without the task route's icons in its first load", () => {
  it("draws the link's role without a static import of its icons", () => {
    expect(iconsReached(PAGE, ROLE_ICONS)).toEqual([])
  })

  it("would see one: the task route, walked from, names them", () => {
    expect(iconsReached("app/app/task/[task-id]/page.tsx", ROLE_ICONS).length).toBeGreaterThan(0)
  })
})
