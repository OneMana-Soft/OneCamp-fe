import type { AxiosRequestConfig } from "axios"
import { useFetch } from "@/hooks/useFetch"
import { ProjectsGet } from "@/services/endpoints/projects"

export interface ProjectTag {
  name: string
  count: number
}

/** The project's tags' address: the key their reads keep them under. */
export const projectTagsKey = (projectId: string) => `${ProjectsGet.ProjectTime}/${projectId}/tags`

/**
 * The tags in use in a project, most used first (GET /project/{id}/tags).
 * `requestConfig` is the read's own, as useFetch's: a caller that draws
 * `failed` itself passes OWN_ERRORS. Its own module, so a list's filter and
 * its selection bar read the tags without the tag picker's code.
 */
export function useProjectTags(projectId: string | undefined, requestConfig?: AxiosRequestConfig) {
  const { data, isError, mutate } = useFetch<{ data: ProjectTag[] }>(projectId ? projectTagsKey(projectId) : "", undefined, undefined, requestConfig)
  // failed: the read failed and nothing read before it is left to show.
  return { tags: data?.data ?? [], failed: Boolean(isError) && !data, refresh: mutate }
}
