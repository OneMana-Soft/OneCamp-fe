"use client"

// An admin can invite someone from their profile when that someone is a
// placeholder: a person an import (or an integration) brought across whose
// work is here under their name but who can't sign in. One click sends the
// same invitation Admin, Invitations sends; when they join with that address,
// the placeholder becomes their account.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, MailPlus } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { inviteImportedPeople } from "@/services/importService"
import { isPlaceholderEmail } from "@/lib/importInvites"

type Answer = { tone: "ok" | "error"; text: string }

/** What one invitation from a profile came to, in a sentence. Pure. */
export function placeholderInviteAnswer(run: Awaited<ReturnType<typeof inviteImportedPeople>>): Answer {
  if (run.invited.length) {
    return run.notEmailed.length
      ? { tone: "ok", text: run.unsentMsg || "Invitation created, but no email went out: copy their link from Admin, Invitations." }
      : { tone: "ok", text: "Invited. They get an email with a link to join." }
  }
  if (run.alreadyInvited.length) return { tone: "ok", text: "They were already invited." }
  if (run.seatLimit) return { tone: "error", text: run.seatLimit.msg }
  return { tone: "error", text: run.failed[0]?.msg ?? "That didn't work. Try again." }
}

export function InvitePlaceholder({ userUUID, email, name }: { userUUID: string; email?: string; name?: string }) {
  // The same request the navigation bar makes, so this is a cache hit.
  const self = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, { revalidateOnFocus: false })
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)

  if (!self.data?.data?.user_is_admin) return null

  if (isPlaceholderEmail(email)) {
    return (
      <p className="text-xs text-muted-foreground text-center max-w-[260px] leading-relaxed">
        No email address came across with them, so they can&apos;t be invited from here.
      </p>
    )
  }

  const invite = async () => {
    setBusy(true)
    const run = await inviteImportedPeople([{ user_id: userUUID, name: name || email || "", email: email || "" }])
    setBusy(false)
    setAnswer(placeholderInviteAnswer(run))
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {!answer || answer.tone === "error" ? (
        <Button variant="secondary" className="w-full gap-2 font-medium" onClick={invite} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
          Invite to the workspace
        </Button>
      ) : null}
      {answer && (
        <p
          role={answer.tone === "error" ? "alert" : "status"}
          className={answer.tone === "error" ? "text-xs text-danger-ink text-center max-w-[260px]" : "text-xs text-muted-foreground text-center max-w-[260px]"}
        >
          {answer.text}
        </p>
      )}
    </div>
  )
}
