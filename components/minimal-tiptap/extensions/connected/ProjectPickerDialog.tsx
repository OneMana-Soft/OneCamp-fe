"use client"

import * as React from "react"
import { useHandoff } from "@/hooks/useHandoff"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CommandList, CommandTile, type CommandListHandle } from "@/components/ui/CommandList"
import { ErrorState } from "@/components/ui/error-state"
import { FolderKanban } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { peekPick, releasePick, PICK_PROJECT, type ProjectPurpose } from "./pick"

interface ProjectRow {
  project_uuid: string
  project_name: string
  project_deleted_at?: string
}

const WORDS: Record<ProjectPurpose, { title: string; description: string; none: string }> = {
  task: {
    title: "Make a task in…",
    description: "Only a project's admins make its tasks, so these are the projects you run.",
    none: "You don't run a project yet. Ask a project's admin, or start a project of your own.",
  },
  tasks: { title: "Show tasks from…", description: "The list stays live as the project's tasks change.", none: "You're not in a project yet." },
  board: { title: "Show the board of…", description: "The board stays live as the project's tasks move.", none: "You're not in a project yet." },
}

/**
 * Which project (docs C1): for ⌘⇧Enter, the projects the person runs, since
 * only a project's admins make its tasks; for /tasks and /board, every
 * project they're in. Typing narrows the list; ↑ ↓ and Enter pick. A sheet on
 * a phone.
 */
export default function ProjectPickerDialog({ onClose }: { docId: string; onClose(): void }) {
  const question = useHandoff(() => peekPick(PICK_PROJECT), releasePick)
  const purpose: ProjectPurpose = question?.purpose ?? "tasks"
  const runs = purpose === "task"
  const res = useFetch<{ data?: ProjectRow[] | { user_projects?: ProjectRow[] } }>(
    !question ? "" : runs ? GetEndpointUrl.projectListByAdminUID : GetEndpointUrl.GetUserProjectList,
  )
  const raw = res.data?.data
  const projects = (Array.isArray(raw) ? raw : raw?.user_projects ?? []).filter((p) => p.project_uuid && isZeroEpoch(p.project_deleted_at || ""))
  const [query, setQuery] = React.useState("")
  const [input, setInput] = React.useState<HTMLInputElement | null>(null)
  const list = React.useRef<CommandListHandle>(null)
  const answered = React.useRef(false)

  // Closed without a choice: whoever asked hears none.
  React.useEffect(() => () => void (!answered.current && question?.answer(null)), [question])
  React.useEffect(() => {
    if (!question) onClose()
  }, [question, onClose])

  const q = query.trim().toLowerCase()
  const shown = q ? projects.filter((p) => p.project_name.toLowerCase().includes(q)) : projects
  const words = WORDS[purpose]

  const choose = (id: string) => {
    const p = projects.find((x) => x.project_uuid === id)
    if (!p || !question) return
    answered.current = true
    question.answer({ id: p.project_uuid, name: p.project_name })
    onClose()
  }

  return (
    <ResponsiveDialog title={words.title} description={words.description} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <div className="flex flex-col gap-2 pb-2" data-project-picker={purpose}>
        <Input
          ref={setInput}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (list.current?.onKeyDown(e)) e.preventDefault()
          }}
          placeholder="Find a project"
          aria-label="Find a project"
        />
        {res.isError ? (
          <ErrorState compact subject="your projects" onRetry={() => void res.mutate()} />
        ) : (
          <CommandList
            ref={list}
            comboboxFor={input}
            label="Projects"
            maxHeight={8 * 36}
            query={query}
            items={shown.map((p) => ({ id: p.project_uuid, label: p.project_name, tile: <CommandTile><FolderKanban /></CommandTile> }))}
            onSelect={(item) => choose(item.id)}
            empty={<span className="text-ink-3">{res.isLoading ? "Loading your projects…" : q ? `No project called “${query.trim()}”` : words.none}</span>}
          />
        )}
      </div>
    </ResponsiveDialog>
  )
}
