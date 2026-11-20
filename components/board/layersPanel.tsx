"use client"

// The board's Layers panel (miro-03; the record and what a layer does to the drawing are lib/board/layers). Its rows
// are the stack, top first: a layer's name (a press makes it the row the footer acts on), Hide or Show, Lock or
// Unlock, Move up and Move down (touch and keyboard; a mouse drags a row too). The footer, pinned under the list:
// New layer, Move selection here, Rename layer and Delete layer, for the chosen row. Editors (the board's owner,
// co-owners and editors) change layers; everyone else reads the list as it's set, with nothing to press. A hidden
// layer is hidden for everyone who draws the board (boardExcalidraw's one filter). A layer's lock is Excalidraw's own
// on its elements, which any editor lifts; protected objects (miro-44) stay as they are. Every change rides the board's
// document, so it works offline and reaches every tab; a change refused says why.

import * as React from "react"
import type * as Y from "yjs"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
// Only icons the board page already loads (Eye, Lock, chevrons, grip): one the panel alone brought would re-cut other
// routes' chunks (regroupwhy, miro-03). A hidden layer's Eye is struck through rather than a separate EyeOff.
import { ChevronDown, ChevronUp, Eye, GripVertical, Lock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldKeyDown } from "@/lib/keys/ime"
import { BoardSidePanel, SIDE_PANELS } from "@/components/board/boardSidePanel"
import {
  HOME_LAYER,
  LAYERS,
  addLayer,
  assignLayer,
  deleteLayer,
  hideLayer,
  lockLayer,
  markLocked,
  moveLayer,
  readLayers,
  renameLayer,
  restackScene,
  useLayers,
  withCopies,
  type Layer,
  type LayerElement,
} from "@/lib/board/layers"
import { CAPTURE } from "@/lib/board/binding"

const ICON = "size-8 [@media(pointer:coarse)]:size-11"
const FOOT = "h-9 [@media(pointer:coarse)]:h-11"

export default function LayersPanel({
  api,
  doc,
  editable,
  protection,
  onClose,
}: {
  api: ExcalidrawImperativeAPI
  doc: Y.Doc
  editable: boolean
  /** The protected objects (miro-44): a layer never moves or locks one. */
  protection: { has(id: string): boolean }
  onClose: () => void
}) {
  const { toast } = useToast()
  const map = React.useMemo(() => doc.getMap<unknown>(LAYERS), [doc])
  const layers = useLayers(doc)
  const top = layers[layers.length - 1]
  const [chosenId, choose] = React.useState<string>(top.id)
  const chosen = layers.find((l) => l.id === chosenId) ?? top
  const [naming, setNaming] = React.useState<string | null>(null)
  const dragged = React.useRef<string | null>(null)

  const refused = (why: string | null) => {
    if (why) toast({ title: "Layers", description: why, variant: "destructive" })
    return why !== null
  }
  /** Changes the record in one transaction, then the drawing follows: the stack in layer order. */
  const change = (f: () => string | null) => {
    let why: string | null = null
    doc.transact(() => {
      why = f()
    })
    if (refused(why)) return false
    restackScene(api, readLayers(map))
    return true
  }
  const scene = () => api.getSceneElementsIncludingDeleted() as unknown as LayerElement[]
  const draw = (copies: LayerElement[]) => {
    if (copies.length) api.updateScene({ elements: withCopies(scene(), copies) as never, captureUpdate: CAPTURE.NEVER })
  }

  const lock = (l: Layer) => {
    if (refused(l.hidden ? "Show the layer to lock or unlock it." : null)) return
    draw(lockLayer(scene(), l.id, !l.locked, readLayers(map), protection))
    change(() => markLocked(map, l.id, !l.locked))
  }
  const moveHere = () => {
    const ids = Object.keys(api.getAppState().selectedElementIds ?? {})
    if (refused(ids.length === 0 ? "Select something on the board first, then move it here." : chosen.hidden ? "Show the layer to move work onto it." : null)) return
    draw(assignLayer(scene(), ids, chosen, protection))
    restackScene(api, readLayers(map))
  }
  const rename = (name: string) => {
    if (naming && change(() => renameLayer(map, naming, name))) setNaming(null)
  }
  const at = (id: string) => readLayers(map).findIndex((l) => l.id === id)

  const newLayer = () => {
    const made: { layer?: Layer } = {}
    const ok = change(() => {
      const r = addLayer(map)
      if ("refused" in r) return r.refused
      made.layer = r.layer
      return null
    })
    if (ok && made.layer) choose(made.layer.id)
  }

  const footer = () =>
    editable && (
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" className={FOOT} onClick={newLayer}>
          New layer
        </Button>
        <Button type="button" size="sm" variant="outline" className={FOOT} onClick={moveHere}>
          Move selection here
        </Button>
        <Button type="button" size="sm" variant="outline" className={FOOT} onClick={() => setNaming(chosen.id)}>
          Rename layer
        </Button>
        <Button type="button" size="sm" variant="outline" className={FOOT} onClick={() => change(() => deleteLayer(map, chosen.id)) && choose(HOME_LAYER)}>
          Delete layer
        </Button>
      </div>
    )

  return (
    <BoardSidePanel {...SIDE_PANELS.layers(editable)} count={layers.length} footer={footer} onClose={onClose}>
      {!editable && <p className="px-1 pb-2 text-sm text-muted-foreground">{"Only the board's editors change layers."}</p>}
      <ul aria-label="Layers, top first" className="grid gap-1">
        {layers
          .slice()
          .reverse()
          .map((l) => {
            const i = at(l.id)
            const isChosen = editable && l.id === chosen.id
            return (
              <li
                key={l.id}
                data-layer-name={l.name}
                data-layer-row={l.id}
                draggable={editable}
                onDragStart={() => void (dragged.current = l.id)}
                onDragOver={(e) => editable && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = dragged.current
                  dragged.current = null
                  if (from && from !== l.id) change(() => moveLayer(map, from, at(l.id)))
                }}
                className={cn("flex items-center gap-1 rounded-lg px-1 py-0.5", isChosen && "bg-accent", l.hidden && "opacity-60")}
              >
                {editable && <GripVertical aria-hidden="true" className="size-4 shrink-0 cursor-grab text-muted-foreground [@media(pointer:coarse)]:hidden" />}
                {naming === l.id ? (
                  <input
                    aria-label="Layer name"
                    autoFocus
                    defaultValue={l.name}
                    maxLength={80}
                    data-escape-own=""
                    className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm [@media(pointer:coarse)]:h-11"
                    onKeyDown={fieldKeyDown((e) => {
                      if (e.key === "Enter") rename((e.currentTarget as HTMLInputElement).value)
                      else if (e.key === "Escape") {
                        e.stopPropagation()
                        setNaming(null)
                      }
                    })}
                    onBlur={(e) => naming === l.id && rename(e.currentTarget.value)}
                  />
                ) : editable ? (
                  <button
                    type="button"
                    aria-pressed={isChosen}
                    onClick={() => choose(l.id)}
                    className="min-h-9 min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm font-medium [@media(pointer:coarse)]:min-h-11"
                  >
                    {l.name}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate px-2 py-2 text-sm font-medium">{l.name}</span>
                )}
                {!editable && (l.hidden || l.locked) && (
                  <span className="shrink-0 px-2 text-xs text-muted-foreground">{[l.hidden && "Hidden", l.locked && "Locked"].filter(Boolean).join(", ")}</span>
                )}
                {editable && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={ICON}
                      aria-label={`${l.hidden ? "Show" : "Hide"} ${l.name}`}
                      aria-pressed={l.hidden}
                      disabled={l.id === HOME_LAYER}
                      title={l.id === HOME_LAYER ? "Layer 1 holds new work, so it always shows." : undefined}
                      onClick={() => change(() => hideLayer(map, l.id, !l.hidden))}
                    >
                      <span className="relative grid place-items-center">
                        <Eye className="size-4" />
                        {l.hidden && <span aria-hidden="true" className="absolute h-0.5 w-5 -rotate-45 rounded-full bg-current" />}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(ICON, l.locked && "text-primary")}
                      aria-label={`${l.locked ? "Unlock" : "Lock"} ${l.name}`}
                      aria-pressed={l.locked}
                      onClick={() => lock(l)}
                    >
                      <Lock className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className={ICON} aria-label={`Move ${l.name} up`} disabled={i === layers.length - 1} onClick={() => change(() => moveLayer(map, l.id, i + 1))}>
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className={ICON} aria-label={`Move ${l.name} down`} disabled={i === 0} onClick={() => change(() => moveLayer(map, l.id, i - 1))}>
                      <ChevronDown className="size-4" />
                    </Button>
                  </>
                )}
              </li>
            )
          })}
      </ul>
    </BoardSidePanel>
  )
}
