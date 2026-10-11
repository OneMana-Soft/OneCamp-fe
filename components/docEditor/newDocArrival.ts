"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"

import { docTemplate } from "@/lib/docTemplates"

/**
 * What a doc made a moment ago asks of the editor (content.md D27). New doc
 * opens it with ?new=1, and from a template with ?template=<id> too:
 *
 * - ?new: the title is focused and selected, so typing replaces "Untitled";
 * - ?template: once the live copy has synced and is still empty, the
 *   template's body is laid in as an ordinary edit, the way someone typing it
 *   would; a doc that already has text (opened twice, a second tab) is left
 *   alone.
 *
 * Both read the address once and then drop the parameters, so a reload or a
 * shared link never does it again.
 */
export function readArrival(search: string): { isNew: boolean; templateId: string | null } {
  const q = new URLSearchParams(search)
  return { isNew: q.get("new") === "1", templateId: q.get("template") }
}

function dropParams() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete("new")
    url.searchParams.delete("template")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  } catch {
    /* the address stays; harmless */
  }
}

export function useNewDocArrival({
  editor,
  synced,
  titleRef,
  canEditTitle,
}: {
  editor: Editor | null
  synced: boolean
  titleRef: React.RefObject<HTMLTextAreaElement | null>
  canEditTitle: boolean
}) {
  const arrival = React.useRef<ReturnType<typeof readArrival> | null>(null)
  if (arrival.current === null && typeof window !== "undefined") arrival.current = readArrival(window.location.search)

  // The title, ready to type over.
  React.useEffect(() => {
    const a = arrival.current
    if (!a?.isNew || !canEditTitle) return
    const el = titleRef.current
    if (!el) return
    el.focus()
    el.select()
    if (!a.templateId) dropParams()
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The template's body, into the synced, empty doc.
  React.useEffect(() => {
    const a = arrival.current
    if (!a?.templateId || !editor || !synced) return
    const t = docTemplate(a.templateId)
    if (t && editor.isEditable && editor.isEmpty) editor.commands.setContent(t.body, true)
    a.templateId = null
    dropParams()
  }, [editor, synced])
}
