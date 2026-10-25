"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ArrowLeft, ArrowRightToLine, Loader2, Search } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToastAction } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { cn } from "@/lib/utils/helpers/cn"
import { isComposingKey } from "@/lib/keys/ime"
import { ancestorsKey, listKey, moveDoc, type Envelope } from "@/services/docGraphService"
import { searchDocs, type FoundDoc } from "@/services/docChromeService"
import { moveReason, planMove } from "@/lib/docMove"
import type { DocAncestors, DocList, DocMovePreview, DocMoveTarget } from "@/types/docGraph"
import { DocIcon } from "./DocIcon"
import { ChromeSheet } from "./chrome/Sheet"
import { ChoiceCards, InlineError } from "./chrome/parts"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { navigate } from "./chrome/pageFacts"
import { peekStagedDrop, releaseStagedDrop } from "./chrome/stagedDrop"
import { peekStagedMove, releaseStagedMove } from "./chrome/stagedMove"
import { useHandoff } from "@/hooks/useHandoff"
import { useDoc } from "./chrome/useDoc"


/** Where something can go: a page, or for a page the top of Docs. */
interface Target {
  uuid: string | null
  title: string
  icon?: string
  path?: string
}

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

/**
 * Move to… (B6; structure.md P0.5, PROGRAM D-1 "moving a page asks what to
 * do about access"). Search for a page, or choose the top of Docs. Every
 * move is planned as every other way of moving a page plans it (planMove):
 * when it would change who can open the page, it says how many people lose
 * or gain access, and why, and asks: into a page, keep its current access or
 * use the new parent's; to the top of Docs, whether to move it. Opened from
 * More, or from B1's block menu with blocks staged, when it moves those
 * blocks instead ("Move 3 blocks to…").
 */
export default function MoveToDialog({ docId: openDocId, onClose }: { docId: string; onClose(): void }) {
  const staged = useHandoff(() => peekStagedMove(openDocId), releaseStagedMove)
  // A page dropped on a breadcrumb: that page, its new parent already chosen.
  const drop = useHandoff(() => (staged ? null : peekStagedDrop(openDocId)), releaseStagedDrop)
  const docId = drop?.page.uuid ?? openDocId
  const doc = useDoc(docId)
  const above = useFetch<Envelope<DocAncestors>>(staged ? "" : ancestorsKey(docId), undefined, undefined, OWN_ERRORS).data?.data
  const recent = useFetch<Envelope<DocList>>(listKey("recent", { limit: 12 }), undefined, undefined, OWN_ERRORS).data?.data
  const [query, setQuery] = React.useState("")
  const found = useFoundDocs(query)
  const [active, setActive] = React.useState(0)
  const [chosen, setChosen] = React.useState<Target | null>(null)
  const [preview, setPreview] = React.useState<DocMovePreview | null>(null)
  const [access, setAccess] = React.useState<"keep" | "adopt">("adopt")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const title = (drop && drop.page.uuid !== openDocId ? drop.page.title : doc?.doc_title)?.trim() || "Untitled"
  const parentNow = above?.ancestors?.[above.ancestors.length - 1]
  const listId = React.useId()

  const options: Target[] = React.useMemo(() => {
    const rows: Target[] = []
    if (!staged && !query.trim() && parentNow) rows.push({ uuid: null, title: "Docs", path: "The top level, under no page" })
    const docs = found.docs ?? (query.trim() ? [] : (recent?.docs ?? []).map((d) => ({ doc_uuid: d.doc_uuid, doc_title: d.doc_title, doc_icon: d.doc_icon, path: d.path })))
    for (const d of docs as (FoundDoc & { path?: { doc_title?: string; redacted?: boolean }[] })[]) {
      if (d.doc_uuid === docId || d.doc_uuid === (staged ? undefined : parentNow?.uuid)) continue
      rows.push({ uuid: d.doc_uuid, title: d.doc_title?.trim() || "Untitled", icon: d.doc_icon, path: d.path?.map((c) => (c.redacted ? "…" : c.doc_title || "Untitled")).join(" › ") || undefined })
    }
    return rows
  }, [staged, query, found.docs, recent, docId, parentNow])

  React.useEffect(() => setActive(0), [query])

  /** Where the page goes: under a page, or the top of Docs. */
  const moveTarget = (target: Target): DocMoveTarget => ({ doc_uuid: docId, ...(target.uuid ? { parent_uuid: target.uuid } : { space: "workspace" }), place: "last" })

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
      const res = await moveDoc({ ...moveTarget(target), access: target.uuid ? how : "keep" })
      const back = parentNow?.uuid
      const undo =
        res.access === "keep"
          ? async () => {
              try {
                await moveDoc({ doc_uuid: docId, ...(back ? { parent_uuid: back } : { space: "workspace" }), place: "last", access: "keep" })
              } catch (e) {
                toast({ title: "It didn't move back", description: apiErrorMessage(e, "Move it from its new place."), variant: "destructive" })
              }
            }
          : null
      toast({
        title: target.uuid ? `Moved to “${target.title}”` : "Moved to the top of Docs",
        description: res.access === "adopt" ? "It has its new parent's access now." : undefined,
        action: undo ? (
          <ToastAction altText="Move it back" onClick={() => void undo()}>
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
      const plan = await planMove(moveTarget(target), true)
      if (!plan.ask) return void (await finish(target, plan.access))
      setPreview(plan.preview)
      setAccess(plan.preview.lose ? "keep" : "adopt")
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
    if (!drop || asked.current) return
    asked.current = true
    void choose({ uuid: drop.target.uuid, title: drop.target.title, icon: drop.target.icon })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the staged drop
  }, [drop])

  const heading = staged ? `Move ${staged.count === 1 ? "1 block" : `${staged.count} blocks`} to…` : drop && !drop.page.title && drop.page.uuid !== openDocId ? "Move the page to…" : `Move “${title}” to…`

  if (chosen && preview) {
    const adopt = adoptWording(preview, chosen.title)
    const reason = moveReason(preview, title)
    return (
      <ChromeSheet
        onClose={onClose}
        title={preview.summary}
        description={`Moving “${title}” ${chosen.uuid ? `into “${chosen.title}”` : "to the top of Docs"}.${reason ? ` ${reason}` : ""}`}
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
            <Button size="sm" disabled={busy} onClick={() => void finish(chosen, access)} data-doc-move-confirm="">
              Move
            </Button>
          </>
        }
      >
        {/* To the top of Docs there is no parent's access to take: the question is the move. */}
        {chosen.uuid ? (
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

  return (
    <ChromeSheet onClose={onClose} title={heading} size="md" data-doc-move-dialog="choose">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a page"
          aria-label="Search for a page"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          className="h-9 pl-8"
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
              void choose(options[active])
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
              onClick={() => !busy && void choose(o)}
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
