import { describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// The row is wrapped in withAI, which renders nothing on the AI-free edition and
// whenever an admin has AI switched off. That gate is correct and is tested
// where it lives; here it would just make every assertion fail on an empty
// list, so the feature reads as available.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  // Spread the real module so the feature CONSTANTS stay real: mocking them out
  // would make this pass against names the app does not use.
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: () => true,
}))

import { AgentWorkRow } from "@/components/ai/AgentWorkRow"
import type { ActiveWorkItem } from "@/services/agentService"

// When an agent stops to ask a question, the answers it offered have to reach
// the person as answers.
//
// They used to arrive inside `note`, which the server collapses to one line so
// the card stays skimmable — so a question with choices read as
// "Which environment? - staging - production" and somebody had to pick an
// enumeration out of a sentence. The server now sends the list separately and
// this row shows it.
//
// The list here is the server's own, which matters beyond looks: it is the same
// list the run matches a reply against, so what a person is shown and what the
// agent understands cannot drift.

const base: ActiveWorkItem = {
  task_id: "t1",
  agent_id: "a1",
  agent_name: "Release Triage",
  state: "blocked",
  where: "on a task",
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function renderRow(item: Partial<ActiveWorkItem>) {
  cleanup()
  return render(<ul><AgentWorkRow item={{ ...base, ...item }} /></ul>)
}

describe("a blocked agent's question", () => {
  it("shows each offered answer separately", () => {
    const { getByText } = renderRow({
      note: "Which environment should I deploy to?",
      options: ["staging", "production"],
    })
    getByText("Which environment should I deploy to?")
    getByText("staging")
    getByText("production")
  })

  it("says how to answer, since the row itself is not where you reply", () => {
    // Answering happens in the thread or task the agent asked in, because that
    // is where the run is waiting and where the answer belongs in the record.
    const { getByText } = renderRow({ note: "Which one?", options: ["a", "b"] })
    getByText(/reply with one of these/i)
  })

  it("shows an open question with no choices at all", () => {
    const { getByText, queryByText } = renderRow({ note: "What should I call the branch?" })
    getByText("What should I call the branch?")
    expect(queryByText(/reply with one of these/i)).toBeNull()
  })

  it("shows nothing extra when the agent is not blocked", () => {
    // Options only ever accompany a question. A working row rendering leftover
    // choices would be inviting an answer to a question nobody asked.
    const { queryByText } = renderRow({
      state: "working",
      note: "Which environment?",
      options: ["staging", "production"],
    })
    expect(queryByText("staging")).toBeNull()
    expect(queryByText(/reply with one of these/i)).toBeNull()
  })
})
