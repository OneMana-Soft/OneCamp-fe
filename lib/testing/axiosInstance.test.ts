import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { axiosInstanceModule } from "@/lib/testing/axiosInstance"
import { testFiles } from "@/lib/testing/sourceFiles"

// Every test's mock of lib/axiosInstance is made by axiosInstanceModule, so it
// carries the module's OWN_ERRORS: hand-made mocks left it out, and what passes
// it failed to load in those tests, while the others kept values of their own.
const MOCK = /vi\.mock\(\s*["']@\/lib\/axiosInstance["']\s*,\s*/g
const MADE = 'async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule('

describe("a test's mock of lib/axiosInstance", () => {
  it("is made by axiosInstanceModule, so it carries the module's OWN_ERRORS", () => {
    const handMade = testFiles(["."], /\.test\.tsx?$/).filter((f) => {
      const src = readFileSync(f, "utf8")
      return [...src.matchAll(MOCK)].some((m) => !src.startsWith(MADE, m.index + m[0].length))
    })
    expect(handMade).toEqual([])
  })

  it("keeps the module's OWN_ERRORS over a value of the test's own", () => {
    expect(axiosInstanceModule({ default: {}, OWN_ERRORS: {} }).OWN_ERRORS).toBe(OWN_ERRORS)
  })
})
