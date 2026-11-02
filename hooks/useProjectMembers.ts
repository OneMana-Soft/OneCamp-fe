"use client"

// A project's members, for a picker that lists them (linear-15), read as it opens.
// /project/info's project_members is null on a live server (it answers the
// project's own fields, fast), so a list drawn from it is empty: the plan's lead
// sheet at a phone's width listed only "No lead" (DB-93, 2 Nov) where a laptop's,
// reading /project/membersInfo, listed everyone. Pickers read /project/membersInfo
// under the key the project page reads it by at a laptop's width (its member
// stack), so an answer the page already read serves the picker and nothing is
// fetched twice. Only lazy pickers import this module (the plan's lead picker in
// ProjectPlanChips): the project page's first load carries none of the read
// (main, 2 Nov 21:2x).

import { useFetch } from "@/hooks/useFetch"
import { ProjectsGet } from "@/services/endpoints/projects"
import type { ProjectInfoRawInterface } from "@/types/project"

/** The key of a project's members read (GET /project/membersInfo/{id}). */
export const projectMembersKey = (projectId: string) => `${ProjectsGet.GetProjectMemberInfo}/${projectId}`

/**
 * A project's members, read while projectId is set (a picker passes it once it
 * opens; undefined reads nothing): undefined until they are read; failed when the
 * read failed with nothing read earlier to stand in; retry reads them again.
 */
export function useProjectMembers(projectId: string | undefined) {
  const read = useFetch<ProjectInfoRawInterface>(projectId ? projectMembersKey(projectId) : "", undefined, { revalidateIfStale: false })
  const members = read.data?.data?.project_members
  return {
    members: read.data ? (members ?? []) : undefined,
    failed: !!read.isError && !read.data,
    retry: () => void read.mutate(),
  }
}
