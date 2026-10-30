"use client"

import { useFetch } from "@/hooks/useFetch"
import type { ProjectOverview } from "@/lib/projectsOverview"
import { browserTZ } from "@/lib/utils/timeZone"
import { ProjectsGet } from "@/services/endpoints/projects"
import { listOnceRead } from "@/lib/utils/listOf"

/** Every project the reader is in, with where each stands, counted in their own days. */
export function useProjectsOverview() {
  const res = useFetch<{ data: { projects: ProjectOverview[] } }>(`${ProjectsGet.ProjectsOverview}?tz=${encodeURIComponent(browserTZ())}`)
  return { projects: listOnceRead<{ data: { projects: ProjectOverview[] | null } }, ProjectOverview>(res.data, (a) => a.data?.projects), isLoading: res.isLoading, isError: res.isError, mutate: res.mutate }
}
