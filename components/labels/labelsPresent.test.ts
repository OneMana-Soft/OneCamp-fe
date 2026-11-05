import { describe, expect, it } from "vitest"

import { chainOf, walk } from "../../scripts/fluidity/reach.mjs"

// A sensitivity label's chip and picker load on demand (miro-44 L), and they only
// present: the page that mounts them reads and writes the label through its thin
// hook (components/labels/labelData), with the SWR, axios and toast that page
// already loads. A lazy piece that brought its own reads would put those modules
// in a chunk group of its own, and the chunker would cut the pages that share
// them again (on 4 Nov the public guest table page moved 7.4 KB that way).
// This walks the static imports from each lazy piece and fails, naming the
// chain, if one reaches a read, a write, a toast or the empty state.
const PRESENT = ["components/labels/boardLabel.tsx", "components/labels/LabelPicker.tsx", "components/labels/labelMarks.tsx", "components/labels/labelHeldNote.tsx"]
const DATA_FILES = ["hooks/useFetch.ts", "lib/axiosInstance.ts", "lib/swrMutate.ts", "hooks/use-toast.ts", "components/ui/empty-state.tsx"]
const DATA_PACKAGES = ["swr", "axios"]

function dataReach(entries: string[]): string[] {
  const { files, packages } = walk(entries) as { files: Map<string, string | null>; packages: Array<[string, string]> }
  const own = DATA_FILES.filter((f) => files.has(f)).map((f) => `${f}: ${chainOf(files, f)}`)
  const pkgs = packages.filter(([spec]) => DATA_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))).map(([spec, file]) => `${spec}: ${chainOf(files, file)}`)
  return [...own, ...pkgs]
}

describe("a label's lazy chip and picker only present", () => {
  it("reach no read, write, toast or empty state of their own", () => {
    expect(dataReach(PRESENT)).toEqual([])
  })

  it("would see one: the board's page, walked from, brings its reads", () => {
    expect(dataReach(["app/app/board/[board-id]/page.tsx"]).length).toBeGreaterThan(0)
  })

  // The hook is on the board's first load: it brings the label's small core and nothing that draws or that only the
  // admin card needs (the picker, the marks, the rules and their words, lib/labels/labels).
  it("leave the page's hook thin: the board's page reaches the hook and the core, and none of what they present", () => {
    const { files } = walk(["app/app/board/[board-id]/page.tsx"]) as { files: Map<string, string | null> }
    expect(["components/labels/labelData.ts", "components/labels/noLabels.tsx", "lib/labels/labelCore.ts"].filter((f) => !files.has(f))).toEqual([])
    const drawn = ["components/labels/LabelPicker.tsx", "components/labels/labelMarks.tsx", "components/labels/labelHeldNote.tsx", "components/labels/boardLabel.tsx", "lib/labels/labelRules.ts", "lib/labels/labels.ts"]
    expect(drawn.filter((f) => files.has(f)).map((f) => `${f}: ${chainOf(files, f)}`)).toEqual([])
  })
})
