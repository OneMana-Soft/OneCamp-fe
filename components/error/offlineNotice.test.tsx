import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render as renderBare, screen } from "@testing-library/react"
import type React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let ready = false
const reload = vi.fn()
vi.mock("@/hooks/useUpdateReady", () => ({ useUpdateReady: () => ({ ready, reload }) }))

import { FootPill, OfflineNotice } from "@/components/error/OfflineNotice"
import { MqttContext, type MqttContextValue } from "@/components/mqtt/mqttContext"
import { noteNetworkFailure, noteNetworkOk } from "@/lib/connectivity"
import { markSchemaOutdated, resetSchemaOutdated } from "@/lib/schemaOutdated"

// The live connection as the signed-in app hands it down: its provider
// (components/mqtt/mqttProvider) gives this context, which the pill reads
// (mqttProviderReaders.test.tsx holds the provider to it). Outside the app
// there is no connection, and mqtt stays undefined. The context is given here
// rather than a module mocked, so the pill is read the way the app reads it.
let mqtt: { isConnected: boolean; reconnectAttempts?: number } | undefined = undefined
const reconnect = vi.fn()
const noop = () => {}
function Live({ children }: { children: React.ReactNode }) {
  const value: MqttContextValue | null = mqtt
    ? {
        connectionState: { isConnecting: false, error: null, reconnectAttempts: 0, ...mqtt },
        reconnect,
        publish: async () => {},
        connect: noop,
        disconnect: noop,
        subscribeToTopic: () => "",
        unsubscribeFromTopic: noop,
      }
    : null
  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>
}
const render = (ui: React.ReactElement) => renderBare(ui, { wrapper: Live })

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

  // It gave up after about three minutes while saying "reconnecting". It never
  // gives up now, and once the fast tries are spent it says it tries every
  // 30 s, and offers to try now.
  it("says how often it tries once the fast tries are spent, with Reconnect", () => {
    mqtt = { isConnected: true }
    const view = render(<FootPill />)
    mqtt = { isConnected: false, reconnectAttempts: 2 }
    view.rerender(<FootPill />)
    expect(pill()?.textContent).toMatch(/Live updates paused · reconnecting/)
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull()
    mqtt = { isConnected: false, reconnectAttempts: 5 }
    view.rerender(<FootPill />)
    expect(pill()?.textContent).toMatch(/Live updates paused · trying every 30 s/)
    act(() => screen.getByRole("button", { name: "Reconnect" }).click())
    expect(reconnect).toHaveBeenCalledOnce()
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
