"use client"

import { Extension, type Editor, type Range } from "@tiptap/core"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { toast } from "@/hooks/use-toast"
import { displayNameOf } from "@/lib/personName"
import { mentionAccess, type MentionAccess } from "@/services/connectedService"
import type { LaterItem, SaveLaterInput } from "@/services/laterService"
import type { UserProfileDataInterface } from "@/types/user"
import type { DateMentionStorage, DateOffer } from "../date-mention/dateMention"

/** A row of the "@" list that isn't a person: a day the query names (D4), or a reminder on it (D6). */
export type DateRow = { kind: "date" | "remind"; offer: DateOffer }

const datesOf = (editor: Editor) => (editor.storage as { dateMention?: DateMentionStorage }).dateMention

/** The days the query names, with a reminder on the first that may have one; none for an empty query. */
function dateRows(editor: Editor, query: string): DateRow[] {
  const dates = datesOf(editor)
  if (!dates || !query.trim()) return []
  const offers = dates.suggest(query)
  const rows: DateRow[] = offers.map((offer) => ({ kind: "date", offer }))
  const first = offers.find((o) => o.remind)
  if (first) rows.push({ kind: "remind", offer: first })
  return rows
}

const hereKept = new WeakMap<Editor, { at: number; ids: Set<string> }>()

/**
 * This doc's people (small-details D2): who has it open now, and who it
 * already mentions; not the writer. Read again at most every five seconds.
 */
function peopleHere(editor: Editor): Set<string> {
  const kept = hereKept.get(editor)
  if (kept && Date.now() - kept.at < 5_000) return kept.ids
  const ids = new Set<string>()
  const cursor = (editor.storage as { collaborationCursor?: { users?: Array<{ id?: string }> } }).collaborationCursor
  for (const u of cursor?.users ?? []) if (u.id) ids.add(u.id)
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "mention") return
    const id = String(node.attrs.id ?? "").split("@")[0]
    if (id) ids.add(id)
  })
  const me = editor.extensionManager.extensions.find((e) => e.name === "collaborationCursor")?.options?.user?.id
  if (me) ids.delete(me)
  hereKept.set(editor, { at: Date.now(), ids })
  return ids
}

const accessKept = new Map<string, { at: number; access: Promise<MentionAccess> }>()

/**
 * Who of these people can't open the doc, and whether the writer may share
 * it with them (collaboration.md P0-C1; the Access Resolver decides, POST
 * /doc/mentionAccess, by the invite's rule: an editor may, as full access
 * may). Kept a minute, so the list asks once it settles.
 */
function access(editor: Editor, ids: string[]): Promise<MentionAccess> | null {
  const docId = busFor(editor)?.docId
  if (!docId || !ids.length) return null
  const key = `${docId}|${ids.join(",")}`
  const kept = accessKept.get(key)
  if (kept && Date.now() - kept.at < 60_000) return kept.access
  if (accessKept.size > 200) accessKept.clear()
  const asked = mentionAccess(docId, ids)
  accessKept.set(key, { at: Date.now(), access: asked })
  asked.catch(() => accessKept.delete(key))
  return asked
}

/** Forgets what the "@" list learned about who can open each doc (tests). */
export function forgetMentionAccess() {
  accessKept.clear()
}

/**
 * Shares the doc with someone just mentioned in it, to view: an invite, as
 * the share dialog's Invite makes it (B6's inviteToDoc, POST
 * /doc/access/invite), which the server caps at the sharer's own level, so an
 * editor may as full access may. A share that fails is said by the request
 * layer.
 */
function share(editor: Editor, person: UserProfileDataInterface) {
  const docId = busFor(editor)?.docId
  if (!docId) return
  const name = displayNameOf(person)
  void import("@/services/docChromeService")
    .then((m) => m.inviteToDoc({ doc_uuid: docId, adds: [{ kind: "user", uuid: person.user_uuid, level: "view" }] }))
    .then(
      () => toast({ title: `Shared with ${name}`, description: "They can view the doc now." }),
      () => undefined,
    )
}

/** Puts a day in where "@" was, and a reminder on it when that's what was picked. */
function insertDate(editor: Editor, range: Range, row: DateRow, save: (input: SaveLaterInput) => Promise<LaterItem>) {
  editor.chain().focus().insertContentAt(range, [{ type: "dateMention", attrs: { date: row.offer.date } }, { type: "text", text: " " }]).run()
  if (row.kind === "remind") void datesOf(editor)?.remind(editor, range.from, save)
}

/** What the "@" list does in a doc beyond people (docs C1): dates, this doc's people first, and who can't open it. */
export interface MentionInDocStorage {
  dateRows: typeof dateRows
  peopleHere: typeof peopleHere
  access: typeof access
  share: typeof share
  insertDate: typeof insertDate
}

/**
 * The "@" list's doc part, loaded with "[[" in a doc's editor (connected/
 * register.ts): the list itself is in every editor (mentionList.tsx), and
 * asks this when the editor has it.
 */
export const MentionInDoc = Extension.create<Record<string, never>, MentionInDocStorage>({
  name: "mentionInDoc",
  addStorage() {
    return { dateRows, peopleHere, access, share, insertDate }
  },
})
