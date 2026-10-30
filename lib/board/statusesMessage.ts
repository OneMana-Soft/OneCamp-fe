import { projectStatusesKey } from "@/lib/projectStatusesKey"
import { MqttMessageType } from "@/services/mqttService"

/**
 * The statuses a message on a project's topic says to read again, or null.
 * The app's message router (hooks/useMqttMessageHandler) reads
 * MESSAGE_PROJECT_STATUSES with it. The app listens on the topic of every
 * project a person is in, so each board and picker of the project reads its
 * statuses again, whatever is open. Its own module, so no first screen
 * carries it.
 */
export function statusesKeyOfMessage(message: string): string | null {
  try {
    const m = JSON.parse(message)
    const id = m?.type === MqttMessageType.Project_Statuses ? m.data?.project_uuid : undefined
    return typeof id === "string" && id ? projectStatusesKey(id) : null
  } catch {
    return null
  }
}
