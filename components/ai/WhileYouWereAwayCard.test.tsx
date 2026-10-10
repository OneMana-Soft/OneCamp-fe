import { describe, expect, it, vi, beforeEach } from "vitest"
// fireEvent rather than user-event: the latter is not a dependency of this
// project, and a click is all these tests need.
import { render, screen, waitFor, fireEvent, act, cleanup } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { setTTL } from "@/lib/utils/helpers/ttlStorage"

/**
 * The card's contract is mostly about restraint: it must state the size of the
 * backlog for free and spend an LLM call ONLY when the user asks. That
 * guarantee is the reason the component is shaped the way it is, so it is the
 * thing worth locking down — along with the conditions under which the card
 * must not appear at all.
 */

const catchUpMock = vi.fn()
let sidebar: {
  userChannels: { unread_post_count: number }[]
  userChats: { dm_unread: number }[]
} = { userChannels: [], userChats: [] }
let aiEnabled: boolean | undefined = true
let statusLoading = false
let aiState: "unknown" | "available" | "unavailable" = "available"

vi.mock("react-redux", () => ({
  useSelector: (fn: (s: unknown) => unknown) =>
    fn({ users: { userSidebar: sidebar } }),
}))
vi.mock("@/services/aiService", () => ({
  useCatchUp: () => ({ catchUp: catchUpMock, isLoading: false }),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({
    data: aiEnabled === undefined ? undefined : { data: { enabled: aiEnabled } },
    isLoading: statusLoading,
  }),
}))
// Render the recap as plain text; the markdown pipeline is tested elsewhere.
vi.mock("@/components/ai/MarkdownMessage", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}))
// The card's export is wrapped in withAI(), which renders nothing when the server has
// no AI subsystem — the AI-free v1 edition, or v2 with AI switched off. Everything
// below is about what the card does WHEN AI is available, so that is stated here as a
// precondition. Without it these tests assert against an intentionally empty render.
vi.mock("@/hooks/useClientConfig", () => ({
  FEATURE_AI: "ai",
  useFeature: () => aiState === "available",
  useFeatureState: () => aiState,
  useAIAvailable: () => aiState === "available",
  useClientConfig: () => ({ features: { ai: aiState === "available" } }),
}))

import WhileYouWereAwayCard from "./WhileYouWereAwayCard"

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
}

function withUnread(channels: number[], chats: number[] = []) {
  sidebar = {
    userChannels: channels.map((n) => ({ unread_post_count: n })),
    userChats: chats.map((n) => ({ dm_unread: n })),
  }
}

describe("WhileYouWereAwayCard", () => {
  beforeEach(() => {
    // This project does not run vitest with globals, so testing-library's
    // auto-cleanup is never registered; without this, renders accumulate
    // across tests and every getByRole finds duplicates.
    cleanup()
    catchUpMock.mockReset()
    localStorage.clear()
    aiEnabled = true
    statusLoading = false
    aiState = "available"
    withUnread([])
  })

  it("makes no request while at rest — the backlog size is free", () => {
    withUnread([20, 18])
    render(<WhileYouWereAwayCard />)
    expect(screen.getByText(/38 unread messages/)).toBeTruthy()
    expect(catchUpMock).not.toHaveBeenCalled()
  })

  it("counts conversations as well as messages, since that is the reason not to read them one by one", () => {
    withUnread([20, 1], [4])
    render(<WhileYouWereAwayCard />)
    expect(screen.getByText(/25 unread messages/)).toBeTruthy()
    expect(screen.getByText(/across 3 conversations/)).toBeTruthy()
  })

  it("asks for the workspace scope — the one scope no other surface requests", async () => {
    withUnread([30])
    catchUpMock.mockResolvedValue({
      enabled: true,
      has_unread: true,
      summary: "Alex shipped the migration.",
    })
    render(<WhileYouWereAwayCard />)
    await click(screen.getByRole("button", { name: /catch me up/i }))
    expect(catchUpMock).toHaveBeenCalledWith({ scope_type: "workspace" })
    await waitFor(() =>
      expect(screen.getByText("Alex shipped the migration.")).toBeTruthy(),
    )
  })

  it("stays hidden for a trivial backlog — going to lunch is not being away", () => {
    withUnread([3, 2])
    const { container } = render(<WhileYouWereAwayCard />)
    expect(container.firstChild).toBeNull()
  })

  it("stays hidden when an admin has AI switched off, so it never offers a dead button", () => {
    withUnread([40])
    aiEnabled = false
    const { container } = render(<WhileYouWereAwayCard />)
    expect(container.firstChild).toBeNull()
  })

  it("holds its place without a button until the AI status is known, so nothing appears then vanishes", () => {
    withUnread([40])
    statusLoading = true
    render(<WhileYouWereAwayCard />)
    expect(screen.getByRole("status", { name: /loading your recap/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /catch me up/i })).toBeNull()
  })

  // Home's layout shift on the demo: the card rendered nothing until the
  // server's config said AI was on, then arrived and pushed the page down.
  it("holds its place while it isn't yet known whether AI is on", () => {
    withUnread([40])
    aiState = "unknown"
    render(<WhileYouWereAwayCard />)
    expect(screen.getByRole("status", { name: /loading your recap/i })).toBeTruthy()
  })

  it("renders nothing at all on a server without AI", () => {
    withUnread([40])
    aiState = "unavailable"
    const { container } = render(<WhileYouWereAwayCard />)
    expect(container.firstChild).toBeNull()
  })

  it("is absent from its very first render once dismissed, rather than showing and then leaving", () => {
    withUnread([40])
    setTTL("away_recap_dismissed_", "home", 60 * 60 * 1000)
    expect(renderToStaticMarkup(<WhileYouWereAwayCard />)).toBe("")
  })

  it("stands down when the search index says there is nothing to recap", async () => {
    withUnread([30])
    catchUpMock.mockResolvedValue({ enabled: true, has_unread: false, summary: "" })
    const { container } = render(<WhileYouWereAwayCard />)
    await click(screen.getByRole("button", { name: /catch me up/i }))
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it("offers a retry rather than losing the recap when the call fails", async () => {
    withUnread([30])
    catchUpMock.mockRejectedValue({ message: "model unavailable" })
    render(<WhileYouWereAwayCard />)
    await click(screen.getByRole("button", { name: /catch me up/i }))
    await waitFor(() => expect(screen.getByText("model unavailable")).toBeTruthy())
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })

  it("remembers a dismissal, so it does not re-ask on every visit to home", async () => {
    withUnread([40])
    const first = render(<WhileYouWereAwayCard />)
    await click(screen.getByRole("button", { name: /dismiss the recap/i }))
    await waitFor(() => expect(first.container.firstChild).toBeNull())
    first.unmount()
    const second = render(<WhileYouWereAwayCard />)
    expect(second.container.firstChild).toBeNull()
  })
})
