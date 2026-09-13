import { describe, expect, it, afterEach } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { AIActivityRow } from "@/components/admin/AIActivityCard"
import type { AIActivityItem } from "@/services/aiActivityService"

afterEach(cleanup)

const item = (over: Partial<AIActivityItem> = {}): AIActivityItem => ({
  kind: "audit",
  title: "mcp.tool_call.refused",
  summary: "the caller is not a member of this channel",
  at: new Date().toISOString(),
  ...over,
})

describe("a refusal in the activity feed", () => {
  // The product's central claim is that an agent is stopped when the person
  // behind it could not have done the thing. Filed beside a crashed run, that
  // reads as a fault, and an admin learns to ignore both.
  it("is not presented as a failure", () => {
    const { container } = render(<AIActivityRow item={item({ status: "refused" })} />)
    // Exactly the status label: the ACTION name also contains "refused"
    // (mcp.tool_call.refused), and matching loosely found the title instead.
    const el = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "refused by permissions",
    )
    expect(el, "no refused status rendered").toBeTruthy()
    expect(el?.className).not.toContain("text-destructive")
    expect(el?.className).toContain("text-brand")
  })

  // Colour alone never carries it.
  it("says why in words", () => {
    const { container } = render(<AIActivityRow item={item({ status: "refused" })} />)
    expect((container.textContent || "")).toContain("refused by permissions")
  })

  it("still paints a real failure as one", () => {
    const { container } = render(<AIActivityRow item={item({ title: "ai.run", status: "failed" })} />)
    const el = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "failed")
    expect(el?.className).toContain("text-destructive")
  })

  it("treats an allowed call as the system working", () => {
    const { container } = render(<AIActivityRow item={item({ title: "mcp.tool_call.allowed", status: "allowed" })} />)
    const el = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "allowed")
    expect(el?.className).toContain("text-success")
  })
})
