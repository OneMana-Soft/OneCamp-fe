import { describe, expect, it } from "vitest"
import { connectionProblem, fullDate, senderName } from "./inboxService"

const httpError = (status: number, code?: string) => ({ response: { status, data: code ? { code } : {} } })

describe("connectionProblem", () => {
  it("sends the page to its connect screen only for the two 409 codes", () => {
    expect(connectionProblem(httpError(409, "not_connected"))).toBe("not_connected")
    expect(connectionProblem(httpError(409, "reconnect"))).toBe("reconnect")
    expect(connectionProblem(httpError(409, "something_else"))).toBeNull()
    expect(connectionProblem(httpError(502))).toBeNull()
    expect(connectionProblem(new Error("network"))).toBeNull()
    expect(connectionProblem(undefined)).toBeNull()
  })
})

describe("fullDate", () => {
  it("shows a header it cannot read as sent, never Invalid Date", () => {
    expect(fullDate("not a date")).toBe("not a date")
    expect(fullDate("Wed, 01 Oct 2026 10:00:00 +0000")).not.toContain("Invalid")
  })
})

describe("senderName", () => {
  it("keeps the display name", () => {
    expect(senderName('"Priya Sharma" <priya@x.com>')).toBe("Priya Sharma")
    expect(senderName("priya@x.com")).toBe("priya@x.com")
  })
})
