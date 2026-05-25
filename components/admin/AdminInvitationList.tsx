"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Button } from "@/components/ui/button"
import { Trash2, Mail, RefreshCw, CheckCircle, Clock, AlertCircle, XCircle } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminInvitationListProps {
  invitations: Invitation[]
  onDelete: (email: string) => void
  onResend: (email: string) => void
  isSubmitting: boolean
  resendingEmail: string | null
  isLoading?: boolean
  isFiltered?: boolean
  totalLoaded?: number
}

function getStatusBadge(status: string) {
  switch (status) {
    case "sent":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Clock className="h-3 w-3" />
          Sent
        </span>
      )
    case "joined":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          Joined
        </span>
      )
    case "expired":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-destructive">
          <XCircle className="h-3 w-3" />
          Expired
        </span>
      )
    case "pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
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
  isLoading,
  isFiltered,
  totalLoaded,
}) => {
  if (invitations.length === 0 && isLoading && !totalLoaded) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <ul className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card/50 animate-pulse"
            >
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-48 bg-muted rounded" />
                <div className="h-2.5 w-24 bg-muted rounded" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (invitations.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center py-10">
          <div className="mx-auto h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {isFiltered ? "No invitations match your search." : "No pending invitations."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <ul className="space-y-2">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium leading-tight truncate">
                  {inv.email}
                </span>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </span>
                  {getStatusBadge(inv.status)}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {inv.status !== "joined" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => onResend(inv.email)}
                        disabled={isSubmitting || resendingEmail === inv.email}
                        aria-label={`Resend invitation to ${inv.email}`}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${
                            resendingEmail === inv.email ? "animate-spin" : ""
                          }`}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resend invitation</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(inv.email)}
                      disabled={isSubmitting}
                      aria-label={`Remove invitation for ${inv.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove invitation</TooltipContent>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  )
}
