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

  it("Pin is 41 (MESSAGE_PIN)", () => {
    expect(MqttMessageType.Pin).toBe(41)
  })

  it("ReadMoved is 46 (MESSAGE_READ_MOVED, the integrator's allotment)", () => {
    expect(MqttMessageType.ReadMoved).toBe(46)
  })

  it("Call_State is 42 (MESSAGE_CALL_STATE; 41 is chat's Pin)", () => {
    expect(MqttMessageType.Call_State).toBe(42)
  })

  it("Project_Statuses is 43 (MESSAGE_PROJECT_STATUSES)", () => {
    expect(MqttMessageType.Project_Statuses).toBe(43)
  })

  // The app tells messages apart by their number alone, so two types on one
  // number are read as each other. An explicit number (Conversation_Access =
  // 38, Call_State = 42) is how two could ever meet, as chat's Pin and
  // Call_State both took 41 on 17 Oct 2026.
  it("no two types share a number", () => {
    const byNumber = new Map<number, string[]>()
    for (const [name, value] of Object.entries(MqttMessageType)) {
      if (typeof value !== "number") continue // a numeric enum maps numbers back to names too
      byNumber.set(value, [...(byNumber.get(value) ?? []), name])
    }
    const shared = [...byNumber].filter(([, names]) => names.length > 1).map(([n, names]) => `${names.join(" and ")} are both ${n}`)
    expect(shared, "append a new type at the end instead").toEqual([])
  })
})
