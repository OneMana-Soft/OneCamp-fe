"use client"

// What happened to an invitation, said where the person who sent it is
// looking: the email went, or it couldn't and why, with the link to hand over
// either way. The admin's invite dialog and a member's both show it.
//
// "Invitation sent" used to mean only that a sending key was set: the send ran
// in the background and its answer was dropped, so a refused sender, the
// day's limit or an address that bounces all read as sent. The server now
// waits for the email provider and says what it answered (email_sent,
// email_error).

import { Check, Copy } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import type { InvitationAnswer } from "@/services/invitationService"

/**
 * "Couldn't email it", and why when the server said: email_error is a phrase
 * that follows those words. A server from before it existed sends none. Pure.
 */
export function couldntEmail(answer: InvitationAnswer): string {
  const reason = (answer.email_error || "").trim().replace(/\.+$/, "")
  return reason ? `Couldn't email it: ${reason}` : "Couldn't email it"
}

/** What to say about an invitation the server made. Pure. */
export function describeInvitation(answer: InvitationAnswer, email: string): { sent: boolean; title: string; message: string } {
  if (answer.email_sent) {
    return {
      sent: true,
      title: "Email sent",
      message: `Email sent to ${email}. The link below is the same one, in case it doesn't arrive.`,
    }
  }
  return { sent: false, title: "Invitation created", message: `${couldntEmail(answer)}. Copy the link instead.` }
}

interface Props {
  answer: InvitationAnswer
  /** The address the invitation is for. */
  email: string
}

/** The outcome and the link: the body of an invite dialog once it's done. */
export function InvitationOutcome({ answer, email }: Props) {
  const { copied, copy } = useCopyToClipboard()
  const link = answer.invite_link || ""
  const { sent, message } = describeInvitation(answer, email)

  return (
    <div className="grid gap-2 py-2">
      {/* Not sent is a warning, not a failure: the invitation exists and the
          link below works, only the email didn't go. */}
      <p role={sent ? "status" : "alert"} className={sent ? "text-sm text-muted-foreground" : "text-sm text-warning-ink"}>
        {message}
      </p>
      {link && (
        <>
          <Label htmlFor="invite-link">Invitation link</Label>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={() => void copy(link, "Invitation link copied")}
              aria-label="Copy invitation link"
              className="shrink-0"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Works for seven days, for that address only.</p>
        </>
      )}
    </div>
  )
}
