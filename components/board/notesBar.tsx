"use client"

// The bar beside a selection (design-22 1; miro-07 6), in the app's
// FloatingBar: what people change on notes, where they're looking.
//
//  - Notes: colour, size, tags (and a tag's colour, for everyone), a vote
//    while a round is on (miro-07 6), tidy into a grid, cluster into frames
//    by tag or colour (miro-07 5), make tasks, and More, which opens
//    Excalidraw's own panel (hidden while notes are selected).
//  - One frame: lay its notes out in a grid, rows or columns (miro-11), and
//    copy a link that opens the board at it (miro-04).
//
// It sits above the selection, or below it near the top of the canvas, and
// slides with it as the board moves. On a phone each picker is a sheet.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import { useSheetMode } from "@/components/ui/overlayMode"
import { BarPicker } from "@/components/board/barPicker"
import { useBoardView } from "@/hooks/useBoardView"
import { useElementsChanged } from "@/hooks/useElementsChanged"
import { useSceneElements } from "@/hooks/useSceneElements"
import { useToast } from "@/hooks/use-toast"
import { useMedia } from "@/context/MediaQueryContext"
import { Columns3, Ellipsis, LayoutGrid, Link2, Tag, Vote } from "@/lib/icons"
import { ToggleChip } from "@/components/ui/toggleChip"
import { cn } from "@/lib/utils/helpers/cn"
import { PHONE_DOCK } from "@/components/board/phoneDock"
import { boxInView, sceneToLocal } from "@/lib/board/viewport"
import { NOTE_COLOURS, nextNoteSize, noteColourOf, noteSizeOf, type NoteColourId, type NoteSize } from "@/lib/board/notes"
import { boardTags, clusterGroups, clusterLayout, hasAnyTag, normaliseTags, noteTags, tagKey, tagKeys, tidyNotes, withoutTag, type ClusterBy } from "@/lib/board/sticky"
import { frameLink, layoutFrame, type FrameLayout } from "@/lib/board/frames"
import { clusterIntoFrames, moveElements, recolourNotes, resizeNotes, tagNotes, type SceneElement } from "@/components/board/boardOps"
import { NotesToTasksDialog } from "@/components/board/boardTools"
import { NoteSwatches } from "@/components/board/stickyTool"
import { NOTE_KEYS, ariaKeys, noteKeyOf, notForTheBoard, withKey, type NoteKey } from "@/components/board/boardKeys"
import { isMacLike } from "@/lib/keys/chord"
import { HueSwatches } from "@/components/ui/hueSwatches"
import { HueDot } from "@/components/ui/chip"
import type { TagHues } from "@/components/board/tagHues"
import { ix } from "@/lib/ui/interactive"
import { isStickyNote, makeTasksLabel, selectedNotes, type SelectedNote } from "@/lib/board/notes"
import { drawnBox, selectedIn } from "@/lib/board/scene"
import { votableNotes } from "@/lib/board/facilitation"
import type { BoardVotes } from "@/components/board/useBoardVoting"

/**
 * The bar's foot above a selection: Excalidraw's turn handle sits 18 to 26 px
 * above it (a mouse's 8 px handle, 16 px out), and the bar keeps 8 px clear of
 * it. Below a selection there is no handle.
 */
const ABOVE = 34
const BELOW = 14

/**
 * Where a bar goes for a selection: centred above it, or below it when above
 * would be under the board's own clusters; null when it's out of view. Placed
 * again when the view moves, and when the selection itself changes: a drop, a
 * nudge, an undo, a collaborator's move. Excalidraw moves elements in place,
 * so neither the view nor the array says so (useElementsChanged). While they
 * move by hand it holds: the bar is away then ([data-board-moving]), and comes
 * back above their new place (miro-06).
 */
function useBarSpot(api: ExcalidrawImperativeAPI, ids: readonly string[], bar: React.RefObject<HTMLDivElement | null>) {
  const view = useBoardView(api)
  const moved = useElementsChanged(api, ids)
  const [spot, setSpot] = React.useState<{ left: number; top: number; below: boolean } | null>(null)
  React.useLayoutEffect(() => {
    if (!view) return
    const els = selectedIn(api.getSceneElements() as unknown as SceneElement[], ids)
    const b = drawnBox(els)
    if (!b) return setSpot(null)
    const tl = sceneToLocal(view, b.x, b.y)
    const br = sceneToLocal(view, b.x + b.width, b.y + b.height)
    const w = bar.current?.offsetWidth ?? 320
    const h = bar.current?.offsetHeight ?? 34
    if (!boxInView(view, tl.left, tl.top, br.left, br.top)) return setSpot(null)
    const left = Math.min(Math.max(12, (tl.left + br.left) / 2 - w / 2), view.width - w - 12)
    const above = tl.top - h - ABOVE
    const below = above < 64
    setSpot({ left, top: below ? Math.min(br.top + BELOW, view.height - h - 80) : above, below })
  }, [api, ids, view, bar, moved])
  return spot
}

/**
 * The bar's place, above (or below) the selection, following pans and zooms.
 * The bar's contents come from the parent, so a pan re-renders only this.
 */
function Floating({ api, ids, label, attr, children }: { api: ExcalidrawImperativeAPI; ids: readonly string[]; label: string; attr: string; children: React.ReactNode }) {
  const { isMobile } = useMedia()
  if (isMobile) {
    // A phone: low, one bar above the facilitation bar (PHONE_DOCK), off
    // Excalidraw's tool row at the top and its column of buttons on the right.
    // It steps aside while a note moves by hand, as the following bar does, so
    // a note dragged low is never under it (the same mark and rule, miro-06).
    return (
      <div className={cn("pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3", PHONE_DOCK.selection)} {...{ [attr]: "" }} data-phone-foot="" data-following-bar="">
        <FloatingBar label={label} className="pointer-events-auto h-11 max-w-full overflow-x-auto" data-board-chrome="">
          {children}
        </FloatingBar>
      </div>
    )
  }
  return <FollowingBar api={api} ids={ids} label={label} attr={attr}>{children}</FollowingBar>
}

/** On a computer: beside the selection, following pans and zooms. */
function FollowingBar({ api, ids, label, attr, children }: { api: ExcalidrawImperativeAPI; ids: readonly string[]; label: string; attr: string; children: React.ReactNode }) {
  const bar = React.useRef<HTMLDivElement>(null)
  const spot = useBarSpot(api, ids, bar)
  return (
    <div
      className={cn("pointer-events-none absolute left-0 top-0 z-20", !spot && "invisible")}
      style={spot ? { transform: `translate(${spot.left}px, ${spot.top}px)` } : undefined}
      // The one mark the board's drag rule sends away while a note moves by hand (excalidrawTheme.css).
      data-following-bar=""
      {...{ [attr]: "" }}
    >
      <FloatingBar ref={bar} label={label} follow below={spot?.below} className="pointer-events-auto max-sm:h-11" data-board-chrome="">
        {children}
      </FloatingBar>
    </div>
  )
}

/** While notes are selected, Excalidraw's own panel steps behind More. */
function useHideExcalidrawPanel(open: boolean) {
  React.useEffect(() => {
    const page = document.querySelector<HTMLElement>("[data-board-page]")
    if (!page) return
    page.dataset.notesSelected = "true"
    if (open) page.dataset.propsOpen = "true"
    else delete page.dataset.propsOpen
    return () => {
      delete page.dataset.notesSelected
      delete page.dataset.propsOpen
    }
  }, [open])
}

/** While a note's words are typed: Excalidraw's panel stays hidden, as it is while notes are selected (design-22 1). */
export function HideExcalidrawPanel() {
  useHideExcalidrawPanel(false)
  return null
}

const SIZES: { id: NoteSize; label: string; name: string }[] = [
  { id: "s", label: "S", name: "Small" },
  { id: "m", label: "M", name: "Medium" },
  { id: "l", label: "L", name: "Large" },
]

export default function NotesBar({ api, ids, tagHues, votes }: { api: ExcalidrawImperativeAPI; ids: string[]; tagHues: TagHues; votes?: BoardVotes }) {
  const [panel, setPanel] = React.useState(false)
  useHideExcalidrawPanel(panel)
  const { toast } = useToast()
  const sheet = useSheetMode()
  const [picker, setPicker] = React.useState<"colour" | "tags" | "cluster" | null>(null)
  const [tasksOpen, setTasksOpen] = React.useState(false)
  const [tagText, setTagText] = React.useState("")

  // Read once per selection and per change to the board (a colour, a tag, a
  // task link), never per frame of a pan.
  const all = useSceneElements<SceneElement>(api)
  const read = React.useMemo(() => {
    const chosen = selectedIn(all, ids)
    const colours = new Set(chosen.map((e) => noteColourOf(e)))
    const sizes = new Set(chosen.map((e) => noteSizeOf(e.width)))
    const notes = selectedNotes(all as never, Object.fromEntries(ids.map((id) => [id, true])))
    return {
      chosen,
      colour: colours.size === 1 ? [...colours][0] : null,
      size: sizes.size === 1 ? [...sizes][0] : null,
      onAll: tagKeys(chosen.flatMap((e) => noteTags(e))),
      known: picker === "tags" || picker === "cluster" ? boardTags(all) : [],
      notes,
    }
  }, [all, ids, picker])
  const { chosen, colour, size, onAll, known, notes } = read
  // While a round is on, the selection's notes that can take a vote (a note with words, as the dots go on).
  const canVote = !!votes?.canVote
  const votable = React.useMemo(() => {
    if (!canVote) return [] as string[]
    const picked = new Set(ids)
    return votableNotes(all).filter((n) => picked.has(n.id)).map((n) => n.id)
  }, [all, ids, canVote])
  const voted = votable.length > 0 && votable.every((id) => votes!.myVotes.includes(id))
  const idSet = new Set(ids)

  const setColour = (c: NoteColourId) => {
    recolourNotes(api, idSet, c)
    setPicker(null)
  }
  const toggleTag = (tag: string) => {
    const one = tagKeys([tag])
    const everyHas = chosen.every((e) => hasAnyTag(noteTags(e), one))
    tagNotes(api, (el) => {
      if (!idSet.has(el.id)) return null
      const now = noteTags(el)
      return everyHas ? withoutTag(now, tag) : normaliseTags([...now, tag])
    })
  }
  const addTag = () => {
    const [tag] = normaliseTags([tagText])
    if (!tag) return
    tagNotes(api, (el) => (idSet.has(el.id) ? normaliseTags([...noteTags(el), tag]) : null))
    setTagText("")
  }
  const tidy = () => moveElements(api, tidyNotes(chosen))
  // The bar on keys (components/board/boardKeys), while its notes are selected and nothing else has the keys.
  const act = React.useRef<(k: NoteKey | NoteColourId) => void>(() => {})
  act.current = (k) => {
    if (k === "vote") votes?.vote(votable)
    else if (k === "tidy") tidy()
    else if (k === "tags" || k === "colour") setPicker(k)
    else if (k === "tasks") {
      if (notes.some((n) => !n.taskUuid)) setTasksOpen(true)
    } else if (k === "size") void resizeNotes(api, idSet, nextNoteSize(size))
    else setColour(k)
  }
  // Alt+U is the bar's only while there's a vote to give: otherwise the key goes on as if the bar weren't there.
  const voteKeyOn = React.useRef(false)
  voteKeyOn.current = votable.length > 0
  React.useEffect(() => {
    const mac = isMacLike()
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || notForTheBoard(e)) return
      const k = noteKeyOf(e, mac)
      if (!k || (k === "vote" && !voteKeyOn.current)) return
      e.preventDefault()
      e.stopPropagation()
      act.current(k)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])
  // The selection's tags, in the board's casing, for their colours.
  const tagsHere = known.filter(({ tag }) => onAll.has(tagKey(tag))).map(({ tag }) => tag)
  const stickies = chosen.filter((e) => isStickyNote(e as never))
  const groupsBy = (by: ClusterBy) => clusterGroups(stickies as never, by, known.map(({ tag }) => tag))
  // Each note goes with its first tag, so the frames By tag makes can be fewer than the tags here.
  const tagFrames = onAll.size > 0 ? groupsBy("tag").length : 0
  const cluster = (by: ClusterBy) => {
    const box = drawnBox(stickies)
    if (!box) return
    const groups = groupsBy(by)
    const { frames, places } = clusterLayout(groups, new Map(stickies.map((e) => [e.id, e])), box)
    clusterIntoFrames(api, frames, places)
    setPicker(null)
    toast({
      title: `${stickies.length} notes in ${frames.length === 1 ? "a frame" : `${frames.length} frames`}`,
      description: by === "tag" ? "A frame for each tag, named for it." : "A frame for each colour, named for it.",
    })
  }

  return (
    <>
      <Floating api={api} ids={ids} label={ids.length === 1 ? "Note" : `${ids.length} notes`} attr="data-notes-bar">
          <BarPicker
            title="Colour"
            open={picker === "colour"}
            onOpenChange={(o) => setPicker(o ? "colour" : null)}
            trigger={
              <FloatingBarButton label="Colour" title={withKey("Colour", NOTE_KEYS.colour)} aria-keyshortcuts={ariaKeys(NOTE_KEYS.colour)} data-note-colour={colour ?? "mixed"}>
                <span
                  aria-hidden="true"
                  className="size-4 rounded-[5px]"
                  style={
                    colour
                      ? { background: NOTE_COLOURS[colour].fill, boxShadow: `inset 0 0 0 1px ${NOTE_COLOURS[colour].edge}` }
                      : { background: `conic-gradient(${NOTE_COLOURS.yellow.fill} 0 25%, ${NOTE_COLOURS.blue.fill} 0 50%, ${NOTE_COLOURS.red.fill} 0 75%, ${NOTE_COLOURS.green.fill} 0)`, boxShadow: "inset 0 0 0 1px var(--line-3)" }
                  }
                />
              </FloatingBarButton>
            }
          >
            <NoteSwatches value={colour} onPick={setColour} keyed />
          </BarPicker>
          <span role="group" aria-label="Size" title={withKey("Size", NOTE_KEYS.size)} aria-keyshortcuts={ariaKeys(NOTE_KEYS.size)} className="flex items-center">
            {SIZES.map((s) => (
              <FloatingBarButton key={s.id} label={`${s.name} note`} title={`${s.name} note · ${withKey("Size", NOTE_KEYS.size)}`} active={size === s.id} onClick={() => void resizeNotes(api, idSet, s.id)} className="w-7 px-0 tabular-nums">
                {s.label}
              </FloatingBarButton>
            ))}
          </span>
          <FloatingBarDivider />
          <BarPicker
            title="Tags"
            open={picker === "tags"}
            onOpenChange={(o) => setPicker(o ? "tags" : null)}
            trigger={
              <FloatingBarButton label="Tags" title={withKey("Tags", NOTE_KEYS.tags)} aria-keyshortcuts={ariaKeys(NOTE_KEYS.tags)}>
                <Tag />
                {onAll.size > 0 && <span className="tabular-nums">{onAll.size}</span>}
              </FloatingBarButton>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addTag()
              }}
              className="flex h-9 items-center gap-2 rounded-lg bg-raised px-2.5 shadow-e1 focus-within:focus-halo"
            >
              <Tag className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              <input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="Add a tag"
                aria-label="Add a tag"
                maxLength={32}
                className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3 max-sm:text-base"
              />
            </form>
            {known.length > 0 && (
              <ul className="mt-[var(--touch-gap,0.5rem)] flex max-w-[296px] flex-wrap gap-1" aria-label="Tags on this board" data-touch-group="24">
                {known.slice(0, 24).map(({ tag }) => (
                  <li key={tag}>
                    <ToggleChip
                      pressed={chosen.every((e) => hasAnyTag(noteTags(e), tagKeys([tag])))}
                      onPressedChange={() => toggleTag(tag)}
                    >
                      <HueDot hue={tagHues.hueOf(tag)} />
                      {tag}
                    </ToggleChip>
                  </li>
                ))}
              </ul>
            )}
            {tagsHere.length > 0 && (
              // A tag's colour is the board's: everyone sees the change (miro-07 5).
              <div data-tag-colours="" className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
                {tagsHere.slice(0, 3).map((tag) => (
                  <div key={tag} className="flex flex-col gap-1.5">
                    <p className="text-meta text-ink-3">Colour of ‘{tag}’, for everyone</p>
                    <HueSwatches value={tagHues.hueOf(tag)} onPick={(h) => h && tagHues.setHue(tag, h)} label={`Colour of ${tag}`} clearable={false} size={sheet ? "lg" : "md"} />
                  </div>
                ))}
              </div>
            )}
          </BarPicker>
          {votable.length > 0 && votes && (
            // A vote for each selected note, or all of them back (lib/board/facilitation toggleVotes). Pressed while
            // each has the person's vote; no number on it (a count fell as you voted and read as votes cast): the
            // votes left are in its title and the facilitation bar.
            <FloatingBarButton
              label="Vote"
              title={`${withKey("Vote", NOTE_KEYS.vote)}: ${votes.votesLeft} left`}
              aria-keyshortcuts={ariaKeys(NOTE_KEYS.vote)}
              active={voted}
              onClick={() => votes.vote(votable)}
              data-note-vote=""
            >
              <Vote />
            </FloatingBarButton>
          )}
          {ids.length > 1 && (
            <FloatingBarButton label="Tidy up into a grid" title={withKey("Tidy up into a grid", NOTE_KEYS.tidy)} aria-keyshortcuts={ariaKeys(NOTE_KEYS.tidy)} onClick={tidy}>
              <LayoutGrid />
            </FloatingBarButton>
          )}
          {ids.length > 1 && (
            <BarPicker
              title="Cluster into frames"
              open={picker === "cluster"}
              onOpenChange={(o) => setPicker(o ? "cluster" : null)}
              trigger={
                <FloatingBarButton label="Cluster into frames">
                  <Columns3 />
                </FloatingBarButton>
              }
            >
              <div role="group" aria-label="Cluster by" className="flex w-[264px] max-w-full flex-col gap-0.5 max-sm:w-full">
                <ClusterChoice
                  title="By tag"
                  // Untagged notes would all land in one frame: send them to Tags instead.
                  hint={tagFrames > 0 ? `A frame for each tag: ${tagFrames === 1 ? "1 frame" : `${tagFrames} frames`}` : "None of these has a tag yet: tag them first"}
                  onPick={() => (tagFrames > 0 ? cluster("tag") : setPicker("tags"))}
                />
                <ClusterChoice title="By colour" hint="A frame for each colour" onPick={() => cluster("colour")} />
              </div>
            </BarPicker>
          )}
          <MakeTasks notes={notes} onOpen={() => setTasksOpen(true)} />
          <FloatingBarDivider />
          <FloatingBarButton label={panel ? "Hide the style panel" : "More: stroke, fill and layers"} active={panel} onClick={() => setPanel((p) => !p)}>
            <Ellipsis />
          </FloatingBarButton>
      </Floating>
      <NotesToTasksDialog open={tasksOpen} onOpenChange={setTasksOpen} api={api} notes={notes} />
    </>
  )
}

/** One way to cluster, as a row: what it does, and what it will make here. */
function ClusterChoice({ title, hint, onPick }: { title: string; hint: string; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} {...ix("row")} className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left max-sm:min-h-12">
      <span className="text-ui font-medium text-ink">{title}</span>
      <span className="text-meta text-ink-3">{hint}</span>
    </button>
  )
}

/** "Make tasks" on a bar, for the notes not yet a task, after a divider; nothing when every one is. */
function MakeTasks({ notes, onOpen }: { notes: readonly SelectedNote[]; onOpen: () => void }) {
  const fresh = notes.filter((n) => !n.taskUuid).length
  if (fresh === 0) return null
  const label = makeTasksLabel(fresh)
  return (
    <>
      <FloatingBarDivider />
      <FloatingBarButton label={label} title={withKey(label, NOTE_KEYS.tasks)} aria-keyshortcuts={ariaKeys(NOTE_KEYS.tasks)} onClick={onOpen} className="px-2 text-ink">
        <TaskCheckGlyph />
        <span>{label}</span>
      </FloatingBarButton>
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

const LAYOUTS: { id: FrameLayout; label: string; glyph: React.ReactNode }[] = [
  { id: "grid", label: "Grid", glyph: <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" /> },
  { id: "rows", label: "Rows", glyph: <path d="M2.5 4h4v3h-4zM8 4h5.5v3H8zM2.5 9h6v3h-6z" /> },
  { id: "columns", label: "Columns", glyph: <path d="M4 2.5h3v4H4zM4 8h3v5.5H4zM9 2.5h3v6H9z" /> },
]

/** One frame selected: lay out its notes, make them tasks (a retro's actions), or copy a link to it. */
export function FrameBar({ api, frameId, boardId }: { api: ExcalidrawImperativeAPI; frameId: string; boardId: string }) {
  const ids = React.useMemo(() => [frameId], [frameId])
  const { toast } = useToast()
  const [tasksOpen, setTasksOpen] = React.useState(false)
  const all = useSceneElements<SceneElement>(api)
  // The frame's sticky notes, not the words or shapes beside them.
  const notes = React.useMemo(
    () => selectedNotes(all as never, Object.fromEntries(all.filter((e) => e.frameId === frameId && isStickyNote(e as never)).map((e) => [e.id, true]))),
    [all, frameId],
  )

  const layout = (mode: FrameLayout) => {
    const all = api.getSceneElements() as unknown as SceneElement[]
    const frame = all.find((e) => e.id === frameId)
    if (!frame) return
    // What's in the frame, less words bound inside its shapes (they move with them).
    const items = all.filter((e) => e.frameId === frameId && !(e.type === "text" && e.containerId))
    if (items.length === 0) {
      toast({ title: "This frame is empty", description: "Put some notes in it, then lay them out." })
      return
    }
    const { positions, width, height } = layoutFrame(frame, items, mode)
    moveElements(api, positions, { sizes: new Map([[frameId, { width, height }]]) })
  }

  const copyLink = async () => {
    const link = frameLink(window.location.origin, boardId, frameId)
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: "Link copied", description: "It opens the board at this frame." })
    } catch {
      toast({ title: "The link couldn't be copied", description: link })
    }
  }

  return (
    <>
      <Floating api={api} ids={ids} label="Frame" attr="data-frame-bar">
          <span className="px-1.5 text-meta font-medium text-ink-3">Lay out</span>
          {LAYOUTS.map((l) => (
            <FloatingBarButton key={l.id} label={`Lay out in ${l.label.toLowerCase()}`} onClick={() => layout(l.id)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" opacity=".85">
                {l.glyph}
              </svg>
            </FloatingBarButton>
          ))}
          <MakeTasks notes={notes} onOpen={() => setTasksOpen(true)} />
          <FloatingBarDivider />
          <FloatingBarButton label="Copy a link to this frame" onClick={() => void copyLink()}>
            <Link2 />
          </FloatingBarButton>
      </Floating>
      <NotesToTasksDialog open={tasksOpen} onOpenChange={setTasksOpen} api={api} notes={notes} />
    </>
  )
}
