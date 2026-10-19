"use client"

/**
 * One project (projects programme, PROGRAM.md §5; A5 builds it from the Task
 * Store, and A1 adds what the person may do in it, project_access).
 *
 * DAY 0. Today's read: /project/info/<id>, on the key the project's page and
 * its header ask with, so they share one request. Nothing calls it yet.
 */

import { useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import type { WorkProject } from "@/lib/work/types"

export interface ProjectState {
  project?: WorkProject
  status: "loading" | "ready" | "error"
  retry: () => void
}

export function useProject(id: string | null | undefined): ProjectState {
  const { data, isError, mutate } = useFetch<ProjectInfoRawInterface>(id ? `${GetEndpointUrl.GetProjectInfo}/${id}` : "")
  return useMemo(
    () => ({
      project: data?.data,
      status: data ? "ready" : isError ? "error" : "loading",
      retry: () => {
        void mutate()
      },
    }),
    [data, isError, mutate],
  )
}
