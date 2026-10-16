import { describe, expect, it } from "vitest"
import { pinTestClock, TEST_TODAY } from "./testClock"

// The one pin for a test that writes dates: today is set before each test it
// covers and given back after, in a file or in a describe.

describe("a pinned clock", () => {
  pinTestClock()

  it("reads today as the suite's one test day", () => {
    expect(Date.now()).toBe(TEST_TODAY.getTime())
    expect(new Date().getTime()).toBe(TEST_TODAY.getTime())
  })
})

const dayAfter = new Date(TEST_TODAY.getTime() + 86_400_000)

describe("a describe with a day of its own", () => {
  pinTestClock(dayAfter)

  it("reads today as the day it was given", () => {
    expect(Date.now()).toBe(dayAfter.getTime())
  })
})

describe("a describe after a pinned one", () => {
  it("reads the machine's clock again", () => {
    expect([TEST_TODAY.getTime(), dayAfter.getTime()]).not.toContain(Date.now())
  })
})
