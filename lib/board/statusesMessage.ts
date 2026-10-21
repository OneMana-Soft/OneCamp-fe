import { projectStatusesKey } from "@/lib/projectStatusesKey"

/**
 * MESSAGE_PROJECT_STATUSES on a project's topic (41, 42: chat's and calls');
 * the board hears it. Its own module, so no first screen carries it.
 */
export const PROJECT_STATUSES_MESSAGE = 43

/** The statuses a message on a project's topic says to read again, or null. */
export function statusesKeyOfMessage(message: string): string | null {
  try {
    const m = JSON.parse(message)
    const id = m?.type === PROJECT_STATUSES_MESSAGE ? m.data?.project_uuid : undefined
    return typeof id === "string" && id ? projectStatusesKey(id) : null
  } catch {
    return null
  }
}
