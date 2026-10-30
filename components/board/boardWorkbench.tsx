"use client"

// The board's tools, in one chunk loaded after the canvas paints (the board
// route's first load stays the canvas and its chrome): the empty board's
// templates, the sticky tool, the notes bar, the frame bar, the template
// picker, the Frames panel, saving the board as a template, its exports and
// opening a board file, each lazy again where only a press needs it.
//
// It follows the scene once (useBoardSelection) and hands each tool what it
// needs, and it answers the page's commands (a button in a cluster that the
// page renders before this chunk has loaded).

import * as React from "react"
import dynamic from "next/dynamic"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import BoardTools, { insertBoardTemplate } from "@/components/board/boardTools"
import StickyTool from "@/components/board/stickyTool"
import NotesBar, { FrameBar, HideExcalidrawPanel } from "@/components/board/notesBar"
import { BOARD_TEMPLATES } from "@/lib/board/templates"
import { STYLE_FONT, STYLE_ROUGHNESS, isStickyNote, type BoardStyle } from "@/lib/board/notes"
import { linkedFromSearch } from "@/lib/board/frames"
import { selectedIn, whenSceneReady } from "@/lib/board/scene"
import { frameDrawing, loadBoardViewport } from "@/lib/board/camera"
import { CAPTURE } from "@/lib/board/binding"
import { isTeamPick, teamTemplateRef, templateElementsOf, type BoardPick } from "@/lib/board/teamTemplates"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { getTemplate } from "@/services/marketplaceService"
import { useToast } from "@/hooks/use-toast"
import { app_board_path } from "@/types/paths"
import { addCopies, fitTypedNote, loadConvert, type Convert, type SceneElement } from "@/components/board/boardOps"
import { NoteTagChips } from "@/components/board/noteTagChips"
import { TagFilterPill, TagVeil } from "@/components/board/tagFilter"
import { useTagHues } from "@/components/board/tagHues"
import { useBoardVoting } from "@/components/board/useBoardVoting"
import { BoardHereNow } from "@/components/board/boardHereNow"
import { BoardMap } from "@/components/board/boardMap"
import { useBottomRow } from "@/components/board/bottomRow"
import { useMedia } from "@/context/MediaQueryContext"

const TemplatePicker = dynamic(() => import("@/components/board/templatePicker"), { ssr: false })
const FramesPanel = dynamic(() => import("@/components/board/framesPanel"), { ssr: false })
const TagFilterPanel = dynamic(() => import("@/components/board/tagFilterPanel"), { ssr: false })
const SaveBoardTemplate = dynamic(() => import("@/components/board/saveBoardTemplate"), { ssr: false })
const BoardExport = dynamic(() => import("@/components/board/boardExport"), { ssr: false })

const NOBODY = { id: "", name: "" }

/** A press in the page's chrome, for a tool here: a new `at` each time. */
export interface BoardCommand {
  kind: "note" | "templates" | "frames" | "tagFilter" | "saveTemplate" | "export" | "openFile"
  at: number
}

/** Lays a team's template on the board (miro-19 3), from its full read: copies, as one undo step. */
async function layTeamTemplate(api: ExcalidrawImperativeAPI, templateId: string): Promise<void> {
  const elements = templateElementsOf(await getTemplate(templateId))
  if (elements.length === 0) throw new Error("the template has nothing on it")
  addCopies(api, elements, `team-${Date.now().toString(36)}`, { animate: !prefersReducedMotion() })
}

export interface BoardSelection {
  /** Every selected element, by id, in the scene's order: what a drag carries, with a selected frame's elements. */
  ids: string[]
  /** Selected sticky notes, by id. */
  notes: string[]
  /** The one selected frame, if a frame alone is selected. */
  frame: string | null
  /** Something's words are being typed. */
  editing: boolean
  /** The words being typed are a note's: its bar's place, so Excalidraw's panel stays away. */
  editingNote: boolean
}

const NONE: BoardSelection = { ids: [], notes: [], frame: null, editing: false, editingNote: false }
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])

/**
 * What is selected, read from the scene once a change, and only when the
 * elements or the selection changed (a pan or a zoom changes neither).
 */
export function useBoardSelection(api: ExcalidrawImperativeAPI | null): BoardSelection {
  const [sel, setSel] = React.useState<BoardSelection>(NONE)
  React.useEffect(() => {
    if (!api) return
    let lastEls: readonly unknown[] | null = null
    let lastIds: unknown = null
    let lastEditing: unknown = null
    const read = (elements: readonly unknown[], appState: { selectedElementIds?: Record<string, boolean>; editingTextElement?: { containerId?: string | null } | null }) => {
      if (elements === lastEls && appState.selectedElementIds === lastIds && appState.editingTextElement === lastEditing) return
      lastEls = elements
      lastIds = appState.selectedElementIds
      lastEditing = appState.editingTextElement
      const ids = appState.selectedElementIds ?? {}
      // The selected ones, without a walk of the scene (none when nothing is selected).
      const chosen = selectedIn(elements as SceneElement[], Object.keys(ids).filter((id) => ids[id]))
      const notes = chosen.filter((e) => isStickyNote(e as never)).map((e) => e.id)
      const frames = chosen.filter((e) => e.type === "frame")
      const holder = appState.editingTextElement?.containerId
      const next: BoardSelection = {
        ids: chosen.map((e) => e.id),
        notes,
        frame: frames.length === 1 && chosen.length === 1 ? frames[0].id : null,
        editing: !!appState.editingTextElement,
        editingNote: !!holder && (elements as SceneElement[]).some((e) => e.id === holder && isStickyNote(e as never)),
      }
      setSel((prev) =>
        prev.editing === next.editing && prev.editingNote === next.editingNote && prev.frame === next.frame && sameIds(prev.ids, next.ids) && sameIds(prev.notes, next.notes) ? prev : next,
      )
    }
    read(api.getSceneElements(), api.getAppState() as never)
    return api.onChange((els, st) => read(els, st as never))
  }, [api])
  return sel
}

/**
 * A note keeps its size while its words are typed (miro-07; boardOps fitTypedNote), on the screen typing them.
 * Every other screen gets the fitted note with the words, so no two screens fit the same note.
 */
export function useTypedNoteFit(api: ExcalidrawImperativeAPI | null, editable: boolean): void {
  React.useEffect(() => {
    if (!api || !editable) return
    let convert: Convert | null = null
    let live = true
    loadConvert().then(
      (c) => {
        if (live) convert = c
      },
      () => {
        // Excalidraw's code didn't come: the note keeps Excalidraw's own ways, and nothing is left unhandled.
      },
    )
    // The words' last version seen, so a change that isn't to them (or the fit's own write, once) costs nothing.
    let seen = ""
    const off = api.onChange((elements, appState) => {
      const editing = (appState as { editingTextElement?: { id: string; containerId?: string | null } | null }).editingTextElement
      if (!convert || !editing?.containerId) return
      const words = (elements as readonly { id: string; version: number }[]).find((e) => e.id === editing.id)
      if (!words || `${words.id}:${words.version}` === seen) return
      seen = `${words.id}:${words.version}`
      fitTypedNote(api, convert, words.id)
    })
    return () => {
      live = false
      off()
    }
  }, [api, editable])
}

export default function BoardWorkbench({
  api,
  provider,
  boardId,
  editable,
  synced,
  quiet,
  command,
  style,
  title = "",
  user,
  host = null,
}: {
  api: ExcalidrawImperativeAPI | null
  provider: HocuspocusProvider
  boardId: string
  editable: boolean
  synced: boolean
  /** Another card is over the canvas (the AI composer). */
  quiet: boolean
  command: BoardCommand | null
  /** The board's style (components/board/boardStyle), for new notes and shapes. */
  style: BoardStyle | null
  /** The board's name, a template saved from it starts with. */
  title?: string
  /** Who's here, for the notes bar's Vote (miro-07 6); none yet, no vote from the bar. */
  user?: { id: string; name: string }
  /** The board page's own element, where Excalidraw's cluster is found for the map's button (miro-04 3). */
  host?: HTMLElement | null
}) {
  const selection = useBoardSelection(api)
  // A note keeps its size while its words are typed, its words shrinking to fit it (miro-07).
  useTypedNoteFit(api, editable)
  // A tag is one colour for everyone: on the notes and in the notes bar (miro-07 5).
  const tagHues = useTagHues(provider, synced)
  // Dot voting's round, shared with the facilitation bar: the notes bar votes in it while it's on.
  const votes = useBoardVoting(provider, user ?? NOBODY, editable && !!user)
  const { isMobile } = useMedia()
  // The bottom row on a computer (the pill, Excalidraw's tool row and zoom cluster, the facilitation bar): one
  // measured layout at every width, written on the page's element (components/board/bottomRow.ts).
  useBottomRow(host, !isMobile)
  const { toast } = useToast()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [framesOpen, setFramesOpen] = React.useState(false)
  // Filter by tag (miro-07 5): the tags picked, this person's view only, kept while they work; and its panel, in the
  // Frames panel's place (one at a time).
  const [filterTags, setFilterTags] = React.useState<string[]>([])
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [noteNow, setNoteNow] = React.useState(0)
  const fileRef = React.useRef<HTMLInputElement>(null)

  // An .excalidraw file laid on the board (miro-36), where the person is looking.
  const openFile = async (file: File) => {
    if (!api) return
    try {
      const { openBoardFile } = await import("@/components/board/boardExport")
      const n = await openBoardFile(api, file)
      toast({ title: n === 0 ? "The file has nothing on it" : `${n} ${n === 1 ? "thing" : "things"} from ${file.name} laid on the board` })
    } catch {
      toast({ variant: "destructive", title: "That file couldn't be opened", description: "Choose an .excalidraw file, from OneCamp or Excalidraw." })
    }
  }

  // The page's presses.
  React.useEffect(() => {
    if (!command) return
    if (command.kind === "templates") setPickerOpen(true)
    else if (command.kind === "frames") {
      setFramesOpen((o) => !o)
      setFilterOpen(false)
    } else if (command.kind === "tagFilter") {
      setFilterOpen((o) => !o)
      setFramesOpen(false)
    } else if (command.kind === "saveTemplate") setSaving(true)
    else if (command.kind === "export") setExporting(true)
    else if (command.kind === "openFile") fileRef.current?.click()
    else setNoteNow(command.at)
  }, [command])

  // A template from the picker: the library's drawn from its skeleton in the board's style, a team's copied as it was saved.
  const applyTemplate = (a: ExcalidrawImperativeAPI, t: BoardPick) => (isTeamPick(t) ? layTeamTemplate(a, t.templateId) : insertBoardTemplate(a, t, style ?? undefined))

  // New shapes and words take the board's style; a style chosen by someone
  // else arrives here too.
  React.useEffect(() => {
    if (!api || !style) return
    api.updateScene({
      appState: { currentItemRoughness: STYLE_ROUGHNESS[style], currentItemFontFamily: STYLE_FONT[style] } as never,
      captureUpdate: CAPTURE.NEVER,
    })
  }, [api, style])

  // ?template=<id> (a board made from a template on the boards list), and
  // ?frame=<id> or ?element=<id> (a link to a frame, an element or a group):
  // once the board has synced, then the address is put back, so a reload
  // doesn't do it again.
  const handled = React.useRef(false)
  const stopGoing = React.useRef<(() => void) | null>(null)
  React.useEffect(() => () => stopGoing.current?.(), [])
  React.useEffect(() => {
    if (!api || !synced || handled.current) return
    const search = window.location.search
    const template = new URLSearchParams(search).get("template")
    const place = linkedFromSearch(search)
    if (!template && !place) return
    handled.current = true
    if (template && editable && !api.getSceneElements().some((e) => !e.isDeleted)) {
      const team = teamTemplateRef(template)
      if (team) {
        // The workspace's own (the Templates page, or the boards list's picker).
        layTeamTemplate(api, team).catch(() =>
          toast({ variant: "destructive", title: "The template couldn't be laid on the board", description: "It may have been removed. Choose another from Templates." }),
        )
      } else {
        // One of the five, or any of the library (loaded for it).
        const own = BOARD_TEMPLATES.find((x) => x.id === template)
        void (own ? Promise.resolve(own) : import("@/lib/board/templateLibrary").then((m) => m.boardTemplate(template))).then((t) => {
          if (t) void insertBoardTemplate(api, t, style ?? undefined)
        })
      }
    }
    if (place) {
      // The drawing lands a frame or two after the sync: go there once the
      // place is on the scene (Excalidraw finds an element, or a group's
      // elements, by the id), or say so after about a second when it isn't.
      const here = () => api.getSceneElements().some((e) => !e.isDeleted && (e.id === place || e.groupIds.includes(place)))
      // A first visit has no camera of its own to stay at (the canvas left it
      // to the link): read before the wait, while the canvas keeps nothing yet.
      const firstVisit = !loadBoardViewport(boardId)
      let frames = 0
      stopGoing.current = whenSceneReady(
        () => !here() && ++frames < 60,
        () => {
          if (here()) {
            api.scrollToContent(place, { fitToContent: true, animate: true })
            return
          }
          // News, not a success: without a tone the toaster drew a green check for something gone.
          toast({ title: "That's no longer on the board", description: "It may have been deleted.", tone: "info" })
          // Never empty canvas: frame the drawing, as a visit without the link would.
          if (firstVisit) frameDrawing(api)
        },
      )
    }
    window.history.replaceState(null, "", `${app_board_path}/${boardId}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- style is read once, with the template: a later change of style is no reason to lay it again
  }, [api, synced, editable, boardId])

  if (!api) return null

  return (
    <>
      <BoardTools api={api} editable={editable} boardId={boardId} synced={synced} quiet={quiet || pickerOpen} onMoreTemplates={() => setPickerOpen(true)} style={style ?? undefined} />
      {editable && (
        <StickyTool api={api} selection={selection} style={style ?? "sketch"} noteNow={noteNow} onFrames={() => {
            setFramesOpen(true)
            setFilterOpen(false)
          }}
        />
      )}
      <TagVeil api={api} tags={filterTags} />
      {/* Here now's Jump to and Follow (miro-04 4), for everyone on the board, and the following frame. */}
      <BoardHereNow provider={provider} api={api} boardId={boardId} host={host} />
      {/* The board's map, on a computer: a phone's board is small enough to cross with a finger. */}
      {!isMobile && <BoardMap api={api} host={host} />}
      <NoteTagChips api={api} tagHues={tagHues} filter={filterTags} selected={selection.ids} />
      {editable && selection.notes.length > 0 && !selection.editing && <NotesBar api={api} ids={selection.notes} tagHues={tagHues} votes={votes} />}
      {editable && selection.editingNote && <HideExcalidrawPanel />}
      {editable && selection.frame && !selection.editing && <FrameBar api={api} frameId={selection.frame} boardId={boardId} />}
      {pickerOpen && editable && <TemplatePicker onUse={(t) => applyTemplate(api, t)} onClose={() => setPickerOpen(false)} />}
      {framesOpen && <FramesPanel api={api} provider={provider} boardId={boardId} editable={editable} onClose={() => setFramesOpen(false)} />}
      {filterOpen && <TagFilterPanel api={api} tags={filterTags} onTags={setFilterTags} tagHues={tagHues} editable={editable} onClose={() => setFilterOpen(false)} />}
      {!filterOpen && !framesOpen && filterTags.length > 0 && (
        <TagFilterPill api={api} tags={filterTags} onOpen={() => setFilterOpen(true)} onClear={() => setFilterTags([])} />
      )}
      {saving && editable && <SaveBoardTemplate api={api} title={title} onClose={() => setSaving(false)} />}
      {exporting && <BoardExport api={api} provider={provider} title={title} onClose={() => setExporting(false)} />}
      {editable && (
        <input
          ref={fileRef}
          type="file"
          accept=".excalidraw,application/vnd.excalidraw+json,application/json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          data-board-open-file=""
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void openFile(file)
          }}
        />
      )}
    </>
  )
}
