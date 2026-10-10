"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Trash2, Mail, RefreshCw, Copy } from "@/lib/icons"
import { fullDateTime, shortDate } from "@/lib/utils/date/shortDate"
import { Tile } from "@/components/ui/graphics/Tile"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PEOPLE_LIST, PERSON_TILE, PersonAction, PersonRow } from "@/components/admin/PeopleFrame"

interface AdminInvitationListProps {
  invitations: Invitation[]
  /** Revoke a live invitation, or clear a joined or expired one from the list. */
  onDelete: (invitation: Invitation) => void
  onResend: (email: string) => void
  /** Copies a live invitation's link, for the admin to hand over themselves. */
  onCopyLink: (link: string) => void
  isSubmitting: boolean
  resendingEmail: string | null
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
const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  sent: { label: "Sent", tone: "info" },
  joined: { label: "Joined", tone: "success" },
  // Ran out: nothing is wrong, it needs sending again.
  expired: { label: "Expired", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
}

function statusWord(status: string) {
  const { label, tone } = STATUS[status] ?? STATUS.pending
  return <StatusWord tone={tone}>{label}</StatusWord>
}

/**
 * The invitations' rows. The tab's frame (PeopleFrame, in invitationCard)
 * draws the header, the toolbar, the skeleton and the empty and failed states.
 */
export const AdminInvitationList: React.FC<AdminInvitationListProps> = ({
  invitations,
  onDelete,
  onResend,
  onCopyLink,
  isSubmitting,
  resendingEmail,
}) => {
  // No scroller of its own: the admin page's tab region is the one that
  // scrolls, so this list sizes to its rows.
  return (
    <TooltipProvider>
      <ul className={PEOPLE_LIST}>
        {invitations.map((inv) => (
          <PersonRow
            key={inv.id}
            // An invitation is not a person yet: the people group's tile, the
            // size of a member's face, so the names start where they do on
            // Members and Admins.
            leading={
              <Tile hue={ADMIN_GROUP_HUE.people} className={PERSON_TILE}>
                <Mail />
              </Tile>
            }
            title={inv.email}
            meta={
              <span className="inline-flex items-center gap-2">
                {/* When it was sent, in the app's one date format, not the browser's. */}
                <time dateTime={inv.created_at} title={fullDateTime(new Date(inv.created_at))} className="tabular-nums">
                  {shortDate(new Date(inv.created_at))}
                </time>
                {statusWord(inv.status)}
                {expiryText(inv) && (
                  <>
                    {/* A separator, so the expiry doesn't run into the status word. */}
                    <span aria-hidden="true" className="text-faint-foreground">·</span>
                    <span>{expiryText(inv)}</span>
                  </>
                )}
              </span>
            }
            actions={
              <>
                {inv.invite_link && isLive(inv) && (
                  <PersonAction
                    icon={Copy}
                    word="Copy"
                    tip="Copy link"
                    onClick={() => onCopyLink(inv.invite_link!)}
                    aria-label={`Copy the invitation link for ${inv.email}`}
                  />
                )}
                {inv.status !== "joined" && (
                  <PersonAction
                    icon={RefreshCw}
                    word={inv.status === "expired" ? "Send" : "Resend"}
                    tip={inv.status === "expired" ? "Send a new link" : "Send again with a new link"}
                    iconClassName={resendingEmail === inv.email ? "animate-spin" : undefined}
                    onClick={() => onResend(inv.email)}
                    disabled={isSubmitting || resendingEmail === inv.email}
                    aria-label={
                      inv.status === "expired" ? `Send ${inv.email} a new invitation link` : `Resend invitation to ${inv.email}`
                    }
                  />
                )}
                <PersonAction
                  icon={Trash2}
                  word={isLive(inv) ? "Revoke" : "Clear"}
                  tip={isLive(inv) ? "Revoke invitation" : "Clear from the list"}
                  tone="danger"
                  onClick={() => onDelete(inv)}
                  disabled={isSubmitting}
                  aria-label={isLive(inv) ? `Revoke the invitation to ${inv.email}` : `Clear ${inv.email}'s invitation from the list`}
                />
              </>
            }
          />
        ))}
      </ul>
    </TooltipProvider>
  )
}
