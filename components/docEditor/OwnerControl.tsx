"use client"

import * as React from "react"
import { Crown, Search, ShieldAlert } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { toast } from "@/hooks/use-toast"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { appMutate } from "@/lib/swrMutate"
import { docInfoKey } from "@/lib/docCache"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDate } from "@/lib/utils/date/shortDate"
import { docAccessKey, transferDoc } from "@/services/docAccessService"
import { searchPeople } from "@/services/docChromeService"
import { GetEndpointUrl } from "@/services/endPoints"
import type { DocAccess } from "@/types/docAccess"
import type { UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import { ChromeSheet } from "./chrome/Sheet"
import { InlineError } from "./chrome/parts"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { setFacts } from "./chrome/pageFacts"
import { useDoc } from "./chrome/useDoc"

const QUIET = { suppressErrorToast: true } as never

/** People the search finds as it is typed, newest answer only. */
function usePeople(query: string) {
  const [people, setPeople] = React.useState<UserProfileDataInterface[] | null>(null)
  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setPeople(null)
      return
    }
    let live = true
    const t = setTimeout(() => {
      searchPeople(q)
        .then((p) => live && setPeople(p))
        .catch(() => live && setPeople([]))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query])
  return people
}

/**
 * Handing a doc on (A5 §4): its owner chooses someone in the workspace, who
 * owns it from then on; the owner keeps full access. Recoveries by a
 * workspace admin, when someone left, are listed here too, as A5 records
 * them for the owner and full access.
 */
export default function OwnerControl({ docId, onClose }: { docId: string; onClose(): void }) {
  const doc = useDoc(docId)
  const access = useFetch<{ data?: DocAccess }>(docAccessKey(docId), undefined, undefined, QUIET).data?.data
  const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  const [query, setQuery] = React.useState("")
  const people = usePeople(query)
  const [to, setTo] = React.useState<UserProfileDataInterface | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const title = doc?.doc_title?.trim() || "Untitled"
  const recoveries = access?.sharing?.recoveries ?? []
  const owner = !!access?.owner

  const transfer = async () => {
    if (!to) return
    setBusy(true)
    setError("")
    try {
      await transferDoc(docId, to.user_uuid)
      setFacts(docId, { owner: false })
      void appMutate(docInfoKey(docId))
      toast({ title: displayNameOf(to) ? `${displayNameOf(to)} owns “${title}” now` : `They own “${title}” now`, description: "You still have full access." })
      onClose()
    } catch (e) {
      setError(apiErrorMessage(e, "It's still yours. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  const shown = (people ?? []).filter((p) => p.user_uuid !== me?.user_uuid)
  return (
    <ChromeSheet
      onClose={onClose}
      title="Transfer ownership"
      description={`Choose who owns “${title}”. They can share it, lock it and hand it on; you keep full access.`}
      size="md"
      data-doc-owner-dialog=""
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!to || busy || !owner} onClick={() => void transfer()} data-doc-transfer="">
            {to ? `Transfer to ${displayNameOf(to) || "them"}` : "Transfer"}
          </Button>
        </>
      }
    >
      {!owner && access ? <InlineError>Only the doc&apos;s owner can hand it on.</InlineError> : null}
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people by name or email" aria-label="Search people" className="h-9 pl-8" disabled={!owner} />
      </div>
      <ul role="listbox" aria-label="People" className="flex max-h-[240px] flex-col overflow-y-auto">
        {shown.map((p) => (
          <li key={p.user_uuid} role="option" aria-selected={to?.user_uuid === p.user_uuid}>
            <button
              type="button"
              onClick={() => setTo(p)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand",
                to?.user_uuid === p.user_uuid && "bg-press",
              )}
            >
              <IdentityMark variant="avatar" size={28} id={avatarSeed(p)} label={displayNameOf(p) || "Someone"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-ink">{displayNameOf(p) || "Someone"}</span>
                {addressOrHandleOf(p) ? <span className="block truncate text-meta text-ink-3">{addressOrHandleOf(p)}</span> : null}
              </span>
              {to?.user_uuid === p.user_uuid ? <Crown aria-hidden="true" className="size-4 text-[var(--camp-sun-ink)]" /> : null}
            </button>
          </li>
        ))}
        {people && shown.length === 0 ? <li className="px-2 py-4 text-center text-ui-sm text-ink-3">Nobody in the workspace is called that.</li> : null}
      </ul>
      {recoveries.length ? (
        <section className="flex flex-col gap-1.5 rounded-xl bg-sunken p-3" aria-label="Recoveries">
          <h3 className="flex items-center gap-1.5 text-meta font-medium text-ink-2">
            <ShieldAlert aria-hidden="true" className="size-3.5" />
            Recovered by a workspace admin
          </h3>
          {recoveries.map((r) => (
            <p key={r.id} className="text-ui-sm text-ink-2">
              {shortDate(new Date(r.created_at))}: {r.reason}
            </p>
          ))}
        </section>
      ) : null}
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}
