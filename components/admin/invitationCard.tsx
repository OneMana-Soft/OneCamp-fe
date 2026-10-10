"use client"

import { type ReactNode, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { InvitationListResponseInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { Mail, UserPlus } from "@/lib/icons"
import { AdminInvitationList } from "./AdminInvitationList"
import { PeopleAction, PeopleFirstRun, PeopleFrame, PeopleNoMatch, peopleCount, quoted } from "./PeopleFrame"
import { useFetch } from "@/hooks/useFetch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { toast } from "@/hooks/use-toast"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { resendInvitation } from "@/services/invitationService"
import { couldntEmail } from "@/components/invite/InvitationOutcome"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { Invitation } from "@/types/user"

const InvitationCard = () => {
  const dispatch = useDispatch()
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const { data: response, mutate, isLoading, isError } = useFetch<InvitationListResponseInterface>(
    GetEndpointUrl.GetAdminInvitationList
  )

  // Memoised, so the filtered list below is not rebuilt on every render.
  const invitations = useMemo(() => response?.data ?? [], [response])
  const post = usePost()
  const confirm = useConfirm()
  const { copy } = useCopyToClipboard()

  // Confirmed, in words that fit the row. Revoking a live invitation kills the
  // link already sitting in someone's inbox, so the consequence lands on a
  // person outside this screen; the prompt names the address so the admin can
  // see they picked the right row. A joined or expired one has no live link,
  // and telling the admin "their link stops working" about someone who joined
  // last week was simply untrue: clearing it only tidies the list.
  const handleDeleteInvitation = (inv: Invitation) => {
    if (!inv.email || post.isSubmitting) return
    const live = inv.status !== "joined" && inv.status !== "expired"
    confirm(
      live
        ? {
            title: `Revoke the invitation to ${inv.email}?`,
            description: "Their invite link stops working. You can invite them again, which sends a new email.",
            confirmText: "Revoke invitation",
            destructive: true,
            onConfirm: () => void revokeInvitation(inv.email),
          }
        : {
            title: `Clear ${inv.email}'s invitation from the list?`,
            description:
              inv.status === "joined"
                ? "They have joined, so nothing changes for them. Only this record goes."
                : "Its link had already run out. Only this record goes.",
            confirmText: "Clear",
            onConfirm: () => void revokeInvitation(inv.email),
          },
    )
  }

  const revokeInvitation = async (email: string) => {
    await mutate(
      async () => {
        await post.makeRequest({
          apiEndpoint: PostEndpointUrl.DeleteInvitation,
          appendToUrl: email,
          method: "DELETE",
        })
        return {
          ...response,
          data: invitations.filter((inv) => inv.email !== email),
        } as InvitationListResponseInterface
      },
      {
        optimisticData: {
          ...response,
          data: invitations.filter((inv) => inv.email !== email),
        } as InvitationListResponseInterface,
        rollbackOnError: true,
        revalidate: true,
      }
    )
  }

  // Resend answers with the link and whether the email provider took the
  // email, or why not, the same as creating one does. Sent, the toast says so;
  // not sent, it says why and the link is put on the clipboard, because
  // "resent" for an email that never went is the lie the dialogs used to tell.
  const handleResendInvitation = async (email: string) => {
    if (!email || resendingEmail) return
    setResendingEmail(email)
    try {
      const outcome = await resendInvitation(email)
      if (!outcome.ok) {
        toast({ title: "Couldn't send it again", description: outcome.msg, variant: "destructive" })
        return
      }
      const answer = outcome.answer
      mutate()
      if (answer?.email_sent) {
        toast({ title: "Email sent", description: `A new link is on its way to ${email}. The old one no longer works.` })
      } else if (answer?.invite_link) {
        const ok = await copy(answer.invite_link)
        toast({
          title: "Invitation link ready",
          description: ok
            ? `${couldntEmail(answer)}. The new link is on your clipboard to send yourself.`
            : `${couldntEmail(answer)}. Send this link yourself: ${answer.invite_link}`,
        })
      }
    } catch (error) {
      // A request that never got an answer used to end here in the console,
      // with the spinner stopping and nothing said at all.
      toast({
        title: "Couldn't send it again",
        description: apiErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      })
    } finally {
      setResendingEmail(null)
    }
  }

  // A live invitation's link, for the admin to hand over themselves: the same
  // link its email carries, which keeps working until it expires.
  const handleCopyLink = async (link: string) => {
    const ok = await copy(link, "Invitation link copied")
    if (!ok) toast({ title: "Couldn't copy the link", description: link })
  }

  const normalisedSearch = search.trim().toLowerCase()
  const filteredInvitations = useMemo(() => {
    if (!normalisedSearch) return invitations
    return invitations.filter(
      (inv) =>
        inv.email.toLowerCase().includes(normalisedSearch) ||
        inv.status.toLowerCase().includes(normalisedSearch)
    )
  }, [invitations, normalisedSearch])

  const openInvite = () => dispatch(openUI({ key: "addInvitation" }))
  const loaded = invitations.length > 0 || !isLoading
  let state: ReactNode = undefined
  // Before the empty branch: a failed request leaves the list empty too.
  if (invitations.length === 0 && isError) {
    state = <ErrorState subject="the invitations" onRetry={() => void mutate()} />
  } else if (loaded && filteredInvitations.length === 0) {
    state = normalisedSearch ? (
      <PeopleNoMatch
        icon={Mail}
        title={`No invitations match ${quoted(search)}`}
        hint="Search by email address, or by a status such as Sent or Expired."
        onClear={() => setSearch("")}
      />
    ) : (
      // A workspace with no invitations at all is a first run, so it is
      // welcomed, with the one thing to do.
      <PeopleFirstRun
        title="No invitations yet"
        description="Invite the people you work with. Each gets an email with a link to join, good for seven days."
        action={
          <Button variant="outline" size="sm" onClick={openInvite}>
            Invite people
          </Button>
        }
      />
    )
  }

  return (
    <PeopleFrame
      title="Invitations"
      count={peopleCount({ shown: filteredInvitations.length, total: invitations.length, filtering: !!normalisedSearch, loaded })}
      // What an invitation is, in one line that fits a phone.
      description="Each is a link to join, good for seven days."
      search={{ value: search, onChange: setSearch, placeholder: "Search invitations…", label: "Search invitations", name: "invitation-search" }}
      // Words at every width: the label hid below an xs: breakpoint that does
      // not exist, so a phone showed a bare "+". The icon is Members' for the
      // same words.
      action={
        <PeopleAction icon={UserPlus} onClick={openInvite}>
          Invite people
        </PeopleAction>
      }
      loading={invitations.length === 0 && !!isLoading && !isError}
      loadingLabel="Loading invitations"
      leading="tile"
      state={state}
    >
      <AdminInvitationList
        invitations={filteredInvitations}
        onDelete={handleDeleteInvitation}
        onResend={handleResendInvitation}
        onCopyLink={handleCopyLink}
        isSubmitting={post.isSubmitting}
        resendingEmail={resendingEmail}
      />
    </PeopleFrame>
  )
}

export default InvitationCard
