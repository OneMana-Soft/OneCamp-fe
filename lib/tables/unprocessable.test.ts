import { describe, expect, it } from "vitest"

import { unprocessableReason, workingOutOf } from "./unprocessable"

describe("unprocessableReason", () => {
  const why = "This table has too many rows to work out a formula or a rollup over all of them yet."

  it("is the server's words when it understood a request and won't do it as asked", () => {
    expect(unprocessableReason({ response: { status: 422, data: { msg: why } } })).toBe(why)
  })

  it("says nothing for any other answer, nor for a request that got none", () => {
    expect(unprocessableReason({ response: { status: 403, data: { msg: "You can't open this table." } } })).toBeUndefined()
    expect(unprocessableReason({ response: { status: 500, data: { msg: why } } })).toBeUndefined()
    expect(unprocessableReason({ message: "Network Error" })).toBeUndefined()
  })
})

describe("workingOutOf", () => {
  const words = "Double is being worked out over 100,000 rows: 42% done"

  it("is how far a formula's fill has got, from a 422 coded working_out", () => {
    expect(workingOutOf({ response: { status: 422, data: { msg: words, code: "working_out", progress: { done: 42000, total: 100000 } } } })).toEqual({ words, done: 42000, total: 100000 })
  })

  it("is nothing for a refusal, any other answer, or a progress that isn't one", () => {
    expect(workingOutOf({ response: { status: 422, data: { msg: "This table has too many rows to work out a formula or a rollup over all of them yet." } } })).toBeUndefined()
    expect(workingOutOf({ response: { status: 500, data: { msg: words, code: "working_out", progress: { done: 1, total: 2 } } } })).toBeUndefined()
    expect(workingOutOf({ response: { status: 422, data: { msg: words, code: "working_out", progress: { done: "1" } } } })).toBeUndefined()
  })
})
