import { describe, expect, it } from "vitest"
import { count } from "@/lib/utils/count"

describe("count", () => {
  it("names one, and many, with the number grouped", () => {
    expect(count(1, "DM", "DMs")).toBe("1 DM")
    expect(count(0, "error", "errors")).toBe("0 errors")
    expect(count(1204, "message", "messages")).toBe("1,204 messages")
  })
})
