import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { Provider } from "react-redux"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import store from "@/store/store"

// Typing in the command palette doesn't redraw its rows twice a key. The
// palette once rebuilt all eighty commands on every keystroke, twice: it
// copied its input into the search in an effect (a second render a key), and
// useCapabilities handed it a new `can` each render. Design v3 opens on a
// curated few rows, and what is typed draws only what it matched.

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
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: () => {} }) }))
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => {
    const [inputValue, setInputValue] = useState("")
    return { inputValue, setInputValue, results: [], isLoading: false, handleResultClick: () => {} }
  },
}))

import { CommandPalette } from "./CommandPalette"

afterEach(cleanup)

describe("typing in the command palette", () => {
  it("draws each row at most a couple of times a key", async () => {
    render(
      <Provider store={store}>
        <CommandPalette />
      </Provider>,
    )
    act(() => void fireEvent.keyDown(document, { key: "k", ctrlKey: true }))
    const input = await screen.findByPlaceholderText("Search or jump to…")
    // The v3 palette opens curated: a few suggestions, not every destination.
    expect(document.querySelectorAll("[cmdk-item]").length).toBeLessThanOrEqual(10)
    act(() => void fireEvent.change(input, { target: { value: "cr" } }))
    const shown = document.querySelectorAll("[cmdk-item]").length
    expect(shown).toBeGreaterThan(2)
    itemRenders = 0
    for (const value of ["cre", "crea", "creat"]) act(() => void fireEvent.change(input, { target: { value } }))
    // Every row redraws once a key (its matched letters change), and cmdk's
    // selection may add one more. A second copy of the query, kept in step
    // by an effect, doubled that before.
    expect(itemRenders).toBeLessThanOrEqual(shown * 3 * 2)
  })
})
