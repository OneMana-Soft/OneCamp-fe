import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
// No member yet: the store isn't opened, only what the screens hear is.
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/components/offline/OfflineChanges", () => ({ OfflineChanges: () => null }))

const { OfflineLoader } = await import("@/components/offline/OfflineLoader")
const { OFFLINE_REFRESH } = await import("@/lib/offline/engine")

const FROM = "offline-0d1f2e3c-4b5a-4f6e-8d7c-6b5a4f3e2d1c"
const made = (from: string, to: string) =>
  act(() => void window.dispatchEvent(new CustomEvent(OFFLINE_REFRESH, { detail: { ids: [to], made: [{ kind: "task", from, to }] } })))

afterEach(() => {
  cleanup()
  replace.mockReset()
  window.history.replaceState(null, "", "/")
})

// CODE-REVIEWER-79 SF1: a page still open on the id the device gave a task
// goes on under the id the server made it, so its address can be copied.
describe("a page on a task made offline, once the server has made it", () => {
  it("moves to the server's id, keeping the rest of its address", async () => {
    window.history.replaceState(null, "", `/app/task/${FROM}?from=board`)
    render(<OfflineLoader />)
    await made(FROM, "t-real")
    expect(replace).toHaveBeenCalledWith("/app/task/t-real?from=board")
  })

  it("stays where it is when its address doesn't name the device's id", async () => {
    window.history.replaceState(null, "", "/app/project/p1")
    render(<OfflineLoader />)
    await made(FROM, "t-real")
    expect(replace).not.toHaveBeenCalled()
  })
})
