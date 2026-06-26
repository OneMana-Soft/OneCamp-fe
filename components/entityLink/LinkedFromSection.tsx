"use client"

// LinkedFromSection: the reverse view. On a doc or board, shows the tasks and
// projects that link it, so context isn't lost when you open the doc/board
// directly. Read-only (links are managed from the task/project side), filtered
// server-side to the viewer's projects. Loads once; renders nothing when empty
// so it never adds visual noise to entities that aren't referenced anywhere.

import { useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import { CheckSquare, FolderKanban, Link2 } from "@/lib/icons"

type RefType = "doc" | "board"

interface LinkedTask {
  task_uuid: string
  task_name?: string
  task_status?: string
}
interface LinkedProject {
  project_uuid: string
  project_name?: string
  project_status?: string
}

interface RefLinksEnvelope {
  data?: { tasks?: LinkedTask[] | null; projects?: LinkedProject[] | null }
}

interface LinkedFromSectionProps {
  refType: RefType
  refUUID: string
  className?: string
}

export function LinkedFromSection({ refType, refUUID, className }: LinkedFromSectionProps) {
  const router = useRouter()
  const key = refUUID ? `${GetEndpointUrl.GetRefLinks}/${refType}/${refUUID}` : ""
  const { data, isLoading } = useFetch<RefLinksEnvelope>(key)

  const tasks = data?.data?.tasks ?? []
  const projects = data?.data?.projects ?? []
  const total = tasks.length + projects.length

  // Render nothing until loaded and only when there is something to show, so it
  // never adds noise to entities that aren't referenced anywhere.
  if (isLoading || total === 0) return null

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Linked to
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tasks.map((t) => (
          <button
            key={`task-${t.task_uuid}`}
            type="button"
            onClick={() => router.push(`/app/task/${t.task_uuid}`)}
            className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
          >
            <CheckSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t.task_name || "Untitled task"}</span>
          </button>
        ))}
        {projects.map((p) => (
          <button
            key={`project-${p.project_uuid}`}
            type="button"
            onClick={() => router.push(`/app/project/${p.project_uuid}`)}
            className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
          >
            <FolderKanban className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{p.project_name || "Untitled project"}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default LinkedFromSection
