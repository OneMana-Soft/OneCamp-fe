import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"

import { AgentNoteOnOpen } from "@/components/ai/AgentNoteOnOpen"
import { leaveDailyNote } from "@/services/agentNoteService"
import { localDay } from "@/lib/utils/timeZone"
import { showNews } from "@/lib/ui/news"

const dismiss = vi.fn()
const toast = vi.fn((_props: Record<string, unknown>) => ({ dismiss }))
let aiOn = true
// The first screen settles when a test says so (lib/ui/whenQuiet's runWhenSettled):
// its tasks start, and the test waits for what it needs.
let waiting: Array<() => unknown> = []
const settle = () => act(async () => waiting.splice(0).forEach((task) => void task()))
/** Lets the note's late steps (its answer, then lib/ui/news) run. */
const later = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
vi.mock("@/lib/ui/whenQuiet", () => ({
  runWhenSettled: (tasks: Array<() => unknown>) => {
    waiting.push(...tasks)
    return () => (waiting = waiting.filter((t) => !tasks.includes(t)))
  },
}))
// The real hold (lib/ui/news), watched, so a test can tell the note was held.
vi.mock("@/lib/ui/news", async (orig) => {
  const real = await orig<typeof import("@/lib/ui/news")>()
  return { showNews: vi.fn(real.showNews) }
})
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
    document.body.innerHTML = ""
    waiting = []
    aiOn = true
  })

  it("asks once the first screen has settled, with the member's own day, and says a note arrived", async () => {
    vi.mocked(leaveDailyNote).mockResolvedValue({ posted: true, bot_uuid: "bot-1", items: 3 })
    render(<AgentNoteOnOpen />)
    expect(leaveDailyNote, "not at first paint").not.toHaveBeenCalled()
    await settle()
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(leaveDailyNote).toHaveBeenCalledWith(localDay())
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "OneCamp AI left you a note", description: "3 things need you today." })
    // Marked as news (lib/ui/news), which the Toaster hands to the toast's element.
    expect(toast.mock.calls[0][0]["data-news"]).toMatch(/^news-\d+$/)
    cleanup()
    render(<AgentNoteOnOpen />)
    await settle()
    expect(leaveDailyNote).toHaveBeenCalledTimes(1)
  })

  it("holds the note while a work surface is up, and shows it once the surface has gone", async () => {
    vi.mocked(leaveDailyNote).mockResolvedValue({ posted: true, bot_uuid: "bot-1", items: 1 })
    const board = document.createElement("div")
    board.setAttribute("data-work-surface", "")
    document.body.append(board)
    render(<AgentNoteOnOpen />)
    await settle()
    await waitFor(() => expect(showNews).toHaveBeenCalled())
    await later()
    expect(toast, "not over the board").not.toHaveBeenCalled()
    await act(async () => board.remove())
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0][0]).toMatchObject({ description: "One thing needs you today." })
  })

  it("stays quiet when there was nothing to say", async () => {
    vi.mocked(leaveDailyNote).mockResolvedValue({ posted: false, items: 0 })
    render(<AgentNoteOnOpen />)
    await settle()
    await waitFor(() => expect(leaveDailyNote).toHaveBeenCalled())
    expect(toast).not.toHaveBeenCalled()
  })

  it("asks nothing when the app closes before the first screen settles, and says nothing when it closes before the answer", async () => {
    let answer: (v: { posted: boolean; bot_uuid: string; items: number }) => void = () => {}
    vi.mocked(leaveDailyNote).mockReturnValue(new Promise((r) => (answer = r)))
    render(<AgentNoteOnOpen />)
    cleanup()
    await settle()
    expect(leaveDailyNote).not.toHaveBeenCalled()

    render(<AgentNoteOnOpen />)
    await settle()
    expect(leaveDailyNote).toHaveBeenCalledTimes(1)
    cleanup()
    await act(async () => answer({ posted: true, bot_uuid: "bot-1", items: 2 }))
    await later()
    await later()
    expect(showNews).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it("never asks without AI", async () => {
    aiOn = false
    render(<AgentNoteOnOpen />)
    await settle()
    expect(leaveDailyNote).not.toHaveBeenCalled()
  })
})
