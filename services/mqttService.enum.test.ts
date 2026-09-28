import { describe, expect, it } from "vitest"
import { MqttMessageType } from "@/services/mqttService"

// The Go side numbers these with iota (models/mqtt). A value added on one side
// and not the other shifts every later type, and messages are then handled as
// something else. Pinned where the two were last checked against each other.
describe("MQTT message types match the backend", () => {
  it("AI_Agent_Work is 28 and Saved_Item_Due is 29", () => {
    expect(MqttMessageType.AI_Agent_Work).toBe(28)
    expect(MqttMessageType.Saved_Item_Due).toBe(29)
  })
})
