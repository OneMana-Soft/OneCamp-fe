"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Button } from "@/components/ui/button"
import { Trash2, Mail } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminInvitationListProps {
  invitations: Invitation[]
  onDelete: (email: string) => void
  isSubmitting: boolean
}

export const AdminInvitationList: React.FC<AdminInvitationListProps> = ({
  invitations,
  onDelete,
  isSubmitting,
}) => {
  return (
    <TooltipProvider>
      <div className="overflow-y-auto h-[calc(100vh-320px)] pr-2 scrollbar-thin">
      <div className="space-y-4">
        {invitations.length > 0 ? (
          invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none">
                    {inv.email}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Invited on {new Date(inv.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(inv.email)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Remove Invitation</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm italic border border-dashed rounded-lg">
            No pending invitations found.
          </div>
        )}
      </div>
      </div>
    </TooltipProvider>
  )
}
