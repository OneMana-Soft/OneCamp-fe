"use client"

// Add from OneCamp (miro-13 2): the board's panel of the workspace's tasks, docs and projects, each put on the board as
// its live card (components/board/boardCard). Search finds anything this person may open (the server decides); with
// nothing typed, a project's open tasks are listed under their status, read as the project's own board reads them
// (hooks/useProjectBoard). A press lays the card in the middle of what the board shows (above the sheet on a phone),
// past whatever is drawn there; on a computer a row can be dragged to its spot, where the board's drop makes it a card
// (boardExcalidraw). A thing already on the board says so, and a press goes to its card. A lazy chunk of the board's
// tools, for people who may edit the board. It imports none of the shared core (the fetch layer, ErrorState, EmptyState,
// SkeletonRows, the graphics), which a lazy chunk never imports: Turbopack would re-cut every route's shared chunks
// (LEAD-RULES 30 Oct 00:13 and 20:5x). So its projects, its failed, empty and waiting states and its rows' leads come
// from the board page's first load, which ships all of that already (components/board/addWorkReads), read only while
// the panel is open. Its search and task lists stay here (hooks/useSearchPicks, hooks/useProjectBoard): on the first
// load they would cost every board ~49 KB of source, the live entities and the MQTT client among it; the fetch layer
// under them ships with the page, so this chunk carries none of it.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { BoardSidePanel } from "@/components/board/boardSidePanel"
import { islandsOver } from "@/components/board/islands"
import { useSheetMode } from "@/components/ui/overlayMode"
import { SearchInput } from "@/components/ui/search-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AddWorkReads } from "@/components/board/addWorkReads"
import { useSearchPicks } from "@/hooks/useSearchPicks"
import { COLUMNS, OPEN, tasksIn, useProjectBoard } from "@/hooks/useProjectBoard"
import { CAPTURE } from "@/lib/board/binding"
import { isCard, layCards } from "@/lib/board/cards"
import { freeCardSpot, scrollToCentre, viewBox } from "@/lib/board/placement"
import { workOfResult, workOfTask, type WorkPick } from "@/lib/board/addWork"
import { viewAboveSheet, viewCentre } from "@/lib/board/viewport"
import { Plus } from "@/lib/icons"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"

/** The project last listed here, kept for the next board this person opens. */
const KEPT = "onecamp:board:addFrom"

const keptProject = () => {
  try {
    return localStorage.getItem(KEPT) ?? ""
  } catch {
    return ""
  }
}

/** What a card's link stays as on the board, for "On the board". Read again only when the elements change. */
function useCardLinks(api: ExcalidrawImperativeAPI): ReadonlySet<string> {
  const read = React.useCallback(
    (els: readonly { type?: string; link?: string | null; isDeleted?: boolean; customData?: Record<string, unknown> }[]) =>
      new Set(els.filter((e) => !e.isDeleted && isCard(e) && e.link).map((e) => e.link as string)),
    [],
  )
  const [links, setLinks] = React.useState<ReadonlySet<string>>(() => read(api.getSceneElements() as never))
  React.useEffect(() => {
    let last: readonly unknown[] | null = null
    return api.onChange((els) => {
      if (els === last) return
      last = els
      const next = read(els as never)
      setLinks((was) => (was.size === next.size && [...next].every((l) => was.has(l)) ? was : next))
    })
  }, [api, read])
  return links
}

function WorkRow({ pick, lead, onBoard, drags, onPress }: { pick: WorkPick; lead: React.ReactNode; onBoard: boolean; drags: boolean; onPress: (p: WorkPick) => void }) {
  return (
    <li>
      <button
        type="button"
        draggable={drags}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/uri-list", pick.link)
          e.dataTransfer.setData("text/plain", pick.link)
          e.dataTransfer.effectAllowed = "copy"
        }}
        onClick={() => onPress(pick)}
        title={onBoard ? "Go to its card" : drags ? "Add it to the board, or drag it to a spot" : undefined}
        className="group/work flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand active:bg-press max-sm:min-h-12 [&[draggable=true]]:cursor-grab"
      >
        <span className="grid size-5 shrink-0 place-items-center">{lead}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui font-[450] text-ink">{pick.title}</span>
          {pick.meta ? <span className="block truncate text-meta text-ink-3">{pick.meta}</span> : null}
        </span>
        {onBoard ? (
          <span className="shrink-0 rounded-sm bg-sunken px-2 py-0.5 text-meta text-ink-3">On the board</span>
        ) : (
          <Plus className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover/work:opacity-100 group-focus-visible/work:opacity-100 [@media(hover:none)]:opacity-100" aria-hidden="true" />
        )}
      </button>
    </li>
  )
}

/** Where else to look, when a list is empty. */
const ELSEWHERE = "Search finds the tasks, docs and projects you can open."

export default function AddWorkPanel({ api, onClose, reads }: { api: ExcalidrawImperativeAPI; onClose: () => void; reads: AddWorkReads }) {
  const sheet = useSheetMode()
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const [query, setQuery] = React.useState("")
  const [said, setSaid] = React.useState("")
  const onBoard = useCardLinks(api)
  const searching = query.trim() !== ""
  const found = useSearchPicks(query, (r) => workOfResult(r, origin), { limit: 12 })

  const { projects, failed, empty, waiting, lead } = reads
  // The projects to add from: never a deleted one, nor one whose own read has said since that it was deleted ("gone")
  // or is out of this person's reach ("none"). Its board never comes, so the panel moves on to the next project, as a
  // doc's embed says "This project was deleted." (embedFrame), and never shows "Loading tasks…" for good.
  const [unreadable, setUnreadable] = React.useState<ReadonlySet<string>>(() => new Set())
  const mine = projects.list.filter((p) => isZeroEpoch(p.project_deleted_at) && !unreadable.has(p.project_uuid))
  const [chosen, setChosen] = React.useState(keptProject)
  const project = mine.find((p) => p.project_uuid === chosen) ?? mine[0]
  const reading = !!project && !searching
  const tasks = useProjectBoard(project?.project_uuid ?? "", { enabled: reading })
  // Only a read that is on counts: with the read off (a search), the hook says "none" for no project at all.
  const ended = reading && (tasks.project.state === "gone" || tasks.project.state === "none") ? (project?.project_uuid ?? "") : ""
  React.useEffect(() => {
    if (ended) setUnreadable((was) => new Set(was).add(ended))
  }, [ended])
  const choose = (id: string) => {
    setChosen(id)
    try {
      localStorage.setItem(KEPT, id)
    } catch {
      /* kept for this panel only */
    }
  }

  // A press: the card in the middle of what the board shows, past what is drawn there and off the board's own bars
  // and panels; or, for a thing already on the board, its card, selected and brought into view.
  const press = (pick: WorkPick) => {
    const card = onBoard.has(pick.link) ? api.getSceneElements().find((e) => isCard(e as never) && e.link === pick.link) : undefined
    if (card) {
      api.updateScene({ appState: { selectedElementIds: { [card.id]: true } } as never, captureUpdate: CAPTURE.NEVER as never })
      api.scrollToContent(card, { animate: true })
      setSaid(`Went to ${pick.title} on the board`)
      return
    }
    const s = api.getAppState()
    const view = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, width: s.width, height: s.height, offsetLeft: s.offsetLeft, offsetTop: s.offsetTop }
    const open = viewAboveSheet(view, sheet)
    const taken = [
      ...api.getSceneElements().filter((e) => e.type !== "text" && e.type !== "frame" && e.type !== "arrow" && e.type !== "line"),
      ...islandsOver(view),
    ]
    const spot = freeCardSpot(viewCentre(open), pick.kind, taken, viewBox(open))
    layCards(api, [{ link: pick.link, kind: pick.kind }], spot)
    // Nothing in view was free: the view goes to the card.
    if (!spot.shown) api.updateScene({ appState: scrollToCentre(open, spot) as never, captureUpdate: CAPTURE.NEVER as never })
    setSaid(`${pick.title} is on the board`)
  }

  const rows = (picks: WorkPick[]) => (
    <ul className="flex flex-col">
      {picks.map((p) => (
        <WorkRow key={p.link} pick={p} lead={lead(p.kind, p.id, p.status)} onBoard={onBoard.has(p.link)} drags={!sheet} onPress={press} />
      ))}
    </ul>
  )

  let body: React.ReactNode
  if (searching) {
    if (found.failed) body = failed("tasks, docs and projects", found.retry)
    else if (found.searching) body = waiting("Searching…")
    else if (found.items.length === 0) body = empty(`Nothing found for “${query.trim()}”`, "Try other words, or pick from a project's open tasks.")
    else body = rows(found.items)
  } else if (projects.failed) {
    body = failed("your projects", projects.retry)
  } else if (projects.waiting) {
    body = waiting("Loading your projects…")
  } else if (!project) {
    body = empty("You aren't in a project yet", ELSEWHERE)
  } else {
    const name = project.project_name || "This project"
    const open = COLUMNS.filter((c) => OPEN.has(c.status))
      .map((c) => ({ label: c.label, picks: tasksIn(tasks.board, c.key).flatMap((t) => workOfTask(t, origin) ?? []) }))
      .filter((c) => c.picks.length > 0)
    body = (
      <section aria-label={`${name}'s open tasks`}>
        <div className="px-1.5 pb-1">
          <Select value={project.project_uuid} onValueChange={choose}>
            <SelectTrigger aria-label="Project" className="w-full">
              <span className="flex min-w-0 items-center gap-2">
                {lead("project", project.project_uuid, undefined, 16)}
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {mine.map((p) => (
                <SelectItem key={p.project_uuid} value={p.project_uuid}>
                  {p.project_name || "Untitled project"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tasks.failed ? (
          failed(`${name}'s tasks`, tasks.retry)
        ) : tasks.loading || !tasks.board ? (
          waiting("Loading tasks…")
        ) : open.length === 0 ? (
          empty(`${name} has no open tasks`, ELSEWHERE)
        ) : (
          open.map((c) => (
            <div key={c.label}>
              <h3 className="px-2.5 pb-1 pt-2.5 text-meta font-[510] text-ink-3">{c.label}</h3>
              {rows(c.picks)}
            </div>
          ))
        )}
      </section>
    )
  }

  return (
    <BoardSidePanel name="Add from OneCamp" closeLabel="Close Add from OneCamp" detent="half" onClose={onClose} data-add-work="">
      <div className="px-1.5 pb-1.5 pt-0.5">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search tasks, docs and projects…"
          size={sheet ? "lg" : "md"}
          autoFocus={!sheet}
        />
        {!sheet ? <p className="px-1 pt-1.5 text-meta text-ink-3">Click one to add it, or drag it to a spot on the board.</p> : null}
      </div>
      {body}
      <p role="status" className="sr-only">
        {said}
      </p>
    </BoardSidePanel>
  )
}
