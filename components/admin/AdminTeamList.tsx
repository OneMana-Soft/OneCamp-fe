"use client"

import React, { useRef, useEffect } from "react"
import { TeamInfoInterface } from "@/types/team"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, RotateCcw, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"

interface AdminTeamListProps {
  teams: TeamInfoInterface[]
  onDelete: (uuid: string) => void
  onUnDelete: (uuid: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
}

export const AdminTeamList: React.FC<AdminTeamListProps> = ({
  teams,
  onDelete,
  onUnDelete,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
}) => {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const sentinel = sentinelRef.current
    if (sentinel) observer.observe(sentinel)

    return () => {
      if (sentinel) observer.unobserve(sentinel)
      observer.disconnect()
    }
  }, [hasMore, isLoading, onLoadMore])

  if (teams.length === 0 && !isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm italic">
        No teams found.
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-y-auto h-[calc(100vh-320px)] pr-2 scrollbar-thin">
        {teams.map((team) => (
          <div
            key={team.team_uuid}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:shadow-sm mb-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none">
                  {team.team_name}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {team.team_member_count || 0} Members
                  </span>
                  {!isZeroEpoch(team.team_deleted_at || '') && (
                      <span className="text-[10px] text-destructive uppercase tracking-wider font-semibold">
                      • Deleted
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isZeroEpoch(team.team_deleted_at || '') ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => onUnDelete(team.team_uuid)}
                      disabled={isSubmitting}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Restore Team</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(team.team_uuid)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete Team</p>
                  </TooltipContent>
                </Tooltip>
              )}
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => {
                      dispatch(openUI({
                        key: 'teamMembers',
                        data: { teamUUID: team.team_uuid, teamName: team.team_name }
                      }))
                    }}
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Team Members</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}

        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>Loading more...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
