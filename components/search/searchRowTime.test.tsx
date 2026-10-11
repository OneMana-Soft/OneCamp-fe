import { describe, expect, it } from "vitest"

import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { resultTime } from "@/lib/search/scopes"

/** The phone shots printed "30 Jun 58746" beside every search result. */
describe("a search result's date", () => {
  it("prints the year it was made, whatever unit the index used", () => {
    for (const created_date of [1791614952, 1791614952000]) {
      const at = resultTime({ type: "message", message: { created_date } } as unknown as Parameters<typeof resultTime>[0])
      const shown = formatListTimestamp(new Date(at).toISOString())
      expect(shown).not.toMatch(/5\d{4}/)
      expect(new Date(at).getUTCFullYear()).toBe(2026)
    }
  })
})
