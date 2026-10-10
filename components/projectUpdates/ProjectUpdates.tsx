"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useFeature, FEATURE_AI } from "@/hooks/useClientConfig"
import { useProjectUpdates } from "@/hooks/useProjectUpdates"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { cn } from "@/lib/utils/helpers/cn"
import { Megaphone } from "@/lib/icons"
import { updateDue, type ProjectUpdate } from "@/lib/projectUpdates"
import { daysSince } from "@/lib/utils/relativeTime"
import { UpdateCard } from "@/components/projectUpdates/UpdateCard"
import { UpdateComposer } from "@/components/projectUpdates/UpdateComposer"
import { ErrorState } from "@/components/ui/error-state"
import { SpotDocs } from "@/components/ui/graphics/spots"
import { WorkState, workBody, workToolbar } from "@/components/task/workFrame"
import { hueFor } from "@/lib/campHue"

/**
 * A project's updates: where it stands and what changed, newest first. Its
 * admins write them, starting from a draft of the project's tasks, and are
 * reminded here once the last one is a week old.
 */
export function ProjectUpdates({ projectId }: { projectId: string }) {
  const { updates, canPost, isLoading, isError, retry, draft, aiDraft, post, edit, remove } = useProjectUpdates(projectId)
  const hasAI = useFeature(FEATURE_AI)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data?.user_uuid
  const [composer, setComposer] = useState<{ editing?: ProjectUpdate } | null>(null)
  const now = Date.now()
  const latest = updates[0]
  const due = canPost && updateDue(latest, now)

  const composerFor = (editing?: ProjectUpdate) => (
    <UpdateComposer
      key={editing?.id ?? "new"}
      editing={editing}
      hasAI={hasAI}
      draft={draft}
      aiDraft={aiDraft}
      post={post}
      edit={edit}
      onDone={() => setComposer(null)}
    />
  )

  return (
    // The tab frame (components/task/workFrame): a toolbar row from the first
    // paint, then the updates, starting at the tab's left edge like every other
    // tab's content (max-w-3xl keeps the measure). The column used to be
    // centred, 180px right of the other tabs at 1440, with no toolbar: its
    // "Write an update" card came with the updates and pushed them down 74px.
    <div className="flex flex-col pb-10">
      <div data-work-toolbar="" className={cn(workToolbar, "justify-between")}>
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
          {canPost && latest && !composer && (
            <>
              <Megaphone className={cn("h-4 w-4 shrink-0", due ? "text-warning-ink" : "text-muted-foreground")} />
              <span className="truncate">
                {due
                  ? `The last update was ${daysSince(latest.created_at, now)} days ago. The next one is drafted from this week's tasks.`
                  : "Post an update when something changes. It's drafted from the project's tasks."}
              </span>
            </>
          )}
        </p>
        {canPost && !composer && (
          <Button size="sm" className="h-8" onClick={() => setComposer({})}>
            Write an update
          </Button>
        )}
      </div>

      {/* The updates keep a reading measure (max-w-3xl) from the tab's left
          edge; an empty or failed tab says so across the whole body, where
          every other tab says it. */}
      <div className={cn(workBody, "flex flex-col gap-3")}>
        {composer && !composer.editing && <div className="w-full max-w-3xl">{composerFor()}</div>}

        {isLoading ? (
          <div role="status" aria-label="Loading updates" className="flex w-full max-w-3xl flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} aria-hidden="true" className="rounded-xl border border-border/60 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="mt-2 h-3.5 w-3/4" />
                <Skeleton className="mt-2 h-3.5 w-2/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <WorkState>
            <ErrorState subject="this project's updates" onRetry={() => void retry()} />
          </WorkState>
        ) : updates.length === 0 ? (
          !composer && (
            <WorkState>
              <EmptyState
                illustration={<SpotDocs hue={hueFor(projectId)} />}
                title="No updates yet"
                description={
                  canPost
                    ? "An update says where the project stands (on track, at risk, off track) with a short note. OneCamp drafts it from the project's tasks: what's done, what's stuck or late, and what's next."
                    : "The project's admins post updates here: where it stands, and what changed."
                }
              />
            </WorkState>
          )
        ) : (
          <ol className="flex w-full max-w-3xl flex-col gap-3" aria-label="Updates, newest first">
            {updates.map((u) =>
              composer?.editing?.id === u.id ? (
                <li key={u.id}>{composerFor(u)}</li>
              ) : (
                <li key={u.id}>
                  <UpdateCard
                    update={u}
                    now={now}
                    canEdit={canPost && u.author_uuid === me}
                    canDelete={canPost || u.author_uuid === me}
                    onEdit={() => setComposer({ editing: u })}
                    onDelete={() => remove(u.id).catch(() => {})}
                  />
                </li>
              ),
            )}
          </ol>
        )}
      </div>
    </div>
  )
}
