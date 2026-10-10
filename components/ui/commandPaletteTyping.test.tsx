import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { Provider } from "react-redux"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import store from "@/store/store"

// Typing in the command palette doesn't redraw its commands. The palette
// rebuilt all eighty of them on every keystroke, twice: it copied its input
// into the search in an effect (a second render a key), and useCapabilities
// handed it a new `can` each render, so the memoised command list was built
// again every time. cmdk filters the items itself; an item re-renders when it
// is shown, hidden or selected, not because its parent did.

let itemRenders = 0
vi.mock("@/components/ui/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/command")>()
  const Counted = (props: React.ComponentProps<typeof actual.CommandItem>) => {
    itemRenders++
    return <actual.CommandItem {...props} />
  }
  return { ...actual, CommandItem: Counted }
})
// Stable, as Next's router and the split actions are.
const router = { push: () => {} }
const splitRun = () => {}
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/app/home" }))
// One answer object, as SWR gives: the same data until it changes.
const answer = { data: { data: { user_is_admin: true } }, isLoading: false, isError: undefined, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answer }))
const config = { features: {} }
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => config,
}))
vi.mock("@/hooks/useTrackPageVisit", () => ({ useTrackPageVisit: () => {} }))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => splitRun }))
vi.mock("@/services/aiSearchService", () => ({
  unifiedSearch: async () => ({ enabled: false, groups: [] }),
  isAbortedRequest: () => false,
}))
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => {
    const [inputValue, setInputValue] = useState("")
    return { inputValue, setInputValue, results: [], isLoading: false, handleResultClick: () => {} }
  },
}))

import { CommandPalette } from "./CommandPalette"

afterEach(cleanup)

describe("typing in the command palette", () => {
  it("doesn't rebuild its commands on each keystroke", async () => {
    render(
      <Provider store={store}>
        <CommandPalette />
      </Provider>,
    )
    act(() => void fireEvent.keyDown(document, { key: "k", ctrlKey: true }))
    const input = await screen.findByPlaceholderText("Search or jump to…")
    const opened = itemRenders
    expect(opened).toBeGreaterThan(20)
    itemRenders = 0
    for (const value of ["s", "se", "set"]) act(() => void fireEvent.change(input, { target: { value } }))
    // Eighty items, three keys: 480 renders before (two a key), none now.
    expect(itemRenders).toBeLessThan(opened / 2)
  })
})
