"use client"

// BoardTools: the two moves a whiteboard is for, beside the canvas.
//
//  - Templates. A blank canvas is where a new board loses people, so a board
//    with nothing on it offers a retro, a brainstorm, a kanban, a journey or a
//    SWOT, and the button keeps them one click away afterwards. Templates are
//    ordinary Excalidraw shapes (lib/board/templates), synced like any drawing.
//  - Notes into tasks. Select sticky notes and make each one a task in a
//    project. Miro needs a Jira or Asana integration for this; here the tasks
//    are OneCamp's own. Each note keeps a link to its task (and the task's id in
//    customData), so selecting it again never makes a duplicate.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoListRawInterface } from "@/types/project"
import { BOARD_TEMPLATES, centreAt, type BoardTemplate } from "@/lib/board/templates"
import { selectedNotes, type BoardElementLike, type SelectedNote } from "@/lib/board/notes"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
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
}

/**
 * Lays a template on the board, centred on what the person is looking at,
 * and brings it into view. The shapes are ordinary Excalidraw elements,
 * synced like any drawing.
 */
export async function insertBoardTemplate(api: ExcalidrawImperativeAPI, t: BoardTemplate) {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw")
  const s = api.getAppState()
  // The middle of what the person is looking at, in scene coordinates.
  const cx = -s.scrollX + s.width / 2 / s.zoom.value
  const cy = -s.scrollY + s.height / 2 / s.zoom.value
  const prefix = `${t.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const generated = convertToExcalidrawElements(centreAt(t.build(prefix), cx, cy) as never, { regenerateIds: false })
  api.updateScene({ elements: [...api.getSceneElements(), ...generated] as never })
  api.scrollToContent(generated as never, { fitToContent: true, animate: !prefersReducedMotion() })
}

export default function BoardTools({ api, editable, synced = true, quiet = false }: BoardToolsProps) {
  const [empty, setEmpty] = React.useState(false)
  const [notes, setNotes] = React.useState<SelectedNote[]>([])
  const [tasksOpen, setTasksOpen] = React.useState(false)

  // Follow the scene: is the board empty, and which notes are selected.
  // Excalidraw calls onChange on every frame of a pan or a zoom, with the
  // same elements and selection: those frames are skipped, rather than each
  // walking every shape on the board.
  React.useEffect(() => {
    if (!api) return
    let lastElements: readonly unknown[] | null = null
    let lastSelection: Record<string, boolean> | undefined
    const read = (elements: readonly unknown[], appState: { selectedElementIds?: Record<string, boolean> }) => {
      if (elements === lastElements && appState.selectedElementIds === lastSelection) return
      lastElements = elements
      lastSelection = appState.selectedElementIds
      const els = elements as BoardElementLike[]
      setEmpty(!els.some((e) => !e.isDeleted))
      const next = selectedNotes(els, appState.selectedElementIds ?? {})
      setNotes((prev) =>
        prev.length === next.length && prev.every((n, i) => n.noteId === next[i].noteId && n.text === next[i].text && n.taskUuid === next[i].taskUuid)
          ? prev
          : next,
      )
    }
    read(api.getSceneElements(), api.getAppState())
    return api.onChange((elements, appState) => read(elements, appState as never))
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

  if (!editable || !api) return null
  const fresh = notes.filter((n) => !n.taskUuid)

  return (
    <>
      {/* Selected sticky notes: what they can become, on a floating bar at
          the top centre of the canvas (it stays put while the board pans). */}
      {fresh.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center max-sm:top-auto max-sm:bottom-[8.5rem]" data-board-tools="">
          <FloatingBar label="Selected notes" className="pointer-events-auto" data-board-chrome="">
            <span className="px-2 text-ui-sm text-ink-2 tabular-nums">
              {fresh.length === 1 ? "1 note" : `${fresh.length} notes`}
            </span>
            <FloatingBarDivider />
            <FloatingBarButton label={fresh.length === 1 ? "Make a task" : `Make ${fresh.length} tasks`} onClick={() => setTasksOpen(true)} className="px-2 text-ink">
              <TaskCheckGlyph />
              <span>{fresh.length === 1 ? "Make a task" : `Make ${fresh.length} tasks`}</span>
            </FloatingBarButton>
          </FloatingBar>
        </div>
      )}

      {cardShown && (
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
                    onClick={() => void insertBoardTemplate(api, t)}
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
            <p className="mt-3 text-center text-meta text-ink-3">or just start drawing</p>
          </div>
        </div>
      )}

      <NotesToTasksDialog open={tasksOpen} onOpenChange={setTasksOpen} api={api} notes={notes} />
    </>
  )
}

/** The task check, drawn small for the "Make tasks" button. */
function TaskCheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="4" stroke="currentColor" strokeWidth="1.3" />
      <path d="m4.8 8.2 2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Templates, from the board's top-right cluster: a 360 px pop of the five
 * templates as previews in two columns.
 */
export function TemplatesButton({ api, trigger }: { api: ExcalidrawImperativeAPI | null; trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false)
  if (!api) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="content-float w-[360px] rounded-xl bg-pop p-2 shadow-e3">
        <p className="px-1.5 pb-2 pt-1 text-meta font-medium text-ink-3">Start from a template</p>
        <ul className="grid grid-cols-2 gap-2">
          {BOARD_TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  void insertBoardTemplate(api, t)
                  setOpen(false)
                }}
                className="group/tpl flex h-[120px] w-full flex-col overflow-hidden rounded-[10px] bg-raised text-left shadow-e1 outline-none transition-transform duration-[140ms] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand"
              >
                <TemplatePreview template={t} height={80} pad={10} />
                <span className="flex flex-1 flex-col justify-center px-2.5">
                  <span className="truncate text-ui-sm font-medium text-ink">{t.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function NotesToTasksDialog({
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
  const post = usePost()
  const { revalidateTaskKeys } = useTaskUpdate()
  const { toast } = useToast()
  const [project, setProject] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const fresh = notes.filter((n) => !n.taskUuid)
  const already = notes.length - fresh.length

  const create = async () => {
    if (!project || fresh.length === 0) return
    setBusy(true)
    const made = new Map<string, string>()
    // One at a time: a failure stops cleanly with the earlier notes linked, so
    // trying again only makes the rest.
    for (const n of fresh) {
      const res = await post
        .makeRequest<{ task_name: string; task_project_uuid: string }, { task_uuid?: string }>({
          apiEndpoint: PostEndpointUrl.CreateTask,
          payload: { task_name: n.text, task_project_uuid: project },
        })
        .catch(() => undefined)
      if (!res?.task_uuid) break
      made.set(n.noteId, res.task_uuid)
    }
    if (made.size > 0) {
      // Link each note to its task. A bumped version is what the board's Yjs
      // binding merges on, so collaborators see the links appear too.
      const next = api.getSceneElements().map((el) => {
        const uuid = made.get(el.id)
        if (!uuid) return el
        return {
          ...el,
          link: `/app/task/${uuid}`,
          customData: { ...(el.customData ?? {}), taskUuid: uuid },
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          updated: Date.now(),
        }
      })
      api.updateScene({ elements: next as never })
      revalidateTaskKeys(project)
    }
    setBusy(false)
    if (made.size === fresh.length) {
      toast({ title: made.size === 1 ? "Made a task" : `Made ${made.size} tasks`, description: "Each note now links to its task." })
      onOpenChange(false)
    } else {
      toast({
        title: `Made ${made.size} of ${fresh.length} tasks`,
        description: "The rest could not be created. Try again to make only those.",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fresh.length === 1 ? "Make this note a task" : `Make ${fresh.length} notes into tasks`}</DialogTitle>
          <DialogDescription>
            Each note becomes a task in the project you choose, and links to it from the board.
            {already > 0 && ` ${already} selected ${already === 1 ? "note is" : "notes are"} already a task and will be skipped.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 overflow-y-auto rounded-xl bg-sunken p-1 text-ui">
          {fresh.map((n) => (
            <li key={n.noteId} className="flex h-8 items-center gap-2.5 rounded-lg px-2.5">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[2px] bg-camp-sun" />
              <span className="min-w-0 truncate text-ink">{n.text}</span>
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
          <Button onClick={create} disabled={!project || busy || fresh.length === 0}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {fresh.length === 1 ? "Make task" : `Make ${fresh.length} tasks`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
