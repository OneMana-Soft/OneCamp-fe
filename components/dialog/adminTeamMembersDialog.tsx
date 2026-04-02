"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Users } from "lucide-react"
import { TeamMemberContent } from "@/components/member/teamMemberContent"

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
      <DialogContent className="sm:max-w-[425px] h-[80vh] flex flex-col p-0 overflow-hidden bg-background backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader className="p-6 pb-2 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Users className="h-5 w-5 text-primary" />
            </div>
            {teamName} Members
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden p-6 pt-2 flex flex-col">
          {teamId && (
            <TeamMemberContent teamId={teamId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AdminTeamMembersDialog
