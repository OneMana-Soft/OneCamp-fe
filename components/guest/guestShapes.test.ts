import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Four radii: a chip is 4px (rounded-sm), and rounded-full is for avatars and
// status dots. The guest pages drew their "Read only" badges, a table's option
// chips and the project's progress bar as pills.
const ROOT = resolve(__dirname, "..", "..")
function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

// The round things that are meant to be round: a guest's initial (an avatar).
// The meeting's icon in a circle is gone: it sits on the playful layer's
// hued tile.
const ROUND = {
  "components/guest/GuestDocComments.tsx": 1,
} as Record<string, number>

describe("guest pages", () => {
  it("draw chips and bars at 4px, and keep rounded-full for avatars", () => {
    const found: string[] = []
    for (const f of [...files(join(ROOT, "app/guest")), ...files(join(ROOT, "components/guest"))]) {
      const rel = relative(ROOT, f)
      const n = (readFileSync(f, "utf8").match(/\brounded-full\b/g) ?? []).length
      if (n > (ROUND[rel] ?? 0)) found.push(`${rel}: ${n}`)
    }
    expect(found).toEqual([])
  })
})
