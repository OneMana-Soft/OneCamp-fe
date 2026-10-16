"use client"

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { DocBacklinks } from "@/types/docChrome"

const List = React.lazy(() => import("@/components/docEditor/chrome/LinkedFromList"))
const QUIET = { suppressErrorToast: true } as never

/**
 * What links to a doc or a board, above it, so the context comes with it: a
 * doc's tasks, projects and docs together as "3 backlinks" (B6, P1.3), a
 * board's tasks and projects. Each only as far as the viewer may see it, by
 * the server. Nothing at all when nothing links here; the list's code loads
 * only when there is one.
 */
export function LinkedFromSection({ refType, refUUID, className, reserve }: { refType: "doc" | "board"; refUUID: string; className?: string; reserve?: boolean }) {
  const key = !refUUID ? "" : refType === "doc" ? `/doc/backlinks/${refUUID}` : `${GetEndpointUrl.GetRefLinks}/${refType}/${refUUID}`
  const links = useFetch<{ data?: Partial<DocBacklinks> }>(key, undefined, undefined, QUIET).data?.data
  // The page knows a doc has backlinks before they come (doc_backlink_count):
  // their row is kept from the first paint, so the body never moves down.
  if (!links) return reserve ? <div aria-hidden="true" className={className} data-linked-from-row=""><div className="h-7" /></div> : null
  if (!((links.tasks?.length ?? 0) + (links.projects?.length ?? 0) + (links.docs?.length ?? 0))) return null
  return (
    <React.Suspense fallback={null}>
      <List links={links} refType={refType} refUUID={refUUID} className={className} />
    </React.Suspense>
  )
}
