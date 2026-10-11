"use client"

// The task panel's description: written in place, saved half a second after
// the typing stops, when the box loses focus, and when the panel moves to
// another task or closes. Its own component, so a keystroke renders the editor
// and nothing else: the panel used to keep the text in its own state, and
// every change (three a second while typing) rendered the whole panel again,
// pickers, dates, fields, subtasks and comments included.

import { memo, useCallback, useEffect, useRef, useState } from "react"
import type { Content } from "@tiptap/core"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import type { CreateTaskInterface } from "@/types/task"

/** How long typing has to stop before the text is saved. */
export const DESCRIPTION_SAVE_DELAY = 500

/** Empty paragraphs are no description: "<p></p>" and "" are the same text. */
export function sameDescription(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => {
    const t = (s ?? "").trim()
    return t === "<p></p>" || t === "<p><br></p>" ? "" : t
  }
  return norm(a) === norm(b)
}

export const TaskDescription = memo(function TaskDescription({
  taskUUID,
  projectUUID,
  html,
  canEdit,
}: {
  taskUUID: string
  projectUUID: string
  /** The description as the server last sent it. */
  html: string
  canEdit: boolean
}) {
  const post = usePost()
  // What was typed and not yet saved, for this task; and what the server has.
  const pending = useRef<string | null>(null)
  const saved = useRef(html)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ids = useRef({ taskUUID, projectUUID })
  const postRef = useRef(post)
  postRef.current = post

  // Typing never round-trips through the server's copy: a fresh answer only
  // moves the baseline the next save compares against.
  useEffect(() => {
    saved.current = html
  }, [html])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const text = pending.current
    pending.current = null
    if (text === null || sameDescription(text, saved.current)) return
    saved.current = text
    const { taskUUID: task_uuid, projectUUID: task_project_uuid } = ids.current
    void postRef.current.makeRequest<CreateTaskInterface>({
      apiEndpoint: PostEndpointUrl.UpdateTaskDesc,
      payload: { task_description: text, task_uuid, task_project_uuid },
    })
  }, [])

  // Another task, or the panel closing: what was typed for this one is saved
  // first, under this task's ids.
  useEffect(() => {
    ids.current = { taskUUID, projectUUID }
    return () => flush()
  }, [taskUUID, projectUUID, flush])

  const onChange = useCallback(
    (content: Content) => {
      if (!canEdit) return
      pending.current = content?.toString() || ""
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, DESCRIPTION_SAVE_DELAY)
    },
    [canEdit, flush],
  )

  // A long description folds at twelve lines with a fade and "Show more"
  // (W31); focusing it, or asking, shows it all.
  const box = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(() => setLong(el.scrollHeight > CLAMP_PX + 8))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const clamped = long && !expanded

  return (
    <div className="relative mb-6" onBlur={flush} onFocus={() => setExpanded(true)} data-task-description="">
      <h3 className="sr-only">Description</h3>
      <div ref={box} className={cn("relative", clamped && "overflow-hidden")} style={clamped ? { maxHeight: CLAMP_PX } : undefined}>
        <MinimalTiptapTextInput
          key={taskUUID}
          throttleDelay={300}
          // Formatting folds behind one button, as Linear's issue body does;
          // Markdown and Ctrl+B still work. The thirteen-button row also asked
          // the editor what each button could do on every keystroke.
          toggleToolbar
          // Text on the sheet, with a hover ground to say it can be edited (W31).
          className={cn("-mx-2 h-auto rounded-md border-0 bg-transparent shadow-none transition-colors", canEdit && "hover:bg-hover focus-within:bg-transparent")}
          editorContentClassName="overflow-auto min-h-[44px] px-2 text-body"
          output="html"
          content={html}
          value={html}
          placeholder={canEdit ? "Add a description…" : "No description."}
          editable={canEdit}
          editorClassName="focus:outline-none"
          onChange={onChange}
        />
        {clamped && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-[var(--panel,var(--sheet))]" />}
      </div>
      {clamped && (
        <button type="button" onClick={() => setExpanded(true)} className="-ml-2 mt-1 h-6 rounded-sm px-2 text-xs font-[510] text-ink-2 transition-colors hover:bg-hover hover:text-foreground">
          Show more
        </button>
      )}
    </div>
  )
})

/** Twelve lines of 22px. */
const CLAMP_PX = 12 * 22
