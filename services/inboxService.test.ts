import { describe, expect, it } from "vitest"
import { connectionProblem, fullDate, mailDate, senderName, shortDate } from "./inboxService"

const httpError = (status: number, code?: string) => ({ response: { status, data: code ? { code } : {} } })

describe("connectionProblem", () => {
  it("sends the page to its connect screen only for the two 409 codes", () => {
    expect(connectionProblem(httpError(409, "not_connected"))).toBe("not_connected")
    expect(connectionProblem(httpError(409, "reconnect"))).toBe("reconnect")
    expect(connectionProblem(httpError(409, "demo"))).toBe("demo")
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

describe("dates, the app's one way", () => {
  const now = new Date(2026, 9, 10, 15, 0)
  it("lists today's mail by its time and older mail by day and month, day first", () => {
    expect(shortDate(new Date(2026, 9, 10, 9, 5).toISOString(), now)).toBe("9:05 AM")
    expect(shortDate(new Date(2026, 9, 1, 9, 5).toISOString(), now)).toBe("1 Oct")
    expect(shortDate(new Date(2025, 11, 24, 9, 5).toISOString(), now)).toBe("24 Dec 2025")
  })
  it("heads a message with its day and time, and keeps all of it for a tooltip", () => {
    expect(mailDate(new Date(2026, 9, 1, 15, 30).toISOString(), now)).toBe("1 Oct, 3:30 PM")
    expect(fullDate(new Date(2026, 9, 1, 15, 30).toISOString())).toBe("Thursday 1 October 2026, 3:30 PM")
  })
})
