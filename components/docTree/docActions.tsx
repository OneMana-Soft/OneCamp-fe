"use client"

// What a doc's menu does, wherever the doc is: a row's menu (the sidebar's
// tree, the docs home's cards and rows, a project's docs) and the doc's own
// page (More, the phone's sheet, the palette: docEditor/chrome/actions). One
// copy of each, so every menu agrees on what Star, Duplicate and Move to trash
// do and say. Each write corrects what is on screen (the store, the cached
// lists: lib/docCache, docGraphService's refresh), never leaving a list
// behind, and says its own failure once: what didn't happen, and why
// (apiErrorMessage), so the app's toast stays quiet (ownErrors).

import * as React from "react"
import type { Dispatch } from "@reduxjs/toolkit"

import { ToastAction } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"
import { docDeleted, docRestored } from "@/lib/docCache"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { addPlace, deleteDoc, duplicateDoc, removePlace, restoreDoc } from "@/services/docGraphService"
import { starPlace, unstarPlace } from "@/store/slice/userSlice"
import { openUI } from "@/store/slice/uiSlice"
import type { Place } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"

/** The doc a menu acts on. An empty title is shown as its placeholder. */
export interface DocRef {
  id: string
  title: string
  icon?: string
}

/** A doc's name in a sentence ("Moved “Launch plan” to the trash"); "Untitled" stays a placeholder (D-6). */
export const named = (d: DocRef) => (d.title.trim() ? `“${d.title.trim()}”` : "the untitled doc")

const OWN = { ownErrors: true }

/** Says that something didn't happen, and why. */
function failed(title: string, err: unknown, fallback = "Try again in a moment.") {
  toast({ variant: "destructive", title, description: apiErrorMessage(err, fallback) })
}

/** The pages inside a doc that went with it, after a word ("and", "with"); "" when none did. */
const pagesInside = (count: number, word: string) => (count > 1 ? ` ${word} ${count - 1} ${count === 2 ? "page" : "pages"} inside` : "")

/**
 * What a delete of d left: the pages inside that the person can't open, which
 * stay, moved up to where d was. Counted, never named, and only the ones the
 * person could see were there (the server counts no page under them).
 */
const pagesThatStayed = (kept: number | undefined, d: DocRef) =>
  kept ? `${kept} ${kept === 1 ? "page" : "pages"} inside that you can't open ${kept === 1 ? "stays" : "stay"}, moved up to where ${named(d)} was.` : undefined

/**
 * What deleting a page in the trash for good says before it is confirmed
 * (name in quotes): it goes, with the pages deleted with it that the person has
 * full access to; any others stay in the trash for the people who have. The
 * one wording for the trash's rows and the deleted page itself.
 */
export function purgeWarning(name: string, subpages: number | undefined): string {
  if (!subpages) return `${name} goes for good. Nobody can bring it back.`
  const pages = `${subpages} ${subpages === 1 ? "page" : "pages"}`
  return `${name} and the ${pages} deleted with it go for good, apart from any you don't have full access to, which stay in the trash. Nobody can bring back what goes.`
}

/** What a delete for good left in the trash: the pages the person hasn't full access to. */
export const pagesLeftInTrash = (kept: number | undefined) =>
  kept ? `${kept} ${kept === 1 ? "page" : "pages"} you don't have full access to ${kept === 1 ? "stays" : "stay"} in the trash.` : undefined

/** Stars a doc: in Starred at once, then on the server; put back if it refuses. Resolves whether it is starred. */
export async function starDoc(dispatch: Dispatch, d: DocRef): Promise<boolean> {
  const place: Place = { kind: "star", resource_kind: "doc", resource_uuid: d.id, position: "", title: d.title, icon: d.icon, href: `${app_doc_path}/${d.id}` }
  dispatch(starPlace({ place }))
  try {
    await addPlace("star", "doc", d.id, undefined, OWN)
    return true
  } catch (err) {
    dispatch(unstarPlace({ resource_uuid: d.id }))
    failed(`Couldn't star ${named(d)}`, err)
    return false
  }
}

/**
 * Takes a doc's star away: gone from Starred at once, back if the server
 * refuses (was is its place there, when the menu has it). Resolves whether
 * the star is gone.
 */
export async function unstarDoc(dispatch: Dispatch, d: DocRef, was?: Place): Promise<boolean> {
  dispatch(unstarPlace({ resource_uuid: d.id }))
  try {
    await removePlace("star", d.id, OWN)
    return true
  } catch (err) {
    if (was) dispatch(starPlace({ place: was }))
    failed(`Couldn't remove ${named(d)} from starred`, err)
    return false
  }
}

/**
 * Copies a doc with the pages inside it, and says so. From the doc's own page
 * the copy opens at once (openNow, P0.5); from a list it is one click away.
 */
export async function duplicate(d: DocRef, open: (href: string) => void, opts?: { openNow?: boolean }): Promise<boolean> {
  let copy: Awaited<ReturnType<typeof duplicateDoc>>
  try {
    copy = await duplicateDoc(d.id, true, OWN)
  } catch (err) {
    failed(`Couldn't copy ${named(d)}`, err)
    return false
  }
  const href = `${app_doc_path}/${copy.doc_uuid}`
  const title = `Copied ${named(d)}${pagesInside(copy.count, "and")}`
  if (opts?.openNow) {
    open(href)
    toast({ title })
  } else {
    toast({
      title,
      action: (
        <ToastAction altText="Open the copy" onClick={() => open(href)}>
          Open
        </ToastAction>
      ),
    })
  }
  return true
}

/**
 * Puts a doc and the pages inside it in the trash, with Undo (N32). Someone on
 * its page is taken to the docs home, since the page now says it was
 * deleted, and Undo takes them back to it. Resolves whether it went.
 */
export async function trash(dispatch: Dispatch, d: DocRef, here: { onItsPage: boolean; go: (href: string) => void }): Promise<boolean> {
  let gone: Awaited<ReturnType<typeof deleteDoc>>
  try {
    gone = await deleteDoc(d.id, OWN)
  } catch (err) {
    failed(`Couldn't move ${named(d)} to the trash`, err)
    return false
  }
  docDeleted(dispatch, d.id)
  const page = `${app_doc_path}/${d.id}`
  if (here.onItsPage) here.go(app_doc_path)
  const undo = async () => {
    try {
      await restoreDoc(d.id, OWN)
    } catch (err) {
      failed(`Couldn't bring ${named(d)} back`, err, "It's still in the trash. Restore it from there.")
      return
    }
    docRestored(d.id)
    if (here.onItsPage) here.go(page)
  }
  toast({
    title: `Moved ${named(d)} to the trash${pagesInside(gone.count, "with")}`,
    description: pagesThatStayed(gone.kept, d),
    action: (
      <ToastAction altText="Undo: bring it back" onClick={() => void undo()}>
        Undo
      </ToastAction>
    ),
  })
  return true
}

/** Opens the rename dialog the doc's own page uses. */
export function rename(dispatch: Dispatch, d: DocRef) {
  dispatch(openUI({ key: "docUpdateTitle", data: { docId: d.id, title: d.title } }))
}
