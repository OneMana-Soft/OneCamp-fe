import { describe, expect, it } from "vitest"
import { MqttMessageType } from "@/services/mqttService"

// The backend's MESSAGE_DESKTOP_NOTICE (models/mqtt, pinned by
// TestDesktopNoticeIs39). Kept apart from mqttService.enum.test.ts so the two
// branches that add 38 and 39 never edit the same lines.
describe("the desktop notice's MQTT type", () => {
  it("Desktop_Notice is 39 (MESSAGE_DESKTOP_NOTICE)", () => {
    expect(MqttMessageType.Desktop_Notice).toBe(39)
  })
})
