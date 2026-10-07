"use client"

import { useFetch } from "@/hooks/useFetch"
import type { ProjectOverview } from "@/lib/projectsOverview"
import { browserTZ } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"

/** Every project the reader is in, with where each stands, counted in their own days. */
export function useProjectsOverview() {
  const res = useFetch<{ data: { projects: ProjectOverview[] } }>(`${GetEndpointUrl.ProjectsOverview}?tz=${encodeURIComponent(browserTZ())}`)
  return { projects: res.data?.data.projects, isLoading: res.isLoading, isError: res.isError, mutate: res.mutate }
}
