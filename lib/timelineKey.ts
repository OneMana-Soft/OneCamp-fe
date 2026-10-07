/**
 * A project's timeline in the app's cache: GET /project/{id}/timeline. Apart
 * from lib/timeline so the status helpers, which the timeline uses, can name
 * it too.
 */

export const timelineKey = (projectId: string) => `/project/${projectId}/timeline`

/** Whether a fetched URL is a project's timeline: projectId's, or any project's without one. */
export function isTimelineKey(key: string, projectId?: string): boolean {
  const m = /^\/project\/([^/?]+)\/timeline(?:\?|$)/.exec(key)
  return !!m && (!projectId || m[1] === projectId)
}
