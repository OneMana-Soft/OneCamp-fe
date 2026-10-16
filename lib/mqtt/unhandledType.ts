import { MqttMessageType } from "@/services/mqttService"

const told = new Set<unknown>()

/**
 * A message type the central handler has no case for. A type the app knows
 * says nothing: it has no live reader yet (a table's rows) or is read on its
 * own topic, and saying so filled the console on every table edit (FE-F-23).
 * A type the app doesn't know (from a newer server) is said once, not on
 * every message.
 */
export function noteUnhandledMqttType(type: unknown): void {
  if (typeof type === "number" && MqttMessageType[type] !== undefined) return
  if (told.has(type)) return
  told.add(type)
  console.warn("[MQTT] Unknown message type:", type)
}
