import { describe, expect, it } from "vitest"
import { signatureSummary } from "./agentService"

const base = { public_key: "k", checked: 10, valid: 10, unsigned: 0, invalid: 0 }

describe("signatureSummary", () => {
  it("says all verify", () => {
    expect(signatureSummary(base)).toEqual({ tone: "ok", text: "All 10 signed actions verify as this agent's, unaltered." })
  })
  it("mentions older unsigned rows without alarm", () => {
    const s = signatureSummary({ ...base, valid: 7, unsigned: 3 })
    expect(s.tone).toBe("ok")
    expect(s.text).toContain("3 older ones were recorded before signing existed")
  })
  it("warns on any invalid row", () => {
    const s = signatureSummary({ ...base, valid: 9, invalid: 1 })
    expect(s.tone).toBe("warn")
    expect(s.text).toContain("1 of 10")
  })
  it("handles an agent with no actions", () => {
    expect(signatureSummary({ ...base, checked: 0, valid: 0 }).tone).toBe("none")
  })
})
