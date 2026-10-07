import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import { AgentNoteOnOpen } from "@/components/ai/AgentNoteOnOpen"
import { leaveDailyNote } from "@/services/agentNoteService"
import { localDay } from "@/lib/utils/timeZone"

const toast = vi.fn()
let aiOn = true
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => aiOn }))
vi.mock("@/services/agentNoteService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentNoteService")>()),
  leaveDailyNote: vi.fn(),
}))

describe("the daily note on opening the app", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    sessionStorage.clear()
    aiOn = true
  })

  it("asks once with the member's own day and says a note arrived", async () => {
    vi.mocked(leaveDailyNote).mockResolvedValue({ posted: true, bot_uuid: "bot-1", items: 3 })
    render(<AgentNoteOnOpen />)
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(leaveDailyNote).toHaveBeenCalledWith(localDay())
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "OneCamp AI left you a note", description: "3 things need you today." })
    cleanup()
    render(<AgentNoteOnOpen />)
    expect(leaveDailyNote).toHaveBeenCalledTimes(1)
  })

  it("stays quiet when there was nothing to say", async () => {
    vi.mocked(leaveDailyNote).mockResolvedValue({ posted: false, items: 0 })
    render(<AgentNoteOnOpen />)
    await waitFor(() => expect(leaveDailyNote).toHaveBeenCalled())
    expect(toast).not.toHaveBeenCalled()
  })

  it("never asks without AI", () => {
    aiOn = false
    render(<AgentNoteOnOpen />)
    expect(leaveDailyNote).not.toHaveBeenCalled()
  })
})
