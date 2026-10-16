"use client"

// More's page actions (B6): the open doc's page does what its row's menu does
// (components/docTree/docActions, the one copy), and keeps More's tick
// (pageFacts) with it.

import store from "@/store/store"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { duplicate as copyDoc, starDoc, trash as trashDoc, unstarDoc, type DocRef } from "@/components/docTree/docActions"
import { factsOf, navigate, setFacts } from "./pageFacts"

const refOf = (ctx: ActionContext): DocRef => ({ id: ctx.docId, title: ctx.state?.title ?? "" })

/** Star or unstar the doc: More's tick and Starred at once, put back if it fails. */
export async function toggleStar(ctx: ActionContext) {
  const was = !!factsOf(ctx.docId).starred
  setFacts(ctx.docId, { starred: !was })
  const place = store.getState().users.userSidebar.userStarred?.find((p) => p.resource_uuid === ctx.docId)
  const saved = was ? await unstarDoc(store.dispatch, refOf(ctx), place) : await starDoc(store.dispatch, refOf(ctx))
  if (!saved) setFacts(ctx.docId, { starred: was })
}

/** A copy of the doc with its subpages, opened (P0.5). */
export async function duplicate(ctx: ActionContext) {
  await copyDoc(refOf(ctx), navigate, { openNow: true })
}

/** The doc and the pages under it to the trash: its page is left, and Undo comes back to it (N32). */
export async function trash(ctx: ActionContext) {
  await trashDoc(store.dispatch, refOf(ctx), { onItsPage: true, go: navigate })
}
