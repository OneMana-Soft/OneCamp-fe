import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { Provider } from "react-redux"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import store from "@/store/store"
import { offerPaletteEntries } from "@/lib/ui/paletteEntries"
import { openPalette } from "@/lib/ui/palette"

// A surface's key can open the palette straight on one of its actions (a
// table's ⌘J on "Switch table…", airtable-04): the action's page of choices
// opens at once, its rows found by typing, and the pick goes to the action's
// own apply, as when the action is picked from the palette's list.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/tables/t1" }))
const answer = { data: { data: { user_is_admin: true } }, isLoading: false, isError: undefined, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answer, useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ features: {} }),
}))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/services/aiSearchService", () => ({
  unifiedSearch: async () => ({ enabled: false, groups: [] }),
  isAbortedRequest: () => false,
}))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: () => {} }) }))
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => {
    const [inputValue, setInputValue] = useState("")
    return { inputValue, setInputValue, results: [], isLoading: false, handleResultClick: () => {} }
  },
}))

import { CommandPalette } from "./CommandPalette"

const releases: Array<() => void> = []
afterEach(() => {
  cleanup()
  while (releases.length) releases.pop()!()
})

function mount() {
  render(
    <Provider store={store}>
      <CommandPalette />
    </Provider>,
  )
}

describe("the palette opened on a surface's action", () => {
  it("opens on its page of choices, finds them by typing, and hands the pick to its apply", async () => {
    const apply = vi.fn()
    releases.push(
      offerPaletteEntries({
        id: "table",
        group: "This table",
        entries: () => [
          {
            id: "switch-table",
            label: "Switch table…",
            keywords: ["table"],
            choices: async () => [
              { value: "t1", label: "Vendors", current: true },
              { value: "t2", label: "Launch budget" },
              { value: "t3", label: "Hiring plan" },
            ],
            apply,
          },
        ],
      }),
    )
    mount()
    act(() => openPalette({ entry: "table:switch-table" }))
    expect(await screen.findByText("Launch budget")).toBeTruthy()
    expect(screen.getByText("Vendors").closest("[cmdk-item]")?.textContent).toContain("Current")
    const input = screen.getByRole("combobox")
    act(() => void fireEvent.change(input, { target: { value: "hir" } }))
    expect(screen.queryByText("Launch budget")).toBeNull()
    act(() => void fireEvent.click(screen.getByText("Hiring plan").closest("[cmdk-item]")!))
    expect(apply).toHaveBeenCalledWith("t3")
  })

  // The palette mounts on its first use (CommandPaletteLoader), so a table's
  // first ⌘J is a request it takes as it mounts: the reset its closing runs
  // used to run after it there, and opened Search instead of the page.
  it("opens on its page when the action was asked for before the palette mounted, as a first ⌘J is", async () => {
    releases.push(
      offerPaletteEntries({
        id: "table",
        group: "This table",
        entries: () => [{ id: "switch-table", label: "Switch table…", keywords: ["table"], choices: async () => [{ value: "t2", label: "Launch budget" }], apply: vi.fn() }],
      }),
    )
    act(() => openPalette({ entry: "table:switch-table" }))
    mount()
    expect(await screen.findByText("Launch budget")).toBeTruthy()
  })

  it("runs an action without choices at once, and opens on search when no surface offers the action", async () => {
    const run = vi.fn()
    releases.push(offerPaletteEntries({ id: "table", group: "This table", entries: () => [{ id: "print", label: "Print", keywords: [], run }] }))
    mount()
    act(() => openPalette({ entry: "table:print" }))
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    act(() => openPalette({ entry: "board:nothing" }))
    expect(await screen.findByPlaceholderText("Search or jump to…")).toBeTruthy()
  })
})
