"use client"

import React from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TeamMemberContent } from "@/components/member/teamMemberContent"
import { TeamMark } from "@/components/admin/AdminTeamList"

interface AdminTeamMembersDialogProps {
  isOpen: boolean
  onOpenChange: () => void
  teamId: string
  teamName: string
}

/**
 * A team, opened from its row in Admin › Teams (design v3, A4): the 452px
 * side sheet rather than a dialog in the middle of the list, so the list it
 * came from stays in view. The title carries the team's own mark (its hue,
 * its initial), as the row does. On a phone it is the whole screen.
 */
const AdminTeamMembersDialog: React.FC<AdminTeamMembersDialogProps> = ({ isOpen, onOpenChange, teamId, teamName }) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-team-sheet=""
        className="flex flex-col gap-0 p-0 sm:max-w-[452px] max-sm:max-w-none"
      >
        <SheetHeader className="flex min-h-[52px] flex-row items-center gap-2.5 space-y-0 px-5 py-3 pr-12 text-left team-sheet-head">
          <SheetTitle className="flex min-w-0 items-center gap-2.5">
            <TeamMark team={{ team_uuid: teamId, team_name: teamName }} />
            <span className="truncate text-title-3">{teamName}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">The people in {teamName}.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 pt-3">
          {teamId && <TeamMemberContent teamId={teamId} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default AdminTeamMembersDialog
