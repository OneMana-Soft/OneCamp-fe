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
import type { AddWorkReads } from "@/components/board/addWorkReads"
import BoardTools, { insertBoardTemplate } from "@/components/board/boardTools"
import StickyTool from "@/components/board/stickyTool"
import NotesBar, { FrameBar, Floating, HideExcalidrawPanel } from "@/components/board/notesBar"
import { BOARD_TEMPLATES } from "@/lib/board/templates"
import { STYLE_FONT, STYLE_ROUGHNESS, isStickyNote, type BoardStyle } from "@/lib/board/notes"
import { findFromSearch, linkedFromSearch } from "@/lib/board/frames"
import { selectedIn, whenSceneReady } from "@/lib/board/scene"
import { frameDrawing, loadBoardViewport } from "@/lib/board/camera"
import { CAPTURE } from "@/lib/board/binding"
import { isTeamPick, teamTemplateRef, templateElementsOf, type BoardPick } from "@/lib/board/teamTemplates"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { getTemplate } from "@/services/marketplaceService"
import { useToast } from "@/hooks/use-toast"
import { app_board_path } from "@/types/paths"
import { addCopies, fitNotesToFaces, fitTypedNote, loadConvert, type Convert, type SceneElement } from "@/components/board/boardOps"
import { NoteTagChips } from "@/components/board/noteTagChips"
import { TagFilterPill, TagVeil } from "@/components/board/tagFilter"
import { useTagHues } from "@/components/board/tagHues"
import { useBoardVoting } from "@/components/board/useBoardVoting"
import { BoardHereNow } from "@/components/board/boardHereNow"
import { BoardMap } from "@/components/board/boardMap"
import { useBottomRow } from "@/components/board/bottomRow"
import { BoardSideFrame, SIDE_PANELS, SidePanelShape } from "@/components/board/boardSidePanel"
import { lazyPanel } from "@/lib/lazy/lazyPanel"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { useCanProtect, useProtection } from "@/lib/board/protection"
import { lazyChunk } from "@/lib/loadChunk"
import { useMedia } from "@/context/MediaQueryContext"

const TemplatePicker = dynamic(() => import("@/components/board/templatePicker"), { ssr: false })
const SaveBoardTemplate = dynamic(() => import("@/components/board/saveBoardTemplate"), { ssr: false })
const BoardExport = dynamic(() => import("@/components/board/boardExport"), { ssr: false })
// The side panels, each its own chunk, drawn in their frame from the first frame (BoardSideFrame, V-195): the panel's
// shape while its code comes, at 10 s the slow line with Try again, or a failure (lib/lazy/lazyPanel). Board options
// warms the chunks it lists as it opens (lib/loadChunk), so a panel drawn after finds its code in, or on its way.
const PANEL = "this panel"
const SIDE_CODE = {
  frames: () => import("@/components/board/framesPanel").then((m) => m.default),
  tagFilter: () => import("@/components/board/tagFilterPanel").then((m) => m.default),
  addWork: () => import("@/components/board/addWorkPanel").then((m) => m.default),
  find: () => import("@/components/board/findPanel").then((m) => m.default),
}
const FramesPanel = lazyPanel(SIDE_CODE.frames, PANEL, SidePanelShape)
const TagFilterPanel = lazyPanel(SIDE_CODE.tagFilter, PANEL, SidePanelShape)
const AddWorkPanel = lazyPanel(SIDE_CODE.addWork, PANEL, SidePanelShape)
const FindPanel = lazyPanel(SIDE_CODE.find, PANEL, SidePanelShape)
// Protected objects (miro-44): their badges, and Protect in a selection's bar, one chunk for a board that has a
// protected object or a reader who may protect.
const ProtectedLayer = lazyPiece(() => import("@/components/board/protectedLayer"))
const ProtectControl = lazyPiece(() => import("@/components/board/protectedLayer").then((m) => ({ default: m.ProtectControl })))
const WARM = { frames: lazyChunk(SIDE_CODE.frames), tagFilter: lazyChunk(SIDE_CODE.tagFilter), addWork: lazyChunk(SIDE_CODE.addWork), find: lazyChunk(SIDE_CODE.find) }

const NOBODY = { id: "", name: "" }
/** No tag filter: while Find dims the rest, its veil stands for the filter's. */
const NO_TAGS: readonly string[] = []

/**
 * A press in the page's chrome, for a tool here: a new `at` each time. "warm" is the page's Board options opening:
 * the side panels it lists fetch their code then, so a tap on one rarely waits (V-195).
 */
export interface BoardCommand {
  kind: "note" | "templates" | "frames" | "tagFilter" | "addWork" | "find" | "saveTemplate" | "export" | "openFile" | "warm"
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

/**
 * Notes whose words were laid out in a face that isn't theirs are fitted again in it (miro-07, V-229; boardOps
 * fitNotesToFaces), on the screen of someone who may edit: once the board has synced, which heals a board saved with
 * the fallback face's widths, and again as each face lands (the font set's loadingdone, on which Excalidraw only draws
 * the words again). Every other screen gets the fit as any edit. A viewer's screen never writes, nor does a link guest's,
 * whose board has no workbench.
 */
export function useNotesFitTheirFaces(api: ExcalidrawImperativeAPI | null, editable: boolean, synced: boolean): void {
  React.useEffect(() => {
    const fonts = typeof document === "undefined" ? undefined : document.fonts
    if (!api || !editable || !synced || !fonts) return
    let convert: Convert | null = null
    let live = true
    let frame = 0
    // The words found right in their face, by version, so a face landing later costs nothing for them.
    const seen = new Set<string>()
    // A frame later: once the synced drawing is on the scene, and Excalidraw has drawn a face that just landed.
    const fit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (live && convert) fitNotesToFaces(api, convert, seen)
      })
    }
    loadConvert().then(
      (c) => {
        if (!live) return
        convert = c
        fit()
      },
      () => {
        // Excalidraw's code didn't come: the notes keep the layout they have, and nothing is left unhandled.
      },
    )
    fonts.addEventListener("loadingdone", fit)
    return () => {
      live = false
      cancelAnimationFrame(frame)
      fonts.removeEventListener("loadingdone", fit)
    }
  }, [api, editable, synced])
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
  addWorkReads: WithAddWorkReads,
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
  /** Add from OneCamp's reads and states, from the board page's first load (components/board/addWorkReads). */
  addWorkReads?: React.ComponentType<{ children: (reads: AddWorkReads) => React.ReactNode }>
}) {
  const selection = useBoardSelection(api)
  // What's protected (miro-44): a protected selection gets no notes or frame bar (the server puts back any change to
  // it), only who protected it, and Lift protection for those who may.
  const protection = useProtection(provider.document)
  // The board's owner or a workspace admin protects objects and lifts protection (getBoardInfo's board_can_protect).
  const canProtect = useCanProtect(boardId)
  const held = protection.size > 0 && selection.ids.some((id) => protection.has(id))
  // A note keeps its size while its words are typed, its words shrinking to fit it (miro-07).
  useTypedNoteFit(api, editable)
  // And notes laid out before their face had come are fitted again in it as it lands, on open too (V-229).
  useNotesFitTheirFaces(api, editable, synced)
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
  // The side panel open, one at a time in one place: Frames, Filter by tag, Add from OneCamp (miro-13 2), or Find
  // and replace (miro-05).
  const [side, setSide] = React.useState<keyof typeof SIDE_PANELS | null>(null)
  const closeSide = () => setSide(null)
  // What Find was last asked: its words (a search hit's), when (each ask focuses it again), and whether a link asked.
  const [find, setFind] = React.useState({ query: "", at: 0, fromLink: false })
  const askFind = React.useCallback((query = "", fromLink = false) => {
    setFind({ query, at: Date.now(), fromLink })
    setSide("find")
  }, [])

  // Ctrl or Cmd+F while the board has the focus opens Find on board: ours, as Excalidraw's own can't replace or be
  // told what to find. Anywhere else on the page it stays the browser's.
  React.useEffect(() => {
    if (!host) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f" || e.isComposing) return
      if (!(e.target instanceof Node) || !host.contains(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      askFind()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [host, askFind])
  // Filter by tag (miro-07 5): the tags picked, this person's view only, kept while they work.
  const [filterTags, setFilterTags] = React.useState<string[]>([])
  // What Find keeps clear while it dims the rest of the board (V-271), and where it draws that veil.
  const [found, setFound] = React.useState<ReadonlySet<string> | null>(null)
  const [veilHost, setVeilHost] = React.useState<HTMLElement | null>(null)
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
    else if (command.kind === "find") {
      setFind({ query: "", at: command.at, fromLink: false })
      setSide((open) => (open === "find" ? null : "find"))
    } else if (command.kind === "frames" || command.kind === "tagFilter" || command.kind === "addWork") {
      const kind = command.kind
      setSide((open) => (open === kind ? null : kind))
    } else if (command.kind === "saveTemplate") setSaving(true)
    else if (command.kind === "export") setExporting(true)
    else if (command.kind === "openFile") fileRef.current?.click()
    else if (command.kind === "note") setNoteNow(command.at)
  }, [command])
  // Board options opened: the side panels it lists fetch their code now (V-195). Find and Filter by tag are everyone's;
  // Frames and Add from OneCamp an editor's. A second warm of a panel whose code is in, or on its way, asks nothing.
  React.useEffect(() => {
    if (command?.kind !== "warm") return
    WARM.find.warm()
    WARM.tagFilter.warm()
    if (!editable) return
    WARM.frames.warm()
    if (WithAddWorkReads) WARM.addWork.warm()
  }, [command, editable, WithAddWorkReads])

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
  // A link's words opened a board with no camera of its own: when they're gone, the drawing is framed instead.
  const findFirstVisit = React.useRef(false)
  const stopGoing = React.useRef<(() => void) | null>(null)
  React.useEffect(() => () => stopGoing.current?.(), [])
  React.useEffect(() => {
    if (!api || !synced || handled.current) return
    const search = window.location.search
    const template = new URLSearchParams(search).get("template")
    const place = linkedFromSearch(search)
    // ?find=<words> (a search hit on the board's words, miro-05): Find opens on them, at the first.
    const words = findFromSearch(search)
    if (!template && !place && !words) return
    handled.current = true
    if (words) {
      findFirstVisit.current = !loadBoardViewport(boardId)
      askFind(words, true)
    }
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

  // The side panel open, in its frame (V-195): the frame rises at once, and the panel fills it once its code is in.
  const sidePanel =
    side === "frames" ? (
      <FramesPanel api={api} provider={provider} boardId={boardId} editable={editable} onClose={closeSide} />
    ) : side === "find" ? (
      <FindPanel
        api={api}
        editable={editable}
        query={find.query}
        at={find.at}
        fromLink={find.fromLink}
        onMissed={() => {
          toast({ title: "Those words are no longer on the board", description: "They may have been changed or deleted.", tone: "info" })
          if (findFirstVisit.current) frameDrawing(api)
        }}
        onClose={closeSide}
        veilHost={veilHost}
        onKept={setFound}
      />
    ) : side === "tagFilter" ? (
      <TagFilterPanel api={api} tags={filterTags} onTags={setFilterTags} tagHues={tagHues} editable={editable} onClose={closeSide} />
    ) : side === "addWork" && editable && WithAddWorkReads ? (
      <WithAddWorkReads>{(reads) => <AddWorkPanel api={api} onClose={closeSide} reads={reads} />}</WithAddWorkReads>
    ) : null

  // The bars a selection gets: the notes bar or the frame bar, unless it's protected; and in it, or on its own,
  // Protect for those who may, or who protected it for everyone.
  const notesBar = editable && selection.notes.length > 0 && !selection.editing && !held
  const frameBar = editable && !!selection.frame && !selection.editing && !held
  const mayProtect = canProtect && editable
  const protect =
    selection.ids.length > 0 && !selection.editing && (mayProtect || held)
      ? (lead: boolean) => (
          <React.Suspense fallback={null}>
            <ProtectControl api={api} boardId={boardId} ids={selection.ids} record={protection} canProtect={mayProtect} lead={lead} />
          </React.Suspense>
        )
      : null

  return (
    <>
      <BoardTools api={api} editable={editable} boardId={boardId} synced={synced} quiet={quiet || pickerOpen} onMoreTemplates={() => setPickerOpen(true)} style={style ?? undefined} />
      {editable && (
        <StickyTool api={api} selection={selection} style={style ?? "sketch"} noteNow={noteNow} onFrames={() => {
            setSide("frames")
          }}
        />
      )}
      {/* One veil at a time: Find's while it dims the rest (V-271), else the tag filter's. Find draws its own into the
          host (its rules are in its chunk), here under the tag chips, which fade with it. */}
      <TagVeil api={api} tags={found ? NO_TAGS : filterTags} />
      <div ref={setVeilHost} data-find-veil-host="" className="contents" />
      {/* Here now's Jump to and Follow (miro-04 4), for everyone on the board, and the following frame. */}
      <BoardHereNow provider={provider} api={api} boardId={boardId} host={host} editable={editable} synced={synced} />
      {/* The board's map, on a computer: a phone's board is small enough to cross with a finger. */}
      {!isMobile && <BoardMap api={api} host={host} />}
      <NoteTagChips api={api} tagHues={tagHues} filter={found ? NO_TAGS : filterTags} lit={found} selected={selection.ids} />
      {notesBar && <NotesBar api={api} ids={selection.notes} tagHues={tagHues} votes={votes} extra={protect && protect(true)} />}
      {editable && selection.editingNote && <HideExcalidrawPanel />}
      {frameBar && <FrameBar api={api} frameId={selection.frame!} boardId={boardId} extra={protect && protect(true)} />}
      {protect && !notesBar && !frameBar && (
        <Floating api={api} ids={selection.ids} label="Protection" attr="data-protect-bar">
          {protect(false)}
        </Floating>
      )}
      {/* Nothing changed on a protected selection stays (the server puts it back), so Excalidraw's style panel steps
          away for it as for notes, and the bar and the badge are its only chrome (DB-113 F1). */}
      {held && protect && <HideExcalidrawPanel />}
      {protection.size > 0 && (
        <React.Suspense fallback={null}>
          <ProtectedLayer api={api} doc={provider.document} record={protection} canProtect={mayProtect} />
        </React.Suspense>
      )}
      {pickerOpen && editable && <TemplatePicker onUse={(t) => applyTemplate(api, t)} onClose={() => setPickerOpen(false)} />}
      {side && sidePanel && (
        <BoardSideFrame key={side} {...SIDE_PANELS[side](editable)} onClose={closeSide}>
          {sidePanel}
        </BoardSideFrame>
      )}
      {side === null && filterTags.length > 0 && (
        <TagFilterPill api={api} tags={filterTags} onOpen={() => setSide("tagFilter")} onClear={() => setFilterTags([])} />
      )}
      {saving && editable && <SaveBoardTemplate api={api} title={title} onClose={() => setSaving(false)} />}
      {exporting && <BoardExport api={api} provider={provider} title={title} boardId={boardId} onClose={() => setExporting(false)} />}
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
