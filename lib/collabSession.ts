/**
 * The Doc Session (docs programme A2, PROGRAM.md §4 #5): one live document's
 * connection, and what the server decided about it.
 *
 * Generic on purpose: a session is a Yjs document by name on the tab's one
 * collaboration socket (lib/collabSocket.ts), so docs, boards, and later
 * channel canvases, agenda docs and call notes all open the same way. React
 * reads it through useCollabSession (below), useCollaborationProvider and
 * useDocSession.
 *
 * WHAT IT DOES
 *   - Connects at once, from the name alone: nothing waits for the doc's
 *     details. The server decides how far this person may go (oneCamp
 *     collaboration-service session.js) and says so in a "session" message:
 *     {level, canEdit, locked, lineage, schemaVersion}. Until it does, nobody
 *     edits.
 *   - Readers join live: their connection is read-only on the server, and they
 *     see edits as they happen.
 *   - ONE COPY (I3). A Y.Doc that has synced holds one lineage (the copy the
 *     server built it from). When its connection comes back, it waits for the
 *     server's session and compares lineages BEFORE it syncs: the same, it
 *     syncs; another, it is dropped and the doc opens afresh, its unconfirmed
 *     edits kept aside (`recovered`), never merged. Its edits are held while it
 *     waits, so nothing from an old copy reaches the server. A server too old
 *     to send a session is waited for briefly, then synced as before (its own
 *     guard refuses a second copy: lineage.js).
 *   - Relays the server's "persisted at" (I8), so the save dot can say saved
 *     only once stored.
 *   - Stays live for a minute after the last view lets go (and half a minute
 *     after a hover warmed it), so opening it again is instant; while nobody
 *     looks, it shows nobody's presence.
 *
 * NO LOCAL COPY. Nothing here is kept on disk: the copy for instant opens and
 * offline is one thing, built last with the lineage check (D-11, C12). A
 * lingering session is the live document itself, still synced.
 */
"use client"

import * as React from 'react'
import type * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { forgetCollabToken, memberCollabToken } from '@/lib/collabToken'
import { markSchemaOutdated } from '@/lib/schemaOutdated'
import {
  attachProvider,
  collabSocket,
  holdCollabSocket,
  markClosing,
  markRefused,
  noteServerSession,
  reviveCollabSocket,
  serverSpeaksSession,
} from '@/lib/collabSocket'

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** How much someone may do with a doc, as the API's Access Resolver names it. */
export type DocAccessLevel = 'none' | 'view' | 'comment' | 'edit' | 'full'

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'synced' | 'offline'

/** What the server decided for this connection. */
export interface SessionAccess {
  level: DocAccessLevel
  canEdit: boolean
  locked: boolean
}

/**
 * Why the server refused the connection (collaboration-service session.js
 * REFUSED; 'permission-denied' from a server older than that).
 */
export type Refusal = 'unauthenticated' | 'forbidden' | 'not-found' | 'gone' | 'auth-unavailable' | 'permission-denied'

/** Edits a tab could not send before its copy of the doc was replaced. */
export interface RecoveredEdits {
  html: string
  text: string
  at: number
}

/** Someone in the document, from their presence. */
export interface PresenceUser {
  id: string
  name: string
  color: string
  /** Their identity hue, as their own tab sent it (lib/identityHue). */
  hue?: string
  profileKey?: string
  /** 'viewing' for someone who can only read (A2); undefined from an older tab. */
  mode?: 'editing' | 'viewing'
}

export interface SessionSnapshot {
  provider: HocuspocusProvider | null
  status: SessionStatus
  synced: boolean
  /** The connection's scope from the server's sign-in answer; null until signed in. */
  scope: 'read-write' | 'readonly' | null
  /** The server keeps this connection read-only (a reader, an older editor, a second copy). */
  readOnly: boolean
  /** The server's decision, from its session message; null until told (or from an older server). */
  access: SessionAccess | null
  /** The lineage of the copy this tab holds; null for a doc never rebuilt, or before it is known. */
  lineage: string | null
  schemaVersion: string | null
  /** When the server last confirmed the doc stored, in ms (I8); null until it says so. */
  persistedAt: number | null
  /** A doc the server could not read: refused, never opened empty. */
  openError: 'unavailable' | null
  refused: Refusal | null
  recovered: RecoveredEdits | null
  users: PresenceUser[]
  activeUsers: number
  /** The server signed this tab in but never sent a session: an older collaboration service. */
  legacy: boolean
}

type KeepEdits = () => { html: string; text: string } | null

export interface SessionOptions {
  /**
   * Fetches the token for each (re)connect. Default: the member's own
   * (/auth/token). The guest viewers pass one that trades a share link.
   */
  tokenFetcher?: () => Promise<string>
  /**
   * Whether the document has a lineage to compare before syncing. Docs do;
   * boards (raw Yjs, `board:` names) have none, and default to false.
   */
  lineage?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The reason the server gives for a doc it could not read (collabServer.js UNAVAILABLE). */
export const UNAVAILABLE_REASON = 'document-unavailable'
/**
 * The session's timings, in ms. A table so a test can shorten them; nothing
 * else changes them.
 */
export const SESSION_TIMING = {
  /** A session nobody looks at any more stays live this long, so reopening it is instant. */
  lingerMs: 60_000,
  /** A session a hover started stays this long if nobody opens it. */
  prefetchLingerMs: 30_000,
  /** A name is prefetched at most once in this long. */
  prefetchEveryMs: 60_000,
  /** How long a returning copy waits for a session from a server not yet heard to send one. */
  legacyWaitMs: 3_000,
  /** How long it waits for one from a server known to send them. */
  sessionWaitMs: 15_000,
  /** Synced with no session this long after: the server is older than sessions. */
  legacyDetectMs: 4_000,
  /** Retries after a refusal that may pass (a token, a moment's outage). */
  retryDelaysMs: [2_000, 5_000, 15_000, 30_000],
}
/** At most this many sessions stay live with nobody looking. */
export const MAX_IDLE_SESSIONS = 4
/** At most this many fresh copies a minute: a server that kept asking would spin the page. */
export const MAX_RELOADS_PER_MINUTE = 3

const DEV = process.env.NODE_ENV !== 'production'
const log = (...args: unknown[]) => {
  if (DEV) console.log(...args)
}

const LEVELS: ReadonlySet<string> = new Set(['none', 'view', 'comment', 'edit', 'full'])
const FINAL: ReadonlySet<string> = new Set(['forbidden', 'not-found', 'gone'])

// ---------------------------------------------------------------------------
// The server's messages
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'session'; access: SessionAccess; lineage: string | null; schemaVersion: string | null }
  | { type: 'persisted'; at: number; lineage?: string | null }
  | { type: 'epoch-changed' }
  | { type: 'schema-outdated' }

/** A stateless message from the server, or null for one this tab does not act on. */
export function parseServerMessage(payload: string): ServerMessage | null {
  let m: Record<string, unknown> | null = null
  try {
    m = JSON.parse(payload)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  switch (m.type) {
    case 'session': {
      const level = typeof m.level === 'string' && LEVELS.has(m.level) ? (m.level as DocAccessLevel) : 'view'
      return {
        type: 'session',
        access: { level, canEdit: m.canEdit === true, locked: m.locked === true },
        lineage: typeof m.lineage === 'string' ? m.lineage : null,
        schemaVersion: typeof m.schemaVersion === 'string' ? m.schemaVersion : null,
      }
    }
    case 'persisted': {
      const at = Number(m.at)
      if (!Number.isFinite(at) || at <= 0) return null
      return 'lineage' in m ? { type: 'persisted', at, lineage: typeof m.lineage === 'string' ? m.lineage : null } : { type: 'persisted', at }
    }
    case 'epoch-changed':
    case 'schema-outdated':
      return { type: m.type }
  }
  return null
}

/**
 * Which copy of the doc a Y.Doc holds: the server stamps each rebuild from
 * HTML with its epoch in the `meta` map (collaboration-service lineage.js).
 * Null for a doc built before that, or never rebuilt.
 */
export function epochIn(doc: Y.Doc | null | undefined): string | null {
  if (!doc) return null
  const v = doc.getMap('meta').get('epoch')
  return typeof v === 'string' ? v : null
}

// ---------------------------------------------------------------------------
// The provider: Hocuspocus's, with the lineage check before a returning copy syncs
// ---------------------------------------------------------------------------

type OpenEvent = Parameters<HocuspocusProvider['onOpen']>[0]

export class SessionProvider extends HocuspocusProvider {
  /** Compare lineages before a returning copy syncs (docs; not boards). */
  checksLineage = true
  /** The lineage of the copy this Y.Doc holds; undefined until it first synced. */
  heldLineage: string | null | undefined = undefined
  /** The lineage the server named on this connection; undefined until it does. */
  serverLineage: string | null | undefined = undefined
  /** Waiting for the server's lineage before syncing; edits are held meanwhile. */
  gated = false
  /** Called when the server holds another copy: never synced, the session opens afresh. */
  onLineageMismatch: (server: string | null) => void = () => {}
  private gateTimer: ReturnType<typeof setTimeout> | null = null

  private clearGate() {
    if (this.gateTimer) clearTimeout(this.gateTimer)
    this.gateTimer = null
  }

  private openGate() {
    this.clearGate()
    if (!this.gated) return
    this.gated = false
    this.startSync()
  }

  /** Records the copy just synced. */
  markSynced() {
    this.heldLineage = this.serverLineage !== undefined ? this.serverLineage : epochIn(this.document)
  }

  override async onOpen(event: OpenEvent) {
    this.isAuthenticated = false
    this.emit('open', { event })
    await this.sendToken()
    // A copy that has synced before waits for the server's lineage; a new,
    // empty one has nothing to merge and syncs at once.
    if (this.checksLineage && this.heldLineage !== undefined) this.gated = true
    if (!this.gated) this.startSync()
  }

  override authenticatedHandler(scope: string) {
    super.authenticatedHandler(scope)
    if (!this.gated) return
    const speaks = serverSpeaksSession()
    const wait = speaks === false ? 0 : speaks ? SESSION_TIMING.sessionWaitMs : SESSION_TIMING.legacyWaitMs
    this.clearGate()
    // A server that never says: synced as before (its own guard refuses a
    // second copy, lineage.js).
    if (wait === 0) this.openGate()
    else this.gateTimer = setTimeout(() => this.openGate(), wait)
  }

  override receiveStateless(payload: string) {
    const m = parseServerMessage(payload)
    if (m?.type === 'session') {
      noteServerSession(true)
      this.serverLineage = m.lineage
      if (this.gated) {
        if (m.lineage === this.heldLineage) this.openGate()
        else {
          this.clearGate()
          this.onLineageMismatch(m.lineage)
        }
      }
    }
    super.receiveStateless(payload)
  }

  override documentUpdateHandler(update: Uint8Array, origin: unknown) {
    if (origin === this) return
    // Not sent while the copy is unconfirmed: the sync that follows a match
    // carries it, and a copy that doesn't match keeps it aside.
    if (this.gated) {
      this.incrementUnsyncedChanges()
      return
    }
    super.documentUpdateHandler(update, origin)
  }

  override onClose() {
    super.onClose()
    this.serverLineage = undefined
    this.clearGate()
    // Edits made while away wait for the lineage check too.
    if (this.checksLineage && this.heldLineage !== undefined) this.gated = true
  }

  override destroy() {
    this.clearGate()
    super.destroy()
  }
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

const INITIAL: SessionSnapshot = {
  provider: null,
  status: 'connecting',
  synced: false,
  scope: null,
  readOnly: false,
  access: null,
  lineage: null,
  schemaVersion: null,
  persistedAt: null,
  openError: null,
  refused: null,
  recovered: null,
  users: [],
  activeUsers: 0,
  legacy: false,
}

/** The snapshot of no session: nothing connected. */
export const NO_SESSION: SessionSnapshot = { ...INITIAL, status: 'disconnected' }

/** Whether two presence lists name the same people, the same way, in order. */
export function samePeople(a: PresenceUser[], b: PresenceUser[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (u, i) =>
      u.id === b[i].id && u.name === b[i].name && u.color === b[i].color && u.hue === b[i].hue && u.profileKey === b[i].profileKey && u.mode === b[i].mode,
  )
}

export class CollabSession {
  readonly name: string
  readonly key: string
  destroyed = false
  /** When a view last held it, for the idle cap. */
  lastUsed = 0
  private opts: SessionOptions
  private provider: SessionProvider | null = null
  private releaseSocket: (() => void) | null = null
  private snap: SessionSnapshot = INITIAL
  private listeners = new Set<() => void>()
  private holders = 0
  private keepEdits: KeepEdits | null = null
  private lingerTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private legacyTimer: ReturnType<typeof setTimeout> | null = null
  private retries = 0
  private reloads: number[] = []
  private metaEpoch: string | null = null
  private windowBound = false

  constructor(name: string, key: string, opts: SessionOptions = {}) {
    this.name = name
    this.key = key
    this.opts = opts
  }

  private get checksLineage() {
    return this.opts.lineage ?? !this.name.startsWith('board:')
  }

  // ---- reading ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): SessionSnapshot => this.snap

  private set(patch: Partial<SessionSnapshot>) {
    let changed = false
    for (const k of Object.keys(patch) as (keyof SessionSnapshot)[]) {
      if (this.snap[k] !== patch[k]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.snap = { ...this.snap, ...patch }
    for (const l of [...this.listeners]) l()
  }

  // ---- holding ----

  /** A view holds the session while it shows it; the returned function lets go. */
  acquire(opts: { keepEdits?: KeepEdits; tokenFetcher?: () => Promise<string> } = {}): () => void {
    if (this.destroyed) {
      this.destroyed = false
      pool.set(this.key, this)
    }
    this.holders++
    this.lastUsed = Date.now()
    this.clearLinger()
    if (opts.keepEdits) this.keepEdits = opts.keepEdits
    if (opts.tokenFetcher) this.opts.tokenFetcher = opts.tokenFetcher
    this.start()
    // Back in view: present again (an idle session shows nobody).
    const awareness = this.provider?.awareness
    if (awareness && awareness.getLocalState() === null) awareness.setLocalState({})
    this.applyMode()
    let held = true
    return () => {
      if (!held) return
      held = false
      this.release()
    }
  }

  /** What the editor holds now, kept aside if this tab's copy is replaced. */
  setKeepEdits(fn: KeepEdits | null | undefined) {
    this.keepEdits = fn ?? null
  }

  private release() {
    this.holders = Math.max(0, this.holders - 1)
    if (this.holders > 0) return
    this.lastUsed = Date.now()
    // Nobody looks: present to nobody, but keep the presence state itself, so
    // the socket keeps hearing the server (the server echoes it back).
    try {
      this.provider?.awareness?.setLocalState({})
    } catch {
      // destroyed already
    }
    this.lingerFor(SESSION_TIMING.lingerMs)
    trimIdle()
  }

  /** Starts the session ahead of a view (a hover on a link to it). */
  warm() {
    if (this.destroyed) {
      this.destroyed = false
      pool.set(this.key, this)
    }
    this.start()
    if (this.holders === 0 && !this.lingerTimer) {
      this.lastUsed = Date.now()
      this.lingerFor(SESSION_TIMING.prefetchLingerMs)
      trimIdle()
    }
  }

  get idle() {
    return this.holders === 0
  }

  private lingerFor(ms: number) {
    this.clearLinger()
    this.lingerTimer = setTimeout(() => {
      this.lingerTimer = null
      if (this.holders > 0) return
      // A view that has just asked for this session (it renders, and holds it
      // in an effect a moment later) keeps it.
      if (Date.now() - this.lastUsed < 1_000) this.lingerFor(1_000)
      else this.destroy()
    }, ms)
  }

  private clearLinger() {
    if (this.lingerTimer) clearTimeout(this.lingerTimer)
    this.lingerTimer = null
  }

  // ---- the provider ----

  private token = async (): Promise<string> => {
    try {
      return this.opts.tokenFetcher ? await this.opts.tokenFetcher() : await memberCollabToken()
    } catch (err) {
      console.error('[Collab] Token fetch failed:', err)
      return ''
    }
  }

  private start() {
    if (this.provider || this.destroyed) return
    this.releaseSocket = holdCollabSocket()
    const socket = collabSocket()
    const provider: SessionProvider = new SessionProvider({
      name: this.name,
      websocketProvider: socket,
      token: this.token,
      onStatus: ({ status }: { status: string }) => {
        if (provider !== this.provider) return
        this.set({ status: status as SessionStatus })
      },
      onAuthenticated: ({ scope }: { scope: string }) => {
        if (provider !== this.provider) return
        this.retries = 0
        this.set({ scope: scope === 'readonly' ? 'readonly' : 'read-write', readOnly: scope === 'readonly', refused: null, openError: null })
        this.applyMode()
      },
      onAuthenticationFailed: ({ reason }: { reason: string }) => {
        if (provider !== this.provider) return
        this.refusedWith(reason)
      },
      onStateless: ({ payload }: { payload: string }) => {
        if (provider !== this.provider) return
        this.onServerMessage(payload)
      },
      onSynced: () => {
        if (provider !== this.provider) return
        this.onSynced(provider)
      },
      onClose: () => {
        if (provider !== this.provider) return
        // The whole socket went: it reconnects, and every doc on it signs in
        // again. The socket still up: the server closed this doc alone (its
        // access changed: A5, I10). It signs in again on the same socket and
        // hears its new access, or a refusal. Not with a close of its own
        // first: the server would queue that close and replay it onto the
        // new connection.
        if (collabSocket().status !== 'connected') return
        this.set({ synced: this.snap.synced, status: 'connecting' })
        const opened = collabSocket().receivedOnOpenPayload
        if (opened) void provider.onOpen(opened as OpenEvent)
      },
      onAwarenessUpdate: ({ states }: { states: Array<Record<string, any>> }) => {
        if (provider !== this.provider) return
        const users: PresenceUser[] = states
          .filter((s) => s.user?.name)
          .map((s) => ({
            id: s.user.id || s.user.name,
            name: s.user.name,
            color: s.user.color || '#6366f1',
            hue: typeof s.user.hue === 'string' ? s.user.hue : undefined,
            profileKey: s.user.profileKey,
            mode: s.mode === 'viewing' || s.mode === 'editing' ? s.mode : undefined,
          }))
        // Every awareness update (anyone's caret, every renewal) used to set
        // a new list and render the whole doc frame: only a change does now.
        this.set({ users: samePeople(users, this.snap.users) ? this.snap.users : users, activeUsers: states.length })
      },
    })
    provider.checksLineage = this.checksLineage
    provider.onLineageMismatch = (server) => {
      if (provider !== this.provider) return
      log('[Collab] The server holds another copy of', this.name, 'lineage', server)
      this.freshCopy()
    }
    this.provider = provider
    this.metaEpoch = null
    if (this.holders === 0) provider.awareness?.setLocalState({})
    this.set({ provider, status: socket.status === 'connected' ? 'connecting' : (socket.status as SessionStatus), synced: false })
    this.bindWindow()
    log('[Collab] Connecting', this.name)
    void attachProvider(provider, () => provider === this.provider)
  }

  private stopProvider() {
    const p = this.provider
    if (!p) return
    this.provider = null
    this.clearRetry()
    if (this.legacyTimer) clearTimeout(this.legacyTimer)
    this.legacyTimer = null
    const attached = p.isAttached
    p.destroy()
    // The server answers the close; the name is reused only after it has.
    if (attached) markClosing(this.name)
    this.releaseSocket?.()
    this.releaseSocket = null
  }

  private onSynced(provider: SessionProvider) {
    // A later sync showing another epoch: the doc was replaced underneath.
    const epoch = epochIn(provider.document)
    if (this.checksLineage && this.metaEpoch && epoch && epoch !== this.metaEpoch) {
      this.freshCopy()
      return
    }
    if (epoch) this.metaEpoch = epoch
    provider.markSynced()
    this.set({
      synced: true,
      status: 'synced',
      openError: null,
      refused: null,
      lineage: this.checksLineage ? (provider.heldLineage ?? null) : null,
    })
    window.setTimeout(() => {
      try {
        if (this.holders > 0) provider.setAwarenessField('refresh', Date.now())
      } catch {
        // destroyed
      }
    }, 300)
    // A doc's server says its session around now; one that never does is older.
    if (this.checksLineage && provider.serverLineage === undefined && !this.legacyTimer) {
      this.legacyTimer = setTimeout(() => {
        this.legacyTimer = null
        if (provider !== this.provider || provider.serverLineage !== undefined) return
        noteServerSession(false)
        this.set({ legacy: true })
      }, SESSION_TIMING.legacyDetectMs)
    }
  }

  private onServerMessage(payload: string) {
    const m = parseServerMessage(payload)
    if (!m) return
    if (m.type === 'session') {
      if (this.legacyTimer) clearTimeout(this.legacyTimer)
      this.legacyTimer = null
      // The copy a fresh tab holds is named now if it synced first; a
      // different one later is a replaced doc.
      const p = this.provider
      if (p && this.checksLineage && p.heldLineage !== undefined && !p.gated && m.lineage !== p.heldLineage) {
        this.freshCopy()
        return
      }
      this.set({ access: m.access, lineage: m.lineage, schemaVersion: m.schemaVersion, legacy: false })
      this.applyMode()
    } else if (m.type === 'persisted') {
      if (m.lineage !== undefined && m.lineage !== this.snap.lineage) return
      if (m.at > (this.snap.persistedAt ?? 0)) this.set({ persistedAt: m.at })
    } else if (m.type === 'epoch-changed') {
      this.freshCopy()
    } else if (m.type === 'schema-outdated') {
      this.set({ readOnly: true })
      markSchemaOutdated()
      this.applyMode()
    }
  }

  private refusedWith(reason: string) {
    markRefused(this.name)
    if (reason === UNAVAILABLE_REASON) {
      // Refused, not opened empty: the view offers Retry.
      this.set({ openError: 'unavailable', synced: false })
      return
    }
    console.error(`[Collab] ${this.name} refused:`, reason)
    const refusal = (FINAL.has(reason) || reason === 'unauthenticated' || reason === 'auth-unavailable' ? reason : 'permission-denied') as Refusal
    if (FINAL.has(refusal)) {
      this.set({ refused: refusal, access: { level: 'none', canEdit: false, locked: false }, synced: false })
      return
    }
    // The next try must not be handed the token just refused.
    if (!this.opts.tokenFetcher) forgetCollabToken()
    this.set({ refused: refusal })
    if (this.retries >= SESSION_TIMING.retryDelaysMs.length) return
    const delay = SESSION_TIMING.retryDelaysMs[this.retries++]
    this.clearRetry()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.reattach()
    }, delay)
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  /** Signs the same copy in again (a refused or failed open), on a connection that can take it. */
  private reattach() {
    const p = this.provider
    if (!p || this.destroyed) return
    p.detach()
    this.set({ openError: null, status: 'connecting' })
    void attachProvider(p, () => p === this.provider)
  }

  /** Drops this tab's copy and opens the doc afresh; edits not yet confirmed are kept aside. */
  private freshCopy() {
    const now = Date.now()
    this.reloads = this.reloads.filter((t) => now - t < 60_000)
    if (this.reloads.length >= MAX_RELOADS_PER_MINUTE) return
    this.reloads.push(now)
    let recovered = this.snap.recovered
    if (this.provider?.hasUnsyncedChanges) {
      try {
        const kept = this.keepEdits?.()
        if (kept && kept.text.trim()) recovered = { ...kept, at: now }
      } catch {
        // nothing to keep
      }
    }
    this.stopProvider()
    // Someone's access doesn't change because their copy did: it stands until
    // the new connection's session says otherwise. Dropping it here flipped
    // the editor read-only and back, and the editor was built twice in a row.
    const { access, scope, schemaVersion, persistedAt } = this.snap
    this.set({ ...INITIAL, recovered, access, scope, schemaVersion, persistedAt })
    this.start()
  }

  /** The view's Retry: open the doc again. */
  retry = () => {
    this.retries = 0
    this.clearRetry()
    if (this.provider) this.reattach()
    else this.start()
  }

  dismissRecovered = () => this.set({ recovered: null })

  /** Presence says whether this person is editing or only viewing (A2). */
  private applyMode() {
    const p = this.provider
    if (!p || this.holders === 0) return
    const canEdit = (this.snap.access ? this.snap.access.canEdit : this.snap.scope === 'read-write') && !this.snap.readOnly
    try {
      if (p.awareness?.getLocalState()?.mode !== (canEdit ? 'editing' : 'viewing')) p.setAwarenessField('mode', canEdit ? 'editing' : 'viewing')
    } catch {
      // no awareness
    }
  }

  // ---- the tab ----

  // Back online. A socket that dropped meanwhile reconnects at once, skipping
  // the backoff, and the copy waits for the lineage check before it syncs. A
  // socket that stayed open through the blip carries on, and the doc compares
  // states with the server straight away (one round trip), so whatever either
  // side sent into the blip and lost arrives now rather than never. (Calling
  // connect() on that open socket did nothing: the doc sat on the saved copy,
  // read-only, until a reload.)
  private onOnline = () => {
    reviveCollabSocket()
    const p = this.provider
    const up = collabSocket().status === 'connected'
    if (up && p?.synced && !p.gated) {
      try {
        p.forceSync()
      } catch {
        // destroyed
      }
      this.set({ status: 'synced', synced: true })
    } else this.set({ status: up ? 'connected' : 'connecting' })
  }

  // Offline says so (the save dot, the pill), but keeps the editor: `synced`
  // means this copy has synced, and the frame shows the saved copy only until
  // that first sync. Edits made offline wait for the lineage check on return.
  private onOffline = () => this.set({ status: 'offline' })

  private onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    reviveCollabSocket()
    // Presence may have lapsed while the tab slept: renew it now.
    if (this.snap.status === 'synced' && this.holders > 0) {
      try {
        this.provider?.setAwarenessField('refresh', Date.now())
      } catch {
        // destroyed
      }
    }
  }

  private bindWindow() {
    if (this.windowBound || typeof window === 'undefined') return
    this.windowBound = true
    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.onOffline)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private unbindWindow() {
    if (!this.windowBound) return
    this.windowBound = false
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOffline)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  /** Disconnects and forgets the session. */
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.clearLinger()
    this.stopProvider()
    this.unbindWindow()
    if (pool.get(this.key) === this) pool.delete(this.key)
    this.set({ ...NO_SESSION, recovered: this.snap.recovered })
  }
}

// ---------------------------------------------------------------------------
// The tab's sessions
// ---------------------------------------------------------------------------

const pool = new Map<string, CollabSession>()
const prefetched = new Map<string, number>()

const keyOf = (name: string, opts?: SessionOptions) => `${opts?.tokenFetcher ? 'guest' : 'member'}:${name}`

/** The tab's session for a document name: the live one, or a new one. */
export function collabSession(name: string, opts: SessionOptions = {}): CollabSession {
  const key = keyOf(name, opts)
  let s = pool.get(key)
  if (!s || s.destroyed) {
    s = new CollabSession(name, key, opts)
    pool.set(key, s)
  }
  // Asked for now: neither its linger nor the idle cap ends it before the
  // view that asked holds it.
  s.lastUsed = Date.now()
  return s
}

/** Starts a document's session ahead of its view, at most once a minute per name. */
export function prefetchCollabSession(name: string, opts: SessionOptions = {}): boolean {
  if (!name) return false
  const now = Date.now()
  const last = prefetched.get(name)
  if (last && now - last < SESSION_TIMING.prefetchEveryMs) return false
  prefetched.set(name, now)
  collabSession(name, opts).warm()
  return true
}

/** Keeps at most MAX_IDLE_SESSIONS live with nobody looking: the oldest go. */
function trimIdle() {
  const now = Date.now()
  const idle = [...pool.values()].filter((s) => s.idle && !s.destroyed && now - s.lastUsed >= 1_000).sort((a, b) => a.lastUsed - b.lastUsed)
  while (idle.length > MAX_IDLE_SESSIONS) idle.shift()!.destroy()
}

/** The live sessions' names (tests and the fluidity probe). */
export function liveSessionNames(): string[] {
  return [...pool.values()].filter((s) => !s.destroyed).map((s) => s.name)
}

/** Forgets every session (tests). */
export function resetCollabSessionsForTests(): void {
  for (const s of [...pool.values()]) s.destroy()
  pool.clear()
  prefetched.clear()
}

// ---------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------

const noSubscribe = () => () => {}
const noSnapshot = () => NO_SESSION

export interface UseCollabSession extends SessionSnapshot {
  session: CollabSession | null
  retry(): void
  dismissRecovered(): void
}

/**
 * Holds `name`'s session while mounted and returns what it knows. Undefined
 * holds nothing (and reads as disconnected).
 */
export function useCollabSession(
  name: string | undefined,
  opts: { tokenFetcher?: () => Promise<string>; keepEdits?: KeepEdits | null; lineage?: boolean } = {},
): UseCollabSession {
  const guest = !!opts.tokenFetcher
  const session = React.useMemo(
    () => (name ? collabSession(name, { tokenFetcher: opts.tokenFetcher, lineage: opts.lineage }) : null),
    // The token fetcher's identity may change; the session reads the latest
    // through acquire. Only who it is for (member or guest) picks the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, guest, opts.lineage],
  )
  const keepEditsRef = React.useRef(opts.keepEdits)
  keepEditsRef.current = opts.keepEdits
  const tokenFetcherRef = React.useRef(opts.tokenFetcher)
  tokenFetcherRef.current = opts.tokenFetcher
  React.useEffect(() => {
    if (!session) return
    return session.acquire({ keepEdits: () => keepEditsRef.current?.() ?? null, tokenFetcher: tokenFetcherRef.current })
  }, [session])
  const snap = React.useSyncExternalStore(session ? session.subscribe : noSubscribe, session ? session.getSnapshot : noSnapshot, noSnapshot)
  return React.useMemo(
    () => ({
      ...snap,
      session,
      retry: session ? session.retry : () => {},
      dismissRecovered: session ? session.dismissRecovered : () => {},
    }),
    [snap, session],
  )
}
