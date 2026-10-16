import { afterEach, describe, expect, it, vi } from "vitest"
import { MqttMessageType } from "@/services/mqttService"
import { noteUnhandledMqttType } from "./unhandledType"

// FE-F-23: every table edit logged "Unknown message type" from the central
// handler, which has no case for a table's rows.
describe("a message type the central handler has no case for", () => {
  afterEach(() => vi.restoreAllMocks())

  it("says nothing when the app knows it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    noteUnhandledMqttType(MqttMessageType.Table_Row)
    noteUnhandledMqttType(MqttMessageType.Table_Row)
    expect(warn).not.toHaveBeenCalled()
  })

  it("is said once when the app doesn't know it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (let i = 0; i < 3; i++) noteUnhandledMqttType(999)
    noteUnhandledMqttType("newer")
    expect(warn.mock.calls).toEqual([
      ["[MQTT] Unknown message type:", 999],
      ["[MQTT] Unknown message type:", "newer"],
    ])
  })
})
