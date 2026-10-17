import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// Critic, 11 Oct. The agent editor read the workspace's authorized models from
// the admin endpoint for everyone. A member opening New agent (every demo
// visitor among them) got a 403 for it, and with it the app's "Not allowed"
// toast over the dialog they had just opened. An admin reads that list; anyone
// else reads the models they may pick for themselves.

const asked = vi.hoisted(() => ({ urls: [] as string[], admin: false }))
// Every channel, as the pickers read it (useEveryChannel).
vi.mock("@/components/admin/useEveryChannel", () => ({ useEveryChannel: () => ({ channels: [], isLoading: false, isError: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) asked.urls.push(url)
    if (url === "/user/profile") return { data: { data: { user_uuid: "u1", user_is_admin: asked.admin } } }
    return { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/components/admin/SkillLibraryDialog", () => ({ SkillLibraryDialog: () => null }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: () => null }))
vi.mock("@/components/admin/AgentEvalSection", () => ({ AgentEvalSection: () => null }))
vi.mock("@/components/admin/AgentLearningSection", () => ({ AgentLearningSection: () => null }))
vi.mock("@/components/admin/A2ACardSummary", () => ({ A2ACardSummary: () => null }))
vi.mock("@/components/task/TaskMoveFilterFields", () => ({ TaskMoveFilterFields: () => null, ANY_MOVE: {} }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  listAgentSkills: vi.fn().mockResolvedValue([]),
}))

import { AgentEditDialog } from "@/components/admin/AgentEditDialog"
import { GetEndpointUrl } from "@/services/endPoints"

afterEach(() => {
  cleanup()
  asked.urls.length = 0
})

describe("the models an agent can be pinned to", () => {
  it("come from the person's own list for a member, never the admin endpoint", () => {
    asked.admin = false
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    expect(asked.urls).not.toContain(GetEndpointUrl.GetAIAuthorizedModels)
    expect(asked.urls).toContain(GetEndpointUrl.GetAIMyModels)
  })

  it("come from the workspace's authorized list for an admin", () => {
    asked.admin = true
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    expect(asked.urls).toContain(GetEndpointUrl.GetAIAuthorizedModels)
    expect(asked.urls).not.toContain(GetEndpointUrl.GetAIMyModels)
  })
})
