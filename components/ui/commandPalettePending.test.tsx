import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"

// The palette said "Nothing called “Wh”" while the name was still being
// typed: the search waits 150 ms for a pause, and that wait didn't count as
// searching (hooks/useSearch). Here the debounce is the real one.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), usePathname: () => "/app/home" }))

const state = {
  users: {
    userSidebar: {
      userChannels: [{ ch_uuid: "c1", ch_name: "engineering", ch_private: false }],
      userChats: [],
      userProjects: [],
      userTeams: [],
      userDocs: [],
      userBoards: [],
    },
  },
  recentItems: { items: [] as { id: string; type: string; title: string; path: string; timestamp: number }[] },
}
vi.mock("react-redux", () => ({
  useSelector: (select: (s: typeof state) => unknown) => select(state),
  useDispatch: () => vi.fn(),
}))

/** The server's answer: null while the search is on its way. */
let answer: SearchResult[] | null = null
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url.startsWith("/search/unifiedSearch/")) {
      asked.push(url)
      return answer ? { data: { data: { page: answer } }, isLoading: false } : { data: undefined, isLoading: true }
    }
    return { data: { data: { user_uuid: "me", user_is_admin: false } }, isLoading: false }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/services/aiSearchService", () => ({
  unifiedSearch: vi.fn(async () => ({ enabled: false, groups: [] })),
  isAbortedRequest: () => false,
}))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => false }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ features: {} }),
}))
vi.mock("@/components/ai/PaletteAsk", () => ({ default: () => null }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: vi.fn(), resume: vi.fn() }) }))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ openShortcuts: () => {} }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { CommandPalette } from "@/components/ui/CommandPalette"

beforeEach(() => {
  vi.useFakeTimers()
  answer = null
  asked.length = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const nothingFound = () => screen.queryByText(/^Nothing called/)

describe("the palette while a name is typed", () => {
  it("searches, never says nothing was found, until the search has answered", () => {
    const view = render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    })
    const input = document.querySelector("[cmdk-input]") as HTMLInputElement
    // Two letters, each before the search's pause.
    for (const text of ["q", "qz"]) {
      act(() => {
        fireEvent.change(input, { target: { value: text } })
      })
      act(() => {
        vi.advanceTimersByTime(60)
      })
      expect(nothingFound()).toBeNull()
    }
    // The pause comes; the search leaves and is on its way.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(asked.some((u) => u.includes("qz"))).toBe(true)
    expect(nothingFound()).toBeNull()
    // It answers with nothing: now, and only now, the palette says so.
    answer = []
    view.rerender(<CommandPalette />)
    expect(nothingFound()?.textContent).toBe("Nothing called “qz”")
  })
})
