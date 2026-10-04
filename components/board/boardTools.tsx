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
import { CheckSquare, LayoutGrid, Loader2 } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoListRawInterface } from "@/types/project"
import { BOARD_TEMPLATES, centreAt, type BoardTemplate } from "@/lib/board/templates"
import { selectedNotes, type BoardElementLike, type SelectedNote } from "@/lib/board/notes"

interface BoardToolsProps {
  api: ExcalidrawImperativeAPI | null
  editable: boolean
}

export default function BoardTools({ api, editable }: BoardToolsProps) {
  const [empty, setEmpty] = React.useState(false)
  const [notes, setNotes] = React.useState<SelectedNote[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [tasksOpen, setTasksOpen] = React.useState(false)

  // Follow the scene: is the board empty, and which notes are selected.
  React.useEffect(() => {
    if (!api) return
    const read = (elements: readonly unknown[], appState: { selectedElementIds?: Record<string, boolean> }) => {
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

  const insertTemplate = React.useCallback(
    async (t: BoardTemplate) => {
      if (!api) return
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw")
      const s = api.getAppState()
      // The middle of what the person is looking at, in scene coordinates.
      const cx = -s.scrollX + s.width / 2 / s.zoom.value
      const cy = -s.scrollY + s.height / 2 / s.zoom.value
      const prefix = `${t.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const generated = convertToExcalidrawElements(centreAt(t.build(prefix), cx, cy) as never, { regenerateIds: false })
      api.updateScene({ elements: [...api.getSceneElements(), ...generated] as never })
      api.scrollToContent(generated as never, { fitToContent: true, animate: true })
      setPickerOpen(false)
    },
    [api],
  )

  if (!editable || !api) return null
  const fresh = notes.filter((n) => !n.taskUuid)

  return (
    <>
      {/* Right, under Library: the left side is where Excalidraw opens its
          style panel whenever something is selected. */}
      <div className="pointer-events-none absolute right-3 top-16 z-20 flex flex-col items-end gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className="pointer-events-auto h-8 gap-1.5 shadow-overlay" title="Start from a template">
              <LayoutGrid className="h-3.5 w-3.5" /> Templates
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <TemplateList onPick={insertTemplate} />
          </PopoverContent>
        </Popover>
        {fresh.length > 0 && (
          <Button size="sm" className="pointer-events-auto h-8 gap-1.5 shadow-overlay" onClick={() => setTasksOpen(true)}>
            <CheckSquare className="h-3.5 w-3.5" />
            {fresh.length === 1 ? "Make a task" : `Make ${fresh.length} tasks`}
          </Button>
        )}
      </div>

      {empty && !pickerOpen && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto w-[min(92vw,26rem)] rounded-xl border bg-popover p-4 shadow-xl">
            <p className="text-sm font-medium">Start from a template</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Or just start drawing. Everyone here sees it live.</p>
            <div className="mt-3">
              <TemplateList onPick={insertTemplate} />
            </div>
          </div>
        </div>
      )}

      <NotesToTasksDialog open={tasksOpen} onOpenChange={setTasksOpen} api={api} notes={notes} />
    </>
  )
}

function TemplateList({ onPick }: { onPick: (t: BoardTemplate) => void }) {
  return (
    <ul className="grid gap-1">
      {BOARD_TEMPLATES.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onPick(t)}
            className="w-full rounded-md px-2.5 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <span className="block text-sm font-medium">{t.name}</span>
            <span className="block text-xs text-muted-foreground">{t.description}</span>
          </button>
        </li>
      ))}
    </ul>
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
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
          {fresh.map((n) => (
            <li key={n.noteId} className="truncate">
              {n.text}
            </li>
          ))}
        </ul>
        {!projects.isLoading && (projects.data?.data ?? []).length === 0 ? (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
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
