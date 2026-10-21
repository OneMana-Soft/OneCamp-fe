import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// The server says when a call changes (MESSAGE_CALL_STATE), and the green room
// reads it again then: the faces, the lock and the recording notice don't wait
// for the next poll. Only the call it is about.

const fetched = vi.hoisted(() => ({ keys: [] as string[], mutate: vi.fn(async () => undefined) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    fetched.keys.push(key)
    return { data: undefined, mutate: fetched.mutate }
  },
}))

const { useCallSession } = await import("./useCallSession")
const { CALL_STATE_EVENT } = await import("@/lib/calls/stateEvent")

const say = (detail: unknown) => window.dispatchEvent(new CustomEvent(CALL_STATE_EVENT, { detail }))

afterEach(() => {
  fetched.keys.length = 0
  fetched.mutate.mockClear()
})

describe("a call's read when the server says it changed", () => {
  it("is read again for its own call, and only for it", () => {
    renderHook(() => useCallSession({ kind: "dm", id: "a-uuid b-uuid" }, "waiting"))
    expect(fetched.keys.at(-1)).toBe("/calls/current?kind=dm&id=a-uuid%20b-uuid")
    say({ resource_kind: "dm", resource_id: "a-uuid c-uuid", live: true })
    say({ resource_kind: "channel", resource_id: "a-uuid b-uuid" })
    say(undefined)
    expect(fetched.mutate).not.toHaveBeenCalled()
    say({ resource_kind: "dm", resource_id: "a-uuid b-uuid", live: true })
    expect(fetched.mutate).toHaveBeenCalledTimes(1)
  })

  it("stops listening when the page goes", () => {
    const { unmount } = renderHook(() => useCallSession({ kind: "channel", id: "c1" }, "in-call"))
    unmount()
    say({ resource_kind: "channel", resource_id: "c1" })
    expect(fetched.mutate).not.toHaveBeenCalled()
  })

  it("listens to nothing before it knows which call it is", () => {
    renderHook(() => useCallSession(null, "waiting"))
    say({ resource_kind: "channel", resource_id: "" })
    expect(fetched.mutate).not.toHaveBeenCalled()
  })
})

describe("the event's name", () => {
  it("is the one the app's MQTT handler raises, which writes it without an import (it loads with every page)", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const handler = readFileSync(join(__dirname, "../../hooks/useMqttMessageHandler.ts"), "utf8")
    expect(handler).toContain(`new CustomEvent("${CALL_STATE_EVENT}"`)
  })
})
