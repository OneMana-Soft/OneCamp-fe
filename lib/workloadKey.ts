import { GetEndpointUrl } from "@/services/endPoints"

/**
 * The workload's address in the app's cache. Apart from lib/workload so a
 * list's writes (useTaskUpdate) can find it without the workload's sums
 * coming onto the project's first screen (app/firstLoad.test.ts).
 */

/** How many weeks the workload shows, from this one. */
export const WORKLOAD_WEEKS = 12

/** The workload's address in the cache, for the reader's zone. */
export function workloadKey(tz: string, weeks = WORKLOAD_WEEKS): string {
  return `${GetEndpointUrl.ProjectWorkload}?tz=${encodeURIComponent(tz)}&weeks=${weeks}`
}

export function isWorkloadKey(key: string): boolean {
  return new URL(key, "http://localhost").pathname === GetEndpointUrl.ProjectWorkload
}
