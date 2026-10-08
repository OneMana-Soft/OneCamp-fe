import { describe, expect, it } from "vitest"
import { connectOf, loadConnect } from "@/lib/mqtt/loadConnect"

describe("loading the mqtt library's connect", () => {
  const connect = () => null
  it("reads it from either shape the bundler gives", () => {
    expect(connectOf({ connect })).toBe(connect)
    // The production browser bundle: the UMD build, connect on default.
    expect(connectOf({ default: { connect } })).toBe(connect)
  })
  it("says so when it isn't there, rather than failing later as 'not a function'", () => {
    expect(() => connectOf({})).toThrow(/no connect/)
    expect(() => connectOf({ default: {} })).toThrow(/no connect/)
  })
  it("loads the real one", async () => {
    expect(typeof (await loadConnect())).toBe("function")
  })
})
