"use client"

// BoardTools: the empty board's first move, and the dialog that makes notes
// into tasks.
//
//  - Templates. A blank canvas is where a new board loses people, so a board
//    with nothing on it offers the five templates teams start with most, the
//    whole library a press away (the picker), and the sticky tool's key.
//    Templates are ordinary Excalidraw shapes (lib/board/templates), synced
//    like any drawing.
//  - Notes into tasks. Select sticky notes and make each one a task in a
//    project (from the notes bar). Miro needs a Jira or Asana integration for
//    this; here the tasks are OneCamp's own. Each note keeps a link to its
//    task (and the task's id in customData), so selecting it again never
//    makes a duplicate.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFetch } from "@/hooks/useFetch"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoListRawInterface } from "@/types/project"
import { BOARD_TEMPLATES, centreAt, type BoardTemplate } from "@/lib/board/templates"
import { STYLE_FONT, makeTasksLabel, type BoardElementLike, type BoardStyle, type SelectedNote } from "@/lib/board/notes"
import { CAPTURE, bumped } from "@/lib/board/binding"
import { TemplatePreview } from "@/components/board/templatePreview"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { cn } from "@/lib/utils/helpers/cn"

interface BoardToolsProps {
  api: ExcalidrawImperativeAPI | null
  editable: boolean
  /** The board (kept for callers; the empty card no longer wears its hue). */
  boardId?: string
  /**
   * Whether the board's shared drawing has arrived. Until it has, the canvas
   * is empty because nothing has loaded, not because nothing is drawn: a
   * full board opened on "Start with a template" for as long as the sync
   * took. Defaults to true for callers without a sync to wait for.
   */
  synced?: boolean
  /** Another card is open over the canvas (the AI composer): the empty card steps aside. */
  quiet?: boolean
  /** Opens the whole template library (the picker). */
  onMoreTemplates?: () => void
  /** The board's style, for a template's words. */
  style?: BoardStyle
}

/**
 * Lays a template on the board, centred on what the person is looking at,
 * and brings it into view. The shapes are ordinary Excalidraw elements,
 * synced like any drawing.
 */
export async function insertBoardTemplate(api: ExcalidrawImperativeAPI, t: BoardTemplate, style?: BoardStyle) {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw")
  const s = api.getAppState()
  // The middle of what the person is looking at, in scene coordinates.
  const cx = -s.scrollX + s.width / 2 / s.zoom.value
  const cy = -s.scrollY + s.height / 2 / s.zoom.value
  const prefix = `${t.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  // Its words in the board's style (a clean board's plain sans, O4).
  const font = style ? STYLE_FONT[style] : undefined
  const built = centreAt(t.build(prefix), cx, cy).map((sk) =>
    font === undefined ? sk : sk.type === "rectangle" ? { ...sk, label: { ...sk.label, fontFamily: font } } : sk.type === "text" ? { ...sk, fontFamily: font } : sk,
  )
  const generated = convertToExcalidrawElements(built as never, { regenerateIds: false })
  // One undo step (lib/board/binding).
  api.updateScene({ elements: [...api.getSceneElements(), ...generated] as never, captureUpdate: CAPTURE.IMMEDIATELY })
  api.scrollToContent(generated as never, { fitToContent: true, animate: !prefersReducedMotion() })
}

export default function BoardTools({ api, editable, synced = true, quiet = false, onMoreTemplates, style }: BoardToolsProps) {
  const [empty, setEmpty] = React.useState(false)

  // Follow the scene: is the board empty. Excalidraw calls onChange on every
  // frame of a pan or a zoom, with the same elements: those frames are
  // skipped, rather than each walking every shape on the board.
  React.useEffect(() => {
    if (!api) return
    let lastElements: readonly unknown[] | null = null
    const read = (elements: readonly unknown[]) => {
      if (elements === lastElements) return
      lastElements = elements
      setEmpty(!(elements as BoardElementLike[]).some((e) => !e.isDeleted))
    }
    read(api.getSceneElements())
    return api.onChange((elements) => read(elements))
  }, [api])

  // The empty-canvas card leaves on the first shape: a 160 ms fade and a
  // small scale, then it unmounts. It comes a beat after the sync, since the
  // shared shapes land on the scene a tick after it, so a full board never
  // flashes it.
  const offer = empty && synced && !quiet
  const [cardShown, setCardShown] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setCardShown(offer), offer ? 250 : 160)
    return () => clearTimeout(t)
  }, [offer])

  if (!editable || !api || !cardShown) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div
        data-empty-canvas=""
        className={cn(
          // 500 px gives each of the five a name's width: at 420 they read
          // "Retrosp…" and "User jou…". A phone lays them three to a row.
          "content-float pointer-events-auto w-[min(92vw,500px)] rounded-[16px] bg-pop p-5 shadow-e3 transition-[opacity,transform] duration-[160ms] ease-[var(--ease-out)]",
          !offer && "scale-[0.98] opacity-0",
        )}
      >
        <p className="text-heading text-ink">Start with a template</p>
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Templates">
          {BOARD_TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void insertBoardTemplate(api, t, style)}
                className="group/tpl flex w-full flex-col items-center gap-1.5 rounded-lg p-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand"
                title={t.description}
              >
                <span className="block w-full overflow-hidden rounded-lg shadow-e1 transition-transform duration-[140ms] group-hover/tpl:-translate-y-px">
                  <TemplatePreview template={t} height={64} pad={8} />
                </span>
                <span className="w-full truncate text-meta font-medium text-ink-2 group-hover/tpl:text-ink">{t.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-center gap-3 text-meta text-ink-3">
          {onMoreTemplates && (
            <>
              <button type="button" onClick={onMoreTemplates} className="rounded-md px-1 font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand" data-more-templates="">
                See all templates
              </button>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>
            or press <kbd className="rounded-[4px] bg-sunken px-1 font-sans text-ink-2">N</kbd> for a note
          </span>
        </div>
      </div>
    </div>
  )
}

/** The dialog that makes selected notes into tasks, each linked from its note. */
export function NotesToTasksDialog({
  open,
  onOpenChange,
  api,
  notes,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  api: ExcalidrawImperativeAPI
  notes: SelectedNote[]
}) {
  const projects = useFetch<ProjectInfoListRawInterface>(open ? GetEndpointUrl.projectListByAdminUID : "")
  const { revalidateTaskKeys } = useTaskUpdate()
  const { toast } = useToast()
  const [project, setProject] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const fresh = notes.filter((n) => !n.taskUuid)
  const already = notes.length - fresh.length
  // Each note is ticked when the dialog opens; one unticked (a template's
  // prompt, a duplicate) is left a note.
  const [left, setLeft] = React.useState<ReadonlySet<string>>(new Set())
  React.useEffect(() => {
    if (open) setLeft(new Set())
  }, [open])
  const chosen = fresh.filter((n) => !left.has(n.noteId))
  const tick = (noteId: string, on: boolean) =>
    setLeft((was) => {
      const next = new Set(was)
      if (on) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  const create = async () => {
    if (!project || chosen.length === 0) return
    setBusy(true)
    const made = new Map<string, string>()
    // One request for them all (POST /task/createTasks, PR2), made in order:
    // a failure stops cleanly with the earlier notes linked, so trying again
    // only makes the rest.
    const res = await axiosInstance
      .post<{ data?: { made?: string[] } }>("/task/createTasks", { project_uuid: project, tasks: chosen.map((n) => ({ task_name: n.text })) }, OWN_ERRORS)
      .catch(() => undefined)
    for (const [i, uuid] of (res?.data.data?.made ?? []).entries()) made.set(chosen[i].noteId, uuid)
    if (made.size > 0) {
      // Link each note to its task, bumped so everyone sees it, and never
      // undone, or Make tasks could make it twice.
      const next = api.getSceneElements().map((el) => {
        const uuid = made.get(el.id)
        if (!uuid) return el
        return bumped(el, { link: `/app/task/${uuid}`, customData: { ...(el.customData ?? {}), taskUuid: uuid } })
      })
      api.updateScene({ elements: next as never, captureUpdate: CAPTURE.NEVER })
      revalidateTaskKeys(project)
    }
    setBusy(false)
    if (made.size === chosen.length) {
      toast({ title: made.size === 1 ? "Made a task" : `Made ${made.size} tasks`, description: "Each note now links to its task." })
      onOpenChange(false)
    } else {
      toast({
        title: `Made ${made.size} of ${chosen.length} tasks`,
        description: "The rest could not be created. Try again to make only those.",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* No count here: the ticks change it, and the button says it (DB-27). */}
          <DialogTitle>{fresh.length === 1 ? "Make this note a task" : "Make notes into tasks"}</DialogTitle>
          <DialogDescription>
            Each note becomes a task in the project you choose, and links to it from the board.
            {already > 0 && ` ${already} selected ${already === 1 ? "note is" : "notes are"} already a task and will be skipped.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 overflow-y-auto rounded-xl bg-sunken p-1 text-ui">
          {fresh.map((n) => (
            <li key={n.noteId}>
              <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 hover:bg-hover max-md:min-h-11">
                <Checkbox checked={!left.has(n.noteId)} onCheckedChange={(v) => tick(n.noteId, v === true)} disabled={busy} />
                <span className="min-w-0 truncate text-ink">{n.text}</span>
              </label>
            </li>
          ))}
        </ul>
        {!projects.isLoading && (projects.data?.data ?? []).length === 0 ? (
          <p className="rounded-xl bg-sunken p-3 text-ui-sm text-ink-2">
            Tasks are made in projects you manage, and you don&apos;t manage one yet. Create a project, or ask a
            project&apos;s admin to make you one of its admins.
          </p>
        ) : (
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger aria-label="Project">
            <SelectValue placeholder={projects.isLoading ? "Loading projects…" : "Choose a project"} />
          </SelectTrigger>
          <SelectContent>
            {(projects.data?.data ?? []).map((p) => (
              <SelectItem key={p.project_uuid} value={p.project_uuid}>
                {p.project_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!project || chosen.length === 0} busy={busy}>
            {makeTasksLabel(chosen.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
