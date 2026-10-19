"use client"

/**
 * A row's comments, in its record (tables A8; business/TableComments): the
 * threads on the row and on its cells, newest conversation last, each one the
 * docs' thread card (B7's ThreadCard: replies, resolve and reopen, edit and
 * delete your own, react, a moderator's delete), and a box to start one, on
 * the row or on the cell its field's comment button named. Notion and Airtable
 * comment on a record; here a comment can also sit on one cell, and the
 * people it mentions are told only if they may open the row.
 *
 * Its own chunk (RecordPanel loads it): the editor and the thread cards never
 * ride in with the grid. Loading, an error and nothing yet are each said.
 */
import * as React from "react"
import { Loader2, MessageSquare, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { ThreadCard } from "@/components/docComments/ThreadCard"
import { CommentComposer } from "@/components/docComments/CommentComposer"
import { setUi } from "@/components/docComments/commentsUi"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ThreadView } from "@/components/threads/types"
import type { Anchor } from "@/lib/anchors/types"
import type { TableField } from "@/services/tableService"
import type { UserProfileInterface } from "@/types/user"
import { useRowThreads } from "./useRowThreads"
import { commentCounts, threadPlace } from "./rowThreads"

export interface RowCommentsProps {
  rowId: string
  fields: TableField[]
  /** A field whose cell a new comment goes on (its comment button was chosen); null for the row. */
  target: string | null
  /** The comment box let go of the cell: a comment on it was sent, or the person chose the row. */
  onTargetDone: () => void
  /** A thread to open at (a link named it). */
  focusThread?: string | null
  /** Each field's count of comments in open threads on its cell, as they change. */
  onCellCounts?: (counts: Record<string, number>) => void
}

export default function RowComments({ rowId, fields, target, onTargetDone, focusThread, onCellCounts }: RowCommentsProps) {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data
  const t = useRowThreads(rowId, me)
  // The thread cards' shared state (which is active), one per row.
  const uiKey = `table_row:${rowId}`
  const [showResolved, setShowResolved] = React.useState(false)

  const open = t.threads.filter((x) => x.status === "open")
  const resolved = t.threads.filter((x) => x.status === "resolved")
  const { total, byField } = React.useMemo(() => commentCounts(t.threads), [t.threads])

  React.useEffect(() => {
    onCellCounts?.(byField)
  }, [byField, onCellCounts])

  // A link named a thread: open it, and bring it into view once it's there.
  React.useEffect(() => {
    if (!focusThread || !t.threads.some((x) => x.id === focusThread)) return
    if (resolved.some((x) => x.id === focusThread)) setShowResolved(true)
    setUi(uiKey, { active: focusThread })
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(focusThread)}"]`)?.scrollIntoView({ block: "center" })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once a named thread arrives
  }, [focusThread, t.threads.length])

  const placeOf = React.useCallback((thread: ThreadView) => threadPlace(thread, fields), [fields])
  const targetField = target ? fields.find((f) => f.id === target) : undefined

  const send = async (body: { body: string }) => {
    const anchor: Anchor = targetField ? { kind: "cell", meta: { field: targetField.id } } : { kind: "none" }
    const made = await t.create(anchor, { body: body.body })
    setUi(uiKey, { active: made.id })
    if (targetField) onTargetDone()
  }

  const card = (thread: ThreadView) => (
    <ThreadCard key={thread.id} docId={uiKey} thread={thread} actions={t.actions} placeOf={placeOf} uploads={false} />
  )

  return (
    <section data-row-comments="" aria-label="Comments" className="mt-6">
      <h3 className="flex h-8 items-center gap-1.5 text-ui-sm font-medium text-ink-2">
        <MessageSquare className="size-3.5 text-ink-3" aria-hidden="true" />
        Comments
        {total > 0 ? <span className="font-normal text-ink-3">· {total}</span> : null}
      </h3>

      {t.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-meta text-danger-ink">
          {t.error || "Couldn't read this row's comments."}
          <Button size="sm" variant="ghost" onClick={() => void t.refresh()}>
            Try again
          </Button>
        </div>
      ) : t.status === "loading" && t.threads.length === 0 ? (
        <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Reading the comments" />
      ) : open.length === 0 && resolved.length === 0 ? (
        <p className="text-meta text-ink-3">No comments yet. Ask a question, or leave a note for whoever picks this row up.</p>
      ) : null}

      {open.length > 0 ? <div className="mt-1 space-y-2">{open.map(card)}</div> : null}

      {resolved.length > 0 ? (
        <>
          <Button size="sm" variant="ghost" className="-mx-2 mt-1 text-ink-3" aria-expanded={showResolved} onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Hide resolved" : resolved.length === 1 ? "Show 1 resolved thread" : `Show ${resolved.length} resolved threads`}
          </Button>
          {showResolved ? <div className="mt-1 space-y-2">{resolved.map(card)}</div> : null}
        </>
      ) : null}

      <div className="mt-3" data-row-comment-box="">
        {targetField ? (
          <div className="mb-1.5 flex items-center gap-1 text-meta text-ink-2" data-comment-target={targetField.id}>
            <span className="truncate">On {targetField.name}</span>
            <button
              type="button"
              aria-label="Comment on the whole row instead"
              onClick={onTargetDone}
              data-touch-target=""
              className="flex size-6 items-center justify-center rounded-md text-ink-3 transition-colors duration-[140ms] ease-out hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <CommentComposer
          // A new box for a new target: what was typed for the row stays with the row.
          key={targetField?.id ?? "row"}
          docId={uiKey}
          placeholder={targetField ? `Comment on ${targetField.name}…` : "Add a comment…"}
          label={targetField ? `Comment on ${targetField.name}` : "Comment on this row"}
          sendLabel="Comment"
          uploads={false}
          autoFocus={!!targetField}
          onSend={send}
          onCancel={targetField ? onTargetDone : undefined}
        />
      </div>
    </section>
  )
}

