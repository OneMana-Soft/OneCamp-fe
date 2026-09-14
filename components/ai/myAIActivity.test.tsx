import { describe, expect, it, afterEach, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import { GetEndpointUrl } from "@/services/endPoints"

// The card gates itself on AI availability, as every AI component rendered from
// outside components/ai must — the repo's own guard enforces it. Without this the
// gate renders nothing and every assertion below fails for the wrong reason.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: () => true,
}))

const fetchCalls: string[] = []
let payload: unknown = { data: [] }
let loading = false

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    fetchCalls.push(url)
    return { data: payload, isLoading: loading }
  },
}))

afterEach(() => {
  cleanup()
  fetchCalls.length = 0
  payload = { data: [] }
  loading = false
})

describe("a member's own AI record", () => {
  // THE ACCESS DECISION IS THE ENDPOINT. The admin route returns the whole
  // workspace; this card must never call it, because a client-side filter over a
  // wider payload is a privacy control the network tab defeats.
  it("reads the member-scoped endpoint, never the admin one", () => {
    render(<MyAIActivityCard />)
    expect(fetchCalls.length).toBe(1)
    expect(fetchCalls[0]).toContain(GetEndpointUrl.MyAIActivity)
    expect(fetchCalls[0]).not.toContain("/admin/")
  })

  // An empty feed is a fact, not a failure. Saying what WOULD appear is what
  // stops it reading as broken.
  it("explains an empty record rather than looking broken", () => {
    render(<MyAIActivityCard />)
    const text = document.body.textContent || ""
    expect(text).toMatch(/nothing yet/i)
    expect(text).toMatch(/stopped from acting/i)
  })

  it("shows a refusal with its reason", () => {
    payload = {
      data: [
        {
          kind: "audit",
          title: "mcp.tool_call.refused",
          summary: "you are not a member of this channel",
          status: "refused",
          at: new Date().toISOString(),
        },
      ],
    }
    render(<MyAIActivityCard />)
    const text = document.body.textContent || ""
    expect(text).toContain("you are not a member of this channel")
    expect(text).toContain("refused by permissions")
  })

  it("announces its loading state to a screen reader", () => {
    loading = true
    render(<MyAIActivityCard />)
    expect(screen.getByRole("status", { name: /loading your ai activity/i })).toBeTruthy()
  })

  // The card says whose record this is. Without that an admin reading it would
  // reasonably assume it is the workspace's, and act on a partial picture.
  it("says this is the viewer's own record, not the workspace's", () => {
    render(<MyAIActivityCard />)
    expect((document.body.textContent || "")).toMatch(/you see yourself/i)
  })
})
