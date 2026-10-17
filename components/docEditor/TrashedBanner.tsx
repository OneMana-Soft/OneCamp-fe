"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import Link from "next/link"
import { Loader2, RotateCcw, Trash2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotError } from "@/components/ui/graphics"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { useConfirm } from "@/hooks/useConfirm"
import { docRestored } from "@/lib/docCache"
import { docCoverOf } from "@/lib/docLook"
import { displayNameOf } from "@/lib/personName"
import { shortDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { purgeDoc, restoreDoc } from "@/services/docGraphService"
import { pagesLeftInTrash, purgeWarning } from "@/components/docTree/docActions"
import { trashedKey } from "@/services/docChromeService"
import type { TrashedDocPage } from "@/types/docChrome"
import { DOC_EDITOR_CLASS } from "./useDocEditor"
import { snapshotHtml } from "./snapshotHtml"
import { DocIcon } from "./DocIcon"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { navigate } from "./chrome/pageFacts"
import "./chrome/look.css"
import CoverArt from "./chrome/CoverArt"


/**
 * A doc in the trash, for someone it was there for (E2): a banner that says
 * so, who deleted it and when, and when it goes for good, with Restore and
 * Delete for good for the people who may; under it, the doc as it was, read
 * only. It answers the server's 410, in the place the old DocDeleted page had.
 */
export function TrashedBanner({ docId, canRestore, onRestored }: { docId: string; canRestore: boolean; onRestored: () => void }) {
  const page = useFetch<{ data?: TrashedDocPage }>(trashedKey(docId), undefined, undefined, OWN_ERRORS)
  const doc = page.data?.data
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState<"restore" | "purge" | null>(null)
  const when = useRelativeTime(doc?.deleted_at ?? null)
  const may = doc ? doc.can_restore : canRestore

  const restore = async () => {
    setBusy("restore")
    try {
      await restoreDoc(docId, { ownErrors: true })
      toast({ title: "Doc restored", description: doc?.subpages ? `With ${doc.subpages} ${doc.subpages === 1 ? "page" : "pages"} deleted along with it.` : undefined })
      docRestored(docId)
      onRestored()
    } catch (e) {
      toast({ title: "Couldn't restore the doc", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }
  const purge = async () => {
    setBusy("purge")
    try {
      const res = await purgeDoc(docId, { ownErrors: true })
      toast({ title: "Deleted for good", description: pagesLeftInTrash(res.kept) })
      navigate("/app/doc")
    } catch (e) {
      toast({ title: "It's still in the trash", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }
  const askPurge = () =>
    confirm({
      title: "Delete this doc for good?",
      description: purgeWarning(`“${doc?.doc_title || "Untitled"}”`, doc?.subpages),
      confirmText: "Delete for good",
      destructive: true,
      onConfirm: () => void purge(),
    })

  if (!doc && page.isError) {
    // No page to show (an older server): say so, as before.
    return (
      <EmptyState
        illustration={<SpotError />}
        title="This doc was deleted"
        description={may ? "It's in the trash. Restoring it brings it back with anything deleted along with it." : "Its owner, its editors or a workspace admin can restore it. Ask one of them if you still need it."}
        headingLevel={2}
        className="py-20"
        action={
          <div className="flex items-center gap-2">
            {may ? (
              <Button size="sm" onClick={() => void restore()} disabled={!!busy} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Restore
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/doc">Back to docs</Link>
            </Button>
          </div>
        }
      />
    )
  }

  const by = doc?.deleted_by ? displayNameOf(doc.deleted_by) : ""
  const cover = docCoverOf(doc?.doc_cover_key)
  const where = doc?.archived ? "archived" : "in the trash"
  return (
    <div className="flex h-full flex-col bg-sheet" data-doc-trashed="">
      <div role="status" className="shrink-0 bg-[color-mix(in_oklab,var(--destructive)_9%,var(--sheet))] px-5 py-3 md:px-8" data-doc-trash-banner="">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-ui font-medium text-danger-ink">This doc is {where}</p>
            <p className="text-ui-sm text-ink-2">
              {[by && `${by} ${doc?.archived ? "archived" : "deleted"} it`, when, doc?.purge_at && `It goes for good on ${shortDate(new Date(doc.purge_at))}`].filter(Boolean).join(" · ") || "Loading…"}
              {doc?.subpages ? ` · ${doc.subpages} ${doc.subpages === 1 ? "page" : "pages"} went with it` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {may ? (
              <Button size="sm" onClick={() => void restore()} disabled={!!busy} className="gap-1.5" data-doc-restore="">
                {busy === "restore" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                Restore
              </Button>
            ) : (
              <span className="text-meta text-ink-3">Its owner, its editors or an admin can restore it.</span>
            )}
            {doc?.can_purge ? (
              <Button variant="destructive" size="sm" onClick={askPurge} disabled={!!busy} className="gap-1.5" data-doc-purge="">
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete for good
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="doc-scroll min-h-0 flex-1 overflow-y-auto [container-type:inline-size]" aria-busy={!doc}>
        <div className={cn("mx-auto flex w-full flex-col", doc?.doc_full_width ? "doc-measure-full" : "doc-measure")}>
          <div className="pb-6" data-doc-title-block="" data-doc-font={doc?.doc_font || undefined} data-doc-small={doc?.doc_small_text ? "" : undefined} data-has-cover={cover ? "" : undefined}>
            {cover ? (
              <div className="doc-cover">
                <CoverArt cover={cover} offset={doc?.doc_cover_offset} />
              </div>
            ) : null}
            <div className={cn("px-5 md:px-8", cover ? "pt-4" : "pt-8 md:pt-14")}>
              {doc?.doc_icon ? (
                <span className="doc-page-icon">
                  <DocIcon icon={doc.doc_icon} id={docId} size={64} />
                </span>
              ) : null}
              <h1 className="doc-title m-0 text-ink">{doc ? doc.doc_title || "Untitled" : ""}</h1>
            </div>
          </div>
          {doc?.doc_body ? (
            <div className={cn(DOC_EDITOR_CLASS, "pb-16 opacity-80")}>
              <SafeHtml html={doc.doc_body} sanitizer={snapshotHtml} className="ProseMirror" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default TrashedBanner
