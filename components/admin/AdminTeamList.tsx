"use client"

import React, { useRef, useEffect } from "react"
import { TeamInfoInterface } from "@/types/team"
import { Trash2, RotateCcw, Users } from "@/lib/icons"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { Tile } from "@/components/ui/graphics/Tile"
import { hueFor } from "@/lib/campHue"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PEOPLE_LIST, PERSON_TILE, PeopleMoreLine, PersonAction, PersonRow, PersonTag } from "@/components/admin/PeopleFrame"

interface AdminTeamListProps {
  teams: TeamInfoInterface[]
  onDelete: (uuid: string) => void
  onUnDelete: (uuid: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
}

/**
 * The teams' rows. The tab's frame (PeopleFrame, in teamCard) draws the
 * header, the toolbar, the skeleton and the empty and failed states.
 */
export const AdminTeamList: React.FC<AdminTeamListProps> = ({
  teams,
  onDelete,
  onUnDelete,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
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

  // No scroller of its own: the admin page's tab region is the one that
  // scrolls, so this list sizes to its rows.
  return (
    <TooltipProvider>
      <ul className={PEOPLE_LIST}>
        {teams.map((team) => {
          const isDeleted = !isZeroEpoch(team.team_deleted_at || "")
          return (
            <PersonRow
              key={team.team_uuid}
              // The team's own colour, as the sidebar draws it beside its name
              // (lib/campHue), on a tile the size of a member's face.
              leading={
                <Tile hue={hueFor(team.team_uuid)} className={PERSON_TILE}>
                  <Users />
                </Tile>
              }
              title={team.team_name}
              tags={isDeleted ? <PersonTag>Deleted</PersonTag> : undefined}
              meta={team.team_member_count === 1 ? "1 member" : `${team.team_member_count || 0} members`}
              actions={
                <>
                  {/* The way in first, the destructive one last, as on Members. */}
                  <PersonAction
                    icon={Users}
                    word="Members"
                    tip="Team members"
                    onClick={() =>
                      dispatch(openUI({ key: "teamMembers", data: { teamUUID: team.team_uuid, teamName: team.team_name } }))
                    }
                    aria-label={`View members of ${team.team_name}`}
                  />
                  {isDeleted ? (
                    <PersonAction
                      icon={RotateCcw}
                      word="Restore"
                      tip="Restore team"
                      tone="success"
                      onClick={() => onUnDelete(team.team_uuid)}
                      disabled={isSubmitting}
                      aria-label={`Restore ${team.team_name}`}
                    />
                  ) : (
                    <PersonAction
                      icon={Trash2}
                      word="Delete"
                      tip="Delete team"
                      tone="danger"
                      onClick={() => onDelete(team.team_uuid)}
                      disabled={isSubmitting}
                      aria-label={`Delete ${team.team_name}`}
                    />
                  )}
                </>
              }
            />
          )
        })}
      </ul>
      {hasMore && <PeopleMoreLine sentinelRef={sentinelRef} loading={isLoading} />}
    </TooltipProvider>
  )
}
