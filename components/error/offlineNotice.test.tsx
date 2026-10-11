import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let mqtt: { isConnected: boolean } | undefined = undefined
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqttConnectionState: () => mqtt }))
let ready = false
const reload = vi.fn()
vi.mock("@/hooks/useUpdateReady", () => ({ useUpdateReady: () => ({ ready, reload }) }))

import { FootPill, OfflineNotice } from "@/components/error/OfflineNotice"
import { noteNetworkFailure, noteNetworkOk } from "@/lib/connectivity"
import { markSchemaOutdated, resetSchemaOutdated } from "@/lib/schemaOutdated"

// Design v3 (shell T3): one pill says the connection state, above the
// sidebar's foot on a desktop and floating above the tab bar elsewhere.
// Offline (with Retry), live updates paused, or a new version ready (Reload).

afterEach(() => {
  cleanup()
  noteNetworkOk()
  mqtt = undefined
  ready = false
  resetSchemaOutdated()
  vi.restoreAllMocks()
})

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online)
  window.dispatchEvent(new Event(online ? "online" : "offline"))
}

const pill = () => screen.queryByRole("status")

describe("the connection pill", () => {
  it("says nothing while the network, the server and the live connection are there", () => {
    render(<FootPill />)
    expect(pill()).toBeNull()
  })

  it("says you're offline when the browser loses the network, with Retry, and goes when it's back", () => {
    render(<FootPill />)
    act(() => setOnline(false))
    expect(pill()?.textContent).toMatch(/You're offline/)
    expect(pill()?.getAttribute("data-connection-pill")).toBe("offline")
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
    act(() => setOnline(true))
    expect(pill()).toBeNull()
  })

  it("says the server can't be reached when requests get no answer", () => {
    render(<FootPill />)
    act(() => {
      noteNetworkFailure()
      noteNetworkFailure()
    })
    expect(pill()?.textContent).toMatch(/Can't reach the server/)
    act(() => noteNetworkOk())
    expect(pill()).toBeNull()
  })

  it("says live updates are paused once a live connection drops, never while it first connects", () => {
    mqtt = { isConnected: false }
    const view = render(<FootPill />)
    expect(pill()).toBeNull()
    mqtt = { isConnected: true }
    view.rerender(<FootPill />)
    mqtt = { isConnected: false }
    view.rerender(<FootPill />)
    expect(pill()?.textContent).toMatch(/Live updates paused/)
  })

  it("offers Reload when a new version is out", () => {
    ready = true
    render(<FootPill />)
    expect(pill()?.textContent).toMatch(/A new version is ready/)
    act(() => screen.getByRole("button", { name: "Reload" }).click())
    expect(reload).toHaveBeenCalled()
  })

  it("is said once: the root's floating copy stands down while the sidebar hosts the pill", () => {
    render(
      <>
        <OfflineNotice />
        <FootPill />
      </>,
    )
    act(() => setOnline(false))
    const all = screen.getAllByRole("status")
    expect(all).toHaveLength(1)
    expect(all[0].className).not.toMatch(/\bfixed\b/)
  })

  it("floats from the root where no shell hosts it (signed out, a phone)", () => {
    render(<OfflineNotice />)
    act(() => setOnline(false))
    expect(pill()?.className).toMatch(/\bfixed\b/)
  })

  it("sits above the sidebar's foot, and is no longer a notice in the sheet", () => {
    const nav = readFileSync(join(__dirname, "..", "navigationBar", "desktop", "desktopNavigationBar.tsx"), "utf8")
    expect(nav).toMatch(/<FootPill \/>\s*<SidebarFoot \/>/)
    const layout = readFileSync(join(__dirname, "..", "..", "app", "app", "LayoutContent.tsx"), "utf8")
    expect(layout).not.toMatch(/OfflineNotice/)
    const root = readFileSync(join(__dirname, "..", "providers", "ClientProviders.tsx"), "utf8")
    expect(root).toMatch(/<OfflineNotice\s*\/>/)
  })

  // The collaboration server opened a doc read-only because this tab's editor
  // is older than its own (a deploy added a block type this tab would delete).
  it("asks to reload to keep editing when the editor is older than the server's", () => {
    render(<FootPill />)
    act(() => markSchemaOutdated())
    expect(pill()?.textContent).toMatch(/A newer version of OneCamp is ready\. Reload to keep editing/)
    expect(pill()?.getAttribute("data-connection-pill")).toBe("update")
    screen.getByRole("button", { name: "Reload" }).click()
    expect(reload).toHaveBeenCalled()
  })
})
