"use client"

// A thread's task (docs C5-2): the chip to the task it became, or, for
// someone who may resolve it, "Make a task" (the card's own button) and the
// task dialog. Apart from ThreadCard so a doc's first load carries none of it.

import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"

import { ListTodo } from "@/lib/icons"
import { taskDraftFromMessage } from "@/lib/task/messageToTask"
import type { ThreadView } from "@/components/threads/types"

const CreateTaskDialog = dynamic(() => import("@/components/dialog/createTaskDialog"), { ssr: false })

export function ThreadTaskAction({ thread, docId, onLinked, children }: { thread: ThreadView; docId: string; onLinked(): void; children: (start: () => void) => React.ReactNode }) {
  const [making, setMaking] = React.useState(false)
  if (thread.task_uuid) {
    return (
      <Link
        href={`/app/task/${encodeURIComponent(thread.task_uuid)}`}
        className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-meta text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        data-thread-task=""
      >
        <ListTodo aria-hidden="true" className="size-3.5" />
        Task
      </Link>
    )
  }
  const first = thread.comments[0]
  const source = {
    threadID: thread.id,
    link: typeof window !== "undefined" ? `${window.location.origin}/app/doc/${encodeURIComponent(docId)}?thread=${encodeURIComponent(thread.id)}` : "",
    authorName: first?.comment_by?.user_full_name || first?.comment_by?.user_name,
  }
  return (
    <>
      {children(() => setMaking(true))}
      {making ? (
        <CreateTaskDialog
          dialogOpenState={making}
          setOpenState={setMaking}
          fromMessage={{ draft: taskDraftFromMessage(first?.comment_text, source), source }}
          onLinked={onLinked}
        />
      ) : null}
    </>
  )
}
