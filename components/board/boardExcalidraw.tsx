"use client"

import * as React from "react"
// Where Excalidraw finds its faces, set before Excalidraw loads (V-94): every board draws it through here.
import "@/lib/board/excalidrawAssets"
import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types"
import { useBoardExportTrail } from "./exportRecord"
import { useKeptDialogFocus } from "./dialogFocus"
import { CARD_KINDS, boardEmbedOf, cardLinksIn, layCards, linkPopupOverCard, onlyCardsSelected, type EmbedPlace } from "@/lib/board/cards"
import { clientToScene, viewCentre } from "@/lib/board/viewport"
import { isBoardElement } from "@/lib/board/elementTypes"
import { codeBlockOf, isCodeBlock } from "@/lib/board/codeBlocks"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import type { CardPointer, EmbedView } from "./boardEmbeds"
import { adminHostsNow } from "@/components/minimal-tiptap/extensions/links-media/hosts"
import { ensureAdminHosts } from "@/components/minimal-tiptap/extensions/links-media/adminHosts"
import { useForeignSheets } from "@/components/ui/foreignSheets"
import { EXCALIDRAW_SHEETS } from "./excalidrawSheets"
import { useToolRowEdgeFade } from "./toolRow"

/**
 * One card or frame, drawn again only when its link, the place or its pointer
 * state changes: Excalidraw draws its embeddables on every frame of a pan or a
 * zoom.
 */
const EmbedSlot = React.memo(function EmbedSlot({ link, view: View, place, pointer }: { link: string; view: EmbedView; place: EmbedPlace; pointer: CardPointer }) {
  const embed = React.useMemo(() => boardEmbedOf(link, place), [link, place])
  if (!embed) return null
  return (
    <React.Suspense fallback={null}>
      <View embed={embed} pointer={pointer} />
    </React.Suspense>
  )
})

// A code block, drawn from its element (its link only says "code block"): loaded on demand, so the highlighter
// stays off the board's first load, and drawn again only when its content or its pointer state changes (miro-17).
const CodeBlockView = lazyPiece(() => import("./boardCodeBlock").then((m) => ({ default: m.BoardCodeBlock })))
const CodeSlot = React.memo(function CodeSlot({ id, data, pointer, edit }: { id: string; data: unknown; pointer: CardPointer; edit?: (id: string) => void }) {
  const block = React.useMemo(() => codeBlockOf({ type: "embeddable", customData: data as Record<string, unknown> }), [data])
  if (!block) return null
  return (
    <React.Suspense fallback={null}>
      <CodeBlockView block={block} pointer={pointer} onEdit={edit ? () => edit(id) : undefined} />
    </React.Suspense>
  )
})

/**
 * "?" on the canvas is Excalidraw's Help, the list the board's More menu opens as "Keyboard shortcuts". The app's own
 * list (components/shortcuts/ShortcutsDialog) opens on "?" too, unless something took the key first, and it lies on
 * the same modal layer (V-491), so it was drawn over the Help. Excalidraw's handler is on its container, inside this
 * one, so the Help is open when the key gets here: the key is marked taken, and one list opens per "?". A "?" typed
 * into a field is left alone; the app's list never opens there.
 */
function takeHelpKey(e: React.KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.key === "?" && !t.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) e.preventDefault()
}

/**
 * Excalidraw as every board draws it (the member's canvas and the guest's
 * viewer load this, never Excalidraw alone): it comes with Excalidraw's own
 * code, a chunk the board loads when it opens, so cards add nothing to the
 * board's first load.
 *
 * What it adds is cards and frames (lib/board/cards): a link on the board to a
 * OneCamp task, doc or project draws its card (the caller's embedView: a
 * member's live card, components/board/boardCard, or a guest's shut one,
 * boardEmbeds, so a guest's page never loads the app's store), and a link to another
 * site is framed only when the docs' allow-list (with an admin's hosts) frames
 * it; anything else stays a link. Links to OneCamp things pasted or dropped on
 * a board someone may edit become cards where they land, as one undo step.
 */
export default function BoardExcalidraw({
  guest = false,
  sheetMode = false,
  embedView,
  onEditCode,
  ...props
}: ExcalidrawProps & {
  guest?: boolean
  /**
   * Overlays are sheets here (the page's useSheetMode, which alone decides: a
   * phone): Excalidraw's own menus, pickers, dialogs and library dock on the
   * bottom edge as the app's sheets (miro-40 H1, ./excalidrawSheets).
   */
  sheetMode?: boolean
  embedView: EmbedView
  /** A code block's Edit button, on a board someone may edit (miro-17): the page opens its dialog. */
  onEditCode?: (id: string) => void
}) {
  // A slow picture's button drops its focus; it stays in Excalidraw's dialog instead (V-362).
  useKeptDialogFocus()
  useForeignSheets(sheetMode, ".excalidraw", EXCALIDRAW_SHEETS)
  const [hosts, setHosts] = React.useState<readonly string[]>(() => adminHostsNow())
  React.useEffect(() => {
    if (guest) return
    let live = true
    void ensureAdminHosts().then((h) => {
      if (live) setHosts(h)
    })
    return () => {
      live = false
    }
  }, [guest])
  const place = React.useMemo<EmbedPlace>(
    () => ({ origin: typeof window === "undefined" ? "" : window.location.origin, adminHosts: hosts, isCardKind: (k) => CARD_KINDS.has(k) }),
    [hosts],
  )
  const placeRef = React.useRef(place)
  placeRef.current = place

  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null)
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const { excalidrawAPI, onPointerUpdate, onPaste, onChange } = props
  const wrapRef = React.useRef<HTMLDivElement>(null)
  // A phone's tool row scrolls sideways and fades as every strip does, on every board.
  useToolRowEdgeFade(wrapRef)
  const editable = !guest && !props.viewModeEnabled

  const handleApi = React.useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      excalidrawAPI?.(api)
    },
    [excalidrawAPI],
  )
  const handlePointer = React.useCallback<NonNullable<ExcalidrawProps["onPointerUpdate"]>>(
    (p) => {
      pointerRef.current = { x: p.pointer.x, y: p.pointer.y }
      onPointerUpdate?.(p)
    },
    [onPointerUpdate],
  )

  /** Lays cards for these links, centred on a point of the scene, selected, as one undo step (lib/board/cards). */
  const lay = React.useCallback((links: { link: string; kind: string }[], at: { x: number; y: number }) => {
    if (apiRef.current) layCards(apiRef.current, links, at)
  }, [])

  const viewMiddle = () => {
    const s = apiRef.current?.getAppState()
    return s ? viewCentre({ ...s, zoom: s.zoom.value }) : { x: 0, y: 0 }
  }

  const handlePaste = React.useCallback<NonNullable<ExcalidrawProps["onPaste"]>>(
    (data, event) => {
      // A paste lays only what a board draws (lib/board/elementTypes, V-547); Excalidraw lays data.elements after this.
      if (data.elements) data.elements = data.elements.filter(isBoardElement)
      const links = editable ? cardLinksIn(data.text ?? "", placeRef.current) : []
      if (!links.length) return onPaste ? onPaste(data, event) : true
      lay(links, pointerRef.current ?? viewMiddle())
      return false
    },
    [editable, lay, onPaste],
  )

  // A link dropped on the board (a card dragged from a list, an address from another tab) is a card where it lands.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!editable || !apiRef.current) return
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")
    const links = cardLinksIn(text, placeRef.current)
    if (!links.length) return
    e.preventDefault()
    e.stopPropagation()
    const s = apiRef.current.getAppState()
    lay(links, clientToScene({ ...s, zoom: s.zoom.value }, e.clientX, e.clientY))
  }

  // The latest Edit handler behind a steady function, so a code block draws again only when its own content changes.
  const editRef = React.useRef(onEditCode)
  React.useEffect(() => {
    editRef.current = onEditCode
  }, [onEditCode])
  const editCode = React.useCallback((id: string) => editRef.current?.(id), [])

  const validateEmbeddable = React.useCallback((link: string) => boardEmbedOf(link, placeRef.current) !== null, [])
  // A card hears whether the pointer is over its middle ("hover": a click there lets its buttons work) or it is
  // being used ("active"), so it can say so itself: Excalidraw's own pill would cover its name (DB-54).
  const renderEmbeddable = React.useCallback<NonNullable<ExcalidrawProps["renderEmbeddable"]>>(
    (el, appState) => {
      const a = appState.activeEmbeddable
      const pointer = a && a.element.id === el.id ? a.state : null
      if (isCodeBlock(el)) return <CodeSlot id={el.id} data={el.customData} pointer={pointer} edit={editable && onEditCode ? editCode : undefined} />
      return <EmbedSlot link={el.link ?? ""} view={embedView} place={placeRef.current} pointer={pointer} />
    },
    [embedView, editable, onEditCode, editCode],
  )

  // Excalidraw opens its link popup over a selected linked element; a card is its own link, so while the popup is
  // open over one the board is marked and the popup hidden (excalidrawTheme.css), as the card's badge is. So is its
  // style panel while only cards are selected: none of it means anything for a live card.
  const handleChange = React.useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState, files) => {
      wrapRef.current?.toggleAttribute("data-card-link-popup", linkPopupOverCard(elements, appState))
      wrapRef.current?.toggleAttribute("data-cards-selected", onlyCardsSelected(elements, appState))
      onChange?.(elements, appState, files)
    },
    [onChange],
  )

  return (
    <div ref={wrapRef} className="contents" onDropCapture={handleDrop} onKeyDown={takeHelpKey}>
      <Excalidraw
        {...props}
        excalidrawAPI={handleApi}
        onChange={handleChange}
        onPointerUpdate={handlePointer}
        onPaste={handlePaste}
        validateEmbeddable={validateEmbeddable}
        renderEmbeddable={renderEmbeddable}
      />
    </div>
  )
}

/**
 * A member's board (BoardCanvas: the board's page and a call's stage): the
 * board as every board draws it, with what Excalidraw exports itself told to
 * the admin log (./exportRecord). The trail comes in this chunk, so the board's
 * first load carries none of it. A guest's viewer draws the default, with no
 * account to tell the log with.
 */
export function MemberExcalidraw({ boardId, ...props }: React.ComponentProps<typeof BoardExcalidraw> & { boardId: string }) {
  const [api, setApi] = React.useState<ExcalidrawImperativeAPI | null>(null)
  const { excalidrawAPI } = props
  const handleApi = React.useCallback(
    (instance: ExcalidrawImperativeAPI) => {
      setApi(instance)
      excalidrawAPI?.(instance)
    },
    [excalidrawAPI],
  )
  useBoardExportTrail(api, boardId)
  return <BoardExcalidraw {...props} excalidrawAPI={handleApi} />
}
