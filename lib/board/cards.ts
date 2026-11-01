/**
 * Cards on a board (miro-13, miro-12 3): a OneCamp thing placed on the canvas
 * and drawn live, as each reader may see it (lib/liveEntity; the server decides
 * access for every read). A card is one of Excalidraw's embeddable elements
 * whose link is the thing's page, so it moves, resizes, copies, undoes and
 * syncs like any element, and an export, an import or a board without this
 * code still keeps the link. Another site on the board is framed from the same
 * table the docs frame from (lib/embeds/providers, with an admin's hosts): one
 * allow-list for both, never Excalidraw's own.
 *
 * layCards is the one way cards are put on a board: a paste, a drop and the
 * board's Add from OneCamp panel (miro-13 2) all lay them. Pure, but for
 * layCards, which writes the scene it is handed.
 */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { embedFor, type Embed } from "@/lib/embeds/providers"
import { entityOfHref, type EntityRef } from "@/lib/liveEntity/href"
import { CAPTURE } from "@/lib/board/binding"
import { newElementId } from "@/lib/board/ids"

/**
 * The kinds that draw a card: the things with a page of their own that the
 * chips read live (lib/liveEntity/kinds; cards.test holds each one registered).
 * Named here so the board's canvas doesn't load the chips to know them.
 */
export const CARD_KINDS: ReadonlySet<string> = new Set(["task", "doc", "project"])

/** What a link on the board draws: a card, a framed site, or nothing (a plain link). */
export type BoardEmbed = { card: EntityRef } | { frame: Embed } | null

/** Where links are read: the app's origin, an admin's embed hosts, and which kinds draw a card. */
export interface EmbedPlace {
  origin: string
  adminHosts: readonly string[]
  isCardKind: (kind: string) => boolean
}

export function boardEmbedOf(link: string, where: EmbedPlace): BoardEmbed {
  const ref = entityOfHref(link, where.origin)
  if (ref) return where.isCardKind(ref.kind) ? { card: ref } : null
  let host = ""
  try {
    host = new URL(where.origin).host
  } catch {
    return null
  }
  const frame = embedFor(link, where.adminHosts, host)
  return frame ? { frame } : null
}

/** A card's size when it is placed: a task carries its status, who has it and when it's due. */
export function cardSize(kind: string): { width: number; height: number } {
  return kind === "task" ? { width: 288, height: 128 } : { width: 288, height: 76 }
}

/** The space between cards placed together. */
const GAP = 24

const nonce = () => Math.floor(Math.random() * 2 ** 31)

/** A card, as Excalidraw's own newEmbeddableElement makes an embeddable: rounded, with no stroke or fill of its own. */
export function cardElement(o: { id: string; x: number; y: number; link: string; kind: string }) {
  const { width, height } = cardSize(o.kind)
  return {
    id: o.id,
    type: "embeddable" as const,
    x: o.x,
    y: o.y,
    width,
    height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [] as string[],
    frameId: null,
    index: null,
    roundness: { type: 3 },
    seed: nonce(),
    version: 1,
    versionNonce: nonce(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: o.link,
    locked: false,
    customData: { kind: "card" },
  }
}

/** A card's link: the thing's page on the app's own origin, as every card keeps it. */
export function cardLink(origin: string, kind: string, id: string): string {
  return `${new URL(origin).origin}/app/${kind}/${id}`
}

/** Whether an element is a card. */
export function isCard(el: { type?: string; customData?: Record<string, unknown> | null }): boolean {
  return el.type === "embeddable" && el.customData?.kind === "card"
}

/**
 * Whether Excalidraw's link popup is open over a card: the popup asked for ("info" when the pointer comes onto a
 * selected linked element, "editor" from its menu) while the one thing selected is a card. A card is its own link,
 * so the board hides the popup then (excalidrawTheme.css), as it hides the badge. Pure.
 */
export function linkPopupOverCard(
  elements: readonly { id: string; type?: string; customData?: Record<string, unknown> | null }[],
  appState: { showHyperlinkPopup?: unknown; selectedElementIds: Readonly<Record<string, boolean>> },
): boolean {
  if (!appState.showHyperlinkPopup) return false
  const ids = Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id])
  if (ids.length !== 1) return false
  const el = elements.find((e) => e.id === ids[0])
  return !!el && isCard(el)
}

/**
 * Whether everything selected is a card: Excalidraw's style panel (strokes,
 * fills, the link editor) means nothing for a live card, so the board shows
 * none then (boardExcalidraw marks it; excalidrawTheme.css; DB-56 MUST 1).
 */
export function onlyCardsSelected(
  elements: readonly { id: string; type?: string; customData?: Record<string, unknown> | null }[],
  appState: { selectedElementIds: Readonly<Record<string, boolean>> },
): boolean {
  const ids = new Set(Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id]))
  if (ids.size === 0) return false
  // One pass over the board (this runs on every change), out at the first selected thing that isn't a card.
  let cards = 0
  for (const el of elements) {
    if (!ids.has(el.id)) continue
    if (!isCard(el)) return false
    cards++
  }
  return cards === ids.size
}

/**
 * The cards pasted text makes: every line a link to a OneCamp thing with a
 * card, as an address on the app's own origin. Text with anything else in it
 * pastes as text, as before.
 */
export function cardLinksIn(text: string, where: EmbedPlace): { link: string; kind: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: { link: string; kind: string }[] = []
  for (const line of lines) {
    const ref = entityOfHref(line, where.origin)
    if (!ref || !where.isCardKind(ref.kind)) return []
    out.push({ link: cardLink(where.origin, ref.kind, ref.id), kind: ref.kind })
  }
  return out
}

/** Where cards placed together go: in a row, centred on a point. */
export function cardsAt(at: { x: number; y: number }, kinds: readonly string[]): { x: number; y: number }[] {
  const sizes = kinds.map(cardSize)
  const total = sizes.reduce((w, s) => w + s.width, 0) + GAP * Math.max(0, sizes.length - 1)
  let x = at.x - total / 2
  return sizes.map((s) => {
    const p = { x, y: at.y - s.height / 2 }
    x += s.width + GAP
    return p
  })
}

/**
 * Lays cards for these links in a row centred on a point of the scene, selected,
 * as one undo step, and says which they are.
 */
export function layCards(
  api: Pick<ExcalidrawImperativeAPI, "getSceneElementsIncludingDeleted" | "updateScene">,
  links: readonly { link: string; kind: string }[],
  at: { x: number; y: number },
): string[] {
  const spots = cardsAt(at, links.map((l) => l.kind))
  const cards = links.map((l, i) => cardElement({ id: newElementId("card"), x: spots[i].x, y: spots[i].y, link: l.link, kind: l.kind }))
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...cards] as never,
    appState: { selectedElementIds: Object.fromEntries(cards.map((c) => [c.id, true])) } as never,
    captureUpdate: CAPTURE.IMMEDIATELY as never,
  })
  return cards.map((c) => c.id)
}
