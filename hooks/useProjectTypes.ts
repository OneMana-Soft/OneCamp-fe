import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import type { ProjectType } from "@/lib/work/keysApi"
import { projectTypesPath } from "@/lib/work/workTypes"

/**
 * The types a task in the project may have, the built-in ones first (linear-03),
 * read only `when` asked: a picker, a filter or a board of types. Its failure is
 * the caller's to say, so the read raises no toast of its own.
 */
export function useProjectTypes(projectId: string | undefined, when = true) {
  const read = useFetch<{ data: ProjectType[] }>(projectId && when ? projectTypesPath(projectId) : "", undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  return { types: read.data?.data ?? [], loading: read.isLoading, failed: !!read.isError }
}
