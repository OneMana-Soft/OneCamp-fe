"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"

/**
 * What a doc made a moment ago asks of the editor (content.md D27): New doc
 * opens it with ?new=1, and the title is focused and selected, so typing
 * replaces it (a blank doc's title is empty, and "Untitled" is only its
 * placeholder: D-6).
 *
 * A template is never laid in here (N37). The server writes its body as it
 * makes the doc (POST /doc/createDoc with template_id, through the live doc's
 * seed), so every tab opens the doc with it already there, once. It used to
 * be laid in by the first tab to sync an empty copy: two tabs opening a new
 * doc together could both lay it in, and a doc left before it synced kept the
 * template's title over an empty body. An old link's ?template= is dropped.
 *
 * The address is read once and the parameters dropped, so a reload or a
 * shared link never does it again.
 */
export function readArrival(search: string): { isNew: boolean } {
  const q = new URLSearchParams(search)
  return { isNew: q.get("new") === "1" }
}

function dropParams() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("new") && !url.searchParams.has("template")) return
    url.searchParams.delete("new")
    url.searchParams.delete("template")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  } catch {
    /* the address stays; harmless */
  }
}

export function useNewDocArrival({
  titleRef,
  canEditTitle,
}: {
  /** Kept for the host's call: nothing here waits for the editor any more (N37). */
  editor?: Editor | null
  synced?: boolean
  titleRef: React.RefObject<HTMLTextAreaElement | null>
  canEditTitle: boolean
}) {
  const arrival = React.useRef<ReturnType<typeof readArrival> | null>(null)
  if (arrival.current === null && typeof window !== "undefined") arrival.current = readArrival(window.location.search)

  // The title, ready to type over; then the address forgets the doc was new.
  React.useEffect(() => {
    if (arrival.current?.isNew && canEditTitle) {
      const el = titleRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }
    dropParams()
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
