import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A phone task list's first load is its rows' shape (work.md W53). The work
 * critic gave a project's list the skeleton (11 Oct); My tasks, the same list
 * on the same phone, still opened on "Loading more…" alone at the top of an
 * empty page (integration review, 12 Oct). Both pass it as the first page's
 * loading state.
 */
const LISTS = ["components/project/projectTaskList.tsx", "components/myTask/myTaskList.tsx"]

describe("a phone task list's first load", () => {
  for (const file of LISTS) {
    it(`${file} draws the rows' shape, not a spinner`, () => {
      const src = readFileSync(file, "utf8")
      const at = src.indexOf("<VirtualInfiniteScroll")
      expect(at).toBeGreaterThan(-1)
      // The element's own props: up to the keyExtractor every list passes last.
      const el = src.slice(at, src.indexOf("keyExtractor=", at))
      expect(el).toMatch(/loadingComponent=\{\(taskListState\?\.length \?\? 0\) === 0 \? <PhoneListSkeleton \/> : undefined\}/)
    })
  }
})
