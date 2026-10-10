"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { InvitationListResponseInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Search } from "@/lib/icons"
import { AdminInvitationList } from "./AdminInvitationList"
import { useFetch } from "@/hooks/useFetch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { toast } from "@/hooks/use-toast"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { resendInvitation } from "@/services/invitationService"
import { couldntEmail } from "@/components/invite/InvitationOutcome"

const InvitationCard = () => {
  const dispatch = useDispatch()
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const { data: response, mutate, isLoading } = useFetch<InvitationListResponseInterface>(
    GetEndpointUrl.GetAdminInvitationList
  )

  const invitations = response?.data || []
  const post = usePost()
  const confirm = useConfirm()
  const { copy } = useCopyToClipboard()

  // Confirmed: revoking invalidates the link already sitting in someone's inbox, so
  // the consequence lands on a person outside this screen who will just find a dead
  // link. The prompt names the address so the admin can see they picked the right row.
  const handleDeleteInvitation = (email: string) => {
    if (!email || post.isSubmitting) return
    confirm({
      title: `Revoke the invitation to ${email}?`,
      description:
        "Their invite link stops working. You can invite them again, which sends a new email.",
      confirmText: "Revoke invitation",
      destructive: true,
      onConfirm: () => {
        void revokeInvitation(email)
      },
    })
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
      console.error("Failed to resend invitation:", error)
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

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base font-semibold">
                Invitations
              </CardTitle>
              <span className="text-sm tabular-nums text-muted-foreground">
                {invitations.length}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Invite people by email. Each invitation is a link, good for seven days, that lets them join this workspace.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search invitations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50"
                aria-label="Search invitations"
              />
            </div>
            <Button
              size="sm"
              className="h-9 gap-1.5 shrink-0"
              onClick={() => dispatch(openUI({ key: "addInvitation" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Invite User</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
        <AdminInvitationList
          invitations={filteredInvitations}
          onDelete={handleDeleteInvitation}
          onResend={handleResendInvitation}
          onCopyLink={handleCopyLink}
          isSubmitting={post.isSubmitting}
          resendingEmail={resendingEmail}
          isLoading={isLoading}
          isFiltered={!!normalisedSearch}
          totalLoaded={invitations.length}
        />
      </CardContent>
    </Card>
  )
}

export default InvitationCard
