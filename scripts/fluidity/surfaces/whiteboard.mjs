// The whiteboard (fluid-22; MIRO-ANALYST's row, with WHITEBOARD-LEAD, whose
// fakeBoard.mjs builds the boards): synthetic boards of 1,000, 5,000 and
// 10,000 things a person sees (syntheticBoard: notes with text, shapes, bound
// arrows, frames, images), each a board's Yjs document on the fake
// collaboration server, with the camera fixed by the board's own localStorage
// key. Per run, on a computer at 1x or a phone at 4x:
//   a cold tab to a 1,000-object board: its frame, Excalidraw's code, the drawing (step 8);
//   Home, then each board opened in the app until its drawing is painted (step 1);
//   one note dragged for 2 s, and a box of 49 things (step 4): frames while it
//     moves, and from the release until the change is sent on the socket;
//   a teammate's move, from its arrival until it is painted, and the main
//     thread's work for it (step 5);
//   typing in a note (step 6);
//   pan and zoom for about 3 s each (step 3), with the renders outside the
//     canvas while it pans (step 7);
//   the 1,000 board again within a minute, from the lingering session (step 2).
// A phone pans with two fingers and zooms by pinching (one finger on empty
// canvas draws a selection box).
//
// "Painted" is W-0's mark: [data-board-canvas] with data-board-synced="true"
// and data-board-elements at the board's count, then one frame. A teammate's
// move is painted once data-board-remote (remote merges applied) moves, then
// one frame. A build without the marks (beta before W-0) gets the frame and
// the save state's "saved", not the drawing.
//
// Budgets: whiteboard-budgets.json (FLUIDITY-LEAD-4, 21 Oct 2026).
//   node scripts/fluidity/surfaces.mjs --only whiteboard --cpu 1 [--boards 1000,5000]
import { deflateSync } from "node:zlib"

import { USERS, bytes, collabFor } from "../fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, syntheticBoard } from "../fakeBoard.mjs"
import { mainThreadAfter, pinch, traceEvents, twoFingerPan } from "../lib.mjs"
import { calendarFixtures, chatFixtures, shellFixtures, workFixtures, workSidebar } from "../workspace.mjs"
import { HOME } from "./shell.mjs"

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i < 0 ? d : argv[i + 1]
}
const PHONE = arg("device", Number(arg("cpu", 1)) > 1 ? "phone" : "desktop") === "phone"
// The boards a run opens (--boards 1000,5000): all three unless told. 4,000 is the
// board's warning line before miro-06 (components/board/boardCanvas BOARD_WARN_ELEMENTS),
// opened only when asked: the size today's 10,000 is compared against.
// With --shots, the board as each step left it (a diagnosis of where the pointer went).
const SHOTS = arg("shots", null)
const SIZES = String(arg("boards", "1000,5000,10000"))
  .split(",")
  .map(Number)
  .filter((n) => [1000, 4000, 5000, 10000].includes(n))

// ---- the boards: one of each size, and a 1,000 one for the cold tab ----
const boardUuid = (tail) => `b0a4d000-0000-4000-8000-${tail.padStart(12, "0")}`
const LEVELS = { sam: "edit" }
function makeBoard(objects, tail, title) {
  const syn = syntheticBoard(objects)
  return { uuid: boardUuid(tail), title, levels: LEVELS, update: boardDoc(syn.elements, syn.files), elements: syn.elements.length, objects: syn.objects }
}
const BOARDS = {}
BOARDS.cold = makeBoard(1000, "c01d", "Launch wall (cold)")
for (const n of SIZES) BOARDS[n] = makeBoard(n, String(n), `Launch wall ${n / 1000}k`)
const ALL = Object.values(BOARDS)

// The camera, the same for every board: the right end of the fourth column of
// groups, where a group's last notes, its shapes and the empty canvas past
// them are in view (syntheticBoard's layout: 220 px cells, 16 to a group,
// four groups a row; group g's notes n<g>-<i>, shapes s<g>-<i>, arrows a<g>-<i>).
// On a computer (the canvas's corner at 248, 48) the fourth column's shapes
// sit at x 608-936 and rows 0 to 6 at y 120-688: clear of the facilitation bar
// (Timer, Vote, Present, from y 780) and of the properties panel (x 264-480).
const CAMERA = PHONE ? { scrollX: -12740, scrollY: 300, zoom: 0.28 } : { scrollX: -12300, scrollY: 150, zoom: 0.4 }
const CELL = 220
const groupX = (g) => (g % 4) * 16 * CELL
const groupY = (g) => Math.floor(g / 4) * CELL
// A note's middle, in scene px: group g (4r + 3 for row r of the fourth column), note i.
const noteAt = (g, i) => ({ x: groupX(g) + i * CELL + 90, y: groupY(g) + 90 })
// The group in the fourth column, row r.
const col3 = (r) => r * 4 + 3
// What a step moves: a note to drag, one a teammate moves, one to type in.
const DRAG_NOTE = { g: col3(1), i: 10 }
const REMOTE_NOTE = { g: col3(3), i: 10 }
const TYPE_NOTE = { g: col3(1), i: 11 }
// The box of 49: the fourth column's shapes and arrows in rows 0 to 6, drawn
// from the empty canvas past them, to the left (the frames, which end at
// 13,170, are left out). A computer draws it down from the top right, since a
// press at its bottom right lands on the facilitation bar. A shape in it to
// drag them by: row 2's second.
const BOX = PHONE ? { from: { x: 14080, y: 1510 }, to: { x: 13190, y: -5 } } : { from: { x: 14100, y: -5 }, to: { x: 13190, y: 1510 } }
// Empty canvas past the fourth column (its shapes end at 14,020), level with
// row 3: a press here clears the selection, which Escape doesn't in Excalidraw.
const EMPTY = PHONE ? { x: 14090, y: 740 } : { x: 14600, y: 740 }
const BOX_HANDLE = { x: groupX(col3(2)) + 13 * CELL + 80, y: groupY(col3(2)) + 80 }
const BOX_IDS = (() => {
  const ids = []
  for (let r = 0; r <= 6; r++) {
    const g = col3(r)
    for (let j = 0; j < 4; j++) ids.push(`s${g}-${j}`)
    for (let j = 0; j < 3; j++) ids.push(`a${g}-${j}`)
  }
  return ids
})()

// ---- a picture for the boards' images: a 360 x 240 PNG with some texture ----
function png(w, h) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head[8] = 8 // bit depth
  head[9] = 2 // RGB
  const row = w * 3 + 1
  const raw = Buffer.alloc(row * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * row + 1 + x * 3
      raw[i] = (x * 255) / w
      raw[i + 1] = (y * 255) / h
      raw[i + 2] = (x ^ y) & 0xff
    }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const PICTURE = png(360, 240)

// ---- in the page: the board's socket stamped, and the canvas's own renders apart ----
function boardPage() {
  // The probe counts renders under Excalidraw's element apart (lib.mjs probe).
  window.__fluInsideProp = "excalidrawAPI"
  const W = (window.__fluWs = { sent: [], got: [], lastGotAt: 0 })
  // A Hocuspocus frame: the doc's name, the message type, and for a sync
  // message (0) its kind; 2 is an update (y-protocols).
  const kind = (data) => {
    try {
      const b = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null
      if (!b) return null
      let i = 0
      const uint = () => {
        let n = 0
        let m = 1
        for (;;) {
          const x = b[i++]
          n += (x & 0x7f) * m
          if (x < 0x80) return n
          m *= 128
        }
      }
      const len = uint()
      const name = new TextDecoder().decode(b.subarray(i, i + len))
      i += len
      const type = uint()
      return { name, update: type === 0 && uint() === 2 }
    } catch {
      return null
    }
  }
  // Playwright's routeWebSocket gives the page a WebSocket of its own (an
  // EventTarget), so the socket is found where its listener is added, and its
  // class's send is wrapped then.
  const isSocket = (t) => !!t && typeof t.send === "function" && "binaryType" in t && "readyState" in t
  const wrapSend = (t) => {
    const proto = Object.getPrototypeOf(t)
    if (!proto || proto.__fluSend) return
    const send = proto.send
    proto.send = function (data) {
      const k = kind(data)
      if (k && k.update && k.name.startsWith("board:")) W.sent.push({ t: performance.now(), name: k.name })
      return send.call(this, data)
    }
    proto.__fluSend = true
  }
  const seen = new WeakSet()
  const stamp = (e) => {
    if (seen.has(e)) return
    seen.add(e)
    const k = kind(e.data)
    if (!k || !k.update || !k.name.startsWith("board:")) return
    const t = performance.now()
    W.got.push({ t, name: k.name })
    W.lastGotAt = t
    try {
      performance.mark("flu-remote")
    } catch {
      /* no user timing */
    }
  }
  const ET = EventTarget.prototype
  const add = ET.addEventListener
  const remove = ET.removeEventListener
  const wrapped = new WeakMap()
  ET.addEventListener = function (type, fn, o) {
    if (type !== "message" || typeof fn !== "function" || !isSocket(this)) return add.call(this, type, fn, o)
    wrapSend(this)
    if (!wrapped.has(fn))
      wrapped.set(fn, function (e) {
        stamp(e)
        return fn.call(this, e)
      })
    return add.call(this, type, wrapped.get(fn), o)
  }
  ET.removeEventListener = function (type, fn, o) {
    return remove.call(this, type, (type === "message" && wrapped.get(fn)) || fn, o)
  }
  // The release a drag ends with, by the pointer or the finger.
  const up = () => (window.__fluUpAt = performance.now())
  addEventListener("pointerup", up, true)
  addEventListener("touchend", up, true)
}

// Each run gets a fresh collaboration server, so what a run moved is back in
// place for the next one; the steps reach it through `server`.
let server = null

const group = {
  name: "whiteboard",
  fixtures: () => [
    ...boardFixtures(ALL, USERS.sam, USERS.sam),
    [/\/board\/getBoardAttachment\//, () => bytes("image/png", PICTURE)],
    ...shellFixtures(),
    ...calendarFixtures(),
    ...workFixtures(),
    ...chatFixtures({ sidebar: workSidebar() }),
  ],
  get collab() {
    server = collabFor(ALL.map((b) => ({ id: boardDocName(b.uuid), update: b.update, levels: LEVELS })))
    return server
  },
  storage: Object.fromEntries(ALL.map((b) => [`onecamp:board:viewport:${b.uuid}`, JSON.stringify(CAMERA)])),
  initScripts: [{ fn: boardPage }],
  async run(h) {
    const { page, cdp } = h
    const M = {}
    const sleep = (ms) => page.waitForTimeout(ms)
    const shot = (name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/wb-${h.phone ? "phone" : "desktop"}-${name}.png` }).catch(() => {}) : null)
    const path = (b) => `/app/board/${b.uuid}`
    const shared = (b) => server.doc(boardDocName(b.uuid)).getMap("elements")

    // Ms since the step's input (or the document's start), once fn(arg) holds in the page.
    const waitIn = async (fn, a, { timeout = 60000, fromNav = false } = {}) => {
      const handle = await page.waitForFunction(
        ({ src, a, fromNav }) => {
          const ok = new Function("a", `return (${src})(a)`)(a)
          return ok ? Math.max(0, performance.now() - (fromNav ? 0 : (window.__fluInputAt ?? 0))) : false
        },
        { src: fn.toString(), a, fromNav },
        { polling: "raf", timeout },
      )
      return Math.round(await handle.jsonValue())
    }
    // The board's frame: its own page with the board's title (the app's part,
    // which needs none of Excalidraw's code), and the canvas: Excalidraw's.
    const frameShown = ({ uuid, title }) => {
      if (!location.pathname.includes(uuid)) return false
      const p = document.querySelector("[data-board-page]")
      return !!p && p.getClientRects().length > 0 && (p.innerText || "").includes(title)
    }
    const canvasShown = (uuid) => location.pathname.includes(uuid) && !!document.querySelector("[data-board-page] .excalidraw canvas.interactive")
    // W-0's mark at the board's count (or a teammate's move merged), then one more frame.
    const painted = ({ uuid, n, remoteAfter }) => {
      if (!location.pathname.includes(uuid)) return false
      const c = document.querySelector("[data-board-canvas]")
      if (!c || c.getAttribute("data-board-synced") !== "true") return false
      if (n && Number(c.getAttribute("data-board-elements")) < n) return false
      if (remoteAfter != null && Number(c.getAttribute("data-board-remote") ?? -1) <= remoteAfter) return false
      if (!window.__fluMarkAt) {
        window.__fluMarkAt = performance.now()
        return false
      }
      return true
    }
    const saved = (uuid) => location.pathname.includes(uuid) && !!document.querySelector('[data-board-page] [data-save-state="saved"]')
    let marks = null // W-0's marks on this build: learnt on the first board
    const resetMark = () => page.evaluate(() => (window.__fluMarkAt = 0))
    const camera = (b) => page.evaluate((k) => localStorage.getItem(k), `onecamp:board:viewport:${b.uuid}`)
    // Until the board's drawing is painted (or, without the marks, saved and a while after).
    const untilPainted = async (b, { fromNav = false, timeout = 90000 } = {}) => {
      if (marks === null) {
        marks = await page
          .locator("[data-board-canvas]")
          .first()
          .waitFor({ state: "attached", timeout: 4000 })
          .then(() => true)
          .catch(() => false)
        M.wbPaintMark = marks ? 1 : 0
      }
      if (marks) return waitIn(painted, { uuid: b.uuid, n: b.elements }, { timeout, fromNav })
      await waitIn(saved, b.uuid, { timeout, fromNav }).catch(() => null)
      await sleep(b.elements > 10000 ? 6000 : b.elements > 5000 ? 4000 : 2000)
      return null
    }

    // Scene px to the page's: the camera is fixed (CAMERA) until a pan or a zoom.
    const screen = async (p) => {
      const box = await page.locator("[data-board-page] .excalidraw").first().boundingBox()
      if (!box) throw new Error("the board's canvas isn't on the page")
      return { x: box.x + (p.x + CAMERA.scrollX) * CAMERA.zoom, y: box.y + (p.y + CAMERA.scrollY) * CAMERA.zoom }
    }
    const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), radiusX: 4, radiusY: 4, force: 1, id: 1 }] : [] })
    // A press at `from`, moves along `points` 16 ms apart, a release: the pointer, or a finger.
    const dragAlong = async (from, points) => {
      if (h.phone) {
        await touch("touchStart", from)
        for (const p of points) {
          await sleep(16)
          await touch("touchMove", p)
        }
        await touch("touchEnd")
        return
      }
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (const p of points) {
        await sleep(16)
        await page.mouse.move(p.x, p.y)
      }
      await page.mouse.up()
    }
    // Nothing selected: a press on the empty canvas (a tap on a phone). A
    // selection left behind opens the properties panel over the notes' column,
    // which then takes the next step's press.
    const unselect = async () => {
      const p = await screen(EMPTY)
      if (h.phone) {
        await touch("touchStart", p)
        await touch("touchEnd")
      } else await page.mouse.click(p.x, p.y)
      await sleep(400)
    }
    // About 2 s of a held thing moving: a loop of `r` px, ending `end` px to the right.
    const loop = (c, { r = 40, end = 24, moves = 120 } = {}) =>
      Array.from({ length: moves }, (_, i) => {
        const a = (2 * Math.PI * (i + 1)) / moves
        const k = (i + 1) / moves
        return { x: c.x + r * Math.sin(a) + end * k, y: c.y - r * (1 - Math.cos(a)) * 0.5 }
      })
    // The last update the page sent for this board after its release, in ms
    // from the release (0 when the release's state was already sent).
    const sentAfterRelease = (b) =>
      page.evaluate((name) => {
        const up = window.__fluUpAt ?? 0
        const sent = window.__fluWs.sent.filter((s) => s.name === name)
        const last = sent.length ? sent[sent.length - 1].t : null
        return last === null ? null : Math.max(0, Math.round(last - up))
      }, boardDocName(b.uuid))
    const at = (b, id) => shared(b).get(id)
    const movedOnServer = (b, ids, before) => ids.filter((id) => at(b, id) && before[id] && (at(b, id).x !== before[id].x || at(b, id).y !== before[id].y)).length
    const xyOf = (b, ids) => Object.fromEntries(ids.map((id) => [id, at(b, id) && { x: at(b, id).x, y: at(b, id).y }]))

    // The steps' positions hold only while the board keeps the camera it was given.
    const cameraHeld = async (b) => {
      await sleep(700)
      const c = JSON.parse((await camera(b)) || "null")
      const held = !!c && Math.abs(c.scrollX - CAMERA.scrollX) < 1 && Math.abs(c.scrollY - CAMERA.scrollY) < 1 && Math.abs(c.zoom - CAMERA.zoom) < 0.001
      M.wbCameraHeld = Math.min(M.wbCameraHeld ?? 1, held ? 1 : 0)
      if (!held) h.log.push(`camera for ${b.uuid}: ${JSON.stringify(c)} (given ${JSON.stringify(CAMERA)})`)
      return held
    }

    // ---- a board opened in the app: the push, until its drawing is painted ----
    // `held`: whether the board should still have the camera it was given (a
    // reopen after the pan and zoom has the one they left, on purpose).
    const open = async (id, b, { held = true } = {}) => {
      await resetMark()
      // Not asked for (--steps): the board is still opened, untimed, for the steps after it.
      if (!h.wants(id)) {
        await h.push(path(b))
        await waitIn(canvasShown, b.uuid, { timeout: 60000 })
        await untilPainted(b)
        if (held) await cameraHeld(b)
        return { ok: true }
      }
      const s = await h.step(id, {
        act: () => h.push(path(b)),
        ready: async () => {
          const canvas = await waitIn(canvasShown, b.uuid, { timeout: 60000 })
          const p = await untilPainted(b)
          M[`${id}CanvasMs`] = canvas
          return p ?? null
        },
        settle: 1500,
      })
      M[`${id}Ms`] = s?.ready
      M[`${id}Renders`] = s?.renders
      M[`${id}LongMs`] = s?.longMs
      if (held) await cameraHeld(b)
      await shot(id)
      return s
    }

    // ---- one note dragged about 2 s, and released ----
    const dragNote = async (id, b, note) => {
      if (!h.wants(id)) return
      const ids = [`n${note.g}-${note.i}`, `n${note.g}-${note.i}-label`]
      const before = xyOf(b, ids)
      const c = await screen(noteAt(note.g, note.i))
      const s = await h.step(id, { act: () => dragAlong(c, loop(c)), frames: true, settle: 1200 })
      M[`${id}FrameP95Ms`] = s?.frames?.p95
      M[`${id}DroppedPct`] = s?.frames?.droppedPct
      M[`${id}Renders`] = s?.renders
      M[`${id}RendersOutside`] = s ? s.renders - (s.rendersInside ?? 0) : null
      M[`${id}Moved`] = movedOnServer(b, ids, before)
      M[`${id}WrittenMs`] = M[`${id}Moved`] ? await sentAfterRelease(b) : null
      await shot(id)
      await unselect()
    }

    // ---- a teammate moves a note: from its arrival until it is painted, and the main thread's work ----
    const remote = async (id, b, note) => {
      if (!h.wants(id)) return
      const rect = `n${note.g}-${note.i}`
      const name = boardDocName(b.uuid)
      const before = marks ? await page.evaluate(() => Number(document.querySelector("[data-board-canvas]")?.getAttribute("data-board-remote") ?? -1)) : null
      const hasCount = before !== null && before >= 0
      let paintMs = null
      let work = null
      await sleep(800)
      const s = await h.step(id, {
        act: async () => {
          await resetMark()
          const events = await traceEvents(cdp, async () => {
            const got = await page.evaluate(() => window.__fluWs.got.length)
            server.edit(name, (doc) => {
              const m = doc.getMap("elements")
              for (const k of [rect, `${rect}-label`]) {
                const el = m.get(k)
                if (el) m.set(k, { ...el, x: el.x + 40, version: (el.version ?? 1) + 1, versionNonce: ((el.versionNonce ?? 0) + 7919) % 2147483647, updated: Date.now() })
              }
            })
            await page.waitForFunction((n) => window.__fluWs.got.length > n, got, { polling: "raf", timeout: 10000 })
            if (hasCount)
              paintMs = await page
                .waitForFunction(
                  (after) => {
                    const c = document.querySelector("[data-board-canvas]")
                    if (!c || Number(c.getAttribute("data-board-remote") ?? -1) <= after) return false
                    if (!window.__fluMarkAt) {
                      window.__fluMarkAt = performance.now()
                      return false
                    }
                    return Math.max(0.1, performance.now() - window.__fluWs.lastGotAt)
                  },
                  before,
                  { polling: "raf", timeout: 10000 },
                )
                .then((x) => x.jsonValue())
                .then(Math.round)
                .catch(() => null)
            // The work the move set off: a second after it arrived.
            await sleep(1100)
          })
          work = mainThreadAfter(events, "flu-remote", 1000)
        },
        settle: 400,
      })
      M[`${id}PaintMs`] = paintMs
      M[`${id}MainMs`] = work?.ms ?? null
      M[`${id}LongestTaskMs`] = work?.longestMs ?? null
      M[`${id}Renders`] = s?.renders
    }

    // ---- pan, then zoom, about 3 s each: the wheel and Ctrl+wheel on a computer, two fingers and a pinch on a phone ----
    const panZoom = async (size, b) => {
      const box = await page.locator("[data-board-page] .excalidraw").first().boundingBox()
      if (!box) throw new Error("the board's canvas isn't on the page")
      const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      if (!h.phone) await page.mouse.move(mid.x, mid.y)
      const panId = `wbPan${size}`
      if (h.wants(panId)) {
        const cam0 = await camera(b)
        const s = await h.step(panId, {
          act: async () => {
            if (h.phone) {
              const area = { left: box.x + 20, top: box.y + 120, right: box.x + box.width - 20, bottom: box.y + box.height - 140 }
              await twoFingerPan(cdp, { box: area, dy: 1400 })
              await twoFingerPan(cdp, { box: area, dy: -700, dx: 300 })
            } else {
              for (let i = 0; i < 120; i++) {
                await page.mouse.wheel(i % 40 < 30 ? 0 : 24, 36)
                await sleep(16)
              }
              for (let i = 0; i < 60; i++) {
                await page.mouse.wheel(0, -36)
                await sleep(16)
              }
            }
          },
          frames: true,
          settle: 900,
        })
        if (s && (await camera(b)) === cam0) {
          s.ok = false
          s.error = "the pan moved nothing (the board's camera is where it was)"
        }
        M[`${panId}FrameP95Ms`] = s?.ok ? s.frames?.p95 : null
        M[`${panId}DroppedPct`] = s?.ok ? s.frames?.droppedPct : null
        M[`${panId}Renders`] = s?.renders
        M[`${panId}RendersOutside`] = s ? s.renders - (s.rendersInside ?? 0) : null
      }
      const zoomId = `wbZoom${size}`
      if (h.wants(zoomId)) {
        const cam0 = await camera(b)
        const s = await h.step(zoomId, {
          act: async () => {
            if (h.phone) {
              for (const [a, z] of [
                [110, 250],
                [250, 150],
                [150, 260],
                [260, 170],
              ])
                await pinch(cdp, { x: mid.x, y: mid.y, from: a, to: z, steps: 36 })
            } else {
              await page.keyboard.down("Control")
              try {
                for (let i = 0; i < 100; i++) {
                  await page.mouse.wheel(0, -8)
                  await sleep(16)
                }
                for (let i = 0; i < 70; i++) {
                  await page.mouse.wheel(0, 8)
                  await sleep(16)
                }
              } finally {
                await page.keyboard.up("Control")
              }
            }
          },
          frames: true,
          settle: 900,
        })
        if (s && (await camera(b)) === cam0) {
          s.ok = false
          s.error = "the zoom changed nothing (the board's camera is where it was)"
        }
        M[`${zoomId}FrameP95Ms`] = s?.ok ? s.frames?.p95 : null
        M[`${zoomId}DroppedPct`] = s?.ok ? s.frames?.droppedPct : null
        M[`${zoomId}RendersOutside`] = s ? s.renders - (s.rendersInside ?? 0) : null
      }
    }

    // ---- a cold tab to a board: its frame, Excalidraw's code and the drawing ----
    const cold = BOARDS.cold
    if (!h.wants("wbCold")) {
      await h.goto("/app/home")
      await h.ready(HOME, { fromNav: true, timeout: 60000 }).catch(() => {})
    }
    const coldStep = await h.step("wbCold", {
      act: () => h.goto(path(cold)),
      ready: async () => {
        M.wbColdFrameMs = await waitIn(frameShown, { uuid: cold.uuid, title: cold.title }, { timeout: 90000, fromNav: true })
        M.wbColdCanvasMs = await waitIn(canvasShown, cold.uuid, { timeout: 90000, fromNav: true })
        return untilPainted(cold, { fromNav: true })
      },
      nav: true,
      settle: 2500,
    })
    M.wbColdPaintedMs = coldStep?.ready
    M.wbColdKB = coldStep?.net?.scriptKB
    // Excalidraw's code: the scripts the tab fetched that hold Excalidraw's own
    // EXCALIDRAW_ASSET_PATH (read back from the cache). The row asks for them
    // to be fetched after the frame paints: how early the first one started.
    if (coldStep) {
      const code = await page
        .evaluate(async () => {
          const s = performance.getEntriesByType("resource").filter((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name))
          const ours = []
          for (const e of s) {
            const text = await fetch(e.name).then((r) => r.text()).catch(() => "")
            if (text.includes("EXCALIDRAW_ASSET_PATH")) ours.push(e)
          }
          if (!ours.length) return null
          return { at: Math.round(Math.min(...ours.map((e) => e.startTime))), end: Math.round(Math.max(...ours.map((e) => e.responseEnd))), kb: Math.round(ours.reduce((n, e) => n + e.transferSize, 0) / 1024), files: ours.length }
        })
        .catch(() => null)
      M.wbColdCodeKB = code?.kb ?? null
      M.wbColdCodeFiles = code?.files ?? null
      M.wbColdCodeAtMs = code?.at ?? null
      M.wbColdCodeEndMs = code?.end ?? null
      // How long before the frame painted Excalidraw's code began to come: 0 when it came after.
      M.wbColdCodeEarlyMs = code && M.wbColdFrameMs != null ? Math.max(0, M.wbColdFrameMs - code.at) : null
      await shot("wbCold")
    }

    // ---- Home, then the boards ----
    await h.push("/app/home")
    await h.ready(HOME, { timeout: 30000 }).catch(() => {})
    await sleep(2000)

    for (const size of SIZES) {
      const b = BOARDS[size]
      const tag = `${size / 1000}k`
      const opened = await open(`wbOpen${tag}`, b)
      if (!opened?.ok) continue
      await sleep(800)
      if (size !== 10000) await dragNote(`wbDrag${tag}`, b, DRAG_NOTE)

      if (size === 1000 && h.wants("wbDrag50")) {
        // The box drawn from the empty canvas (not timed), then its 49 things dragged by one of them.
        const from = await screen(BOX.from)
        const to = await screen(BOX.to)
        const steps = Array.from({ length: 24 }, (_, i) => ({ x: from.x + ((to.x - from.x) * (i + 1)) / 24, y: from.y + ((to.y - from.y) * (i + 1)) / 24 }))
        await dragAlong(from, steps)
        await sleep(500)
        const before = xyOf(b, BOX_IDS)
        const c = await screen(BOX_HANDLE)
        const s = await h.step("wbDrag50", { act: () => dragAlong(c, loop(c)), frames: true, settle: 1500 })
        const moved = movedOnServer(b, BOX_IDS, before)
        M.wbDrag50Moved = moved
        if (s && moved < 40) {
          s.ok = false
          s.error = `the box's drag moved ${moved} of its ${BOX_IDS.length} things`
        }
        M.wbDrag50FrameP95Ms = s?.ok ? s.frames?.p95 : null
        M.wbDrag50DroppedPct = s?.ok ? s.frames?.droppedPct : null
        M.wbDrag50WrittenMs = s?.ok ? await sentAfterRelease(b) : null
        M.wbDrag50Renders = s?.renders
        M.wbDrag50RendersOutside = s ? s.renders - (s.rendersInside ?? 0) : null
        await shot("wbDrag50")
        await unselect()
      }

      if (size !== 10000) await remote(`wbRemote${tag}`, b, REMOTE_NOTE)

      if (size === 1000 && h.wants("wbType")) {
        // Nothing selected, then into the note's words (a double click), then 12 keys.
        await unselect()
        const c = await screen(noteAt(TYPE_NOTE.g, TYPE_NOTE.i))
        await page.mouse.dblclick(c.x, c.y)
        const editor = page.locator(".excalidraw textarea").first()
        const editing = await editor.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
        await shot("wbType-editing")
        if (editing) {
          await page.keyboard.press("End")
          await sleep(300)
        }
        const s = await h.step("wbType", {
          act: async () => {
            if (!editing) throw new Error("the note's words never opened for typing")
            await page.keyboard.type(" and ship it", { delay: 90 })
          },
          typed: 12,
          settle: 600,
        })
        M.wbTypeKeyP95Ms = s?.ok ? s.keyP95 : null
        M.rendersPerWbKey = s?.ok ? s.rendersPerKey : null
        await page.keyboard.press("Escape")
        await sleep(300)
        await unselect()
      }

      await panZoom(tag, b)
      await sleep(600)

      if (size === 1000 && h.wants("wbReopen")) {
        // ---- away and back within the minute: the lingering session ----
        await h.push("/app/home")
        await h.ready(HOME, { timeout: 30000 }).catch(() => {})
        await sleep(2500)
        await open("wbReopen", b, { held: false })
        await sleep(600)
      }
    }
    return M
  },
}

export default group
