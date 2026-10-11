"use client"

import React, { useRef, useEffect } from "react"
import { TeamInfoInterface } from "@/types/team"
import { Trash2, RotateCcw, Users } from "@/lib/icons"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { hueFor } from "@/lib/campHue"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { displayNameOf } from "@/lib/personName"
import { PeopleMoreLine, PeopleRows, PersonRow, PersonTag, RowMenu } from "@/components/admin/PeopleFrame"

interface AdminTeamListProps {
  teams: TeamInfoInterface[]
  onDelete: (uuid: string) => void
  onUnDelete: (uuid: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
}

/** "8 people · 3 projects": the projects only when the server sent them. Pure. */
export function teamMeta(team: Pick<TeamInfoInterface, "team_member_count" | "team_projects">): string {
  const n = team.team_member_count || 0
  const people = n === 1 ? "1 person" : `${n} people`
  const p = team.team_projects?.length
  return p ? `${people} · ${p} ${p === 1 ? "project" : "projects"}` : people
}

/**
 * A team's mark (design v3, A4): 28px r8 in the team's own hue gradient, the
 * same hue the sidebar gives it (lib/campHue), with its initial in white.
 * Identity, so hue is allowed; it replaced a tinted tile with a generic icon.
 */
export function TeamMark({ team }: { team: Pick<TeamInfoInterface, "team_uuid" | "team_name"> }) {
  return (
    <span aria-hidden="true" data-team-mark="" className={`team-mark ${avatarHueClass(hueFor(team.team_uuid))}`}>
      {(team.team_name || "?").trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Up to four faces of a team, 22px, overlapping, then +N. Only when the list sent members. */
function MemberStack({ team }: { team: TeamInfoInterface }) {
  const members = team.team_members ?? []
  if (!members.length) return null
  const shown = members.slice(0, 4)
  const rest = (team.team_member_count || members.length) - shown.length
  return (
    <span data-team-stack="" className="people-stack">
      {shown.map((m) => {
        const name = displayNameOf(m)
        return (
          <Avatar key={m.user_uuid}>
            <AvatarFallback className={`text-3xs font-semibold ${getAvatarFallbackClass(name)}`}>{getNameInitials(name).charAt(0)}</AvatarFallback>
          </Avatar>
        )
      })}
      {rest > 0 && <span className="ml-1.5 text-2xs tabular-nums text-ink-3 !shadow-none">+{rest}</span>}
    </span>
  )
}

/**
 * The teams' rows. The tab's frame (PeopleFrame, in teamCard) draws the
 * toolbar, the header row, the skeleton and the empty and failed states. A
 * row opens the team's side sheet; its ⋯ holds Members and Delete.
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

  const openTeam = (team: TeamInfoInterface) =>
    dispatch(openUI({ key: "teamMembers", data: { teamUUID: team.team_uuid, teamName: team.team_name } }))

  return (
    <>
      <PeopleRows label="Teams">
        {teams.map((team) => {
          const isDeleted = !isZeroEpoch(team.team_deleted_at || "")
          return (
            <PersonRow
              key={team.team_uuid}
              dimmed={isDeleted}
              onOpen={() => openTeam(team)}
              openLabel={`Open ${team.team_name}`}
              leading={<TeamMark team={team} />}
              title={team.team_name}
              tags={isDeleted ? <PersonTag>Deleted</PersonTag> : undefined}
              meta={teamMeta(team)}
              cells={[<MemberStack key="stack" team={team} />]}
              menu={
                <RowMenu label={`Actions for ${team.team_name}`}>
                  {/* The way in first, the destructive one last, as on Members. */}
                  <DropdownMenuItem onSelect={() => openTeam(team)}>
                    <Users aria-hidden="true" />
                    View members
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isDeleted ? (
                    <DropdownMenuItem disabled={isSubmitting} onSelect={() => onUnDelete(team.team_uuid)}>
                      <RotateCcw aria-hidden="true" />
                      Restore team
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="destructive" disabled={isSubmitting} onSelect={() => onDelete(team.team_uuid)}>
                      <Trash2 aria-hidden="true" />
                      Delete team…
                    </DropdownMenuItem>
                  )}
                </RowMenu>
              }
            />
          )
        })}
      </PeopleRows>
      {hasMore && <PeopleMoreLine sentinelRef={sentinelRef} loading={isLoading} />}
    </>
  )
}
