// The Release filter (jira-04): its id, its "in no release" value, its
// choices and its chip's words, and where a project's releases are read.
// Re-exported by ./releases. Pure.

import type { Release } from "@/lib/work/releases"

export const releasesPath = (projectId: string) => `/project/${projectId}/releases`

/** The Release filter's id, as the list, the boards and saved views send it, beside task_cycle; NO_RELEASE is its "in no release". */
export const TASK_RELEASE = "task_release"
export const NO_RELEASE = "none"

/** The filter's choices: No release first, then the project's releases as listed. */
export const releaseFilterOptions = (releases: Pick<Release, "id" | "name">[]) => [
  { id: NO_RELEASE, label: "No release" },
  ...releases.map((r) => ({ id: r.id, label: r.name })),
]

/** What's chosen, in words, for the filter's chip. */
export const releaseFilterWords = (values: string[], releases: Pick<Release, "id" | "name">[]) =>
  values.map((v) => (v === NO_RELEASE ? "No release" : (releases.find((r) => r.id === v)?.name ?? "a release"))).join(", ")
