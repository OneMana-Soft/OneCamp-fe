"use client"

/**
 * An empty doc's AI rows (docs programme B9; the shell's 'emptyStarter' slot,
 * order 20, after B5's templates and import; AI edition only): "Ask AI to
 * draft", and, when the doc is in a project the person is in that has open
 * tasks, "Draft from Launch's open tasks · 12", which drafts from them at
 * once. Notion's empty page can't know what a project's tasks are.
 *
 * Drawn as B5's rows are (EmptyDocStarter.tsx StarterRow: 32 px, a 20 px
 * tile, the hint in ink-3) and moved through with the same keys, so the list
 * reads as one: ↓ from the empty line comes into it, ↑ and ↓ move along it,
 * Esc goes back to the text.
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { useEditorState } from "@tiptap/react"
import { isBlankDoc } from "@/components/docEditor/DocBodyLayer"
import { proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { Spark } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"
import { getDocAIStarters, type DocProject } from "@/lib/ai/docAIApi"
import { openAiBar } from "./docAiStore"

const rowsOf = (from: HTMLElement): HTMLElement[] => {
  const list = from.closest("[data-doc-empty-starter]")
  return list ? Array.from(list.querySelectorAll<HTMLElement>("[data-starter-row]")) : []
}

/** ↓ from the empty first line moves into the starter's rows, when nothing else took the key. */
function useArrowIn(editor: Editor | null | undefined, root: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const host = editor?.view?.dom?.parentElement
    if (!editor || !host) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== "ArrowDown" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.isComposing) return
      if (!editor.isEditable || !isBlankDoc(editor.state.doc)) return
      const first = root.current ? rowsOf(root.current)[0] : undefined
      if (!first) return
      e.preventDefault()
      first.focus()
    }
    host.addEventListener("keydown", onKey, true)
    return () => host.removeEventListener("keydown", onKey, true)
  }, [editor, root])
}

export default function DocAiStarter({ editor, docId }: SlotProps) {
  const first = React.useRef<HTMLButtonElement>(null)
  const [project, setProject] = React.useState<DocProject | null>(null)
  useArrowIn(editor, first)
  // An answer shown for review fills the empty line: the row steps aside for it.
  const reviewing = useEditorState({
    editor: editor ?? null,
    selector: ({ editor: e }) => !!e && Object.keys(proposalsOf(e.state).active).length > 0,
  })

  React.useEffect(() => {
    let current = true
    getDocAIStarters(docId).then(
      (p) => current && setProject(p && p.open_tasks > 0 ? p : null),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [docId])

  if (!editor || reviewing) return null
  const open = (fromTasks: boolean) => {
    const at = editor.state.selection.from
    openAiBar(editor, {
      docId,
      from: at,
      to: at,
      mode: "actions",
      source: "starter",
      ...(fromTasks && project ? { action: "draft_from_tasks" as const, projectId: project.uuid } : {}),
    })
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      editor.commands.focus("end")
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const rows = rowsOf(e.currentTarget)
    const at = rows.indexOf(e.currentTarget)
    if (e.key === "ArrowUp" && at <= 0) return void editor.commands.focus("end")
    rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus()
  }
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Row ref={first} onClick={() => open(false)} onKeyDown={onKeyDown}>
        Ask AI to draft
      </Row>
      {project && (
        <Row onClick={() => open(true)} onKeyDown={onKeyDown}>
          Draft from {project.name}&apos;s open tasks
          <span className="text-ink-3"> · {project.open_tasks}</span>
        </Row>
      )}
    </div>
  )
}

/** One row, drawn as B5's starter rows are. */
const Row = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function Row({ children, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-starter-row=""
      {...rest}
      className={cn(
        "group/starter inline-flex h-8 min-w-[220px] max-w-full items-center gap-2.5 rounded-lg pl-1.5 pr-2.5 text-left text-ui text-ink-2 outline-none",
        "transition-colors duration-[140ms] ease-[var(--ease-out)] hover:bg-hover hover:text-ink hover:duration-0 focus-visible:bg-hover focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-brand",
        "max-sm:h-11",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-agent-muted text-agent">
        <Spark size={12} />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
})
