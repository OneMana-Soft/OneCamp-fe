"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { NodeLink } from "@/components/docFiles/NodeLink"
import { Check } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useFetch } from "@/hooks/useFetch"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { ACCESS_LEVEL_LABEL } from "@/lib/docAccess"
import { accessRequestsKey, requestDocAccess } from "@/services/docAccessService"
import type { DocAccessRequest, DocAccessRequests } from "@/types/docAccess"
import { ChoiceCards, InlineError } from "./chrome/parts"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { LoadFailureState } from "@/components/ui/load-failure-state"

type Wanted = DocAccessRequest["level_wanted"]
const VERB: Record<Wanted, string> = { view: "view it", comment: "comment on it", edit: "edit it" }

/** How often an open request is looked at again while the page is shown. */
const RECHECK_MS = 15_000

/**
 * A doc that is there but not shared with this person (E1; collaboration.md
 * P1-C): the server answers 403, and the page says so and offers Request
 * access, at the level they need, with a note. It names nothing of the doc
 * (I12). Once asked, it says so, and opens the doc by itself when the request
 * is approved (the request list is looked at again every 15 s while the page
 * shows, until A6's notification arrives for it).
 */
export function NoAccessPage({ docId, onGranted, canRequest = true, admin = false }: {
  docId: string
  onGranted: () => void
  /**
   * Whether a request would reach someone who can answer it (the server's
   * can_request: never the demo's own people, never from its shared visitor).
   * Without one, the page says who to ask instead of offering a form nobody
   * reads (docs incident, 14 Oct 2026).
   */
  canRequest?: boolean
  /** An admin is told being one opens no doc. */
  admin?: boolean
}) {
  // Looked at again only while a request of theirs is waiting for an answer.
  const requests = useFetch<{ data?: DocAccessRequests }>(
    accessRequestsKey(docId),
    undefined,
    { refreshInterval: (latest?: { data?: DocAccessRequests }) => (latest?.data?.outgoing?.some((r) => r.doc_uuid === docId && r.status === "pending") ? RECHECK_MS : 0) },
    OWN_ERRORS,
  )
  const mine = requests.data?.data?.outgoing?.find((r) => r.doc_uuid === docId)
  const [level, setLevel] = React.useState<Wanted>("view")
  const [note, setNote] = React.useState("")
  const [asking, setAsking] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [error, setError] = React.useState("")
  const asked = useRelativeTime(mine?.created_at ?? null)

  // Approved: the doc is theirs to open now.
  React.useEffect(() => {
    if (mine?.status === "approved") onGranted()
  }, [mine?.status, onGranted])

  const ask = async () => {
    setAsking(true)
    setError("")
    try {
      await requestDocAccess(docId, level, note.trim())
      setEditing(false)
      void requests.mutate()
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 409) onGranted()
      else setError(apiErrorMessage(e, "The request wasn't sent. Try again in a moment."))
    } finally {
      setAsking(false)
    }
  }

  const pending = mine?.status === "pending" && !editing
  const declined = mine?.status === "declined" && !editing
  const said = pending
    ? `You asked to ${VERB[mine.level_wanted]}. It opens here once someone with full access says yes.`
    : declined
      ? "Your request wasn't approved. You can ask again, with a note that says why you need it."
      : canRequest
        ? "It hasn't been shared with you. Ask for access and the people who manage it get your request."
        : "It hasn't been shared with you. Ask whoever sent you the link to share it."
  const offer = canRequest || !!mine
  return (
    <div data-doc-no-access="" className="px-5 py-8">
      <LoadFailureState
        kind="no-access"
        noun="doc"
        back={{ label: "Back to docs", href: "/app/doc" }}
        noAccessDetail={
          <>
            {said}
            {admin && " Being an admin doesn't open docs: only the people it's shared with can."}
          </>
        }
        requestAccess={
          offer ? (
            <div className="flex w-full max-w-[420px] flex-col gap-3">
        {pending ? (
          <div className="flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--camp-moss-tint)] px-2.5 py-1 text-ui-sm font-medium text-[var(--camp-moss-ink)]" data-doc-request-sent="">
              <Check aria-hidden="true" className="size-3.5" />
              Request sent{asked ? ` · ${asked}` : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Change the request
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ChoiceCards
              label="Access to ask for"
              value={level}
              onChange={setLevel}
              choices={[
                { value: "view", label: ACCESS_LEVEL_LABEL.view, description: "Read it." },
                { value: "comment", label: ACCESS_LEVEL_LABEL.comment, description: "Read it and leave comments." },
                { value: "edit", label: ACCESS_LEVEL_LABEL.edit, description: "Read it and change it." },
              ]}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-2">A note, if it helps (optional)</span>
              <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="What you need it for" className="resize-none" />
            </label>
            <InlineError>{error}</InlineError>
            <Button onClick={() => void ask()} disabled={asking} className="w-full" data-doc-request-access="">
              {asking ? "Sending…" : "Request access"}
            </Button>
          </div>
        )}

              <Button variant="link" size="sm" asChild className="self-center">
                <NodeLink href="/app/doc">Back to docs</NodeLink>
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  )
}

export default NoAccessPage
