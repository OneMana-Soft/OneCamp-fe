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
import { getOfflineStatus, resetOfflineStatus, setOfflineStatus, setSendNow } from "@/lib/offline/status"

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

// The Offline Store (lib/offline, P7-1): the same pill says what waits.
describe("the connection pill with changes kept offline", () => {
  afterEach(() => resetOfflineStatus())
  const op = (seq: number, state: "conflict" | "held") =>
    ({ seq, opKey: `k${seq}`, kind: "task", id: `t${seq}`, action: "update", method: "POST", url: "/x", payload: {}, hasBase: true, queuedAt: 0, bytes: 1, state }) as const

  it("offline, says how many changes are kept on this device", () => {
    setOnline(false)
    act(() => setOfflineStatus({ waiting: 3 }))
    render(<OfflineNotice />)
    expect(pill()?.textContent).toContain("You're offline · 3 changes waiting")
    expect(pill()?.getAttribute("title")).toContain("Kept on this device")
  })

  it("offline at the cap, says new changes can't be kept: never a silent drop", () => {
    setOnline(false)
    act(() => setOfflineStatus({ waiting: 200, full: true }))
    render(<OfflineNotice />)
    expect(pill()?.textContent).toContain("200 changes waiting")
    expect(pill()?.getAttribute("title")).toContain("New changes can't be kept until these are sent")
  })

  // DESIGN-BUILD-21 M2: one failed send leaves the server short of
  // unreachable (two misses), and an idle page asks nothing more: the kept
  // change waited with no sign at all.
  it("online, with a change kept after a failed send, says it is waiting, and Retry sends it now", () => {
    setOnline(true)
    const send = vi.fn()
    setSendNow(send)
    act(() => setOfflineStatus({ waiting: 1 }))
    render(<OfflineNotice />)
    expect(pill()?.textContent).toContain("1 change waiting")
    expect(pill()?.getAttribute("title")).toContain("Kept on this device")
    act(() => screen.getByRole("button", { name: "Retry" }).click())
    expect(send).toHaveBeenCalledTimes(1)
    setSendNow(null)
  })

  // DESIGN-BUILD-21 M1: on a phone it sat over a task's composer, placed for a
  // tab bar the page doesn't have. It sits above whatever owns the foot, as a
  // toast does (app/phone.css --phone-floor; a call's --call-dock-floor).
  it("on a phone, sits 8px above what owns the screen's foot", () => {
    render(<OfflineNotice />)
    act(() => setOnline(false))
    expect(pill()?.className).toContain("bottom-[max(calc(var(--phone-floor)+8px),var(--call-dock-floor,0px))]")
  })

  it("back online, says it is sending them", () => {
    setOnline(true)
    act(() => setOfflineStatus({ waiting: 1, sending: true }))
    render(<OfflineNotice />)
    expect(pill()?.textContent).toContain("Sending 1 change…")
  })

  it("offers Review for changes that need the member", () => {
    setOnline(true)
    act(() => setOfflineStatus({ waiting: 2, conflicts: [op(1, "conflict")], held: [op(2, "held")] }))
    render(<OfflineNotice />)
    expect(pill()?.textContent).toContain("2 changes need you")
    act(() => screen.getByRole("button", { name: "Review" }).click())
    expect(getOfflineStatus().reviewing).toBe(true)
  })
})
