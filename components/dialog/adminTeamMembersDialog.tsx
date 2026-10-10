"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Users } from "@/lib/icons";
import { TeamMemberContent } from "@/components/member/teamMemberContent"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

interface AdminTeamMembersDialogProps {
  isOpen: boolean
  onOpenChange: () => void
  teamId: string
  teamName: string
}

const AdminTeamMembersDialog: React.FC<AdminTeamMembersDialogProps> = ({
  isOpen,
  onOpenChange,
  teamId,
  teamName,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] h-[80vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border/60 space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold truncate">
            {/* The people group's hue, as the admin menu draws Teams. */}
            <Tile hue={ADMIN_GROUP_HUE.people} size="sm">
              <Users />
            </Tile>
            <span className="truncate">{teamName} members</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden p-5 pt-3 flex flex-col">
          {teamId && (
            <TeamMemberContent teamId={teamId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AdminTeamMembersDialog
