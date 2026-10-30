import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { changedRanges, isRemoteTransaction } from "../offload-embedded-images/offloadEmbeddedImages"
import { trackPos } from "../smart-paste/smartPaste"
import { changedRange } from "../../utils/changedRange"
import { KEEP_PAGES } from "./keepPages"
import { once } from "@/lib/lazy/once"

/*
 * Body to tree (docs C7a): a page whose last sub-page block the person deletes
 * from its parent's body goes to the trash, with Undo, as in Notion; a block
 * that linked to a page living elsewhere goes alone. A page this tab put in the
 * trash comes back with its block (the editor's Undo, a paste). Only the
 * person's own edits and their Undo count: what reaches the doc from someone
 * else or from the server (an agent's edit, a version restored) never trashes a
 * page. What asks the server loads when a page's last block first goes
 * (trashBlock.ts).
 */

const pageOf = (node: PMNode): string | null => (node.type.name === "subpage" && typeof node.attrs.docId === "string" && node.attrs.docId) || null

/** Whether the doc holds a block of the page. */
export function holds(doc: PMNode, page: string): boolean {
  let found = false
  doc.descendants((node) => {
    if (!found && pageOf(node) === page) found = true
    return !found
  })
  return found
}

/** Every page the doc holds a block of ("Pages inside" lists the rest). */
export function pagesHeld(doc: PMNode): Set<string> {
  const pages = new Set<string>()
  doc.descendants((node) => {
    const page = pageOf(node)
    if (page) pages.add(page)
  })
  return pages
}

/**
 * Whether a transaction put a page's block in or took one out, anyone's: read
 * from where the two docs differ, since another person's change comes from
 * y-prosemirror as the whole doc replaced.
 */
export function touchesPages(tr: Transaction): boolean {
  const at = tr.docChanged ? changedRange(tr.before, tr.doc) : null
  if (!at) return false
  let found = false
  const look = (doc: PMNode, to: number) =>
    doc.nodesBetween(at.start, to, (node) => {
      if (!found && pageOf(node)) found = true
      return !found
    })
  look(tr.before, at.endA)
  look(tr.doc, at.endB)
  return found
}

/**
 * The pages whose last block this tab took out, while their trash is on its
 * way: "Pages inside" leaves them out, rather than offering for that moment a
 * page that is going. One whose trash is refused (a link, a failure) stays.
 */
const leaving = new Set<string>()
const leavingWatchers = new Set<() => void>()

function setLeaving(page: string, going: boolean) {
  if (going === leaving.has(page)) return
  if (going) leaving.add(page)
  else leaving.delete(page)
  for (const watcher of leavingWatchers) watcher()
}

export const isLeaving = (page: string) => leaving.has(page)

/** Hears each page start and stop leaving; returns what stops it. */
export function watchLeaving(watcher: () => void): () => void {
  leavingWatchers.add(watcher)
  return () => void leavingWatchers.delete(watcher)
}

/** The pages whose blocks a transaction took out, each with where the first went from, in the doc after it. */
function takenOut(tr: Transaction): Map<string, number> {
  const out = new Map<string, number>()
  tr.steps.forEach((step, i) => {
    const after = tr.mapping.slice(i + 1)
    step.getMap().forEach((oldStart, oldEnd, newStart) => {
      tr.docs[i].nodesBetween(oldStart, oldEnd, (node) => {
        const page = pageOf(node)
        if (page && !out.has(page)) out.set(page, after.map(newStart, -1))
      })
    })
  })
  return out
}

/** The pages whose blocks a transaction put in. */
function putIn(tr: Transaction): Set<string> {
  const pages = new Set<string>()
  for (const [from, to] of changedRanges(tr)) {
    tr.doc.nodesBetween(from, to, (node) => {
      const page = pageOf(node)
      if (page) pages.add(page)
    })
  }
  return pages
}

let asked: typeof import("./trashBlock") | null = null
const askTrash = once(() => import("./trashBlock").then((m) => (asked = m)))

/** Follows one transaction (subpage.ts): the person's own, that changed the body. */
export function followBlocks(editor: Editor, tr: Transaction) {
  if (!tr.docChanged || isRemoteTransaction(tr) || tr.getMeta(KEEP_PAGES)) return
  const out = takenOut(tr)
  const into = putIn(tr)
  if (asked && into.size) asked.blocksBack([...into].filter((page) => !out.has(page)))
  const parent = busFor(editor)?.docId
  if (!parent) return
  for (const [page, pos] of out) {
    if (into.has(page) || holds(tr.doc, page)) continue
    // Followed from now, so Undo can put the block back where it was.
    const at = trackPos(editor, pos)
    setLeaving(page, true)
    void askTrash()
      .then(
        (m) => m.blockLeft(editor, parent, page, at),
        () => at.stop(),
      )
      .finally(() => setLeaving(page, false))
  }
}
