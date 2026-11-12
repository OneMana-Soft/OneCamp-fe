"use client"

// The Release filter's lazy part (jira-04): the Filter's Release list and the
// chip's words, a chunk the list's toolbar loads when its Filter opens or a
// release is chosen. It reads the project's releases through the page's client,
// as the Releases tab does (one kept read per path, components/work/releases),
// and imports none of the shared core (app/releasesLazy.test): the toolbar
// hands it the client and its loading line.

import * as React from "react"
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"
import { useKeptRead } from "@/components/work/releases/releaseParts"
import { releaseCalls, releaseFilterOptions, releaseFilterWords, releasesPath, type ReleaseHttp } from "@/lib/work/releases"

/** A project's releases, newest first (the first page), read once `when`: for the facet, the chip and the filter drawer. */
export function useReleaseList(projectId: string | undefined, http: ReleaseHttp, when = true) {
  const path = projectId && when ? releasesPath(projectId) : null
  const load = React.useCallback(() => releaseCalls(http, projectId ?? "").list(), [http, projectId])
  const { data, failed } = useKeptRead(path, load)
  return { releases: data?.releases ?? [], loading: !!path && !data && !failed, failed }
}

type Part = { projectId: string; http: ReleaseHttp; chosen: string[] }

/** The Filter's Release list: No release, then the project's releases, each a tick; `State` says loading or failed. */
export function ReleaseFacet({ projectId, http, chosen, onToggle, State }: Part & {
  onToggle: (id: string) => void
  State: (p: { loading: boolean; failed: boolean; what: string }) => React.ReactNode
}) {
  const { releases, loading, failed } = useReleaseList(projectId, http)
  return (
    <>
      <State loading={loading} failed={failed} what="releases" />
      {releaseFilterOptions(releases).map((o) => (
        <DropdownMenuCheckboxItem key={o.id} checked={chosen.includes(o.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onToggle(o.id)} className="h-[30px] gap-2 text-sm">
          <span className="truncate">{o.label}</span>
        </DropdownMenuCheckboxItem>
      ))}
    </>
  )
}

/** The chip's words: what's chosen, by name once the releases are read. */
export function ReleaseWords({ projectId, http, chosen }: Part) {
  return <>{releaseFilterWords(chosen, useReleaseList(projectId, http).releases)}</>
}
