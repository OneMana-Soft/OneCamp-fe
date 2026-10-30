import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// "/apps <name>" and the "/" menu's "Set up <app>" both landed on the whole
// directory: the bridge dropped the name and had no app to open.
const push = vi.fn()
vi.mock("@/lib/navigation/appRouter", () => ({ useAppRouter: () => ({ push }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => {} }))

const { default: store } = await import("@/store/store")
const { default: CommandActionBridge } = await import("@/components/command/CommandActionBridge")

afterEach(() => {
  cleanup()
  push.mockClear()
})

describe("opening Admin › Apps from a command", () => {
  it("opens the app to set up, searches for /apps' words, or shows the directory", () => {
    render(<Provider store={store}><CommandActionBridge /></Provider>)
    for (const detail of [{ slug: "giphy" }, { query: "zoom meetings" }, {}]) {
      act(() => void window.dispatchEvent(new CustomEvent("open-apps", { detail })))
    }
    expect(push.mock.calls.map((c) => c[0])).toEqual([
      "/app/admin?tab=apps&app=giphy",
      "/app/admin?tab=apps&q=zoom+meetings",
      "/app/admin?tab=apps",
    ])
  })
})
