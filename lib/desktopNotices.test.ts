import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "fs"

// TN-BUG-12: the desktop app showed no notification for anything. Its webview
// has no web push, and the page never called new Notification(), which the
// app's notification plugin turns into a native one. The server now sends a
// desktop notice beside every push, and the app raises it: once, only while
// fresh, never about what the person is looking at, and coming back to the
// window soon after opens it.

const SELF = "5e1f0000-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const BOB = "b0b00000-0000-4000-8000-00000000000b"
const ENG = "c0ffee00-0000-4000-8000-000000000001"
const POST = "aaaa0000-0000-4000-8000-00000000000a"

const raised = vi.fn<(title: string, options: NotificationOptions) => void>()
class FakeNotification {
  static requestPermission = vi.fn(async () => "granted")
  constructor(title: string, options: NotificationOptions) {
    raised(title, options)
  }
}
vi.stubGlobal("Notification", FakeNotification)

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { DESKTOP_OPEN_ROUTE_EVENT } = await import("@/lib/desktopApp")
const { raiseDesktopNotice, NOTICE_MAX_AGE_MS, CLICK_THROUGH_MS } = await import("@/lib/desktopNotices")

let n = 0
/** A fresh DM notice from Maya, sent agoMs ago. */
function dm(agoMs = 1_000, from = MAYA, extra: Record<string, string> = {}) {
  n++
  return {
    notice_id: `chat:${from} ${SELF}:m${n}`,
    sent_at: new Date(Date.now() - agoMs).toISOString(),
    data: { type: "chat", type_id: `${from} ${SELF}`, thread_id: `m${n}`, title: "Dm - Maya Chen", body: "lunch?", ...extra },
  }
}

const opened = vi.fn<(route: unknown) => void>()
const onOpen = (e: Event) => opened((e as CustomEvent).detail)
const at = (path: string) => window.history.pushState({}, "", path)
function windowIs(state: "hidden" | "visible, not focused" | "focused") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (state === "hidden" ? "hidden" : "visible") })
  vi.spyOn(document, "hasFocus").mockReturnValue(state === "focused")
}
const comeBack = () => {
  windowIs("focused")
  window.dispatchEvent(new Event("focus"))
}

beforeEach(() => {
  ;(window as unknown as { __TAURI__?: object }).__TAURI__ = {}
  store.dispatch({ type: RESET_STORE_ACTION })
  raised.mockClear()
  opened.mockClear()
  window.addEventListener(DESKTOP_OPEN_ROUTE_EVENT, onOpen)
  localStorage.removeItem("oc_dnd_until")
  windowIs("hidden")
})
afterEach(() => {
  window.removeEventListener(DESKTOP_OPEN_ROUTE_EVENT, onOpen)
  vi.useRealTimers()
  vi.restoreAllMocks()
  at("/")
})

describe("a desktop notice", () => {
  it("raises nothing outside the desktop app: a browser tab has push", () => {
    delete (window as unknown as { __TAURI__?: object }).__TAURI__
    expect(raiseDesktopNotice(dm(), SELF)).toBe(false)
    expect(raised).not.toHaveBeenCalled()
  })

  it("raises a native notification with its title, body and tag in the desktop app", () => {
    const notice = dm()
    expect(raiseDesktopNotice(notice, SELF)).toBe(true)
    expect(raised).toHaveBeenCalledTimes(1)
    expect(raised).toHaveBeenCalledWith("Dm - Maya Chen", { body: "lunch?", tag: notice.notice_id })
  })

  it("is raised once, however often it comes", () => {
    const notice = dm()
    raiseDesktopNotice(notice, SELF)
    raiseDesktopNotice(notice, SELF)
    raiseDesktopNotice({ ...notice }, SELF)
    expect(raised).toHaveBeenCalledTimes(1)
  })

  it("stays raised once after the page reloads (kept for the session)", async () => {
    const notice = dm()
    raiseDesktopNotice(notice, SELF)
    vi.resetModules()
    const again = await import("@/lib/desktopNotices")
    expect(again.raiseDesktopNotice(notice, SELF)).toBe(false)
    expect(raised).toHaveBeenCalledTimes(1)
  })

  it("is dropped when sent more than two minutes ago: a replay, not news", () => {
    expect(raiseDesktopNotice(dm(NOTICE_MAX_AGE_MS + 1_000), SELF)).toBe(false)
    expect(raiseDesktopNotice({ ...dm(), sent_at: "" }, SELF)).toBe(false)
    expect(raised).not.toHaveBeenCalled()
    expect(raiseDesktopNotice(dm(NOTICE_MAX_AGE_MS - 5_000), SELF)).toBe(true)
  })

  it("is dropped while this device is paused", () => {
    localStorage.setItem("oc_dnd_until", String(Date.now() + 60_000))
    expect(raiseDesktopNotice(dm(), SELF)).toBe(false)
    expect(raised).not.toHaveBeenCalled()
  })
})

describe("what is on screen", () => {
  it("drops a notice about the conversation in front of a focused window, and only that", () => {
    windowIs("focused")
    at(`/app/chat/${MAYA}`)
    expect(raiseDesktopNotice(dm(), SELF)).toBe(false)
    expect(raiseDesktopNotice(dm(1_000, BOB, { title: "Dm - Bob" }), SELF)).toBe(true)
    expect(raised).toHaveBeenCalledTimes(1)
    expect(raised.mock.calls[0][0]).toBe("Dm - Bob")
  })

  it("drops a reply only when its thread is the one open", () => {
    windowIs("focused")
    at(`/app/channel/${ENG}`)
    const reply = () => ({
      ...dm(),
      data: { type: "post_comment", type_id: ENG, thread_id: POST, title: "Comment - Maya Chen", body: "done" },
    })
    expect(raiseDesktopNotice(reply(), SELF)).toBe(true)
    store.dispatch(openRightPanel({ channelUUID: ENG, postUUID: POST }))
    expect(raiseDesktopNotice(reply(), SELF)).toBe(false)
    expect(raised).toHaveBeenCalledTimes(1)
  })

  it("raises it when the window is hidden or not focused, whatever the page shows", () => {
    at(`/app/chat/${MAYA}`)
    windowIs("hidden")
    expect(raiseDesktopNotice(dm(), SELF)).toBe(true)
    windowIs("visible, not focused")
    expect(raiseDesktopNotice(dm(), SELF)).toBe(true)
    expect(raised).toHaveBeenCalledTimes(2)
  })
})

describe("coming back to the window", () => {
  it("within 20 seconds of a notice opens what it was about", () => {
    vi.useFakeTimers()
    raiseDesktopNotice(dm(), SELF)
    vi.advanceTimersByTime(5_000)
    comeBack()
    expect(opened).toHaveBeenCalledTimes(1)
    expect(opened).toHaveBeenCalledWith(`/app/chat/${MAYA}`)
    comeBack() // once
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it("later than that opens nothing", () => {
    vi.useFakeTimers()
    raiseDesktopNotice(dm(), SELF)
    vi.advanceTimersByTime(CLICK_THROUGH_MS + 1_000)
    comeBack()
    expect(opened).not.toHaveBeenCalled()
  })

  it("opens the latest notice's, and none for one with nowhere of its own to go", () => {
    vi.useFakeTimers()
    raiseDesktopNotice(dm(), SELF)
    raiseDesktopNotice(dm(1_000, BOB), SELF)
    document.dispatchEvent(new Event("visibilitychange")) // still hidden
    expect(opened).not.toHaveBeenCalled()
    windowIs("visible, not focused")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(opened).toHaveBeenCalledWith(`/app/chat/${BOB}`)

    windowIs("hidden")
    raiseDesktopNotice({ ...dm(), data: { type: "reminder", type_id: SELF, title: "Reminder", body: "standup" } }, SELF)
    comeBack()
    expect(opened).toHaveBeenCalledTimes(1)
  })
})

// The notice code is a chunk of its own, loaded when a notice comes: the MQTT
// handler reaches it only by import(), so no first screen downloads it.
it("loads only when a notice comes", () => {
  const handler = readFileSync("hooks/useMqttMessageHandler.ts", "utf8")
  expect(handler).toMatch(/import\("@\/lib\/desktopNotices"\)/)
  expect(handler).not.toMatch(/from ["']@\/lib\/desktopNotices["']/)
})
