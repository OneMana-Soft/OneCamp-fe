"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Button } from "@/components/ui/button"
import { Trash2, Mail, RefreshCw, Copy } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { fullDateTime, shortDate } from "@/lib/utils/date/shortDate"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { cn } from "@/lib/utils/helpers/cn"

interface AdminInvitationListProps {
  invitations: Invitation[]
  /** Revoke a live invitation, or clear a joined or expired one from the list. */
  onDelete: (invitation: Invitation) => void
  onResend: (email: string) => void
  /** Copies a live invitation's link, for the admin to hand over themselves. */
  onCopyLink: (link: string) => void
  isSubmitting: boolean
  resendingEmail: string | null
  isLoading?: boolean
  /** The list could not be read: said as such, never as "no invitations". */
  isError?: boolean
  onRetry?: () => void
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

/** Whether an invitation's link still works: sent and not yet used or run out. */
function isLive(inv: Pick<Invitation, "status">): boolean {
  return inv.status !== "joined" && inv.status !== "expired"
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
  isError,
  onRetry,
  isFiltered,
  totalLoaded,
}) => {
  // Loading draws the rows it is about to show, in the same bordered list, so
  // nothing moves when they arrive.
  if (invitations.length === 0 && isLoading && !totalLoaded) {
    return (
      <ul aria-busy="true" aria-label="Loading invitations" className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5" aria-hidden="true">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-52" : "w-44")} />
              <Skeleton className="h-3 w-40" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  // Before the empty branch: a failed request leaves the list empty too.
  if (invitations.length === 0 && isError) {
    return <ErrorState subject="the invitations" onRetry={onRetry} />
  }

  if (invitations.length === 0) {
    // The people group's hue, as the admin menu draws Invitations.
    return (
      <EmptyState
        icon={Mail}
        hue={ADMIN_GROUP_HUE.people}
        title={isFiltered ? "No invitation matches your search." : "No invitations yet."}
      />
    )
  }

  return (
    <TooltipProvider>
      {/* No scroller of its own: the admin page's tab region is the one that
          scrolls, so this list sizes to its rows. */}
      <div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-highlight"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium leading-tight truncate">
                  {inv.email}
                </span>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {/* When it was sent, in the app's one date format, not the browser's. */}
                  <time
                    dateTime={inv.created_at}
                    title={fullDateTime(new Date(inv.created_at))}
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {shortDate(new Date(inv.created_at))}
                  </time>
                  {getStatusBadge(inv.status)}
                  {expiryText(inv) && (
                    <span className="text-xs text-muted-foreground">{expiryText(inv)}</span>
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
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                      className="h-8 w-8 text-muted-foreground hover:text-danger-ink hover:bg-destructive/10"
                      onClick={() => onDelete(inv)}
                      disabled={isSubmitting}
                      aria-label={
                        isLive(inv)
                          ? `Revoke the invitation to ${inv.email}`
                          : `Clear ${inv.email}'s invitation from the list`
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isLive(inv) ? "Revoke invitation" : "Clear from the list"}</TooltipContent>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  )
}
