/**
 * A task's page, written one way wherever it is made: the panel's Open the
 * full page and Copy link, and the palette's Copy link (linear-28). The
 * branch's name is lib/work/taskBranchName.
 */

import { app_task_path } from "@/types/paths"

/** The task's own page: by its key when it has one (/app/task/Q4-12), else its id. */
export function taskPageHref(taskKey: string | undefined, taskUUID: string): string {
  return `${app_task_path}/${taskKey || taskUUID}`
}

/** The page's address to paste elsewhere. */
export function taskPageUrl(taskKey: string | undefined, taskUUID: string): string {
  return `${window.location.protocol}//${window.location.host}${taskPageHref(taskKey, taskUUID)}`
}
