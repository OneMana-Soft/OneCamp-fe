"use client"

// Mind maps (miro-15) as an editor works them, loaded on first use (boardWorkbench's loaders): a new map, the keys a
// selected node takes (Tab a child, Enter a sibling, typing its words, Delete its branch), the bar's Add child, Add
// sibling and Fold with More's edition add-ons, Make tasks, Make a doc and Delete branch, and the folded-count badge
// every reader sees. A map is ordinary board elements (lib/board/mindMapTree), laid out by the ONE layout
// (lib/board/mindMap relayout) after every change to its shape: written as one change, so one undo takes it back.
// Who: board editors (owner, co-owners, editors) make and edit maps, fold, use an edition's add-ons (under their own
// rules), and make tasks or a doc under those targets' own create rights; everyone else sees the map as laid out and folded.
// The bar's parts, icons, key test and doc writes come from the board (components/board/boardKit, V-1262): the board
// loads them already, and this chunk importing them itself re-cut the doc editor's and every app route's chunks.
import * as React from "react"
import type * as Y from "yjs"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import axiosInstance from "@/lib/axiosInstance"
import { useToast } from "@/hooks/use-toast"
import { useBoardView } from "@/hooks/useBoardView"
import { useSceneElements } from "@/hooks/useSceneElements"
import { Button } from "@/components/ui/button"
import type { BoardKit } from "@/components/board/boardKit"
import { loadConvert, selectAndEdit, stampLaidOut, viewMiddle, type SceneElement } from "@/components/board/boardOps"
import { isAppOffline } from "@/lib/connectivity"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { MindMapNodeOffer } from "@/lib/addOns/core"
import { useMindMapNodeAddOn } from "@/lib/addOns/mindMap"
import { CAPTURE, bumped } from "@/lib/board/binding"
import { newElementId } from "@/lib/board/ids"
import type { SelectedNote } from "@/lib/board/notes"
import { outwardScene } from "@/lib/board/sceneOut"
import { boxInView, sceneToLocal } from "@/lib/board/viewport"
import { isFoldedNode, mindNodeOf, mindTag, withAttached, type MindState, type MindTag } from "@/lib/board/mindMapTree"
import { PostEndpointUrl } from "@/services/endPoints"

// The one layout, from its one chunk (mindMapChunkGuard.test.ts): awaited here, at the top, so the keys, bar and badge
// below call it as they did, synchronously; the workbench's loader fetches it beside this chunk.
const { BRANCH_INKS, NODE_SIZE, ROOT_INK, ROOT_SIZE, branchOf, edgeSkeleton, expandLabels, mapOf, mindKey, newSide, nodeSkeleton, outlineHtml, relayout } =
  await import("@/lib/board/mindMap")

type Api = ExcalidrawImperativeAPI
type El = SceneElement & { strokeColor?: string; backgroundColor?: string; fontFamily?: number; text?: string; endBinding?: Record<string, unknown> | null }

const scene = (api: Api) => api.getSceneElements() as unknown as El[]
const live = (all: readonly El[], id: string) => all.find((e) => e.id === id && !e.isDeleted)
const wordsIn = (all: readonly El[], id: string) => all.find((e) => e.containerId === id && !e.isDeleted && e.type === "text")?.text ?? ""
/** Excalidraw's own container, where it takes its keys (Enter starts typing in a selected shape). */
const excalidrawContainer = () => document.querySelector("[data-board-canvas] .excalidraw")
/** Gives the keys back to the board after a bar press, so Ctrl+Z, Delete and the arrows work on it again. */
const backToBoard = () => requestAnimationFrame(() => (excalidrawContainer() as HTMLElement | null)?.focus({ preventScroll: true }))
const OFFLINE = (what: string) => `You're offline: ${what} needs a connection.`

/** A scene with the map laid out again, as one write: the moved copies bumped, everything else as it was. */
function laidOut(all: readonly El[], map: string): El[] {
  const moved = new Map(relayout(all, map).map((e) => [e.id, e]))
  return moved.size === 0 ? [...all] : all.map((e) => (moved.has(e.id) ? bumped(e, moved.get(e.id)!) : e))
}
function write(api: Api, elements: readonly El[], capture: (typeof CAPTURE)[keyof typeof CAPTURE] = CAPTURE.IMMEDIATELY) {
  api.updateScene({ elements: elements as never, captureUpdate: capture })
}
const select = (api: Api, id: string) => api.updateScene({ appState: { selectedElementIds: { [id]: true } } as never })

/** A new map where the person is looking: one central node, selected, its words open. */
export async function startMindMap(api: Api, font: number): Promise<void> {
  const convert = await loadConvert()
  const mid = viewMiddle(api)
  const id = newElementId("mind")
  const map = newElementId("map")
  const made = convert([nodeSkeleton({ id, tag: { map, parent: null }, text: "", x: mid.x - ROOT_SIZE.w / 2, y: mid.y - ROOT_SIZE.h / 2, ink: ROOT_INK, font })] as never, { regenerateIds: false })
  write(api, [...scene(api), ...stampLaidOut(made as unknown as El[])])
  selectAndEdit(api, [id], excalidrawContainer())
}

type Convert = Awaited<ReturnType<typeof loadConvert>>

/**
 * Adds children to a node, or siblings after it (the root's sibling is its child; each next sibling follows the one
 * made before it), each joined to its parent, the map laid out: ONE write, so one undo takes them all back. Returns
 * the new nodes' ids, in order.
 */
async function addNodes(api: Api, fromId: string, as: "child" | "sibling", texts: readonly string[] = [""]): Promise<string[]> {
  const convert = await loadConvert()
  let all = scene(api)
  let map = ""
  const made: string[] = []
  for (const text of texts) {
    const next = placed(all, convert, as === "sibling" && made.length ? made[made.length - 1] : fromId, as, text)
    if (!next) break
    ;({ all, map } = next)
    made.push(next.id)
  }
  if (made.length) write(api, laidOut(all, map))
  return made
}
/** Adds a child or a sibling and opens its words (Tab, Enter, Add child, Add sibling). */
const addAndEdit = (api: Api, fromId: string, as: "child" | "sibling") =>
  void addNodes(api, fromId, as).then(([made]) => made && selectAndEdit(api, [made], excalidrawContainer()))

/**
 * A scene with one node added to `fromId`'s map, joined to its parent, before its layout. Its branch colour: a new
 * branch takes the next, a child its parent's.
 */
function placed(all: readonly El[], convert: Convert, fromId: string, as: "child" | "sibling", text: string): { all: El[]; map: string; id: string } | null {
  const from = live(all, fromId)
  const tag = from && mindTag(from)
  if (!from || !tag) return null
  const parent = as === "child" || tag.parent == null ? from : live(all, tag.parent)
  if (!parent) return null
  const nodes = mapOf(all, tag.map)
  const root = nodes.find((n) => n.parent === null)
  if (!root) return null
  const kids = nodes.filter((n) => n.parent === parent.id)
  const onRoot = parent.id === root.id
  // A sibling keeps to the side of the one it follows; the root's new branch goes to its shorter side.
  const side = from !== parent ? (tag.side ?? "r") : onRoot ? newSide(nodes, root.id) : (mindTag(parent)?.side ?? "r")
  const ink = onRoot ? BRANCH_INKS[kids.length % BRANCH_INKS.length] : { stroke: parent.strokeColor ?? ROOT_INK.stroke, fill: parent.backgroundColor ?? ROOT_INK.fill }
  // Stacking order is the layout's: a sibling sorts just after the one it follows, a child after its parent's last.
  const y = as === "sibling" && from !== parent ? from.y + 0.5 : kids.reduce((m, k) => Math.max(m, k.y + 0.5), parent.y)
  const x = side === "r" ? parent.x + parent.width + 64 : parent.x - 64 - NODE_SIZE.w
  const font = all.find((e) => e.containerId === parent.id && e.type === "text")?.fontFamily ?? 6
  const id = newElementId("mind")
  const edgeId = newElementId("mind-edge")
  const edge = { ...edgeSkeleton({ id: edgeId, map: tag.map, parent: parent.id, child: id, stroke: ink.stroke }), start: undefined }
  const made = stampLaidOut(
    convert([nodeSkeleton({ id, tag: { map: tag.map, parent: parent.id, side }, text, x, y, ink, font }), edge] as never, { regenerateIds: false }) as unknown as El[],
  )
  // The parent is already on the board, so its end is bound here, as Excalidraw binds the child's.
  const joined = made.map((e) => (e.id === edgeId ? ({ ...e, startBinding: { ...(e.endBinding ?? { focus: 0, gap: 4 }), elementId: parent.id } } as El) : e))
  const withJoin = all.map((e) => (e.id === parent.id ? bumped(e, { boundElements: [...(e.boundElements ?? []), { id: edgeId, type: "arrow" }] }) : e))
  return { all: [...withJoin, ...joined], map: tag.map, id }
}

/** A node's branch: its nodes, their words, the connectors into them and those connectors' words (withAttached). */
function branchIds(all: readonly El[], id: string): Set<string> {
  const tag = live(all, id) && mindTag(live(all, id)!)
  if (!tag) return new Set()
  return withAttached(all, new Set(branchOf(mapOf(all, tag.map), id)))
}

/** A node's copy folded or open, the rest of its tag as it was. */
const withFold = (e: El, tag: MindTag, folded: boolean) => bumped(e, { customData: { ...(e.customData ?? {}), mindMap: { ...tag, folded } } })
/** Passes that open a branch's folds before it is deleted: each opens the folds drawn, a fold inside one shows on the next. */
const OPEN_PASSES = 32

/**
 * Deletes a node's branch as ordinary deletion (undo and version history bring it back), the rest laid out again. The
 * scene filter keeps what a fold hides out of the drawn scene, so each fold in the branch is opened first, outside
 * undo: the deletion then takes the whole branch, and one undo brings it all back, open.
 */
function deleteBranch(api: Api, id: string): void {
  for (let pass = 0; pass < OPEN_PASSES; pass++) {
    const drawn = scene(api)
    const folds = new Set([...branchIds(drawn, id)].filter((b) => isFoldedNode(live(drawn, b) ?? {})))
    if (folds.size === 0) break
    write(api, drawn.map((e) => (folds.has(e.id) ? withFold(e, mindTag(e)!, false) : e)), CAPTURE.NEVER)
  }
  const all = scene(api)
  const node = live(all, id)
  const tag = node && mindTag(node)
  if (!tag) return
  const gone = branchIds(all, id)
  write(api, laidOut(all.map((e) => (gone.has(e.id) && !e.isDeleted ? bumped(e, { isDeleted: true }) : e)), tag.map))
  if (tag.parent) select(api, tag.parent)
}

/** Folds or unfolds a node: the fold is shared in the document (the scene filter hides its branch), the map laid out. */
function toggleFold(api: Api, id: string): void {
  const all = scene(api)
  const node = live(all, id)
  const tag = node && mindTag(node)
  if (!tag) return
  write(api, laidOut(all.map((e) => (e.id === id ? withFold(e, tag, !tag.folded) : e)), tag.map))
}

/** Opens a node's words, the typed key in them in place of what they said (typing on a selected node). */
/** Letters typed over a node before its words open: they land together once the words are open. */
let typing: { id: string; keys: string } | null = null
function editWith(api: Api, id: string, key: string): void {
  if (typing?.id === id) return void (typing.keys += key)
  typing = { id, keys: key }
  selectAndEdit(api, [id], excalidrawContainer())
  let tries = 0
  const put = () => {
    const words = document.querySelector<HTMLTextAreaElement>("textarea.excalidraw-wysiwyg")
    if (!words) return void (++tries < 60 ? requestAnimationFrame(put) : (typing = null))
    words.select()
    document.execCommand("insertText", false, typing?.keys ?? key)
    typing = null
  }
  requestAnimationFrame(put)
}

/**
 * Ends a node's open words by sending Excalidraw's editor its own Escape, which keeps the words and ends them there and
 * then (its blur ends them only once it listens). A key SENT to the editor, never a page Escape read: lib/keys/escape
 * answers those (escapeGuard).
 */
const endWords = (words: HTMLTextAreaElement) => void words.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }))

/**
 * A board's map keys, on until the returned stop: Tab a child, Enter a sibling (in its words, Enter ends them), Delete
 * its branch, a letter types over its words. Anywhere else the board's own keys stand. The node is read from
 * Excalidraw's state at key time and words end by its own Escape, so a key never waits on React or a timer
 * (CR-421 F5). A node whose size changed (its words grew) or a branch that came back (unfolded) has its map laid out
 * again. `isProtected`: a protected node takes no keys; `kit.notForTheBoard`: the board's own test of a key.
 */
export function hearMindKeys(api: Api, isProtected: (id: string) => boolean, kit: Pick<BoardKit, "notForTheBoard">): () => void {
  const onKey = (e: KeyboardEvent) => {
    // Excalidraw's own Enter that opens a node's words (selectAndEdit) is synthetic: never a sibling.
    if (!e.isTrusted || e.defaultPrevented) return
    const target = e.target as HTMLElement | null
    const words = target instanceof HTMLTextAreaElement && target.classList.contains("excalidraw-wysiwyg") ? target : null
    if (!words && kit.notForTheBoard(e)) return
    const action = mindKey(e, !!words)
    if (!action) return
    const id = mindNodeOf(scene(api), api.getAppState() as MindState)
    if (!id || isProtected(id)) return
    e.preventDefault()
    e.stopPropagation()
    if (words) {
      endWords(words)
      if (action === "child") addAndEdit(api, id, "child")
      else select(api, id)
      return
    }
    if (action === "child" || action === "sibling") addAndEdit(api, id, action)
    else if (action === "delete") deleteBranch(api, id)
    else if (action === "edit") editWith(api, id, e.key)
  }
  window.addEventListener("keydown", onKey, true)

  let last: readonly unknown[] | null = null
  let shape = ""
  const read = (elements: readonly unknown[], state: MindState) => {
    if (elements === last) return
    last = elements
    const all = elements as El[]
    const id = mindNodeOf(all, state)
    const tag = id && mindTag(live(all, id)!)
    if (!tag) return
    const nodes = mapOf(all, tag.map)
    const now = `${tag.map}|${nodes.map((n) => `${n.id}:${Math.round(n.w)}x${Math.round(n.h)}`).join(",")}`
    if (now === shape) return
    const first = shape === ""
    shape = now
    // Outside undo: the layout follows the map, after an undo or redo too. Left EVENTUALLY, its copies stay
    // uncommitted, and Excalidraw commits the next scene write's copies of them as they were before it, so that
    // step's undo misses them (a branch deleted there stays deleted).
    if (!first && relayout(all, tag.map).length) requestAnimationFrame(() => write(api, laidOut(scene(api), tag.map), CAPTURE.NEVER))
  }
  read(api.getSceneElements(), api.getAppState() as MindState)
  const off = api.onChange((els, st) => read(els, st as MindState))
  return () => {
    window.removeEventListener("keydown", onKey, true)
    off()
  }
}

function useRefusal() {
  const { toast } = useToast()
  return React.useCallback((title: string, description: string) => toast({ variant: "destructive", title, description }), [toast])
}

/**
 * The selected node's bar: Add child, Add sibling, Fold or Unfold (44 px on a touch screen, as every bar button), and
 * More with an edition's add-ons, Make tasks, Make a doc and Delete branch (a drawer with them in its pinned footer on a
 * phone). `kit`: the board's bar parts, icons and doc writes (components/board/boardKit).
 */
export function MindMapActions({ api, node, boardId, onTasks, kit }: { api: Api; node: string; boardId: string; onTasks: (notes: SelectedNote[]) => void; kit: BoardKit }) {
  const { FloatingBarButton, FloatingBarDivider, BarPicker, createDoc, deleteDoc } = kit
  const { ChevronDown, Ellipsis, Plus } = kit.icons
  const { toast } = useToast()
  const refuse = useRefusal()
  const [more, setMore] = React.useState(false)
  const [busy, setBusy] = React.useState<"addOn" | "doc" | null>(null)
  const all = useSceneElements<El>(api)
  // An edition's add-ons in More (lib/addOns/mindMap.ts): they add ideas under the node through the bar.
  const offer: MindMapNodeOffer = {
    boardId,
    held: busy !== null,
    ready: (title) => !isAppOffline() || (refuse(title, OFFLINE(title)), false),
    refuse,
    words: async () => {
      // The words as they may leave this tab (private mode's held words never do).
      const out = await outwardScene<El>(api)
      const own = live(out, node)
      const tag = own && mindTag(own)
      const root = tag ? mapOf(out, tag.map).find((n) => n.parent === null) : undefined
      return { node: wordsIn(out, node).trim() || "this idea", root: root && root.id !== node ? wordsIn(out, root.id).trim() : null }
    },
    grow: async (answer, words) => {
      const labels = answer && Array.isArray((answer as { nodes?: unknown }).nodes) ? expandLabels(answer as never, words) : null
      if (!labels) return null
      const made = await addNodes(api, node, "child", labels)
      setMore(false)
      return made.length
    },
    working: (on) => setBusy(on ? "addOn" : null),
  }
  const addOns = useMindMapNodeAddOn(offer)
  const el = live(all, node)
  const tag = el && mindTag(el)
  if (!el || !tag) return null
  const nodes = mapOf(all, tag.map)
  const branch = branchOf(nodes, node)
  // The ideas Make tasks makes, the ones with words, in tree order: the label counts these.
  const ideas = branch.map((id) => ({ noteId: id, text: wordsIn(all, id).trim(), taskUuid: live(all, id)?.customData?.taskUuid as string | undefined })).filter((n) => n.text)

  const add = (as: "child" | "sibling") => addAndEdit(api, node, as)

  const tasks = () => {
    if (isAppOffline()) return refuse("Make tasks", OFFLINE("Making tasks"))
    setMore(false)
    onTasks(ideas)
  }

  const doc = async () => {
    if (isAppOffline()) return refuse("Make a doc", OFFLINE("Making a doc"))
    setBusy("doc")
    let made: string | null = null
    try {
      const out = await outwardScene<El>(api)
      const page = await createDoc({ doc_title: wordsIn(out, node).trim() || "Mind map", doc_private: true })
      made = page.doc_uuid
      await axiosInstance.post(PostEndpointUrl.UpdateDoc, { doc_uuid: made, doc_body: outlineHtml(nodes, (id) => wordsIn(out, id), node) })
      setMore(false)
      toast({ title: "Made a doc", description: <a className="underline" href={`/app/doc/${made}`}>Open the outline</a> })
    } catch (e) {
      // A doc without its outline is no use: it goes to the trash, and nothing else changed.
      if (made) void deleteDoc(made).catch(() => {})
      refuse("Make a doc", apiErrorMessage(e, "The doc couldn't be made. Try again in a moment."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <FloatingBarButton label="Add child" onClick={() => add("child")}>
        <Plus />
      </FloatingBarButton>
      <FloatingBarButton label="Add sibling" onClick={() => add("sibling")}>
        <Plus className="rotate-90" />
      </FloatingBarButton>
      <FloatingBarButton label={tag.folded ? "Unfold" : "Fold"} active={!!tag.folded} onClick={() => (toggleFold(api, node), backToBoard())}>
        <ChevronDown className={tag.folded ? "-rotate-90" : undefined} />
      </FloatingBarButton>
      <FloatingBarDivider />
      <BarPicker
        title="Mind map"
        open={more}
        onOpenChange={setMore}
        trigger={
          <FloatingBarButton label="More">
            <Ellipsis />
          </FloatingBarButton>
        }
        footer={
          <div className="grid gap-2" data-mind-map-more="">
            {addOns.map((a) => (
              <Button key={a.key} variant="secondary" disabled={busy !== null} onClick={a.run}>
                {a.label}
              </Button>
            ))}
            <Button variant="secondary" disabled={busy !== null || ideas.length === 0} onClick={tasks}>
              {ideas.length === 1 ? "Make a task" : `Make ${ideas.length} tasks`}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => void doc()}>
              {busy === "doc" ? "Making the doc…" : "Make a doc"}
            </Button>
            <Button variant="ghost" className="text-danger" disabled={busy !== null} onClick={() => (setMore(false), deleteBranch(api, node), backToBoard())}>
              Delete branch
            </Button>
          </div>
        }
      >
        <p className="text-ui-sm text-ink-2">
          {branch.length === 1 ? "This idea" : `This idea and the ${branch.length - 1} under it`}: make it tasks or a doc outline.
        </p>
      </BarPicker>
    </>
  )
}

const BADGE = 22
/** "+N" on each folded node, N its hidden ideas (read from the document: a folded branch isn't in the scene). Everyone's. */
export function MindMapFolds({ api, doc }: { api: Api; doc: Y.Doc }) {
  const all = useSceneElements<El>(api)
  const folded = React.useMemo(() => all.filter((e) => !e.isDeleted && isFoldedNode(e)), [all])
  const counts = React.useMemo(() => {
    if (folded.length === 0) return new Map<string, number>()
    const stored = [...doc.getMap<El>("elements").values()]
    return new Map(folded.map((e) => [e.id, branchOf(mapOf(stored, mindTag(e)!.map), e.id).length - 1]))
  }, [folded, doc])
  const view = useBoardView(api, folded.length > 0)
  if (!view || folded.length === 0) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {folded.map((e) => {
        const at = sceneToLocal(view, e.x, e.y)
        const width = e.width * view.zoom
        const height = e.height * view.zoom
        const n = counts.get(e.id) ?? 0
        if (n === 0 || !boxInView(view, at.left, at.top, at.left + width + BADGE, at.top + height)) return null
        const right = mindTag(e)?.side !== "l"
        return (
          <span
            key={e.id}
            data-mind-map-folded=""
            className="absolute flex items-center justify-center rounded-full bg-pop px-1.5 text-ui-xs font-semibold text-ink-2 shadow-e1 ring-1 ring-line"
            style={{ height: BADGE, minWidth: BADGE, top: at.top + height / 2 - BADGE / 2, left: right ? at.left + width + 4 : at.left - BADGE - 4 }}
          >
            +{n}
          </span>
        )
      })}
    </div>
  )
}
