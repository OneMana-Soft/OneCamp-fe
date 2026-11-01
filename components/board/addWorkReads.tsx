"use client"

// Add from OneCamp's projects, states and row leads (miro-13 2), on the shared core the board page already ships, so
// the lazy panel (components/board/addWorkPanel, where the why is) imports none of it.

import * as React from "react"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { FileText } from "@/lib/icons"
import { CATEGORY_KIND, type StatusCategory } from "@/lib/taskStatus"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoInterface } from "@/types/project"

const VIEWS = {
  failed: (subject: string, retry: () => void) => <ErrorState compact subject={subject} onRetry={retry} />,
  empty: (title: string, words: string) => <EmptyState title={title} description={words} className="px-4 py-8" />,
  waiting: (label: string) => (
    <div role="status" aria-label={label} className="px-2.5 py-1">
      <SkeletonRows rows={3} />
    </div>
  ),
  lead: (kind: string, id: string, status?: string, size: 16 | 20 = 20) =>
    kind === "task" ? (
      <StatusGlyph status={CATEGORY_KIND[status as StatusCategory] ?? "todo"} size={16} />
    ) : kind === "project" ? (
      <ProjectTile id={id} size={size} />
    ) : (
      <FileText className="size-4 text-ink-3" aria-hidden="true" />
    ),
}

export type AddWorkReads = typeof VIEWS & {
  projects: { list: ProjectInfoInterface[]; waiting: boolean; failed: boolean; retry: () => void }
}

export function useAddWorkReads(): AddWorkReads {
  const res = useFetch<{ data?: { user_projects?: ProjectInfoInterface[] } }>(GetEndpointUrl.GetUserProjectList, undefined, undefined, OWN_ERRORS)
  const projects = {
    list: res.data?.data?.user_projects ?? [],
    waiting: !!res.isLoading && !res.data,
    failed: !!res.isError,
    retry: () => void res.mutate?.(),
  }
  return { ...VIEWS, projects }
}

/** Held while the panel is open: the workbench renders the lazy panel inside. */
export default function WithAddWorkReads({ children }: { children: (reads: AddWorkReads) => React.ReactNode }) {
  return <>{children(useAddWorkReads())}</>
}
