import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  OWN_ERRORS: { ownErrors: true },
}))

import { DOC_AI_PATHS, getDocAIModel, getDocAIStarters, messageOf, recordAppliedEdit, revertAgentEdit } from "./docAIApi"

// Doc AI's routes beside the stream (router/docsAI.go): their answers in
// words a person can act on, and the record's body without the text.

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

const httpError = (status: number, data: unknown) => Object.assign(new Error("http"), { response: { status, data } })

describe("doc AI's routes", () => {
  it("all live under /doc/ai", () => {
    for (const path of Object.values(DOC_AI_PATHS)) expect(path).toMatch(/^\/doc\/ai\//)
  })

  it("names the model only when AI is on", async () => {
    get.mockResolvedValueOnce({ data: { data: { enabled: true, model: { name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true } } } })
    expect(await getDocAIModel()).toMatchObject({ label: "qwen3 4B", local: true })
    get.mockResolvedValueOnce({ data: { data: { enabled: false } } })
    expect(await getDocAIModel()).toBeNull()
  })

  it("asks for a doc's project by its id, escaped", async () => {
    get.mockResolvedValueOnce({ data: { data: { project: null } } })
    expect(await getDocAIStarters("a b")).toBeNull()
    expect(get.mock.calls[0][0]).toBe("/doc/ai/starters?doc_uuid=a%20b")
  })

  it("records an accepted edit by its counts and fingerprints, never its text", async () => {
    post.mockResolvedValueOnce({ data: {} })
    const edit = {
      doc_uuid: "d1",
      action: "improve" as const,
      model: "qwen3 4B",
      local: true,
      changes: 2,
      of: 3,
      inserted: false,
      before_hash: "a".repeat(64),
      after_hash: "b".repeat(64),
      chars: 120,
    }
    await recordAppliedEdit(edit)
    expect(post).toHaveBeenCalledWith("/doc/ai/applied", edit, { ownErrors: true })
    expect(Object.keys(post.mock.calls[0][1])).not.toContain("text")
  })

  it("says the server's reason, or its own", () => {
    expect(messageOf(httpError(403, { msg: "You can't edit this doc." }), "fallback")).toBe("You can't edit this doc.")
    expect(messageOf(httpError(500, { msg: "  " }), "fallback")).toBe("fallback")
    expect(messageOf(new Error("network"), "fallback")).toBe("fallback")
  })
})

describe("reverting an agent's edit", () => {
  it("reports how many edits went back", async () => {
    post.mockResolvedValueOnce({ data: { data: { reverted: 1 } } })
    expect(await revertAgentEdit("d1", { edit_id: "e1" })).toEqual({ ok: true, reverted: 1 })
    expect(post.mock.calls[0][1]).toEqual({ doc_uuid: "d1", edit_id: "e1", force: false })
  })

  it("asks first when someone edited the agent's text since", async () => {
    post.mockRejectedValueOnce(httpError(409, { msg: "Sam edited this since. Revert anyway?", edited_since: true }))
    expect(await revertAgentEdit("d1", { edit_id: "e1" })).toEqual({ ok: false, editedSince: true, message: "Sam edited this since. Revert anyway?" })
  })

  it("says why it couldn't, with what to do", async () => {
    post.mockRejectedValueOnce(httpError(422, { msg: "That edit was already reverted." }))
    expect(await revertAgentEdit("d1", { run_id: "r1" }, true)).toEqual({ ok: false, editedSince: false, message: "That edit was already reverted." })
    post.mockRejectedValueOnce(new Error("offline"))
    expect(await revertAgentEdit("d1", { edit_id: "e1" })).toMatchObject({ ok: false, message: "The revert couldn't be made just now. Try again in a moment." })
  })
})
