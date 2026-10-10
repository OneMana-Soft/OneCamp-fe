"use client"

import React, { useRef, useEffect } from "react"
import { TeamInfoInterface } from "@/types/team"
import { Button } from "@/components/ui/button"
import { Trash2, RotateCcw, Users } from "@/lib/icons"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { cn } from "@/lib/utils/helpers/cn"

interface AdminTeamListProps {
  teams: TeamInfoInterface[]
  onDelete: (uuid: string) => void
  onUnDelete: (uuid: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  /** The list could not be read: said as such, never as "no teams". */
  isError?: boolean
  onRetry?: () => void
  /** Opens the app's create-team dialog, offered when there are none. */
  onNewTeam?: () => void
  isFiltered?: boolean
  totalLoaded?: number
}

export const AdminTeamList: React.FC<AdminTeamListProps> = ({
  teams,
  onDelete,
  onUnDelete,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  isError,
  onRetry,
  onNewTeam,
  isFiltered,
  totalLoaded,
}) => {
  const dispatch = useDispatch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || isLoading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { threshold: 0.1, rootMargin: "200px" }
    )
    const sentinel = sentinelRef.current
    if (sentinel) observer.observe(sentinel)
    return () => {
      if (sentinel) observer.unobserve(sentinel)
      observer.disconnect()
    }
  }, [hasMore, isLoading, onLoadMore])

  // Loading draws the rows it is about to show, in the same bordered list.
  if (teams.length === 0 && isLoading && !totalLoaded) {
    return (
      <ul aria-busy="true" aria-label="Loading teams" className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5" aria-hidden="true">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-32" : "w-24")} />
              <Skeleton className="h-3 w-20" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  // Before the empty branch: a failed request leaves the list empty too.
  if (teams.length === 0 && isError) {
    return <ErrorState subject="the teams" onRetry={onRetry} />
  }

  if (teams.length === 0 && !isLoading) {
    // The people group's hue, as the admin menu draws Teams, and the one thing
    // to do about an empty list.
    return (
      <EmptyState
        icon={Users}
        hue={ADMIN_GROUP_HUE.people}
        title={isFiltered ? "No team matches your search." : "No teams yet"}
        description={isFiltered ? undefined : "Teams group the people who work together, with their own channels and projects."}
        action={
          !isFiltered && onNewTeam ? (
            <Button variant="outline" size="sm" onClick={onNewTeam}>
              New team
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <TooltipProvider>
      {/* No scroller of its own: the admin page's tab region is the one that
          scrolls, so this list sizes to its rows. */}
      <div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {teams.map((team) => {
            const isDeleted = !isZeroEpoch(team.team_deleted_at || "")
            return (
              <li
                key={team.team_uuid}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-highlight"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium leading-tight truncate">
                    {team.team_name}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {team.team_member_count === 1 ? "1 member" : `${team.team_member_count || 0} members`}
                    </span>
                    {isDeleted && (
                      <span className="text-xs text-muted-foreground">
                        Deleted
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isDeleted ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-success-ink hover:text-success-ink hover:bg-success/10"
                          onClick={() => onUnDelete(team.team_uuid)}
                          disabled={isSubmitting}
                          aria-label={`Restore ${team.team_name}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore team</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-danger-ink hover:bg-destructive/10"
                          onClick={() => onDelete(team.team_uuid)}
                          disabled={isSubmitting}
                          aria-label={`Delete ${team.team_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete team</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          dispatch(
                            openUI({
                              key: "teamMembers",
                              data: { teamUUID: team.team_uuid, teamName: team.team_name },
                            })
                          )
                        }
                        aria-label={`View members of ${team.team_name}`}
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Team members</TooltipContent>
                  </Tooltip>
                </div>
              </li>
            )
          })}
        </ul>

        {hasMore && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-4"
            aria-hidden={!isLoading}
          >
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>Loading more…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
