import { EventEmitter } from "events"
import { renderHook } from "@testing-library/react"
import { RoomEvent, type Room } from "livekit-client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const toasts = vi.fn()
vi.mock("./callSurface", () => ({ callToast: (t: { title: string }) => toasts(t.title) }))

import { useControlNotices } from "./callHosting"

// Why a board left the stage, told to its presenter (calls package B): the
// notice needs whose board was up, and the room's metadata can already say
// none when the server's packet arrives. livekit-client drops a metadata
// change that lands before the room says Connected (emitWhenConnected), so
// a board that went up while you were still connecting reaches you only as
// the room's metadata when Connected fires.

const SAM = "sam-identity"
const BOARD = { uuid: "b0a4d000-0000-4000-8000-000000000003", by: SAM, draw: "everyone" }

function fakeRoom() {
  const room = new EventEmitter() as EventEmitter & { metadata?: string; localParticipant: { identity: string; name: string; attributes: Record<string, string> } }
  room.metadata = "{}"
  room.localParticipant = { identity: SAM, name: "Sam Rivera", attributes: {} }
  return room
}
const packet = (o: object) => new TextEncoder().encode(JSON.stringify(o))

beforeEach(() => toasts.mockReset())

describe("why your board left the stage", () => {
  it("knows the board was yours when it went up while the room was still connecting", () => {
    const room = fakeRoom()
    renderHook(() => useControlNotices(room as unknown as Room, { current: undefined }))
    // The board's update arrived before Connected: no change event, only the metadata.
    room.metadata = JSON.stringify({ board: BOARD })
    room.emit(RoomEvent.Connected)
    room.metadata = JSON.stringify({ held: ["share"] })
    room.emit(RoomEvent.RoomMetadataChanged, room.metadata)
    room.emit(RoomEvent.DataReceived, packet({ t: "board_stopped", by: "Sam Rivera", reason: "share_held" }), undefined, undefined, "oc.call")
    expect(toasts.mock.calls.map((c) => c[0])).toEqual(["Your board left the stage: hosts turned off sharing"])
  })

  it("says whose board it was when it was someone else's", () => {
    const room = fakeRoom()
    room.metadata = JSON.stringify({ board: { ...BOARD, by: "priya" } })
    renderHook(() => useControlNotices(room as unknown as Room, { current: undefined }))
    room.metadata = JSON.stringify({ held: ["share"] })
    room.emit(RoomEvent.RoomMetadataChanged, room.metadata)
    room.emit(RoomEvent.DataReceived, packet({ t: "board_stopped", by: "Priya Shah", reason: "share_held" }), undefined, undefined, "oc.call")
    expect(toasts.mock.calls.map((c) => c[0])).toEqual(["Hosts turned off sharing, so Priya Shah's board left the stage"])
  })
})
