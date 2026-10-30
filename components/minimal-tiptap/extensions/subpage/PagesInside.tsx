"use client"

import * as React from "react"
import type { Editor } from "@tiptap/core"
import type { Transaction } from "@tiptap/pm/state"
import { Button } from "@/components/ui/button"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { PagedListFooter, usePagedList, type ListPage } from "@/components/doc/usePagedList"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { useLiveEntity, type DocChipData } from "@/lib/liveEntity"
import { childrenKey, type Envelope } from "@/services/docGraphService"
import type { DocChildren, TreeNodeJSON } from "@/types/docGraph"
import { isLeaving, pagesHeld, touchesPages, watchLeaving } from "./leaving"

/*
 * Pages inside (docs C7a part 4): at a doc's foot, the pages inside it that
 * its body holds no block of: made before blocks followed pages, kept by B1's
 * move of their blocks or an agent's rewrite, moved up by a delete. Each opens,
 * and someone who may edit the body adds its block at the end (as the server
 * places one), or all of them at once. Nothing shows while the tree is read,
 * or when every page inside has its block.
 */

/** A page of the tree's answer: the most the server sends at once. */
const PAGE = 100
/**
 * Pages of the tree read on their own while the body holds a block of every
 * page read so far; past them (a doc of more than 500 pages inside), the list
 * waits for Show more.
 */
const READ_ON = 5

type PageInside = TreeNodeJSON & { uuid: string }

// Module-level, so a page's rows are read once per answer: pages only, not a
// folder, file or link (docs F1), nor one the reader can't open.
const readLevel = (d: Envelope<DocChildren>): ListPage<PageInside> => ({
  items: (d?.data?.nodes ?? []).filter((n): n is PageInside => !!n.uuid && !n.redacted && !n.node_kind),
  count: d?.data?.count ?? 0,
  next: d?.data?.next_cursor || undefined,
})
const uuidOf = (n: PageInside) => n.uuid

/** The pages the body holds a block of, read again only after a change that adds or takes one. */
function useHeld(editor: Editor): Set<string> {
  const [held, setHeld] = React.useState(() => ({ editor, pages: pagesHeld(editor.state.doc) }))
  // The doc's editor made again (its blocks changed): its body, read now.
  if (held.editor !== editor) setHeld({ editor, pages: pagesHeld(editor.state.doc) })
  React.useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (touchesPages(transaction)) setHeld({ editor, pages: pagesHeld(transaction.doc) })
    }
    editor.on("transaction", onTransaction)
    return () => void editor.off("transaction", onTransaction)
  }, [editor])
  return held.pages
}

/** Draws again when a page starts or stops leaving (its block deleted, its trash on its way). */
function useLeaving() {
  const [, redraw] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => watchLeaving(redraw), [])
}

/**
 * One page inside, kept live: its title and icon as they are now, and gone
 * from the list once it is trashed or moved out (Doc_Meta reads it again).
 * Says whether it is still inside, for the list's heading and Add all.
 */
function PageRow({ page, docId, canAdd, onInside, onAdd }: { page: PageInside; docId: string; canAdd: boolean; onInside(uuid: string, inside: boolean): void; onAdd(uuid: string, button: HTMLButtonElement): void }) {
  const live = useLiveEntity<DocChipData>("doc", page.uuid)
  const inside = live.state === "loading" || live.state === "error" || (live.state === "ok" && live.data?.parent_id === docId)
  React.useEffect(() => onInside(page.uuid, inside), [onInside, page.uuid, inside])
  if (!inside) return null
  const now = live.state === "ok" ? live.data : undefined
  const title = (now?.title ?? page.title ?? "").trim()
  return (
    <li data-page-inside={page.uuid} className="flex items-center gap-1">
      <IntentLink
        href={`/app/doc/${page.uuid}`}
        className="flex min-h-[34px] min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-ink transition-colors duration-[140ms] ease-[var(--ease-out)] hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none pointer-coarse:min-h-11"
      >
        <span className="inline-flex size-[18px] shrink-0 items-center justify-center">
          <DocIcon icon={now ? now.icon : page.icon} id={page.uuid} size={18} />
        </span>
        <span className="min-w-0 truncate font-[510] underline decoration-line-3 decoration-1 underline-offset-[3px]">{title || <span className="text-ink-3">Untitled</span>}</span>
      </IntentLink>
      {canAdd ? (
        <Button type="button" variant="ghost" size="sm" data-add-page="" aria-label={`Add to page, “${title || "Untitled"}”`} className="shrink-0" onClick={(e) => onAdd(page.uuid, e.currentTarget)}>
          Add to page
        </Button>
      ) : null}
    </li>
  )
}

export default function PagesInside({ docId, editor }: SlotProps) {
  // A doc of its own: its list starts again from its first page.
  return editor ? <PagesInsideList key={docId} docId={docId} editor={editor} /> : null
}

function PagesInsideList({ docId, editor }: { docId: string; editor: Editor }) {
  const keyOf = React.useCallback((cursor?: string) => childrenKey(docId, { limit: PAGE, cursor }), [docId])
  const list = usePagedList(keyOf, readLevel, uuidOf)
  const held = useHeld(editor)
  useLeaving()
  const [out, setOut] = React.useState<ReadonlySet<string>>(() => new Set())
  const onInside = React.useCallback((uuid: string, inside: boolean) => {
    setOut((was) => {
      if (was.has(uuid) !== inside) return was
      const next = new Set(was)
      if (inside) next.delete(uuid)
      else next.add(uuid)
      return next
    })
  }, [])
  const missing = list.items.filter((p) => !held.has(p.uuid) && !isLeaving(p.uuid))
  const shown = missing.filter((p) => !out.has(p.uuid))
  const canAdd = editor.isEditable

  // Read on while every page read so far has its block, up to READ_ON pages.
  const pagesRead = React.useRef(1)
  const { isLoading, hasMore, loadMore } = list
  React.useEffect(() => {
    if (isLoading || !hasMore || shown.length || pagesRead.current >= READ_ON) return
    pagesRead.current += 1
    loadMore()
  }, [isLoading, hasMore, loadMore, shown.length])

  // A keyboard's Add takes its row away: focus goes to the next row's Add.
  const section = React.useRef<HTMLElement>(null)
  const refocus = React.useRef<number | null>(null)
  React.useEffect(() => {
    const at = refocus.current
    if (at === null) return
    refocus.current = null
    const adds = section.current?.querySelectorAll<HTMLButtonElement>("[data-add-page]")
    adds?.[Math.min(at, adds.length - 1)]?.focus()
  }, [shown.length])

  const add = (pages: string[]) => {
    if (!pages.length || editor.isDestroyed || !editor.isEditable) return
    // Not in the editor's history: its Undo would take the block out again,
    // and a child page whose block the person takes out goes to the trash.
    editor
      .chain()
      .insertContentAt(
        editor.state.doc.content.size,
        pages.map((uuid) => ({ type: "subpage", attrs: { docId: uuid } })),
      )
      .setMeta("addToHistory", false)
      .run()
  }
  const addOne = (uuid: string, button: HTMLButtonElement) => {
    if (document.activeElement === button) refocus.current = shown.findIndex((p) => p.uuid === uuid)
    add([uuid])
  }

  const headingId = React.useId()
  if (list.isLoading && !list.items.length) return list.loaders
  if (list.isError) {
    return (
      <>
        {list.loaders}
        <p role="alert" data-pages-inside="" data-doc-foot="" className="mb-8 mt-6 flex flex-wrap items-center gap-x-2 px-1.5 text-ui-sm text-ink-3">
          <SaysLoadFailure />
          Couldn&apos;t load the pages inside this one.
          <button type="button" onClick={list.retry} className="font-medium text-ink-2 underline-offset-2 hover:underline">
            Try again
          </button>
        </p>
      </>
    )
  }
  const offerMore = list.hasMore && (shown.length > 0 || pagesRead.current >= READ_ON)
  return (
    <>
      {list.loaders}
      {/* Rows stay drawn, hidden, while none is inside: each keeps its live read. */}
      <section ref={section} aria-labelledby={headingId} data-pages-inside="" data-doc-foot="" hidden={!shown.length} className="mb-8 mt-6 flex flex-col gap-0.5">
        <div className="flex min-h-8 items-center gap-2 px-1.5">
          <h2 id={headingId} className="text-meta font-medium text-ink-3">
            Pages inside
          </h2>
          <span aria-hidden="true" className="rounded-sm bg-hover px-1.5 text-meta tabular-nums text-ink-3">
            {shown.length}
          </span>
          {canAdd && shown.length > 1 ? (
            <Button type="button" variant="ghost" size="sm" aria-label="Add all to page" className="ml-auto" onClick={() => add(shown.map((p) => p.uuid))}>
              Add all
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-0.5">
          {missing.map((p) => (
            <PageRow key={p.uuid} page={p} docId={docId} canAdd={canAdd} onInside={onInside} onAdd={addOne} />
          ))}
        </ul>
        {list.moreFailed || (list.isLoading && shown.length) ? (
          <PagedListFooter what="pages" failed={list.moreFailed} loading={list.isLoading} onRetry={list.retryMore} />
        ) : offerMore ? (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={list.loadMore}>
            Show more
          </Button>
        ) : null}
      </section>
    </>
  )
}
