// A board's canvas, built in Node for the tests and measurements that open a
// board without a real server: the two-client e2e (e2e/boardUndo.spec.ts) and
// the whiteboard fluidity budgets (fluid-22). One copy, so the e2e and the
// harness open the same kind of board.
//
// A board is a Yjs document named "board:<uuid>" whose map "elements" holds
// each Excalidraw element under its id, and whose map "files" holds image
// metadata only ({ id, objectUuid, mimeType }); components/board/boardCanvas.tsx
// binds it. Pass { id: boardDocName(uuid), update: boardDoc(elements), levels }
// to fakeApp.mjs's collabFor(), as the docs pass theirs, and boardFixtures()
// to fakeApp's fixtures for the board's own reads.
import * as Y from "yjs"

/** The collaboration service's name for a board's document. */
export const boardDocName = (uuid) => `board:${uuid}`

// Excalidraw's font families (0.18): the hand-drawn one and the clean sans.
const EXCALIFONT = 5
const NUNITO = 6

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/**
 * The n-th of Excalidraw's element orders, "a0" … "az", "b10" …, "c100" …,
 * which sort as the elements are listed (fractional indexing's integer keys,
 * as business/DemoSeed/board.go writes them). Pure.
 */
export function fractionalIndex(n) {
  const b = DIGITS.length
  if (n < b) return "a" + DIGITS[n]
  if (n < b * b) return "b" + DIGITS[Math.floor(n / b)] + DIGITS[n % b]
  return "c" + DIGITS[Math.floor(n / (b * b)) % b] + DIGITS[Math.floor(n / b) % b] + DIGITS[n % b]
}

/** A small stable number from a string (FNV-1a), for seeds and nonces. Pure. */
export function seedFor(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h & 0x7fffffff
}

function base(id, type, x, y, width, height, o = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: seedFor(id),
    version: 1,
    versionNonce: seedFor(id + "#"),
    isDeleted: false,
    boundElements: null,
    updated: o.updated ?? 1_760_000_000_000,
    link: null,
    locked: false,
    ...o.extra,
  }
}

/**
 * A sticky note: a filled rectangle with its label bound inside it, the way
 * the templates draw one (lib/board/templates.ts). Returns [note, label].
 */
export function note(id, x, y, text, { fill = "#FFF6D6", edge = "#B98200", ink = "#7A5200", size = 180, frameId = null, updated } = {}) {
  const labelId = `${id}-label`
  const rect = base(id, "rectangle", x, y, size, size, {
    updated,
    extra: {
      backgroundColor: fill,
      strokeColor: edge,
      strokeWidth: 1,
      roundness: { type: 3 },
      boundElements: [{ type: "text", id: labelId }],
      frameId,
      customData: { kind: "note" },
    },
  })
  const lines = String(text).split("\n")
  const fontSize = 18
  const width = Math.min(size - 20, Math.max(...lines.map((l) => l.length)) * 9)
  const height = lines.length * fontSize * 1.25
  const label = base(labelId, "text", x + (size - width) / 2, y + (size - height) / 2, width, height, {
    updated,
    extra: {
      strokeColor: ink,
      text,
      originalText: text,
      fontSize,
      fontFamily: NUNITO,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: id,
      autoResize: true,
      lineHeight: 1.25,
      frameId,
    },
  })
  return [rect, label]
}

/** A plain shape: "rectangle", "ellipse" or "diamond". */
export function shape(id, kind, x, y, width = 160, height = 100, { fill = "transparent", frameId = null, updated } = {}) {
  return base(id, kind, x, y, width, height, { updated, extra: { backgroundColor: fill, frameId } })
}

/**
 * An arrow from one shape's right edge to another's left edge, bound to both,
 * with the shapes' boundElements updated in place to name it (as Excalidraw
 * keeps the two sides of a binding).
 */
export function arrow(id, from, to, { updated } = {}) {
  const x = from.x + from.width
  const y = from.y + from.height / 2
  const ex = to.x
  const ey = to.y + to.height / 2
  const el = base(id, "arrow", x, y, Math.abs(ex - x), Math.abs(ey - y), {
    updated,
    extra: {
      points: [
        [0, 0],
        [ex - x, ey - y],
      ],
      lastCommittedPoint: null,
      startBinding: { elementId: from.id, focus: 0, gap: 1 },
      endBinding: { elementId: to.id, focus: 0, gap: 1 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      roundness: { type: 2 },
    },
  })
  for (const s of [from, to]) s.boundElements = [...(s.boundElements ?? []), { type: "arrow", id }]
  return el
}

/** A named frame round the given elements, whose frameId it sets. */
export function frame(id, name, children, { pad = 10, updated } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of children) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.width); y1 = Math.max(y1, c.y + c.height)
  }
  for (const c of children) c.frameId = id
  return base(id, "frame", x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, {
    updated,
    extra: { name, strokeColor: "#bbb", strokeWidth: 1 },
  })
}

/** An image element and its "files" entry (metadata only; the bytes are the server's). */
export function image(id, x, y, { width = 240, height = 160, objectUuid, mimeType = "image/png", updated } = {}) {
  const fileId = `file-${id}`
  const el = base(id, "image", x, y, width, height, {
    updated,
    extra: { fileId, status: "saved", scale: [1, 1], crop: null },
  })
  return { element: el, file: { id: fileId, objectUuid: objectUuid ?? `0b1ec700-0000-4000-8000-${String(seedFor(id)).padStart(12, "0").slice(-12)}`, mimeType } }
}

/** Gives elements their order, in the order listed. Mutates and returns them. */
export function ordered(elements) {
  elements.forEach((el, i) => (el.index = fractionalIndex(i)))
  return elements
}

/** The Yjs update that holds these elements (and image metadata), as the server stores a board. */
export function boardDoc(elements, files = []) {
  const doc = new Y.Doc()
  doc.transact(() => {
    const m = doc.getMap("elements")
    for (const el of elements) m.set(el.id, el)
    const f = doc.getMap("files")
    for (const x of files) f.set(x.id, x)
  })
  return Y.encodeStateAsUpdate(doc)
}

/** The live elements of a board document (the server's copy), by id. */
export function liveElements(doc) {
  const out = new Map()
  doc.getMap("elements").forEach((el, id) => {
    if (!el.isDeleted) out.set(id, el)
  })
  return out
}

/**
 * GET /board/getBoardInfo/<uuid>'s answer for `user`: board.levels maps a
 * user's token to "edit" or "view" (anything else can't open it).
 */
export function boardInfo(board, user, owner) {
  const level = board.levels?.[user.token] ?? "none"
  const now = new Date().toISOString()
  return {
    board_uuid: board.uuid,
    board_title: board.title,
    board_edit_access: level === "edit" ? 1 : 0,
    board_read_access: level === "none" ? 0 : 1,
    board_comment_access: 0,
    board_private: false,
    board_created_by: { user_uuid: owner.user_uuid, user_name: owner.user_name, user_full_name: owner.user_full_name },
    board_editing_users: [],
    board_reading_users: [],
    board_commenting_users: [],
    board_created_at: now,
    board_updated_at: now,
    board_mqtt_topic: "",
  }
}

/**
 * fakeApp fixtures for these boards' reads, as `user` (and the board list).
 * @returns {Array<[RegExp, (path: string) => unknown]>}
 */
export function boardFixtures(boards, user, owner) {
  return [
    [
      /\/board\/getBoardInfo\/[^/]+$/,
      (path) => {
        const uuid = path.split("/").pop()
        const board = boards.find((b) => b.uuid === uuid)
        if (!board || (board.levels?.[user.token] ?? "none") === "none") return { msg: "There's no such board.", data: null }
        return { msg: "ok", data: boardInfo(board, user, owner) }
      },
    ],
    [
      /\/board\/getBoardList$/,
      () => ({
        msg: "ok",
        data: {
          boards: boards
            .filter((b) => (b.levels?.[user.token] ?? "none") !== "none")
            .map((b) => ({ board_uuid: b.uuid, board_title: b.title, board_private: false, board_updated_at: new Date().toISOString() })),
          count: boards.length,
        },
      }),
    ],
  ]
}

/**
 * A synthetic board of `objects` things a person sees, in fluid-22's mix:
 * 60% notes with text, 20% shapes, 15% arrows bound to shapes, 5% frames, and
 * one image in every 200 objects (50 at 10,000). Groups of 20: twelve notes in
 * a frame, four shapes joined by three arrows, the frame itself; four groups
 * a row, so no frame spans two rows. Deterministic. Returns { elements, files,
 * objects, notes }.
 */
export function syntheticBoard(objects, { cell = 220 } = {}) {
  const TEXTS = ["Ship the pricing page", "Rollback steps in the plan", "Load test Wednesday", "Freeze copy a week out", "Ask Acme about SSO", "Book the retro", "Docs for the API", "Who is on call?"]
  const TINTS = [
    { fill: "#FFF6D6", edge: "#B98200", ink: "#7A5200" },
    { fill: "#E6F6EC", edge: "#2F9E5B", ink: "#1D6A3C" },
    { fill: "#FCE8EF", edge: "#D9467C", ink: "#962556" },
    { fill: "#E7EFFC", edge: "#3B7DDD", ink: "#1E4E9A" },
  ]
  const elements = []
  const files = []
  let notes = 0
  let made = 0
  const groups = Math.ceil(objects / 20)
  for (let g = 0; g < groups && made < objects; g++) {
    const gx = (g % 4) * 16 * cell
    const gy = Math.floor(g / 4) * cell
    const children = []
    for (let i = 0; i < 12 && made < objects; i++, made++) {
      const t = TINTS[(g + i) % TINTS.length]
      const pair = note(`n${g}-${i}`, gx + i * cell, gy, TEXTS[(g * 12 + i) % TEXTS.length], { ...t, size: 180 })
      children.push(...pair)
      elements.push(...pair)
      notes++
    }
    const shapes = []
    for (let i = 0; i < 4 && made < objects; i++, made++) {
      const x = gx + (12 + i) * cell
      if (i === 0 && g % 10 === 0) {
        const { element, file } = image(`img${g}`, x, gy, { width: 180, height: 120 })
        elements.push(element)
        files.push(file)
        shapes.push(element)
      } else {
        const s = shape(`s${g}-${i}`, ["rectangle", "ellipse", "diamond"][i % 3], x, gy + 30, 160, 100)
        elements.push(s)
        shapes.push(s)
      }
    }
    // An image takes a binding as a shape does.
    for (let i = 0; i + 1 < shapes.length && i < 3 && made < objects; i++, made++) {
      elements.push(arrow(`a${g}-${i}`, shapes[i], shapes[i + 1]))
    }
    if (children.length && made < objects) {
      elements.push(frame(`f${g}`, `Group ${g + 1}`, children))
      made++
    }
  }
  return { elements: ordered(elements), files, objects: made, notes }
}
