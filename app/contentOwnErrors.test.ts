import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * One message per failure. The content pages say a failed load themselves,
 * with Try again (ErrorState, or LoadFailureState, which says whether the
 * thing is not yours, gone or not loaded and draws ErrorState for the last);
 * the global error toast said it again, with the server's raw text
 * ("Something went wrong · boom"). A fetch whose failure the page explains
 * is made with OWN_ERRORS, which keeps the toast quiet.
 */
const read = (p: string) => readFileSync(p, "utf8")

const PAGES: { fetches: string; explains: string }[] = [
  { fetches: "app/app/tables/page.tsx", explains: "app/app/tables/page.tsx" },
  { fetches: "app/app/board/page.tsx", explains: "app/app/board/page.tsx" },
  { fetches: "app/app/board/[board-id]/page.tsx", explains: "app/app/board/[board-id]/page.tsx" },
  { fetches: "components/calendar/calendarApp.tsx", explains: "components/calendar/calendarApp.tsx" },
  { fetches: "components/project/projectFiles.tsx", explains: "components/project/ProjectAttachments.tsx" },
  { fetches: "lib/tables/useTableRows.ts", explains: "app/app/tables/[table-id]/page.tsx" },
]

describe("content pages say a failed load once", () => {
  it.each(PAGES)("$fetches keeps the toast quiet for the load it explains", ({ fetches, explains }) => {
    expect(read(explains)).toMatch(/<(ErrorState|LoadFailureState)\b/)
    expect(read(fetches)).toMatch(/OWN_ERRORS|suppressErrorToast: true/)
  })
})
