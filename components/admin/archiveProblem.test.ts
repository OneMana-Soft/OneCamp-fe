import { describe, expect, it } from "vitest"

import { archiveProblem } from "./archiveProblem"

const refusal = (status: number, data: Record<string, unknown>) => ({ response: { status, data } })

// The archive endpoints answer in `error`, and a server fault there is the raw
// dependency error. A person gets the refusals they can act on in plain words,
// and the caller's own sentence for everything else.
describe("an archive request's problem", () => {
  it("says the server couldn't be reached when nothing answered", () => {
    expect(archiveProblem(new Error("Network Error"), "fallback")).toBe("Couldn't reach the server. Check your connection and try again.")
  })

  it("names the refusals an admin can act on", () => {
    expect(archiveProblem(refusal(429, { error: "rate limit exceeded, try again later" }), "fallback")).toBe("Too many archive requests at once. Try again in a minute.")
    expect(archiveProblem(refusal(409, { error: "x", code: "already_running" }), "fallback")).toBe("This is being archived right now. Wait for that run to finish.")
    expect(archiveProblem(refusal(409, { error: "x", code: "archive_running" }), "fallback")).toBe("Archiving is running right now. Try again when it finishes.")
    expect(archiveProblem(refusal(400, { error: "entity_ids exceeds maximum of 1000 per request" }), "fallback")).toBe("Restore up to 1,000 items at a time.")
  })

  it("never shows a raw server error", () => {
    expect(archiveProblem(refusal(500, { error: "pq: relation \"archived_posts\" does not exist" }), "Couldn't restore them. Try again.")).toBe("Couldn't restore them. Try again.")
    expect(archiveProblem(refusal(400, { error: "entityType is required" }), "Couldn't save the rules.")).toBe("Couldn't save the rules.")
  })
})
