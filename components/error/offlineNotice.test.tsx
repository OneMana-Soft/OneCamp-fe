import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { OfflineNotice } from "@/components/error/OfflineNotice"
import { noteNetworkFailure, noteNetworkOk } from "@/lib/connectivity"

// The app had no offline state: with the network gone, reads failed into
// empty lists or "Couldn't load" boxes, and writes failed in silence or under
// a generic error. One quiet notice now says what is true while it is true.

afterEach(() => {
  cleanup()
  noteNetworkOk()
  vi.restoreAllMocks()
})

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online)
  window.dispatchEvent(new Event(online ? "online" : "offline"))
}

describe("the offline notice", () => {
  it("says nothing while the network and the server are there", () => {
    render(<OfflineNotice />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says you're offline when the browser loses the network, and goes when it's back", () => {
    render(<OfflineNotice />)
    act(() => setOnline(false))
    expect(screen.getByRole("status").textContent).toMatch(/You're offline/)
    expect(screen.getByRole("status").textContent).toMatch(/won't be saved until you're back/)
    act(() => setOnline(true))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says the server can't be reached when requests get no answer, and goes on the next answer", () => {
    render(<OfflineNotice />)
    act(() => {
      noteNetworkFailure()
      noteNetworkFailure()
    })
    expect(screen.getByRole("status").textContent).toMatch(/Can't reach the server/)
    act(() => noteNetworkOk())
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("is mounted once, at the root, so every page has it", () => {
    const root = readFileSync(join(__dirname, "..", "providers", "ClientProviders.tsx"), "utf8")
    expect(root).toMatch(/<OfflineNotice\s*\/>/)
  })
})
