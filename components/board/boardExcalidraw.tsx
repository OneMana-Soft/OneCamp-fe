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

  const validateEmbeddable = React.useCallback((link: string) => boardEmbedOf(link, placeRef.current) !== null, [])
  // A card hears whether the pointer is over its middle ("hover": a click there lets its buttons work) or it is
  // being used ("active"), so it can say so itself: Excalidraw's own pill would cover its name (DB-54).
  const renderEmbeddable = React.useCallback<NonNullable<ExcalidrawProps["renderEmbeddable"]>>(
    (el, appState) => {
      const a = appState.activeEmbeddable
      return <EmbedSlot link={el.link ?? ""} view={embedView} place={placeRef.current} pointer={a && a.element.id === el.id ? a.state : null} />
    },
    [embedView],
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
    <div ref={wrapRef} className="contents" onDropCapture={handleDrop}>
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
