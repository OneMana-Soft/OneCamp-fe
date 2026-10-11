"use client"

import React from "react"
import { Invitation } from "@/types/user"
import { Trash2, Mail, RefreshCw, Copy } from "@/lib/icons"
import { fullDateTime } from "@/lib/utils/date/shortDate"
import { hueFor } from "@/lib/campHue"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { DotWord, PeopleRows, PersonRow, RowMenu, relativeShort } from "@/components/admin/PeopleFrame"

interface AdminInvitationListProps {
  invitations: Invitation[]
  /** Revoke a live invitation, or clear a joined or expired one from the list. */
  onDelete: (invitation: Invitation) => void
  onResend: (email: string) => void
  /** Copies a live invitation's link, for the admin to hand over themselves. */
  onCopyLink: (link: string) => void
  isSubmitting: boolean
  resendingEmail: string | null
  /** Ids of invitations accepted while this page was open: they morph into a face. */
  justJoined?: Set<string>
  /** The avatar of the row to celebrate from, when it mounts. */
  celebrateRef?: (id: string) => React.Ref<HTMLSpanElement> | undefined
}

/**
 * How long a live invitation's link has left, as the server counts it (days,
 * rounded up), or nothing once it can no longer be used. Pure.
 */
export function expiryText(inv: Pick<Invitation, "status" | "expires_in_days" | "token_expires_at">, now = Date.now()): string {
  if (inv.status === "joined" || inv.status === "expired") return ""
  if (inv.token_expires_at) {
    const hours = (new Date(inv.token_expires_at).getTime() - now) / 3_600_000
    if (Number.isFinite(hours) && hours > 0 && hours < 24) return `Expires in ${Math.max(1, Math.round(hours))} h`
  }
  if (inv.expires_in_days == null) return ""
  if (inv.expires_in_days <= 1) return "Expires within a day"
  return `Expires in ${inv.expires_in_days} d`
}

/** Under 24 hours left: the expiry turns sun. Pure. */
export function expiresSoon(inv: Pick<Invitation, "status" | "expires_in_days" | "token_expires_at">, now = Date.now()): boolean {
  if (!isLive(inv)) return false
  if (inv.token_expires_at) {
    const hours = (new Date(inv.token_expires_at).getTime() - now) / 3_600_000
    if (Number.isFinite(hours)) return hours < 24
  }
  return inv.expires_in_days != null && inv.expires_in_days <= 1
}

/** Whether an invitation's link still works: sent and not yet used or run out. */
export function isLive(inv: Pick<Invitation, "status">): boolean {
  return inv.status !== "joined" && inv.status !== "expired"
}

/** "Invited by Arjun · 2 d ago": the inviter's name before the @. Pure. */
export function invitedLine(inv: Pick<Invitation, "invited_by" | "created_at">, now = Date.now()): string {
  const by = (inv.invited_by || "").split("@")[0]
  const name = by ? by.charAt(0).toUpperCase() + by.slice(1) : ""
  const when = relativeShort(inv.created_at, now)
  const ago = when && when !== "just now" ? `${when} ago` : when
  return [name ? `Invited by ${name}` : "Invited", ago].filter(Boolean).join(" · ")
}

/**
 * The mark of an invitation (design v3, A5): an invite is not yet a person,
 * so it is a 32px circle with a dashed ring and an envelope in ink-3. Once
 * they join it is their face, in their hue.
 */
export function InviteAvatar({ inv, joinedNow, spanRef }: { inv: Invitation; joinedNow?: boolean; spanRef?: React.Ref<HTMLSpanElement> }) {
  if (inv.status === "joined") {
    return (
      <span
        ref={spanRef}
        data-invite-avatar="joined"
        className={`invite-face inline-flex size-8 items-center justify-center text-2xs font-semibold ${avatarHueClass(hueFor(inv.email))} ${joinedNow ? "invite-joined" : ""}`}
      >
        <span>{getNameInitials(inv.email.split("@")[0])}</span>
      </span>
    )
  }
  return (
    <span ref={spanRef} data-invite-avatar="pending" className="invite-avatar size-8">
      <Mail aria-hidden="true" />
    </span>
  )
}

function Expiry({ inv }: { inv: Invitation }) {
  if (inv.status === "joined") return <DotWord tone="ok">Joined</DotWord>
  if (inv.status === "expired") return <DotWord tone="neutral">Expired</DotWord>
  const text = expiryText(inv)
  if (!text) return <DotWord tone="neutral">Pending</DotWord>
  return <DotWord tone={expiresSoon(inv) ? "sun" : "neutral"}>{text}</DotWord>
}

/**
 * The invitations' rows. The tab's frame (PeopleFrame, in invitationCard)
 * draws the toolbar, the header row, the skeleton and the empty and failed
 * states. Every action is in the row's ⋯: Resend, Copy link, then Revoke.
 */
export const AdminInvitationList: React.FC<AdminInvitationListProps> = ({
  invitations,
  onDelete,
  onResend,
  onCopyLink,
  isSubmitting,
  resendingEmail,
  justJoined,
  celebrateRef,
}) => {
  return (
    <PeopleRows label="Invitations">
      {invitations.map((inv) => {
        const live = isLive(inv)
        const now = justJoined?.has(inv.id)
        return (
          <PersonRow
            key={inv.id}
            marker={inv.status === "joined" ? "joined" : "invite"}
            leading={<InviteAvatar inv={inv} joinedNow={now} spanRef={celebrateRef?.(inv.id)} />}
            title={inv.email}
            meta={
              now ? (
                "Joined just now"
              ) : (
                <span title={fullDateTime(new Date(inv.created_at))}>{invitedLine(inv)}</span>
              )
            }
            cells={[<Expiry key="exp" inv={inv} />]}
            menu={
              <RowMenu label={`Actions for the invitation to ${inv.email}`}>
                {inv.status !== "joined" && (
                  <DropdownMenuItem
                    disabled={isSubmitting || resendingEmail === inv.email}
                    onSelect={() => onResend(inv.email)}
                    aria-label={inv.status === "expired" ? `Send ${inv.email} a new invitation link` : `Resend invitation to ${inv.email}`}
                  >
                    <RefreshCw aria-hidden="true" className={resendingEmail === inv.email ? "animate-spin" : undefined} />
                    {inv.status === "expired" ? "Send a new link" : "Resend"}
                  </DropdownMenuItem>
                )}
                {inv.invite_link && live && (
                  <DropdownMenuItem onSelect={() => onCopyLink(inv.invite_link!)} aria-label={`Copy the invitation link for ${inv.email}`}>
                    <Copy aria-hidden="true" />
                    Copy link
                  </DropdownMenuItem>
                )}
                {inv.status !== "joined" && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant={live ? "destructive" : "default"}
                  disabled={isSubmitting}
                  onSelect={() => onDelete(inv)}
                  aria-label={live ? `Revoke the invitation to ${inv.email}` : `Clear ${inv.email}'s invitation from the list`}
                >
                  <Trash2 aria-hidden="true" />
                  {live ? "Revoke…" : "Clear from the list"}
                </DropdownMenuItem>
              </RowMenu>
            }
          />
        )
      })}
    </PeopleRows>
  )
}
