/**
 * One collaboration socket per tab (docs programme A2, the Doc Session).
 *
 * WHY. Every doc opened its own websocket: a new TLS handshake and a new
 * connection on each open, one after another with the doc's details, the token,
 * the server's access check and the sync (perf §1.8). Hocuspocus multiplexes:
 * one socket carries any number of docs, each authenticated on its own, so a
 * second open costs the server's answer and nothing else.
 *
 * Every session attaches its provider here (lib/collabSession.ts). The socket
 * opens with the first one, and closes a minute after the last one leaves.
 *
 * TWO SERVER RULES THIS FILE KEEPS (Hocuspocus 3.4, ClientConnection.ts):
 *   - A doc whose authentication or load failed on a socket can never be tried
 *     again on that socket: the server keeps its half-made state for as long as
 *     the socket lives and queues everything sent for it, the next sign-in
 *     included. Trying such a doc again therefore starts a new connection
 *     (`refused`, then `attach` recycles the socket).
 *   - A doc that was closed and is opened again at once must wait for the
 *     server to finish closing it: until then a new sign-in for it reaches the
 *     old connection, which ignores it, and the new provider would never sync.
 *     The server answers a close with a close of its own, so `attach` waits for
 *     that answer (or, after a few seconds, starts a new connection).
 */
"use client"

import { HocuspocusProviderWebsocket, type HocuspocusProvider } from '@hocuspocus/provider'
import { SCHEMA_MANIFEST_HASH } from '@/components/minimal-tiptap/schemaManifest'

/**
 * The collaboration URL, carrying the hash of the schema manifest this build's
 * editor was made with. The server opens a doc read-only for a tab built
 * against an older manifest, which would delete the blocks it does not know
 * (oneCamp collaboration-service schemaGate.js).
 */
export function collabUrl(base: string): string {
  const url = base.trim()
  if (!url) return url
  return `${url}${url.includes('?') ? '&' : '?'}schema=${SCHEMA_MANIFEST_HASH}`
}

/** The socket's timings, in ms (a table so a test can shorten them). */
export const SOCKET_TIMING = {
  /** How long the socket stays open after the last doc leaves it. */
  idleMs: 60_000,
  /**
   * How long a reopened doc waits for the server to finish closing it, and how
   * long a connection being replaced may take to close before it is let go.
   */
  closeWaitMs: 3_000,
}

// Hocuspocus message types (provider src/types.ts).
const MESSAGE_CLOSE = 7

type Deferred = { promise: Promise<boolean>; resolve: (closed: boolean) => void; timer: ReturnType<typeof setTimeout> }

/** The provider's socket, which can also let go of a connection that will never finish closing. */
class CollabSocket extends HocuspocusProviderWebsocket {
  /** Takes the connection as closed, as the browser says it once it is: every doc on it hears the close. */
  letGo() {
    this.emit('close', { event: new CloseEvent('close', { code: 4408, reason: 'forced' }) })
  }
}

interface SocketState {
  socket: CollabSocket
  holds: number
  idle: ReturnType<typeof setTimeout> | null
  /** Doc names refused on a connection, with that connection's number. */
  refused: Map<string, number>
  /** Doc names closed on this connection and not yet answered by the server. */
  closing: Map<string, Deferred>
  /** Whether the server has said a session (it speaks the A2 protocol); null while unknown. */
  speaksSession: boolean | null
  /** When the server last sent anything on this socket (ms); 0 before it ever has. */
  heardAt: number
  /** A new connection being made (recycle): every doc that asks for one meanwhile gets this one. */
  recycling: Promise<void> | null
}

let state: SocketState | null = null

/** The varString document name at the start of a Hocuspocus frame, and its type. */
function peekFrame(data: ArrayBuffer | Uint8Array): { name: string; type: number } | null {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data)
  let i = 0
  const uint = () => {
    let n = 0
    let mult = 1
    while (i < buf.length) {
      const b = buf[i++]
      n += (b & 0x7f) * mult
      if (b < 0x80) return n
      mult *= 128
    }
    throw new Error('truncated')
  }
  try {
    const length = uint()
    if (i + length > buf.length) return null
    const name = new TextDecoder().decode(buf.subarray(i, i + length))
    i += length
    return { name, type: uint() }
  } catch {
    return null
  }
}

function settleClosing(s: SocketState, name: string, closed: boolean) {
  const d = s.closing.get(name)
  if (!d) return
  clearTimeout(d.timer)
  s.closing.delete(name)
  d.resolve(closed)
}

function create(): SocketState {
  const socket = new CollabSocket({
    // No fallback URL: an install that had not set it once opened a socket to
    // somebody else's server. An empty URL fails here, which is honest.
    url: collabUrl(process.env.NEXT_PUBLIC_COLLABORATION_URL || ''),
    // Opened by the first doc that needs it (holdCollabSocket), never at load.
    autoConnect: false,
  })
  const s: SocketState = { socket, holds: 0, idle: null, refused: new Map(), closing: new Map(), speaksSession: null, heardAt: 0, recycling: null }
  // The server's answer to a closed doc: the name is free on this connection.
  socket.on('message', (event: { data: ArrayBuffer }) => {
    s.heardAt = Date.now()
    const frame = peekFrame(event.data)
    if (frame && frame.type === MESSAGE_CLOSE && !socket.configuration.providerMap.has(frame.name)) settleClosing(s, frame.name, true)
  })
  // A connection gone takes the server's memory of it along: nothing is half
  // closed or refused on the next one.
  // Whether the server speaks sessions is the server's, and outlives a
  // connection: an older server is not waited for again on every reconnect.
  socket.on('disconnect', () => {
    for (const name of [...s.closing.keys()]) settleClosing(s, name, true)
  })
  return s
}

function current(): SocketState {
  if (!state) state = create()
  return state
}

/** The tab's collaboration socket. */
export function collabSocket(): HocuspocusProviderWebsocket {
  return current().socket
}

/** How many websocket connections this tab has opened (one per connect, reconnects included). */
export function collabSocketConnections(): number {
  return state?.socket.identifier ?? 0
}

function connectIfIdle(s: SocketState) {
  // connect() while a connection is being made would replace it with a second.
  if (s.socket.status === 'disconnected') void s.socket.connect().catch(() => {})
}

/** Keeps the socket open; the returned function lets go of it. */
export function holdCollabSocket(): () => void {
  const s = current()
  s.holds++
  if (s.idle) {
    clearTimeout(s.idle)
    s.idle = null
  }
  connectIfIdle(s)
  let held = true
  return () => {
    if (!held) return
    held = false
    s.holds = Math.max(0, s.holds - 1)
    if (s.holds > 0 || s.idle) return
    s.idle = setTimeout(() => {
      s.idle = null
      if (s.holds === 0) s.socket.disconnect()
    }, SOCKET_TIMING.idleMs)
  }
}

/** Reconnects at once when the tab comes back (visible, online), skipping the backoff. */
export function reviveCollabSocket(): void {
  const s = state
  if (s && s.holds > 0) connectIfIdle(s)
}

/** Remembers that the server refused `name` on the current connection. */
export function markRefused(name: string): void {
  const s = current()
  s.refused.set(name, s.socket.identifier)
}

/** Records whether the server on this connection speaks the session protocol. */
export function noteServerSession(speaks: boolean): void {
  const s = current()
  if (s.speaksSession !== true) s.speaksSession = speaks
}

/** True once the server has sent a session; false once it is known not to; null while unknown. */
export function serverSpeaksSession(): boolean | null {
  return state?.speaksSession ?? null
}

/** Records that `name` was just closed on this connection (its provider detached after it was set up). */
export function markClosing(name: string): void {
  const s = current()
  if (s.socket.status === 'disconnected') return
  settleClosing(s, name, true)
  let resolve!: (closed: boolean) => void
  const promise = new Promise<boolean>((r) => (resolve = r))
  const timer = setTimeout(() => settleClosing(s, name, false), SOCKET_TIMING.closeWaitMs)
  s.closing.set(name, { promise, resolve, timer })
}

/**
 * A new connection: closes the current one and opens another straight away.
 * A connection whose server answers nothing never finishes closing (the
 * browser waits for the server's close), so after closeWaitMs it is taken as
 * closed, as the browser would say it (every doc on it hears the close).
 */
function recycle(s: SocketState): Promise<void> {
  const socket = s.socket
  if (socket.status === 'disconnected') {
    connectIfIdle(s)
    return Promise.resolve()
  }
  if (s.recycling) return s.recycling
  s.recycling = new Promise((resolve) => {
    const letGo = setTimeout(() => socket.letGo(), SOCKET_TIMING.closeWaitMs)
    const onDisconnect = () => {
      clearTimeout(letGo)
      socket.off('disconnect', onDisconnect)
      s.recycling = null
      void socket.connect().catch(() => {})
      resolve()
    }
    socket.on('disconnect', onDisconnect)
    socket.disconnect()
  })
  return s.recycling
}

/** Whether the server has sent anything on the tab's socket since `since` (ms). */
export function collabSocketHeardSince(since: number): boolean {
  return (state?.heardAt ?? 0) >= since
}

/** Replaces the tab's connection: for docs whose sign-in it never answered (lib/collabSession.ts). */
export function recycleCollabSocket(): Promise<void> {
  return recycle(current())
}

/**
 * Attaches a provider to the socket once its doc's name is free there (see the
 * top), and keeps the socket open while it is attached.
 */
export async function attachProvider(provider: HocuspocusProvider, stillWanted: () => boolean = () => true): Promise<void> {
  const s = current()
  const name = provider.configuration.name
  const pending = s.closing.get(name)
  const closed = pending ? await pending.promise : true
  if (!stillWanted()) return
  const refusedHere = s.refused.get(name) === s.socket.identifier && s.socket.status !== 'disconnected'
  if (!closed || refusedHere) {
    s.refused.delete(name)
    await recycle(s)
    if (!stillWanted()) return
  }
  provider.attach()
  connectIfIdle(s)
}

/** Forgets the tab's socket (tests). */
export function resetCollabSocketForTests(): void {
  if (state) {
    if (state.idle) clearTimeout(state.idle)
    for (const name of [...state.closing.keys()]) settleClosing(state, name, true)
    state.socket.destroy()
  }
  state = null
}
