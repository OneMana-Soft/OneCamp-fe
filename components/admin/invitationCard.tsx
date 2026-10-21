"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { SpotInbox } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { celebrate } from "@/lib/celebrateSoon"
import { ErrorState } from "@/components/ui/error-state"
import { PostEndpointUrl } from "@/services/endPoints"
import { AdminGet } from "@/services/endpoints/admin"
import { InvitationListResponseInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { UserPlus } from "@/lib/icons"
import { AdminInvitationList, isLive } from "./AdminInvitationList"
import { PeopleAction, PeopleFab, PeopleFirstRun, PeopleFrame, PeopleNoMatch, peopleCount, quoted } from "./PeopleFrame"
import { useFetch } from "@/hooks/useFetch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { toast } from "@/hooks/use-toast"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { resendInvitation } from "@/services/invitationService"
import { couldntEmail } from "@/components/invite/InvitationOutcome"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { Invitation } from "@/types/user"

type Show = "pending" | "accepted" | "expired"
const SHOW: { value: Show; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
]
const showOf = (inv: Invitation): Show => (inv.status === "joined" ? "accepted" : inv.status === "expired" ? "expired" : "pending")

/** Where this browser remembers that it has seen the workspace's first acceptance. */
export const FIRST_ACCEPT_KEY = "onecamp:invites:first-accepted"

/**
 * Which invitations were accepted between two reads of the list, and whether
 * that is the workspace's first acceptance ever: nobody had joined by an
 * invitation before (the server's count) and this browser has not
 * celebrated it already (localStorage). One of the area's four celebration
 * moments, so never for a routine accept. Pure.
 */
export function newlyAccepted(
  before: Invitation[] | undefined,
  after: Invitation[],
  celebratedAlready: boolean,
): { ids: string[]; celebrate: boolean } {
  if (!before) return { ids: [], celebrate: false }
  const was = new Map(before.map((i) => [i.id, i.status]))
  const ids = after.filter((i) => i.status === "joined" && was.has(i.id) && was.get(i.id) !== "joined").map((i) => i.id)
  const joinedBefore = before.some((i) => i.status === "joined")
  return { ids, celebrate: ids.length > 0 && !joinedBefore && !celebratedAlready }
}

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(FIRST_ACCEPT_KEY) === "1"
  } catch {
    return false
  }
}
function writeFlag() {
  try {
    window.localStorage.setItem(FIRST_ACCEPT_KEY, "1")
  } catch {
    /* private window: the celebration may repeat, nothing else is lost */
  }
}

const InvitationCard = () => {
  const dispatch = useDispatch()
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [show, setShow] = useState<Show>("pending")

  // The list is read again every 30 seconds while an invitation is waiting,
  // so one accepted while the page is open turns into its person here.
  const [polling, setPolling] = useState(false)
  const { data: response, mutate, isLoading, isError } = useFetch<InvitationListResponseInterface>(
    AdminGet.GetAdminInvitationList,
    undefined,
    polling ? { refreshInterval: 30_000 } : undefined,
  )

  // Memoised, so the filtered list below is not rebuilt on every render.
  const invitations = useMemo(() => response?.data ?? [], [response])
  useEffect(() => setPolling(invitations.some(isLive)), [invitations])

  // The accept morph and, once ever, the celebration from the new face.
  const previous = useRef<Invitation[] | undefined>(undefined)
  const [justJoined, setJustJoined] = useState<Set<string>>(new Set())
  const [celebrateId, setCelebrateId] = useState<string | null>(null)
  useEffect(() => {
    if (!response) return
    const { ids, celebrate: party } = newlyAccepted(previous.current, invitations, readFlag())
    previous.current = invitations
    if (!ids.length) return
    setJustJoined((prev) => new Set([...prev, ...ids]))
    if (party) {
      writeFlag()
      setCelebrateId(ids[0])
    }
  }, [response, invitations])
  const celebrateRef = useCallback(
    (id: string) =>
      id === celebrateId
        ? (el: HTMLSpanElement | null) => {
            if (el) {
              celebrate(el)
              setCelebrateId(null)
            }
          }
        : undefined,
    [celebrateId],
  )
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
    if (!ok) toast({ title: "Couldn't copy the link", description: link, tone: "error" })
  }

  const normalisedSearch = search.trim().toLowerCase()
  const filteredInvitations = useMemo(() => {
    // Accepted while the page is open stays under Pending, so the morph is seen.
    const shown = invitations.filter((inv) => showOf(inv) === show || (show === "pending" && justJoined.has(inv.id)))
    if (!normalisedSearch) return shown
    return shown.filter(
      (inv) =>
        inv.email.toLowerCase().includes(normalisedSearch) ||
        inv.status.toLowerCase().includes(normalisedSearch)
    )
  }, [invitations, normalisedSearch, show, justJoined])

  const openInvite = () => dispatch(openUI({ key: "addInvitation" }))
  const loaded = invitations.length > 0 || !isLoading
  let state: ReactNode = undefined
  // Before the empty branch: a failed request leaves the list empty too.
  if (invitations.length === 0 && isError) {
    state = <ErrorState subject="the invitations" onRetry={() => void mutate()} />
  } else if (loaded && invitations.length === 0) {
    // No invitation ever: a first run, the envelope spot at 96px and the
    // one thing to do, as the primary.
    state = (
      <PeopleFirstRun
        illustration={<SpotInbox hue={ADMIN_GROUP_HUE.people} />}
        title="Bring your team in"
        description="Invite by email. They land in #general, ready to say hello."
        action={
          <Button size="sm" onClick={openInvite}>
            <UserPlus aria-hidden="true" />
            Invite people
          </Button>
        }
      />
    )
  } else if (loaded && filteredInvitations.length === 0) {
    state = normalisedSearch ? (
      <PeopleNoMatch
        title={`No one matches ${quoted(search)}.`}
        hint="Search by email address."
        onClear={() => setSearch("")}
      />
    ) : (
      <p role="status" className="py-12 text-center text-sm text-muted-foreground">
        {show === "pending" ? "No invitations are waiting." : show === "accepted" ? "No one has joined by invitation yet." : "No invitations have run out."}
      </p>
    )
  }

  return (
    <PeopleFrame
      label="Invitations"
      count={peopleCount({ shown: filteredInvitations.length, total: invitations.length, filtering: true, loaded })}
      filter={<SegmentedControl aria-label="Show invitations" value={show} onValueChange={setShow} options={SHOW} />}
      columns={["Expires"]}
      cols="150px"
      fab={<PeopleFab icon={UserPlus} label="Invite people" onClick={openInvite} />}
      search={{ value: search, onChange: setSearch, placeholder: "Search invitations…", label: "Search invitations", name: "invitation-search" }}
      // Words at every width: the label hid below an xs: breakpoint that does
      // not exist, so a phone showed a bare "+". The icon is Members' for the
      // same words.
      action={
        <PeopleAction icon={UserPlus} kbd="i" onClick={openInvite}>
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
        justJoined={justJoined}
        celebrateRef={celebrateRef}
      />
    </PeopleFrame>
  )
}

export default InvitationCard
