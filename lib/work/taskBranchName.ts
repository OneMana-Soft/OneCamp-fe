/**
 * The branch a task's work goes on, written one way wherever it is made: the
 * branch dialog and the palette's Copy branch name (linear-28). It imports
 * nothing, so the palette's task actions, a chunk of their own, bring nothing
 * with them (app/firstLoad.test.ts).
 */

/** Its id's first 8 characters, then its name in lower case with dashes, 50 characters at most. */
export function taskBranchName(taskUUID: string, taskName: string): string {
  const slug = taskName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 50)
  return `feature/${taskUUID.substring(0, 8)}-${slug}`
}
