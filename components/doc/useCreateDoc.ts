"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useDispatch } from "react-redux"

import { createDoc } from "@/services/docGraphService"
import { docCreated, subpagePrivate } from "@/lib/docCache"
import type { DocCreateRequest, DocSpace } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"

/** How a new doc starts, and where it goes. */
interface CreateDocOptions {
  /**
   * A template's id. The server writes its body as it makes the doc (N37),
   * so the doc opens with it already there, in every tab, once.
   */
  templateId?: string
  /** The title it starts with. Left out, it has none: "Untitled" is only the placeholder (D-6). */
  title?: string
  /** The page it goes inside. */
  parentId?: string
  /** Whether that page is private, when the caller knows (a tree's row): the new page is sent as that (subpagePrivate). */
  parentPrivate?: boolean
  /** Where it goes at the top: private (the default), the workspace, or a project's or team's space. */
  space?: DocSpace
  /** Right after this page, among its siblings. */
  afterId?: string
  /** Open it once it's made (the default). */
  open?: boolean
  /** What `busy` names while it's being made: a template's row, a tree's row. A template's id, else "blank". */
  busyKey?: string
}

// One doc is made at a time in the tab, whatever asked for it: N, the docs
// page's button, a template's row and the sidebar's + each made one when
// pressed together (N31: there was no busy guard across callers).
let making: string | null = null
const listeners = new Set<() => void>()
function setMaking(key: string | null) {
  making = key
  for (const l of listeners) l()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const current = () => making

/** What is being made in this tab (useCreateDoc's busy), for a row that only shows it. */
export function useMakingDoc(): string | null {
  return useSyncExternalStore(subscribe, current, () => null)
}

/**
 * The request a doc is made with. doc_private always, a subpage's its
 * parent's: a server without nested pages reads only it and the title
 * (DocCreateRequest).
 */
function createRequest(opts: CreateDocOptions): DocCreateRequest {
  const doc_title = (opts.title ?? "").trim()
  const space = opts.space ?? "private"
  const req: DocCreateRequest = opts.parentId
    ? { doc_title, parent_uuid: opts.parentId, doc_private: subpagePrivate(opts.parentId, opts.parentPrivate) }
    : { doc_title, space, doc_private: space !== "workspace" }
  if (opts.templateId) req.template_id = opts.templateId
  if (opts.afterId) req.after_uuid = opts.afterId
  return req
}

/**
 * Makes a doc and opens it (content.md D27): no dialog. A blank doc has no
 * title and is private (who can see it moves to Share), and opens with the
 * title ready to type (?new=1). From a template the server writes the body
 * as it makes the doc, so nothing is laid in after the doc opens. `busy`
 * names what is being made, so the one row can show a spinner and the rest
 * wait; it is shared by every caller in the tab.
 *
 * Resolves to the new doc's id, or null when nothing was made: one was being
 * made already, or the server said no (the app's error toast says why).
 */
export function useCreateDoc() {
  const router = useAppRouter()
  const dispatch = useDispatch()
  const busy = useSyncExternalStore(subscribe, current, () => null)

  const create = useCallback(
    async (opts: CreateDocOptions = {}): Promise<string | null> => {
      if (making) return null
      setMaking(opts.busyKey ?? opts.templateId ?? "blank")
      try {
        const req = createRequest(opts)
        const doc = await createDoc(req)
        if (!doc?.doc_uuid) return null
        docCreated(dispatch, { doc_uuid: doc.doc_uuid, doc_title: doc.doc_title ?? req.doc_title ?? "" })
        if (opts.open !== false) router.push(`${app_doc_path}/${doc.doc_uuid}?new=1`)
        return doc.doc_uuid
      } catch {
        // The app's error toast has said what went wrong; nothing was made.
        return null
      } finally {
        setMaking(null)
      }
    },
    [router, dispatch],
  )

  return { create, busy }
}
