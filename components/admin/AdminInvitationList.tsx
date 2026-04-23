"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Button } from "@/components/ui/button"
import { Trash2, Mail, RefreshCw, CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminInvitationListProps {
  invitations: Invitation[]
  onDelete: (email: string) => void
  onResend: (email: string) => void
  isSubmitting: boolean
  resendingEmail: string | null
}

function getStatusBadge(status: string) {
  switch (status) {
    case "sent":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Clock className="h-3 w-3" />
          Sent
        </span>
      )
    case "joined":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          Joined
        </span>
      )
    case "expired":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          Expired
        </span>
      )
    case "pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3 w-3" />
          Pending
        </span>
      )
  }
}

export const AdminInvitationList: React.FC<AdminInvitationListProps> = ({
  invitations,
  onDelete,
  onResend,
  isSubmitting,
  resendingEmail,
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
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </span>
                    {getStatusBadge(inv.status)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {inv.status !== "joined" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => onResend(inv.email)}
                        disabled={isSubmitting || resendingEmail === inv.email}
                      >
                        <RefreshCw className={`h-4 w-4 ${resendingEmail === inv.email ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Resend Invitation</p>
                    </TooltipContent>
                  </Tooltip>
                )}
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
