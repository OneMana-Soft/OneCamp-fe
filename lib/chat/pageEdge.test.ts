import { describe, expect, it } from "vitest"
import { pageEdgeQuery } from "@/lib/chat/pageEdge"

// Three posts in one second, the page's edge among them: asked for in whole
// seconds, the two the edge didn't hold were in neither page.
describe("a page's edge", () => {
  it("is the edge message itself: its exact time and its id", () => {
    const q = pageEdgeQuery("2026-10-12T10:00:00.3Z", "4b0c0a43-2f6b-4b3d-9d6e-1f2a3b4c5d6e")
    const params = new URLSearchParams(q.slice(1))
    expect(params.get("at")).toBe("2026-10-12T10:00:00.3Z")
    expect(params.get("id")).toBe("4b0c0a43-2f6b-4b3d-9d6e-1f2a3b4c5d6e")
  })

  it("keeps a time zone's plus sign", () => {
    const q = pageEdgeQuery("2026-10-12T15:30:00.123456789+05:30", "4b0c0a43-2f6b-4b3d-9d6e-1f2a3b4c5d6e")
    expect(new URLSearchParams(q.slice(1)).get("at")).toBe("2026-10-12T15:30:00.123456789+05:30")
  })

  it("is left out for a message the server hasn't given an id yet", () => {
    expect(pageEdgeQuery("2026-10-12T10:00:00.3Z", "local-mf3k2x1a-1b")).toBe("")
    expect(pageEdgeQuery("2026-10-12T10:00:00.3Z", "")).toBe("")
    expect(pageEdgeQuery("", "4b0c0a43-2f6b-4b3d-9d6e-1f2a3b4c5d6e")).toBe("")
  })
})
