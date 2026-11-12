"use client"

// The boards list's Project picker (miro-46 3), a chunk of its own loaded when it is first wanted: the viewer's projects
// under their teams, and a team's heading for every board linked from its projects. A popover under its button on a
// computer, a sheet on a phone (BarPicker). It imports none of the shared core: the page reads the projects
// (components/board/addWorkReads) and hands them in with the views for waiting and failing.

import * as React from "react"
import { BarPicker } from "@/components/board/barPicker"
import type { AddWorkReads } from "@/components/board/addWorkReads"
import { MenuCheck } from "@/components/ui/menuCheck"
import type { BoardFilter } from "@/lib/board/boardListFilter"
import { groupByTeam } from "@/lib/board/boardPlaceGroups"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"

type Place = Pick<BoardFilter, "project" | "team">

const ROW = "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm text-ink"

function Row({ chosen, onPick, children, className }: { chosen: boolean; onPick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={chosen} onClick={onPick} {...ix("item")} className={cn(ROW, className)}>
      {children}
      <MenuCheck checked={chosen} className="ml-auto" />
    </button>
  )
}

export default function BoardPlacePicker({
  open,
  onOpenChange,
  anchor,
  reads,
  teams,
  place,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchor: React.RefObject<HTMLElement | null>
  reads: AddWorkReads
  /** The teams the viewer is in (the sidebar's): only those take a team's filter. */
  teams: { team_uuid: string; team_name: string }[]
  place: Place
  onPick: (place: Place) => void
}) {
  const { projects } = reads
  const groups = React.useMemo(() => groupByTeam(projects.list, teams), [projects.list, teams])
  const pick = (p: Place) => {
    onPick(p)
    onOpenChange(false)
  }
  return (
    <BarPicker anchor={anchor} side="bottom" title="Show boards from" open={open} onOpenChange={onOpenChange}>
      {projects.waiting ? (
        reads.waiting("Loading your projects")
      ) : projects.failed ? (
        reads.failed("your projects", projects.retry)
      ) : (
        <div role="menu" aria-label="Show boards from" data-board-places="" className="flex w-full flex-col gap-0.5 sm:w-64">
          <Row chosen={!place.project && !place.team} onPick={() => pick({ project: null, team: null })}>
            All projects
          </Row>
          {groups.length === 0 ? reads.empty("No projects yet", "When you're in a project, its boards can be found here.") : null}
          {groups.map((g) => (
            <div key={g.team?.uuid ?? "none"} role="group" aria-label={g.team?.name ?? "Other projects"} className="mt-1.5 flex flex-col gap-0.5">
              {g.team?.pickable ? (
                <Row chosen={place.team === g.team.uuid} onPick={() => pick({ project: null, team: g.team!.uuid })} className="font-semibold">
                  <span className="min-w-0 truncate">{g.team.name}</span>
                  <span className="shrink-0 text-meta font-normal text-ink-3">All its projects</span>
                </Row>
              ) : (
                <p className="truncate px-2 pb-0.5 pt-1 text-micro font-medium text-ink-3">{g.team?.name ?? "Other projects"}</p>
              )}
              {g.projects.map((p) => (
                <Row key={p.uuid} chosen={place.project === p.uuid} onPick={() => pick({ project: p.uuid, team: null })} className="pl-4">
                  {reads.lead("project", p.uuid, undefined, 16)}
                  <span className="min-w-0 truncate">{p.name}</span>
                </Row>
              ))}
            </div>
          ))}
        </div>
      )}
    </BarPicker>
  )
}
