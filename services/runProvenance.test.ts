import { describe, expect, it } from "vitest"

import { parseRunSkills, type AgentRun } from "./agentService"

const run = (skills_used: string | null | undefined): AgentRun =>
  ({
    id: "r1",
    agent_id: "a1",
    trigger_source: "manual",
    status: "succeeded",
    steps: "[]",
    step_count: 0,
    tokens: 0,
    started_at: "2026-09-01T00:00:00Z",
    skills_used,
  }) as AgentRun

// This is a display path for an audit record. A run whose provenance cannot be
// read should render without its skill list, never take the dialog down with it.
describe("parseRunSkills", () => {
  it("reads the fingerprints a run recorded", () => {
    const got = parseRunSkills(run('[{"id":"s1","name":"Tone","sha256":"abc"}]'))
    expect(got).toEqual([{ id: "s1", name: "Tone", sha256: "abc" }])
  })

  it("treats a run with no skills as having none", () => {
    expect(parseRunSkills(run(undefined))).toEqual([])
    expect(parseRunSkills(run(null))).toEqual([])
    expect(parseRunSkills(run("[]"))).toEqual([])
  })

  it("survives anything that is not the shape it expects", () => {
    expect(parseRunSkills(run("not json"))).toEqual([])
    // An object rather than an array: older row, or a hand-edited one.
    expect(parseRunSkills(run('{"id":"s1"}'))).toEqual([])
    // Entries without an id cannot be matched against the library, so they are
    // dropped rather than rendered as a nameless chip.
    expect(parseRunSkills(run('[{"name":"Tone"},{"id":"s2","name":"Brevity","sha256":"d"}]'))).toEqual([
      { id: "s2", name: "Brevity", sha256: "d" },
    ])
  })
})
