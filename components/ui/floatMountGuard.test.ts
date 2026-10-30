import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * A FLOAT MARKS THE PAGE ONLY WHILE IT'S UP (27 Oct 2026).
 *
 * A popover's, a select's or a menu's content marks the page for as long as
 * it is mounted (components/ui/floatMark), and on a phone the page dims under
 * the mark and its scrim takes the page's taps (app/overlay.css). A content
 * mounted while shut (forceMount) held the mark at rest: from 21 Oct a phone's
 * New task page was dim and took no taps. So none of them is force-mounted.
 */
const FORCED = /<(PopoverContent|SelectContent|DropdownMenuContent|DropdownMenuSubContent)\b[^>]*?\bforceMount\b/g

/** Each force-mounted float in a source, as "<file>: <element>". Pure. */
export function forcedFloats(file: string, source: string): string[] {
  return [...source.matchAll(FORCED)].map((m) => `${file}: ${m[1]}`)
}

describe("a float marks the page only while it's up", () => {
  it("sees a float force-mounted, and passes one that isn't", () => {
    expect(forcedFloats("f.tsx", `<PopoverContent forceMount className="w-80" align="start">`)).toEqual(["f.tsx: PopoverContent"])
    expect(forcedFloats("f.tsx", `<DropdownMenuContent\n  align="end"\n  forceMount\n>`)).toEqual(["f.tsx: DropdownMenuContent"])
    expect(forcedFloats("f.tsx", `<PopoverContent className="w-80" align="start">`)).toEqual([])
  })

  it("mounts no popover, select or menu content while it's shut", () => {
    const found = sourceFiles(["app", "components"], /\.tsx$/).flatMap((f) => forcedFloats(f, readFileSync(f, "utf8")))
    expect(found).toEqual([])
  })
})
