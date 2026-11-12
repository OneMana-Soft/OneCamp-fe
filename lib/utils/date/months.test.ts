import { format } from "date-fns"
import { describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { MONTHS_SHORT } from "./months"

// V-530 (4): a plan's periods, a report's days and a connected value's date
// each kept their own list of months. One list, the words dateWords writes.
describe("the months as a date writes them", () => {
  pinTestClock()
  it("are dateWords' own: date-fns' MMM for each month", () => {
    expect(MONTHS_SHORT).toEqual(Array.from({ length: 12 }, (_, m) => format(new Date(2026, m, 1), "MMM")))
  })
})
