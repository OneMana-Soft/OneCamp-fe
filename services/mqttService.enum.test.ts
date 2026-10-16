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
  it("Poll_Update is 30 and Scheduled_Message is 31", () => {
    expect(MqttMessageType.Poll_Update).toBe(30)
    expect(MqttMessageType.Scheduled_Message).toBe(31)
  })
  it("Task_Dates is 32 and Task_Field is 33", () => {
    expect(MqttMessageType.Task_Dates).toBe(32)
    expect(MqttMessageType.Task_Field).toBe(33)
  })
  it("Chat_Seen is 34", () => {
    expect(MqttMessageType.Chat_Seen).toBe(34)
  })
  it("Content_IO_Job is 35 (MESSAGE_CONTENT_IO_JOB)", () => {
    expect(MqttMessageType.Content_IO_Job).toBe(35)
  })
  it("Doc_Meta is 36 and Notice 37", () => {
    expect(MqttMessageType.Doc_Meta).toBe(36)
    expect(MqttMessageType.Notice).toBe(37)
  })
  it("Conversation_Access is 38 (MESSAGE_CONVERSATION_ACCESS)", () => {
    expect(MqttMessageType.Conversation_Access).toBe(38)
  })
  it("Desktop_Notice is 39 and Task_Changed 40 (MESSAGE_TASK_CHANGED)", () => {
    expect(MqttMessageType.Desktop_Notice).toBe(39)
    expect(MqttMessageType.Task_Changed).toBe(40)
  })
})
