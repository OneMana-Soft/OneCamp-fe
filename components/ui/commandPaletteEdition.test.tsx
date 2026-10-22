import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { Provider } from "react-redux"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import store from "@/store/store"

// This edition's server has no AI: it answers every /ai/ route with 501. The
// palette posted each query of two letters or more to POST /ai/search all the
// same, quiet only because that request hid its error. What is typed searches
// the workspace and asks no AI.

const asked: string[] = []
vi.mock("@/lib/axiosInstance", async (importOriginal) => {
  const ask = (url: string) => {
    asked.push(url)
    return Promise.resolve({ data: {} })
  }
  return {
    ...(await importOriginal<typeof import("@/lib/axiosInstance")>()),
    default: { get: ask, post: ask, put: ask, patch: ask, delete: ask },
  }
})
const router = { push: () => {} }
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/app/home" }))
const answer = { data: { data: { user_is_admin: true } }, isLoading: false, isError: undefined, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answer }))
let config: { features: Record<string, boolean> } = { features: {} }
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => config,
}))
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))
vi.mock("@/hooks/useTrackPageVisit", () => ({ useTrackPageVisit: () => {} }))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: () => {} }) }))
const searched: string[] = []
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => {
    const [inputValue, setInputValue] = useState("")
    return {
      inputValue,
      setInputValue: (v: string) => {
        searched.push(v)
        setInputValue(v)
      },
      results: [],
      isLoading: false,
      handleResultClick: () => {},
    }
  },
}))

import { FEATURE_AI } from "@/hooks/useClientConfig"
import { CommandPalette } from "./CommandPalette"

afterEach(() => {
  cleanup()
  config = { features: {} }
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

describe("the command palette on the edition without AI", () => {
  it("searches the workspace for what is typed and asks no AI", async () => {
    await typeInPalette("launch plan")
    expect(searched).toContain("launch plan")
    expect(asked.filter((url) => url.startsWith("/ai/"))).toEqual([])
  })

  // A server that claims AI is a wrong pairing here, and the build has no AI
  // pages for these commands to open.
  it("offers no AI commands, even where the server claims AI", async () => {
    config = { features: { [FEATURE_AI]: true } }
    await typeInPalette("ai")
    const rows = [...document.querySelectorAll("[cmdk-item]")].map((row) => row.textContent ?? "")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((text) => /Second Brain|Workspace Memory|AI agents|tasks from a conversation/.test(text))).toEqual([])
  })
})
