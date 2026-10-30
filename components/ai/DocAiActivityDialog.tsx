"use client"

/**
 * "AI activity on this doc" (docs programme B9, ai-search-io P1-2; a dialog
 * registered for the doc's More menu, AI edition only): every AI edit someone
 * accepted here, what agents wrote or suggested, tasks made from the doc, and
 * what was refused, newest first. Each row is an entry in the workspace's
 * record (the admin audit log's hash chain, business/AI docAIRecord.go): its
 * text says what happened, never the text that was written. The foot links to
 * where a member checks their own record, with Prove it (Settings, Agents).
 */

import * as React from "react"
import Link from "next/link"
import { Ban, ListChecks } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Spark } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { getDocAIActivity, type DocAIActivityItem } from "@/lib/ai/docAIApi"

type Kind = "agent" | "refused" | "tasks" | "edit"

/** What a row is about, for its tile. Pure. */
export function kindOf(item: DocAIActivityItem): Kind {
  if (item.status === "refused" || item.action.endsWith(".refused")) return "refused"
  if (item.actor_kind === "agent") return "agent"
  if (item.action.startsWith("ai.doc.tasks.")) return "tasks"
  return "edit"
}

/** The row's second line: who, when, and its place in the record. Pure. */
export function metaOf(item: DocAIActivityItem, now = new Date()): { who: string; when: string; whenFull: string } {
  const at = new Date(item.at)
  const actor = item.actor?.trim() ?? ""
  const who = item.actor_kind === "agent" ? (actor ? `for ${actor}` : "") : actor
  return { who, when: agoOrDate(at, now), whenFull: fullDateTime(at) }
}

const TILE: Record<Kind, string> = {
  agent: "bg-agent-muted text-agent",
  refused: "bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-danger-ink",
  tasks: "bg-sunken text-ink-3 ring-1 ring-inset ring-line",
  edit: "bg-sunken text-ink-3 ring-1 ring-inset ring-line",
}

function Tile({ kind }: { kind: Kind }) {
  return (
    <span aria-hidden="true" className={cn("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-[7px]", TILE[kind])}>
      {kind === "refused" ? <Ban className="size-3.5" /> : kind === "tasks" ? <ListChecks className="size-3.5" /> : <Spark size={12} />}
    </span>
  )
}

export default function DocAiActivityDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const [open, setOpen] = React.useState(true)
  const [items, setItems] = React.useState<DocAIActivityItem[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    setFailed(false)
    getDocAIActivity(docId).then(
      (list) => {
        setItems(list)
        setLoading(false)
      },
      () => {
        setFailed(true)
        setLoading(false)
      },
    )
  }, [docId])

  React.useEffect(load, [load])

  const close = () => {
    setOpen(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg" data-doc-ai-activity="">
        <DialogHeader>
          <DialogTitle>AI activity on this doc</DialogTitle>
          <DialogDescription>
            AI edits accepted here, what agents wrote or suggested, and tasks made from the doc. Each is an entry in the workspace&apos;s
            record, which can&apos;t be edited.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <ErrorState compact subject="this doc's AI activity" onRetry={load} retrying={loading} />
        ) : items === null ? (
          <div role="status" aria-label="Loading this doc's AI activity">
            <SkeletonRows rows={3} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No AI activity yet"
            description="When someone accepts an AI edit here, or an agent writes in this doc, it's listed here."
          />
        ) : (
          <OverlayBody>
            <ul className="flex flex-col" aria-label="AI activity, newest first">
              {items.map((item) => {
                const kind = kindOf(item)
                const meta = metaOf(item)
                return (
                  <li key={`${item.seq}-${item.at}`} className="flex gap-3 border-b border-line py-2.5 last:border-b-0" data-ai-activity-row={kind}>
                    <Tile kind={kind} />
                    <div className="min-w-0 flex-1">
                      <p className="text-ui text-ink [overflow-wrap:anywhere]">{item.summary}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-meta text-ink-3">
                        {meta.who && <span className="min-w-0 truncate">{meta.who}</span>}
                        {meta.who && <span aria-hidden="true">·</span>}
                        <time dateTime={item.at} title={meta.whenFull}>
                          {meta.when}
                        </time>
                        {item.seq > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className="tabular-nums"
                              title="Its place in the workspace's record. Each entry carries the hash of the one before it, so an entry changed or removed later shows."
                            >
                              Entry {item.seq.toLocaleString("en-GB")}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </OverlayBody>
        )}
        <DialogFooter
          tertiary={
            <Link
              href="/app/settings/agents"
              title="Settings, Agents: what the AI did for you, and Prove it"
              className="rounded-sm text-ui-sm text-ink-2 underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            >
              Check your AI record
            </Link>
          }
        >
          <Button type="button" variant="secondary" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
