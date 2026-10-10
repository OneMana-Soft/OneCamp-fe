"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Button } from "@/components/ui/button"
import { Trash2, Mail, RefreshCw, Copy } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminInvitationListProps {
  invitations: Invitation[]
  onDelete: (email: string) => void
  onResend: (email: string) => void
  /** Copies a live invitation's link, for the admin to hand over themselves. */
  onCopyLink: (link: string) => void
  isSubmitting: boolean
  resendingEmail: string | null
  isLoading?: boolean
  isFiltered?: boolean
  totalLoaded?: number
}

/**
 * How long a live invitation's link has left, as the server counts it (days,
 * rounded up), or nothing once it can no longer be used. Pure.
 */
export function expiryText(inv: Pick<Invitation, "status" | "expires_in_days">): string {
  if (inv.status === "joined" || inv.status === "expired" || inv.expires_in_days == null) return ""
  if (inv.expires_in_days <= 1) return "Expires within a day"
  return `Expires in ${inv.expires_in_days} days`
}

/** A dot and a word: the status of an invitation is information, not a coloured pill. */
const STATUS: Record<string, { label: string; dot: string }> = {
  sent: { label: "Sent", dot: "bg-info" },
  joined: { label: "Joined", dot: "bg-success" },
  // Ran out: nothing is wrong, it needs sending again.
  expired: { label: "Expired", dot: "bg-muted-foreground/60" },
  pending: { label: "Pending", dot: "bg-warning" },
}

function getStatusBadge(status: string) {
  const { label, dot } = STATUS[status] ?? STATUS.pending
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export const AdminInvitationList: React.FC<AdminInvitationListProps> = ({
  invitations,
  onDelete,
  onResend,
  onCopyLink,
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
        <ul className="divide-y divide-border rounded-lg border border-border">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium leading-tight truncate">
                  {inv.email}
                </span>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(inv.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  {getStatusBadge(inv.status)}
                  {expiryText(inv) && (
                    <span className="text-2xs text-muted-foreground">{expiryText(inv)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {inv.invite_link && inv.status !== "joined" && inv.status !== "expired" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => onCopyLink(inv.invite_link!)}
                        aria-label={`Copy the invitation link for ${inv.email}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy link</TooltipContent>
                  </Tooltip>
                )}
                {inv.status !== "joined" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => onResend(inv.email)}
                        disabled={isSubmitting || resendingEmail === inv.email}
                        aria-label={
                          inv.status === "expired"
                            ? `Send ${inv.email} a new invitation link`
                            : `Resend invitation to ${inv.email}`
                        }
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${
                            resendingEmail === inv.email ? "animate-spin" : ""
                          }`}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {inv.status === "expired" ? "Send a new link" : "Send again with a new link"}
                    </TooltipContent>
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
