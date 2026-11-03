import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { MqttContext, type MqttContextValue } from "@/components/mqtt/mqttContext"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { useLiveEntity } from "@/lib/liveEntity/useLiveEntity"

// A public doc's guest page (/guest/d/<token>) has no live connection: no MqttProvider. The blocks a doc holds still
// draw there (a whiteboard block, a sub-page chip), and each reads its thing through useLiveEntity, which hears its
// topic through useMqttTopic. A topic heard outside the signed-in app is no topic: nothing to subscribe to, and never
// a thrown error, which took the whole guest page to "Something went wrong" (DB-105, H-b re-look #2).

function connection(): MqttContextValue {
  return {
    connectionState: { isConnected: true } as MqttContextValue["connectionState"],
    publish: vi.fn(async () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    subscribeToTopic: vi.fn(() => "sub-1"),
    unsubscribeFromTopic: vi.fn(),
  }
}

describe("a topic heard with no live connection (a guest's page)", () => {
  it("useMqttTopic does nothing, and never throws", () => {
    expect(() => renderHook(() => useMqttTopic({ topic: "workspace/doc/d1" }))).not.toThrow()
  })

  it("useLiveEntity draws its thing's state, as a guest's block asks it (no id) and as a member's does", () => {
    expect(renderHook(() => useLiveEntity("doc", null)).result.current).toEqual({ state: "none" })
    expect(() => renderHook(() => useLiveEntity("doc", "d1"))).not.toThrow()
  })

  it("inside the app, it still subscribes and lets go", () => {
    const live = connection()
    const wrapper = ({ children }: { children: ReactNode }) => <MqttContext.Provider value={live}>{children}</MqttContext.Provider>
    const { unmount } = renderHook(() => useMqttTopic({ topic: "workspace/doc/d1" }), { wrapper })
    expect(live.subscribeToTopic).toHaveBeenCalledWith("workspace/doc/d1", expect.any(Function), expect.objectContaining({ onLive: expect.any(Function) }))
    unmount()
    expect(live.unsubscribeFromTopic).toHaveBeenCalledWith("sub-1")
  })
})
