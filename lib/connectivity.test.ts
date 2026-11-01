import { afterEach, describe, expect, it, vi } from "vitest"
import { isAppOffline, noteNetworkFailure, noteNetworkOk, subscribeConnectivity } from "./connectivity"

afterEach(() => {
  vi.restoreAllMocks()
  noteNetworkOk()
})

// The app's ONE connectivity state: what OfflineNotice says, and what a read that got no answer waits on (hooks/useFetch).
describe("whether the app is offline", () => {
  it("is when the browser has no network", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    expect(isAppOffline()).toBe(true)
  })

  it("is after two misses in a row, not one, and the next answer ends it", () => {
    noteNetworkFailure()
    expect(isAppOffline()).toBe(false)
    noteNetworkFailure()
    expect(isAppOffline()).toBe(true)
    noteNetworkOk()
    expect(isAppOffline()).toBe(false)
  })

  it("is said to subscribers when the browser goes offline and back, as when the server stops answering", () => {
    const heard = vi.fn()
    const stop = subscribeConnectivity(heard)
    window.dispatchEvent(new Event("offline"))
    window.dispatchEvent(new Event("online"))
    expect(heard).toHaveBeenCalledTimes(2)
    noteNetworkFailure()
    noteNetworkFailure()
    expect(heard).toHaveBeenCalledTimes(3)
    stop()
    window.dispatchEvent(new Event("offline"))
    expect(heard).toHaveBeenCalledTimes(3)
  })
})
