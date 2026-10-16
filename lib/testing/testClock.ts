import { afterEach, beforeEach, vi } from "vitest"

/**
 * Today, in a test that writes dates: 15 Oct 2026, 12:00 UTC.
 *
 * A fixed date in a test meets today wherever the code under test reads the
 * time, so the test holds only until the calendar moves past it: the booking
 * page's failed every gate from 11:30 IST on 14 Oct 2026, and a cycle's
 * "4 d left" would have ended on 19 Oct. One day for every such test, so the
 * dates they write are read against the same today on any day the suite runs.
 */
export const TEST_TODAY = new Date("2026-10-15T12:00:00Z")

/**
 * Sets the clock for the tests where it is called: in a file, every test in
 * it; in a describe, the describe's. Today is `at` (TEST_TODAY unless a test
 * needs another day), set before each test and given back after it.
 *
 *   pinTestClock()
 *   describe("a date in a line", () => {
 *     pinTestClock(new Date(2026, 9, 14, 10)) // this describe's own day
 *   })
 *
 * The clock stands still and timers stay real (vi.setSystemTime with no fake
 * timers), which is all a test that reads today needs. A test may move the
 * clock itself with vi.setSystemTime. One that needs fake timers sets them
 * instead of this pin, with `now`: vitest refuses fake timers once the date is
 * mocked. app/testClock.test.ts counts a call to this, in the file or in a
 * describe over a test, as that test setting its clock.
 */
export function pinTestClock(at: Date = TEST_TODAY): void {
  beforeEach(() => {
    vi.setSystemTime(at)
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}
