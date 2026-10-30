"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ArrowLeft, ArrowRightToLine, ChevronRight, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/ui/search-input"
import { ToastAction } from "@/components/ui/toast"
import { NodeMark, markOfRow } from "@/components/docFiles/NodeMark"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { holdsChildren } from "@/lib/docs/docNode"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { isComposingKey } from "@/lib/keys/ime"
import { ancestorsKey, childrenKey, listKey, type Envelope } from "@/services/docGraphService"
import { searchDocs, type FoundDoc } from "@/services/docChromeService"
import { moveAll, moveReason, planMove, type MoveItem, type MoveStop } from "@/lib/docMove"
import type { DocAncestors, DocChildren, DocList, DocMovePreview, DocMoveTarget, DocSpace } from "@/types/docGraph"
import { DocIcon } from "./DocIcon"
import { ChromeSheet } from "./chrome/Sheet"
import { ChoiceCards, InlineError } from "./chrome/parts"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { navigate } from "./chrome/pageFacts"
import { peekStagedDrop, releaseStagedDrop } from "./chrome/stagedDrop"
import { peekStagedMove, releaseStagedMove } from "./chrome/stagedMove"
import { useHandoff } from "@/hooks/useHandoff"
import { useDoc } from "./chrome/useDoc"


/** Where something can go: a page or a folder, or the top of its space. */
interface Target {
  uuid: string | null
  title: string
  icon?: string
  path?: string
}

/** How many places a level of Docs & Files lists. */
const LEVEL_LIMIT = 100

/** Docs the search finds, as it is typed (180 ms after the last key), newest answer only. */
function useFoundDocs(query: string): { docs: FoundDoc[] | null; failed: boolean } {
  const [state, setState] = React.useState<{ docs: FoundDoc[] | null; failed: boolean }>({ docs: null, failed: false })
  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setState({ docs: null, failed: false })
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      searchDocs(q, ctl.signal)
        .then((docs) => setState({ docs, failed: false }))
        .catch(() => {
          if (!ctl.signal.aborted) setState({ docs: [], failed: true })
        })
    }, 180)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query])
  return state
}

/** What a move's access prompt says, from the server's preview (A5). Pure. */
export function adoptWording(p: Pick<DocMovePreview, "pages">, parent: string): { label: string; description: string } {
  const n = (p.pages ?? 1) - 1
  const pages = n === 1 ? " So does the page under it that you have full access to." : n > 1 ? ` So do the ${n} pages under it that you have full access to.` : ""
  return { label: "Use the new parent's access", description: `The same people and teams as “${parent}” can open it.${pages}` }
}

/**
 * What keeping its access means, from the preview: a move into a project's
 * or team's space, or out of one, changes who can open the page all the
 * same. Pure.
 */
export function keepWording(p: Pick<DocMovePreview, "space" | "was">): string {
  if (p.space) return `Its own people and teams keep it, and everyone in “${p.space.name}” can open it too.`
  if (p.was) return `Its own people and teams keep it, and being in “${p.was.name}” no longer opens it.`
  return "Everyone who can open it now still can, and nobody else."
}

const itemsWord = (items: MoveItem[]) => (items.length === 1 ? `“${items[0].title.trim() || "Untitled"}”` : `${items.length} items`)

/** What Move to… moves. */
export type MoveToProps = { onClose(): void } & (
  /** The open page (More), the blocks B1 staged from it, or a page dropped on a breadcrumb. */
  | { docId: string }
  /** Rows of Docs & Files, one or several, and the way down to where they are, the top first. */
  | { items: MoveItem[]; space?: DocSpace; start: MoveStop[] }
)

/**
 * Move to… (B6; structure.md P0.5, PROGRAM D-1 "moving a page asks what to
 * do about access"), for the open page and for Docs & Files' rows, one or
 * several (docs F1b). The open page searches for where it goes, or chooses
 * the top of Docs; rows go down a level at a time from where they are (the
 * pages and folders there: a file or a link holds nothing, and nothing goes
 * into itself), and Move here moves them to the level shown. Every move is
 * planned as every other way of moving one plans it (planMove): when it
 * would change who can open it, it says how many people lose or gain access,
 * and why, and asks: into a page, the open page may keep its access or use
 * the new parent's; rows keep theirs, as a drag does. Undo puts what moved
 * back where it was (lib/docMove moveAll). Opened from B1's block menu with
 * blocks staged, it moves those blocks instead ("Move 3 blocks to…"), or
 * with a child page's block, it moves that page (its block follows it, docs
 * C7a).
 */
export default function MoveToDialog(props: MoveToProps) {
  const { onClose } = props
  const rows = "items" in props ? props : null
  const openDocId = "docId" in props ? props.docId : ""
  const staged = useHandoff(() => (openDocId ? peekStagedMove(openDocId) : null), releaseStagedMove)
  // Another page to move: dropped on a breadcrumb, its new parent already
  // chosen, or a child page's block, its new parent to choose here.
  const drop = useHandoff(() => (openDocId && !staged ? peekStagedDrop(openDocId) : null), releaseStagedDrop)
  const docId = drop?.page.uuid ?? openDocId
  const doc = useDoc(docId)
  const above = useFetch<Envelope<DocAncestors>>(docId && !staged ? ancestorsKey(docId) : "", undefined, undefined, OWN_ERRORS).data?.data
  const recent = useFetch<Envelope<DocList>>(rows ? "" : listKey("recent", { limit: 12 }), undefined, undefined, OWN_ERRORS).data?.data
  const title = (drop && drop.page.uuid !== openDocId ? drop.page.title : doc?.doc_title)?.trim() || "Untitled"
  const parentNow = above?.ancestors?.[above.ancestors.length - 1]
  const items = React.useMemo<MoveItem[]>(() => rows?.items ?? [{ id: docId, title, from: parentNow?.uuid ?? null }], [rows?.items, docId, title, parentNow?.uuid])
  const space: DocSpace = rows?.space ?? "workspace"
  const [chosen, setChosen] = React.useState<Target | null>(null)
  const [preview, setPreview] = React.useState<DocMovePreview | null>(null)
  const [access, setAccess] = React.useState<"keep" | "adopt">("adopt")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  /** Where an item goes: under a page or a folder, or the top of its space. */
  const moveTarget = (item: MoveItem, target: Target): DocMoveTarget => ({ doc_uuid: item.id, ...(target.uuid ? { parent_uuid: target.uuid } : { space }), place: "last" })

  const finish = async (target: Target, how: "keep" | "adopt") => {
    setBusy(true)
    setError("")
    try {
      if (staged) {
        await staged.moveTo(target.uuid!)
        toast({
          title: `Moved ${staged.count === 1 ? "1 block" : `${staged.count} blocks`} to “${target.title}”`,
          action: (
            <ToastAction altText={`Open ${target.title}`} onClick={() => navigate(`/app/doc/${target.uuid}`)}>
              Open
            </ToastAction>
          ),
        })
        onClose()
        return
      }
      const done = await moveAll(items, (item) => ({ ...moveTarget(item, target), access: target.uuid ? how : "keep" }), space)
      if (done.error !== undefined) {
        const why = apiErrorMessage(done.error, done.moved.length ? "The rest didn't." : items.length === 1 ? "It didn't move. Try again in a moment." : "Nothing moved. Try again in a moment.")
        setError(done.moved.length ? `${done.moved.length} of ${items.length} moved. ${why}` : why)
        return
      }
      const one = items.length === 1
      const undo = done.undo
      toast({
        title: rows ? `Moved ${itemsWord(items)} to “${target.title.trim() || "Untitled"}”` : target.uuid ? `Moved to “${target.title}”` : "Moved to the top of Docs",
        description: done.results.some((r) => r.access === "adopt") ? "It has its new parent's access now." : undefined,
        action: undo ? (
          <ToastAction
            altText={one ? "Move it back" : "Move them back"}
            onClick={() =>
              void undo().catch((e: unknown) =>
                toast({ variant: "destructive", title: one ? "It didn't move back" : "They didn't move back", description: apiErrorMessage(e, one ? "Move it from its new place." : "Move them from their new place.") }),
              )
            }
          >
            Undo
          </ToastAction>
        ) : undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error && staged ? e.message : apiErrorMessage(e, "It didn't move. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  const choose = async (target: Target) => {
    setError("")
    if (staged) return void finish(target, "keep")
    setChosen(target)
    setBusy(true)
    try {
      // The open page may take its new parent's access; rows keep theirs, as a drag does.
      let how: "keep" | "adopt" = "keep"
      for (const item of items) {
        const plan = await planMove(moveTarget(item, target), !rows)
        if (plan.ask) {
          setPreview(plan.preview)
          setAccess(plan.preview.lose || rows ? "keep" : "adopt")
          return
        }
        how = plan.access
      }
      await finish(target, how)
    } catch (e) {
      setChosen(null)
      setError(apiErrorMessage(e, "Couldn't check who'd have access there. Try again."))
    } finally {
      setBusy(false)
    }
  }

  // A dropped page goes straight to the question about its access.
  const asked = React.useRef(false)
  React.useEffect(() => {
    const target = drop?.target
    if (!target || asked.current) return
    asked.current = true
    void choose({ uuid: target.uuid, title: target.title, icon: target.icon })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the staged drop
  }, [drop])

  const heading = staged ? `Move ${staged.count === 1 ? "1 block" : `${staged.count} blocks`} to…` : drop && !drop.page.title && drop.page.uuid !== openDocId ? "Move the page to…" : `Move ${itemsWord(items)} to…`

  if (chosen && preview) {
    const adopt = adoptWording(preview, chosen.title)
    const reason = items.length === 1 ? moveReason(preview, items[0].title.trim() || "Untitled") : null
    const where = chosen.uuid || rows ? `into “${chosen.title.trim() || "Untitled"}”` : "to the top of Docs"
    return (
      <ChromeSheet
        onClose={onClose}
        title={preview.summary}
        description={`Moving ${itemsWord(items)} ${where}.${reason ? ` ${reason}` : ""}`}
        data-doc-move-dialog="access"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setChosen(null)
                setPreview(null)
              }}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </Button>
            <Button size="sm" busy={busy} onClick={() => void finish(chosen, access)} data-doc-move-confirm="">
              Move
            </Button>
          </>
        }
      >
        {/* Rows keep their access, and to the top of Docs there is no parent's access to take: the question is the move. */}
        {chosen.uuid && !rows ? (
          <ChoiceCards
            label="What happens to who can open it"
            value={access}
            onChange={setAccess}
            choices={[
              { value: "keep", label: "Keep its current access", description: keepWording(preview) },
              { value: "adopt", label: adopt.label, description: adopt.description },
            ]}
          />
        ) : null}
        <InlineError>{error}</InlineError>
      </ChromeSheet>
    )
  }

  if (rows) return <ChooseLevel items={items} space={rows.space} start={rows.start} heading={heading} busy={busy} error={error} onChoose={choose} onClose={onClose} />
  return <ChoosePage docId={docId} parentNow={parentNow?.uuid} staged={!!staged} recent={recent} heading={heading} busy={busy} chosen={chosen} error={error} onChoose={choose} onClose={onClose} />
}

/** The open page's places: the search's answers, or recent pages and the top of Docs. */
function ChoosePage({
  docId,
  parentNow,
  staged,
  recent,
  heading,
  busy,
  chosen,
  error,
  onChoose,
  onClose,
}: {
  docId: string
  parentNow?: string
  staged: boolean
  recent?: DocList
  heading: string
  busy: boolean
  chosen: Target | null
  error: string
  onChoose: (target: Target) => void
  onClose: () => void
}) {
  const [query, setQuery] = React.useState("")
  const found = useFoundDocs(query)
  const [active, setActive] = React.useState(0)
  const listId = React.useId()

  const options: Target[] = React.useMemo(() => {
    const rows: Target[] = []
    if (!staged && !query.trim() && parentNow) rows.push({ uuid: null, title: "Docs", path: "The top level, under no page" })
    const docs = found.docs ?? (query.trim() ? [] : (recent?.docs ?? []).map((d) => ({ doc_uuid: d.doc_uuid, doc_title: d.doc_title, doc_icon: d.doc_icon, path: d.path })))
    for (const d of docs as (FoundDoc & { path?: { doc_title?: string; redacted?: boolean }[] })[]) {
      if (d.doc_uuid === docId || d.doc_uuid === (staged ? undefined : parentNow)) continue
      rows.push({ uuid: d.doc_uuid, title: d.doc_title?.trim() || "Untitled", icon: d.doc_icon, path: d.path?.map((c) => (c.redacted ? "…" : c.doc_title || "Untitled")).join(" › ") || undefined })
    }
    return rows
  }, [staged, query, found.docs, recent, docId, parentNow])

  React.useEffect(() => setActive(0), [query])

  return (
    <ChromeSheet onClose={onClose} title={heading} size="md" data-doc-move-dialog="choose">
      <div>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search for a page"
          aria-label="Search for a page"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          onKeyDown={(e) => {
            // An input method's Enter picks its word: it never moves the page.
            if (isComposingKey(e.nativeEvent)) return
            if (e.key === "ArrowDown" && options.length) {
              e.preventDefault()
              setActive((i) => (i + 1) % options.length)
            } else if (e.key === "ArrowUp" && options.length) {
              e.preventDefault()
              setActive((i) => (i - 1 + options.length) % options.length)
            } else if (e.key === "Enter" && options[active] && !busy) {
              e.preventDefault()
              onChoose(options[active])
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="px-1 text-meta font-medium text-ink-3">{query.trim() ? "Pages" : "Recent"}</p>
        <ul id={listId} role="listbox" aria-label="Where to move it" className="flex max-h-[min(50dvh,320px)] flex-col overflow-y-auto">
          {options.map((o, i) => (
            <li
              key={o.uuid ?? "top"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => !busy && onChoose(o)}
              data-doc-move-target={o.uuid ?? "top"}
              className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5", i === active && "bg-hover")}
            >
              {o.uuid ? <DocIcon icon={o.icon} id={o.uuid} size={18} /> : <ArrowRightToLine aria-hidden="true" className="size-[18px] text-ink-3" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui text-ink">{o.title}</span>
                {o.path ? <span className="truncate text-meta text-ink-3">{o.path}</span> : null}
              </span>
              {busy && chosen?.uuid === o.uuid ? <Loader2 aria-label="Checking" className="size-4 animate-spin text-ink-3" /> : null}
            </li>
          ))}
          {options.length === 0 ? (
            <li className="px-2 py-6 text-center text-ui-sm text-ink-3">
              {found.failed ? "Search isn't answering. Try again in a moment." : query.trim() ? (found.docs ? "No page is called that. Try another word." : "Searching…") : "Search for the page to move it into."}
            </li>
          ) : null}
        </ul>
      </div>
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}

/**
 * Rows' places, a level at a time from where they are: the pages and folders
 * there, each opening the level inside it, and Back up the way it came. Move
 * here chooses the level shown.
 */
function ChooseLevel({
  items,
  space,
  start,
  heading,
  busy,
  error,
  onChoose,
  onClose,
}: {
  items: MoveItem[]
  space?: DocSpace
  start: MoveStop[]
  heading: string
  busy: boolean
  error: string
  onChoose: (target: Target) => void
  onClose: () => void
}) {
  const [path, setPath] = React.useState<MoveStop[]>(start)
  const at = path[path.length - 1] ?? { id: null, title: "" }
  const moving = React.useMemo(() => new Set(items.map((i) => i.id)), [items])
  const key = at.id ? childrenKey(at.id, { limit: LEVEL_LIMIT }) : space ? childrenKey(null, { space, limit: LEVEL_LIMIT }) : ""
  const level = useFetch<Envelope<DocChildren>>(key, undefined, undefined, OWN_ERRORS)
  const places = (level.data?.data?.nodes ?? []).filter((n) => n.uuid && !n.redacted && holdsChildren(n.node_kind) && !moving.has(n.uuid))
  // Where they all are already: moving them there would change nothing.
  const here = items.every((i) => i.from === at.id)
  const where = at.title.trim() || "Untitled"
  const up = path.length > 1 ? path[path.length - 2] : null

  return (
    <ChromeSheet
      onClose={onClose}
      title={heading}
      size="md"
      data-doc-move-dialog="choose"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} disabled={here} onClick={() => onChoose({ uuid: at.id, title: at.title })} className="gap-1.5">
            Move here
          </Button>
        </>
      }
    >
      <div className="flex min-h-9 items-center gap-1.5">
        {up ? (
          <button
            type="button"
            aria-label={`Back to ${up.title.trim() || "Untitled"}`}
            onClick={() => setPath((p) => p.slice(0, -1))}
            {...ix("icon")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-2"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <span className="min-w-0 truncate text-ui font-medium text-ink" data-move-at={at.id ?? "top"}>
          {where}
        </span>
        {here ? <span className="shrink-0 text-meta text-ink-3">· where {items.length === 1 ? "it is" : "they are"} now</span> : null}
      </div>
      {level.isLoading && !level.data ? (
        <div className="flex h-24 items-center justify-center text-ink-3">
          <Loader2 className="size-4 animate-spin" aria-label="Loading" />
        </div>
      ) : places.length === 0 ? (
        <p className="rounded-xl bg-sunken px-3 py-6 text-center text-ui-sm text-ink-3">Nothing to move into here.</p>
      ) : (
        <ul aria-label="Places to move to" className="flex max-h-[min(50dvh,340px)] flex-col gap-px overflow-y-auto">
          {places.map((n) => (
            <li key={n.uuid}>
              <button
                type="button"
                aria-label={n.title?.trim() || "Untitled"}
                onClick={() => setPath((p) => [...p, { id: n.uuid!, title: n.title ?? "" }])}
                {...ix("row", { hue: undefined })}
                className="group flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui text-ink pointer-coarse:h-12"
              >
                <NodeMark node={markOfRow(n)} size={16} />
                <span className="min-w-0 flex-1 truncate">{n.title?.trim() || "Untitled"}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform duration-[140ms] group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}
