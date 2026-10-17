"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ChevronRight, Ellipsis } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToastAction } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { cn } from "@/lib/utils/helpers/cn"
import { ancestorsKey, getAncestors, moveDoc, renameDoc, type Envelope } from "@/services/docGraphService"
import { planMove } from "@/lib/docMove"
import store from "@/store/store"
import { DocBusContext } from "@/components/docEditor/registry/commandBus"
import type { DocCommandBus, SlotProps } from "@/components/docEditor/registry/types"
import { stageDrop } from "./chrome/stagedDrop"
import type { DocAncestors, DocMoveTarget, TreeNodeJSON } from "@/types/docGraph"
import { DocIcon } from "./DocIcon"
import { isComposingKey } from "@/lib/keys/ime"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { usePageFacts } from "./chrome/pageFacts"
import { useDoc } from "./chrome/useDoc"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One step of a path: a page (named, or one the viewer can't open), or the hidden middle. */
export type Crumb = { kind: "page"; node: TreeNodeJSON } | { kind: "hidden"; count: number } | { kind: "more"; nodes: TreeNodeJSON[]; hidden: number }

/**
 * A path as the breadcrumb shows it (P1, structure.md P0.5): every page above
 * the doc, the top first. Pages the viewer can't open are one "…" each run
 * of them, never named (I12). Past 3 levels (the doc counted), the middle
 * collapses into "…", a menu of the pages it holds: the top page and the
 * doc's parent stay. Pure.
 */
export function crumbsOf(ancestors: TreeNodeJSON[]): Crumb[] {
  const steps: Crumb[] = []
  for (const node of ancestors) {
    const last = steps[steps.length - 1]
    if (node.redacted || !node.uuid) {
      if (last?.kind === "hidden") last.count++
      else steps.push({ kind: "hidden", count: 1 })
    } else steps.push({ kind: "page", node })
  }
  if (steps.length <= 2) return steps
  const middle = steps.slice(1, -1)
  const named = middle.flatMap((s) => (s.kind === "page" ? [s.node] : []))
  const hidden = middle.reduce((n, s) => n + (s.kind === "hidden" ? s.count : 0), 0)
  const more: Crumb = named.length ? { kind: "more", nodes: named, hidden } : { kind: "hidden", count: hidden }
  return [steps[0], more, steps[steps.length - 1]]
}

/**
 * Moves a page dropped on a crumb under that crumb's page, or dropped on Docs
 * to the top. It plans the move as every move is planned (planMove): when it
 * would change who can open the page, it asks first, in Move to… with the
 * page and where it goes chosen (PROGRAM §3.2), and never moves it unasked;
 * otherwise it moves, and Undo puts it back where it was.
 */
async function dropPage(dragged: string, parent: { uuid: string; title: string } | null, openDocId: string, bus: DocCommandBus | null) {
  const target: DocMoveTarget = { doc_uuid: dragged, ...(parent ? { parent_uuid: parent.uuid } : { space: "workspace" }), place: "last" }
  try {
    const plan = await planMove(target, true)
    if (plan.ask) {
      if (!bus) {
        toast({ title: "The page didn't move", description: "Moving it there changes who can open it. Use Move to… to choose what happens.", variant: "destructive" })
        return
      }
      stageDrop(openDocId, { page: { uuid: dragged }, target: parent ?? { uuid: null, title: "Docs" } })
      bus.emit("openDialog", { id: "doc.moveTo" })
      return
    }
    const from = (await getAncestors(dragged).catch(() => null))?.ancestors?.at(-1)?.uuid ?? null
    await moveDoc({ ...target, access: plan.access })
    toast({
      title: parent ? `Moved into “${parent.title}”` : "Moved to the top of Docs",
      action: (
        <ToastAction
          altText="Move it back"
          onClick={() =>
            void moveDoc({ doc_uuid: dragged, ...(from ? { parent_uuid: from } : { space: "workspace" }), place: "last", access: "keep" }).catch((e) =>
              toast({ title: "It didn't move back", description: apiErrorMessage(e, "Move it from its new place."), variant: "destructive" }),
            )
          }
        >
          Undo
        </ToastAction>
      ),
    })
  } catch (e) {
    toast({ title: "The page didn't move", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
  }
}

/** A crumb that takes a page dragged from the docs tree (text/plain: its id). */
/** The doc whose breadcrumb this is: a drop that needs asking opens its Move to…. */
const OpenDoc = React.createContext("")

function useDropTarget(target: string | null, name: string) {
  const [over, setOver] = React.useState(false)
  const openDocId = React.useContext(OpenDoc)
  const bus = React.useContext(DocBusContext)
  return {
    over,
    props: {
      "data-doc-drop-target": target ?? "top",
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("text/plain")) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false)
        const dragged = e.dataTransfer.getData("text/plain").trim()
        if (!UUID.test(dragged) || dragged.toLowerCase() === target) return
        e.preventDefault()
        void dropPage(dragged.toLowerCase(), target ? { uuid: target, title: name } : null, openDocId, bus)
      },
    },
  }
}

const crumbClass = "inline-flex min-w-0 max-w-[180px] items-center gap-1.5 rounded-md px-1 py-0.5 text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
const Sep = () => <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-4" />

function PageCrumb({ node }: { node: TreeNodeJSON }) {
  const name = node.title?.trim() || "Untitled"
  const drop = useDropTarget(node.uuid!, name)
  return (
    <IntentLink href={`/app/doc/${node.uuid}`} className={cn(crumbClass, drop.over && "bg-press text-ink ring-2 ring-brand/50")} {...drop.props}>
      {node.icon ? <DocIcon icon={node.icon} id={node.uuid} size={14} /> : null}
      <span className="truncate">{name}</span>
    </IntentLink>
  )
}

function HiddenCrumb({ count }: { count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-md px-1 text-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-brand" data-crumb-hidden="">
          …
        </span>
      </TooltipTrigger>
      <TooltipContent>{count === 1 ? "A page you can't open" : `${count} pages you can't open`}</TooltipContent>
    </Tooltip>
  )
}

function MoreCrumb({ nodes, hidden }: { nodes: TreeNodeJSON[]; hidden: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-6 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand" aria-label={`${nodes.length} more ${nodes.length === 1 ? "page" : "pages"} in the path`}>
        <Ellipsis className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="content-float w-56 rounded-xl p-1 shadow-e3">
        {nodes.map((n) => (
          <DropdownMenuItem key={n.uuid} asChild className="h-[30px] gap-2 rounded-lg text-ui-sm">
            <IntentLink href={`/app/doc/${n.uuid}`}>
              {n.icon ? <DocIcon icon={n.icon} id={n.uuid} size={14} /> : <span aria-hidden="true" className="size-3.5" />}
              <span className="truncate">{n.title?.trim() || "Untitled"}</span>
            </IntentLink>
          </DropdownMenuItem>
        ))}
        {hidden ? (
          <DropdownMenuItem disabled className="h-[30px] gap-2 rounded-lg text-ui-sm text-ink-3">
            <span aria-hidden="true" className="size-3.5" />
            {hidden === 1 ? "A page you can't open" : `${hidden} pages you can't open`}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The doc's own crumb: its icon and title; whoever may edit renames it in place. */
function DocCrumb({ docId, title, icon, canEdit }: { docId: string; title: string; icon?: string; canEdit: boolean }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(title)
  const input = React.useRef<HTMLInputElement>(null)
  const drop = useDropTarget(docId, title || "Untitled")
  React.useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])
  React.useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])
  const save = async () => {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === title) return
    try {
      await renameDoc(store.dispatch, docId, next)
    } catch (e) {
      toast({ title: "The title didn't change", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }
  if (editing)
    return (
      <input
        ref={input}
        value={draft}
        aria-label="Doc title"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (isComposingKey({ isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) return
          if (e.key === "Enter") {
            e.preventDefault()
            void save()
          } else if (e.key === "Escape") {
            e.preventDefault()
            e.stopPropagation()
            setDraft(title)
            setEditing(false)
          }
        }}
        className="field-surface h-7 w-[300px] max-w-full rounded-lg px-2 text-ui font-medium text-ink outline-none"
      />
    )
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => setEditing(true)}
      title={canEdit ? "Rename" : undefined}
      aria-current="page"
      {...drop.props}
      className={cn(
        "inline-flex min-w-0 max-w-[300px] items-center gap-1.5 rounded-md px-1 py-0.5 text-left font-medium text-ink outline-none disabled:cursor-default",
        canEdit && "cursor-text hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand",
        drop.over && "bg-press ring-2 ring-brand/50",
      )}
    >
      {/* The open doc always shows its glyph, in its hue (D13): the header is where a doc is most often seen. */}
      <DocIcon icon={icon} id={docId} size={16} />
      <span key={title} className="content-rise truncate">
        {title || "Untitled"}
      </span>
    </button>
  )
}

/**
 * The doc's breadcrumb in its header (B6, P1): Docs, every page above the
 * doc, and the doc. It takes the place of "Docs › title" (DocHeader's
 * crumbs slot). Each crumb is a drop target: a page dragged from the docs
 * tree onto it moves under it, asking first when that changes who can open
 * it.
 */
export default function Breadcrumbs({ docId }: SlotProps) {
  return (
    <OpenDoc.Provider value={docId}>
      <Trail docId={docId} />
    </OpenDoc.Provider>
  )
}

function Trail({ docId }: { docId: string }) {
  const doc = useDoc(docId)
  const path = useFetch<Envelope<DocAncestors>>(docId ? ancestorsKey(docId) : "", undefined, undefined, OWN_ERRORS).data?.data
  const top = useDropTarget(null, "Docs")
  // A soft lock holds the title here too, until lifted for this person.
  const facts = usePageFacts(docId)
  const held = (facts.lock || doc?.doc_lock_level) === "soft" && !facts.unlockedForMe
  const steps = crumbsOf(path?.ancestors ?? [])
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-ui" data-doc-breadcrumbs="">
      <IntentLink href="/app/doc" className={cn(crumbClass, "shrink-0", top.over && "bg-press text-ink ring-2 ring-brand/50")} {...top.props}>
        Docs
      </IntentLink>
      {path?.truncated ? (
        <>
          <Sep />
          <HiddenCrumb count={1} />
        </>
      ) : null}
      {steps.map((s, i) => (
        <React.Fragment key={s.kind === "page" ? s.node.uuid : `${s.kind}-${i}`}>
          <Sep />
          {s.kind === "page" ? <PageCrumb node={s.node} /> : s.kind === "more" ? <MoreCrumb nodes={s.nodes} hidden={s.hidden} /> : <HiddenCrumb count={s.count} />}
        </React.Fragment>
      ))}
      <Sep />
      <DocCrumb docId={docId} title={doc?.doc_title?.trim() ?? ""} icon={doc?.doc_icon} canEdit={(doc?.doc_edit_access ?? 0) > 0 && !held} />
    </nav>
  )
}

/**
 * A phone's path (B6): the pages above the doc, in a line above its title,
 * each a link; the header that holds the breadcrumb isn't drawn on a phone.
 */
export function PathLine({ docId }: { docId: string }) {
  const path = useFetch<Envelope<DocAncestors>>(docId ? ancestorsKey(docId) : "", undefined, undefined, OWN_ERRORS).data?.data
  const steps = crumbsOf(path?.ancestors ?? [])
  if (!steps.length) return null
  return (
    <nav aria-label="Pages above this doc" className="flex min-w-0 items-center gap-0.5 text-ui-sm" data-doc-path-line="">
      {steps.map((s, i) => (
        <React.Fragment key={s.kind === "page" ? s.node.uuid : `${s.kind}-${i}`}>
          {i > 0 ? <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-ink-4" /> : null}
          {s.kind === "page" ? (
            <IntentLink href={`/app/doc/${s.node.uuid}`} className="inline-flex min-w-0 max-w-[140px] items-center gap-1 rounded px-0.5 text-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {s.node.icon ? <DocIcon icon={s.node.icon} id={s.node.uuid} size={12} /> : null}
              <span className="truncate">{s.node.title?.trim() || "Untitled"}</span>
            </IntentLink>
          ) : s.kind === "more" ? (
            <span className="px-0.5 text-ink-3">…</span>
          ) : (
            <span className="px-0.5 text-ink-3" aria-label="Pages you can't open">
              …
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}
