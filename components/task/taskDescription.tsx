"use client"

// The task panel's description: written in place, saved half a second after
// the typing stops, when the box loses focus, and when the panel moves to
// another task or closes. Its own component, so a keystroke renders the editor
// and nothing else: the panel used to keep the text in its own state, and
// every change (three a second while typing) rendered the whole panel again,
// pickers, dates, fields, subtasks and comments included.

import { memo, useCallback, useEffect, useRef } from "react"
import type { Content } from "@tiptap/core"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import { sectionTitle } from "@/lib/ui/fieldRow"
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

  return (
    <div className="mb-4 grid gap-2" onBlur={flush}>
      <h3 className={sectionTitle}>Description</h3>
      <MinimalTiptapTextInput
        key={taskUUID}
        throttleDelay={300}
        // Formatting folds behind one button, as Linear's issue body does;
        // Markdown and Ctrl+B still work. The thirteen-button row also asked
        // the editor what each button could do on every keystroke.
        toggleToolbar
        className={cn("h-auto rounded-lg border bg-muted/30")}
        editorContentClassName="overflow-auto min-h-[7rem]"
        output="html"
        content={html}
        value={html}
        placeholder={canEdit ? "Add a description…" : "No description."}
        editable={canEdit}
        editorClassName="focus:outline-none"
        onChange={onChange}
      />
    </div>
  )
})
