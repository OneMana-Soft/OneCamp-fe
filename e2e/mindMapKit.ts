import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { arrow, boardDoc, boardDocName, boardFixtures, boardInfo, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// The mind map specs' board and helpers (e2e/boardMindMap.spec.ts, and the AI edition's e2e/boardMindMapAI.spec.ts).

export const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
export const NAME = boardDocName(BOARD)
export const TOKEN = "guest-link-mindmap"
const LEVELS = { sam: "edit", ann: "view", guest: "view" }
export const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
export type Device = keyof typeof DEVICES
export type Shared = { id: string; type: string; x: number; y: number; width: number; isDeleted?: boolean; text?: string; containerId?: string; customData?: { mindMap?: { map?: string; parent?: string | null; folded?: boolean }; taskUuid?: string } }
export const GREEN = { r: 0x0c, g: 0xa6, b: 0x78 }

/** A mind map node at a scene point: a box with its words, tagged as the map's. */
export const mind = (id: string, x: number, y: number, text: string, parent: string | null, fill = "#FFFFFF") => {
  const [box, label] = note(id, x, y, text, { fill, edge: "#2563EB", ink: "#1F2933", size: 120 })
  return [{ ...box, customData: { mindMap: { map: "m1", parent, ...(parent === "root" ? { side: "r" } : {}) } } }, label]
}
export function mapBoard(elements: unknown[] = [...mind("root", 20, 200, "Launch", null), ...mind("a", 200, 120, "Site", "root"), ...mind("a1", 380, 120, "Copy", "a", "#0CA678"), ...mind("b", 200, 300, "Press", "root")]) {
  const board = { uuid: BOARD, title: "Launch map", levels: LEVELS, update: boardDoc(ordered(elements as never)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
}
export type Board = ReturnType<typeof mapBoard>

/** root -> a -> a1 -> a2, root -> b, each joined by a tagged connector; a1's connector has words ("via"). */
export function connected() {
  const els = [...mind("root", 20, 200, "Launch", null), ...mind("a", 200, 120, "Site", "root"), ...mind("a1", 380, 120, "Copy", "a", "#0CA678"), ...mind("a2", 560, 120, "Brief", "a1"), ...mind("b", 200, 300, "Press", "root")] as Record<string, unknown>[]
  const by = (id: string) => els.find((e) => e.id === id)!
  const edge = (id: string, from: string, to: string) => ({ ...arrow(id, by(from), by(to)), endArrowhead: null, customData: { mindMap: { map: "m1", child: to } } }) as Record<string, unknown>
  const edges = [edge("e-a", "root", "a"), edge("e-a1", "a", "a1"), edge("e-a2", "a1", "a2"), edge("e-b", "root", "b")]
  const [, words] = note("e-a1", 440, 150, "via", { ink: "#1F2933", size: 60 })
  edges[1].boundElements = [{ type: "text", id: words.id }]
  return [...els, ...edges, words]
}

const camera = (key: string) => {
  try {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
  } catch {
    /* the nodes are then elsewhere, and the checks say so */
  }
}

export async function openMember(browser: Browser, device: Device, on: Board, user = USERS.sam, extra: Array<[RegExp, unknown]> = []) {
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(camera, `onecamp:board:viewport:${BOARD}`)
  const fixtures: Array<[RegExp, unknown]> = [...extra, [/\/board\/getBoardInfo\/[^/]+$/, () => ({ msg: "ok", data: boardInfo(on.board, user, USERS.sam) })], ...boardFixtures([on.board], user, USERS.sam)]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab: on.collab, fixtures })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

export const server = (on: Board) => () => [...on.collab.doc(NAME).getMap("elements").values()] as Shared[]
export const el = (on: Board, id: string) => server(on)().find((e) => e.id === id)
export const deleted = (on: Board, ids: readonly string[]) => () => ids.map((id) => el(on, id)?.isDeleted ?? false)
export const nodes = (on: Board) => server(on)().filter((e) => e.customData?.mindMap && !e.isDeleted && e.type !== "arrow")
export const wordsOf = (on: Board, id: string) => server(on)().find((e) => e.containerId === id && !e.isDeleted)?.text
/** A fixture that answers `body` and keeps each request's JSON body, in order. */
export function posts(body: (sent: Record<string, unknown>, n: number) => unknown) {
  const sent: Record<string, unknown>[] = []
  const answer = (_p: string, _u: URL, req: { postData(): string | null }) => {
    const json = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>
    sent.push(json)
    return body(json, sent.length)
  }
  return { sent, answer }
}
/** Presses a scene point (the camera at 0, 0, zoom 1). */
export async function pressAt(page: Page, device: Device, x: number, y: number) {
  const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  if (device === "phone") await page.touchscreen.tap(box.x + x, box.y + y)
  else await page.mouse.click(box.x + x, box.y + y)
}
export const drawnAnywhere = (page: Page, c: { r: number; g: number; b: number }) =>
  page.evaluate((c) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.static")
    if (!canvas) return false
    const px = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - c.r) < 12 && Math.abs(px[i + 1] - c.g) < 12 && Math.abs(px[i + 2] - c.b) < 12) return true
    return false
  }, c)
