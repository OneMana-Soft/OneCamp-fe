import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { readFileSync } from "node:fs"
import { Provider } from "react-redux"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import store from "@/store/store"
import { createDocCommandBus, holdBus, providePaletteEntries } from "@/components/docEditor/registry/commandBus"

// The palette offers the open doc's own actions (PROGRAM.md §4 #2: the same
// actions on every surface): its page lists them on its bus, as More shows
// them, and the palette finds them by typing. It reads the bus alone, never
// the registry, so the app's first load stays free of editor code.

const router = { push: () => {} }
const splitRun = () => {}
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/app/doc/d1" }))
const answer = { data: { data: { user_is_admin: true } }, isLoading: false, isError: undefined, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answer, useFetchOnlyOnce: () => ({ data: undefined }) }))
const config = { features: {} }
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => config,
}))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => splitRun }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: () => {} }) }))
vi.mock("@/components/ai/PaletteAsk", () => ({ default: () => null }))
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

async function typeInPalette(value: string) {
  render(
    <Provider store={store}>
      <CommandPalette />
    </Provider>,
  )
  act(() => void fireEvent.keyDown(document, { key: "k", ctrlKey: true }))
  const input = await screen.findByPlaceholderText("Search or jump to…")
  act(() => void fireEvent.change(input, { target: { value } }))
}

describe("the palette on a doc", () => {
  it("lists the open doc's actions as its page shows them, and runs them there", async () => {
    const bus = createDocCommandBus("d1")
    const fullWidth = vi.fn()
    releases.push(holdBus(bus))
    releases.push(providePaletteEntries(bus, () => [
      { id: "doc.fullWidth", label: "Full width", keywords: ["wide"], run: fullWidth },
      { id: "doc.copyLink", label: "Copy link", keywords: [], keys: "⌘ L", run: () => {} },
    ]))
    await typeInPalette("full width")
    const row = await screen.findByText("This doc")
    expect(row.closest("[cmdk-item]")?.textContent).toContain("Full width")
    act(() => void fireEvent.click(row.closest("[cmdk-item]")!))
    expect(fullWidth).toHaveBeenCalledTimes(1)
  })

  it("lists none once the doc is closed", async () => {
    const bus = createDocCommandBus("d2")
    const release = holdBus(bus)
    const stop = providePaletteEntries(bus, () => [{ id: "doc.history", label: "Version history", keywords: [], run: () => {} }])
    stop()
    release()
    await typeInPalette("version history")
    expect(screen.queryByText("This doc")).toBeNull()
  })

  it("reads the bus, not the registry", () => {
    const src = readFileSync("components/ui/CommandPalette.tsx", "utf8")
    expect(src).toMatch(/paletteEntries\(\)/)
    expect(src).not.toMatch(/from "@\/components\/docEditor\/registry"/)
    expect(src).not.toMatch(/docEditor\/registry\/(readers|registry|shortcuts)/)
  })
})
