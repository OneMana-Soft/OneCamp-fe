"use client"

// A doc that's out of the way, as a row with a way back (docs programme B5):
// the trash's entries and the archive's. Its title, who put it there and
// when, how many pages went with it, when it goes for good; Restore, and for
// someone who may, Delete for good after a confirmation. Restoring any page of
// a delete brings the whole delete back (A3).

import * as React from "react"
import { useRouter } from "next/navigation"

import { DocIcon } from "@/components/docEditor/DocIcon"
import { titleOf } from "@/components/doc/docRows"
import { pagesLeftInTrash, purgeWarning } from "@/components/docTree/docActions"
import { Button } from "@/components/ui/button"
import { ToastAction } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { docRestored } from "@/lib/docCache"
import { Loader2, Trash2 } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { agoOrDate, fullDateTime, shortDate } from "@/lib/utils/date/shortDate"
import { purgeDoc, restoreDoc } from "@/services/docGraphService"
import type { DocGraphPerson } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"

export interface RestoreRowProps {
  id: string
  title: string
  icon?: string
  /** When it was deleted or archived. */
  at?: string
  verb: "Deleted" | "Archived"
  by?: DocGraphPerson
  /** Pages that went with it. */
  subpages?: number
  /** When it goes for good on its own. */
  purgeAt?: string
  /** The viewer may delete it for good. */
  canPurge?: boolean
}

const dated = (raw: string | undefined) => {
  const d = raw ? new Date(raw) : null
  return d && !isNaN(d.getTime()) ? d : null
}

export function RestoreRow({ id, title, icon, at, verb, by, subpages = 0, purgeAt, canPurge }: RestoreRowProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState<"restore" | "purge" | null>(null)
  const when = dated(at)
  const goes = dated(purgeAt)
  const name = titleOf(title)
  const who = by ? displayNameOf(by) : ""

  const restore = async () => {
    setBusy("restore")
    try {
      await restoreDoc(id)
      docRestored(id)
      toast({
        title: `Restored “${name}”${subpages > 0 ? ` and ${subpages} ${subpages === 1 ? "page" : "pages"} inside` : ""}`,
        action: (
          <ToastAction altText={`Open ${name}`} onClick={() => router.push(`${app_doc_path}/${id}`)}>
            Open
          </ToastAction>
        ),
      })
    } catch {
      // The app's error toast has said why.
    } finally {
      setBusy(null)
    }
  }

  const purge = () =>
    confirm({
      title: `Delete “${name}” for good?`,
      description: purgeWarning(`“${name}”`, subpages),
      confirmText: "Delete for good",
      destructive: true,
      onConfirm: async () => {
        setBusy("purge")
        try {
          const res = await purgeDoc(id)
          toast({ title: `Deleted “${name}” for good`, description: pagesLeftInTrash(res.kept) })
        } catch {
          // The app's error toast has said why.
        } finally {
          setBusy(null)
        }
      },
    })

  return (
    <div data-restore-row={id} className="flex min-h-14 items-center gap-2.5 rounded-lg px-2 py-2 sm:min-h-12">
      <DocIcon icon={icon} id={id} size={16} />
      <div className="min-w-0 flex-1">
        <p className={title.trim() ? "truncate text-ui font-[450] text-ink" : "truncate text-ui font-[450] text-ink-3"}>
          {name}
          {subpages > 0 && <span className="ml-1.5 text-ui-sm font-normal text-ink-3">+ {subpages} {subpages === 1 ? "page" : "pages"} inside</span>}
        </p>
        <p className="text-meta text-ink-3 max-sm:line-clamp-2 sm:truncate">
          {when && (
            <span title={fullDateTime(when)}>
              {verb} {agoOrDate(when)}
              {who ? ` by ${who}` : ""}
            </span>
          )}
          {goes && (
            <span title={fullDateTime(goes)}>
              {when ? " · " : ""}goes for good on {shortDate(goes)}
            </span>
          )}
        </p>
      </div>
      {/* Delete for good before Restore, so every row's Restore lines up at the end. */}
      {canPurge && (
        <Button size="sm" variant="ghost" onClick={purge} disabled={!!busy} aria-label={`Delete “${name}” for good`} className="shrink-0 text-danger-ink max-sm:size-11 max-sm:p-0">
          {busy === "purge" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4 sm:hidden" aria-hidden="true" />}
          <span className="max-sm:hidden">Delete for good</span>
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => void restore()} disabled={!!busy} className="shrink-0 gap-1.5">
        {busy === "restore" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
        Restore
      </Button>
    </div>
  )
}
