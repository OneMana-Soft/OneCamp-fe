"use client"

// Invite, in a conversation's call (calls HU13): a link that opens this call
// alone, while it lasts. Someone outside the workspace asks to come in;
// someone in it comes in as themselves, and never sees the conversation.
// Made on asking, as each is a way in; loaded only once the call is on and
// its reader may let people in (CallView).

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { guestMeetingLink } from "@/services/guestService"
import { inviteToCall } from "@/services/callInviteService"
import type { CallRef } from "@/services/callService"
import { InviteLinkRow, InvitePanel } from "./invite"

export function ConversationInvite({ callRef }: { callRef: CallRef }) {
  const [link, setLink] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const make = async () => {
    setBusy(true)
    setError("")
    try {
      setLink(guestMeetingLink((await inviteToCall(callRef)).guest_token))
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't make an invite link. Try again."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <InvitePanel
      label="Invite people"
      title="Invite to this call"
      description="Anyone with the link can ask to come in while this call lasts. People in your workspace come in as themselves, and never see this conversation."
      body={
        <>
          {link ? <InviteLinkRow link={link} label="Invite link" /> : null}
          {error ? (
            <p role="alert" className="mt-2 text-meta text-danger-ink text-pretty">
              {error}
            </p>
          ) : null}
        </>
      }
      actions={
        link ? undefined : (
          <Button size="sm" onClick={() => void make()} busy={busy}>
            Make an invite link
          </Button>
        )
      }
    />
  )
}
