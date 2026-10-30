/**
 * Live Entity Chips (docs programme §4 #21, built by C1): a task, a doc, a
 * project, a person or a date drawn as a chip wherever it is named, kept live.
 *
 * One registry of kinds (registry.ts). Each kind says how it is read, which
 * messages on its MQTT topic mean it changed, how its chip reads and what
 * opening it does; useLiveEntity(kind, id) reads through it, and EntityChip
 * draws any kind. Docs register theirs here (kinds.tsx); the calendar's
 * events, the tables' rows and chat's calls register theirs from their own
 * code, with registerEntityKind, and nothing here changes.
 *
 * The server decides access for every read (POST /entities, business/
 * EntityLink): a thing the reader can't open comes back as "none", with no
 * data, so a chip never shows its title.
 */

import type { ElementType, ReactNode } from "react"

/** What the server says the reader may do with a thing. */
export type EntityAccess = "ok" | "none" | "gone"

/** One thing as the server read it for this reader. */
export interface EntityRead<D = unknown> {
  access: EntityAccess
  /** The kind's own fields; only when access is "ok". */
  data?: D
  /** The MQTT topic that says when it changes, when the reader may listen on it. */
  topic?: string
}

/** A chip's state: still coming, read, or the read failed. */
export type LiveEntityState = "loading" | "error" | EntityAccess

/** What useLiveEntity answers. */
export interface LiveEntity<D = unknown> {
  state: LiveEntityState
  data?: D
  topic?: string
}

/** A message on a topic, as the broker delivers it: its type and its data. */
export interface TopicMessage {
  type: number
  data?: Record<string, unknown>
}

/** How a chip reads: drawn the same way for every kind (EntityChip). */
export interface ChipView {
  /** Before the words: a status glyph, a page's icon, an avatar. */
  lead?: ReactNode
  /** A short name before the words, quieter, read with them: a task's key ("Q4-12"). */
  tag?: string
  /** The words the chip names it by. */
  title: string
  /** After the words, quieter: who it's assigned to, when it's due. */
  trailing?: ReactNode
  /** It needs the reader: due today (sun), or past due (danger). */
  tone?: "today" | "overdue"
}

/** What a kind's view is given besides its data. */
export interface ViewContext {
  /** Today on the device, "2026-10-14": dates read against it, and age. */
  today: string
}

/** One kind of thing a chip can stand for. */
export interface EntityKind<D = unknown> {
  /** Its name, as the server's registry knows it ("task"). */
  kind: string
  /** Its glyph, while it loads and when it can't be shown. */
  icon: ElementType
  /** What it is, in a sentence: "page", "task". */
  noun: string
  /**
   * Whether a chip of it the reader can't open still opens its page (a doc's
   * page offers Request access); otherwise "No access" goes nowhere.
   */
  opensWithoutAccess?: boolean
  /**
   * Reads things of this kind that the server doesn't (a date reads nothing).
   * Absent: POST /entities reads them, many at once.
   */
  read?(ids: string[]): Promise<Map<string, EntityRead<D>>>
  /** Whether a message on its topic says this one changed: then it is read again. */
  hears?(message: TopicMessage, id: string): boolean
  /** How its chip reads. */
  view(data: D, id: string, ctx: ViewContext): ChipView
  /** Where it opens, or null for something with no page of its own. */
  href(id: string, data?: D): string | null
  /**
   * What opening it does instead of following href (a person's card, a
   * task's panel): true when it did, false to follow href after all.
   */
  open?(id: string, data: D | undefined, anchor: HTMLElement): boolean
  /** The card shown while the pointer rests on its chip, or on Space from the keyboard; loaded the first time. */
  card?(): Promise<{ default: React.ComponentType<{ id: string; data: D }> }>
}
