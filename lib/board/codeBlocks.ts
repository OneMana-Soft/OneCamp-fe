/**
 * A code block on a board (miro-17): an Excalidraw embeddable that draws its own code, as a card draws its task
 * (lib/board/cards.ts). One element carries it all in customData (kind "code", the code, its language and a title),
 * so it moves, resizes, copies, undoes, syncs, joins templates and reaches guests as any element does.
 *
 * Excalidraw draws an embeddable only once its link is valid (validateEmbeddable sees the link alone), so every code
 * block keeps the same fixed link on the app's origin, which only says "a code block": the code is never in it.
 * No React, and no Excalidraw code: laying and changing one go through the api they are handed.
 */

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { CAPTURE, bumped, type BoardElement } from "@/lib/board/binding"
import { newElementId } from "@/lib/board/ids"

/** The kind a code block keeps in customData. */
export const CODE_KIND = "code"

/** The path every code block's link names, on the app's own origin. Nothing is served there. */
export const CODE_LINK_PATH = "/app/code-block"

/** The most a code block holds, and the longest title and language name it keeps. */
export const CODE_MAX = 20_000
const TITLE_MAX = 120
const LANGUAGE = /^[A-Za-z0-9#+._-]{1,40}$/

/** What a code block says: its code, the language it is coloured as (null: guessed), and its title ("" for none). */
export interface CodeBlock {
  code: string
  language: string | null
  title: string
}

type ElementLike = { type?: string; customData?: Record<string, unknown> | null }

/** Whether an element is a code block. */
export function isCodeBlock(el: ElementLike | null | undefined): boolean {
  return !!el && el.type === "embeddable" && el.customData?.kind === CODE_KIND
}

/** A code block's link: the fixed code path on the app's origin. */
export function codeBlockLink(origin: string): string {
  return `${new URL(origin).origin}${CODE_LINK_PATH}`
}

/** Whether a link is a code block's own: exactly the code path on the app's origin, with nothing after it. */
export function isCodeBlockLink(link: string, origin: string): boolean {
  try {
    const base = new URL(origin)
    const url = new URL(link.trim(), base)
    return url.origin === base.origin && url.pathname === CODE_LINK_PATH && !url.search && !url.hash
  } catch {
    return false
  }
}

/** A code block's content, made safe to draw: anything missing or malformed reads as empty, too much is cut. */
export function codeBlockOf(el: ElementLike | null | undefined): CodeBlock | null {
  if (!el || !isCodeBlock(el)) return null
  const d = el.customData ?? {}
  return {
    code: typeof d.code === "string" ? d.code.slice(0, CODE_MAX) : "",
    language: typeof d.language === "string" && LANGUAGE.test(d.language) ? d.language : null,
    title: typeof d.title === "string" ? d.title.slice(0, TITLE_MAX) : "",
  }
}

/** The lines a code block draws, each with its number (one empty line for no code). */
export function codeLines(code: string): Array<{ n: number; text: string }> {
  return code.replace(/\r\n?/g, "\n").split("\n").map((text, i) => ({ n: i + 1, text }))
}

/** Room for the header, a line, a character and the gutter, in scene units at zoom 1. */
const HEADER = 40
const LINE = 20
const CHAR = 7.8
const PAD = 24
const SIZE = { minWidth: 320, maxWidth: 960, minHeight: 96, maxHeight: 640 }

/** The size a code block is placed at: its longest line and its lines, within bounds (the code scrolls past them). */
export function codeBlockSize(code: string): { width: number; height: number } {
  const lines = codeLines(code)
  const longest = lines.reduce((m, l) => Math.max(m, l.text.length), 0)
  const gutter = String(lines.length).length * CHAR + 16
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)))
  return {
    width: clamp(gutter + longest * CHAR + PAD * 2, SIZE.minWidth, SIZE.maxWidth),
    height: clamp(HEADER + lines.length * LINE + PAD, SIZE.minHeight, SIZE.maxHeight),
  }
}

const nonce = () => Math.floor(Math.random() * 2 ** 31)

/** A new code block, as Excalidraw's own newEmbeddableElement makes an embeddable: rounded, no stroke or fill. */
export function codeBlockElement(o: { id: string; x: number; y: number; origin: string; block: CodeBlock }) {
  const block = codeBlockOf({ type: "embeddable", customData: { kind: CODE_KIND, ...o.block } }) as CodeBlock
  const { width, height } = codeBlockSize(block.code)
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
    link: codeBlockLink(o.origin),
    locked: false,
    customData: { kind: CODE_KIND, code: block.code, language: block.language, title: block.title },
  }
}

type SceneApi = Pick<ExcalidrawImperativeAPI, "getSceneElementsIncludingDeleted" | "updateScene">

/** Lays a new code block centred on a point of the scene, selected, as one undo step; its id. */
export function layCodeBlock(api: SceneApi, block: CodeBlock, at: { x: number; y: number }, origin: string): string {
  const { width, height } = codeBlockSize(block.code)
  const el = codeBlockElement({ id: newElementId("code"), x: at.x - width / 2, y: at.y - height / 2, origin, block })
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), el] as never,
    appState: { selectedElementIds: { [el.id]: true } } as never,
    captureUpdate: CAPTURE.IMMEDIATELY as never,
  })
  return el.id
}

/**
 * Changes a code block's code, language and title in place, cleaned as codeBlockOf cleans them, as one undo step; its
 * place, size and link stay. False, and nothing written, when the id is no live code block.
 */
export function changeCodeBlock(api: SceneApi, id: string, block: CodeBlock): boolean {
  const all = api.getSceneElementsIncludingDeleted() as unknown as readonly BoardElement[]
  const el = all.find((e) => e.id === id) as (BoardElement & { customData?: Record<string, unknown> | null }) | undefined
  if (!el || el.isDeleted || !isCodeBlock(el)) return false
  const clean = codeBlockOf({ type: "embeddable", customData: { kind: CODE_KIND, ...block } }) as CodeBlock
  const next = bumped(el, { customData: { ...(el.customData ?? {}), kind: CODE_KIND, ...clean } })
  api.updateScene({ elements: all.map((e) => (e === el ? next : e)) as never, captureUpdate: CAPTURE.IMMEDIATELY as never })
  return true
}
