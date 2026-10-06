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
import { Eye, Megaphone, Pencil, Trash2 } from "@/lib/icons"
import { ago, daysSince, updateDue, type ProjectUpdate } from "@/lib/projectUpdates"
import { HealthPill } from "@/components/projectUpdates/HealthPill"
import { UpdateText } from "@/components/projectUpdates/UpdateText"
import { UpdateComposer } from "@/components/projectUpdates/UpdateComposer"

/**
 * A project's updates: where it stands and what changed, newest first. Its
 * admins write them, starting from a draft of the project's tasks, and are
 * reminded here once the last one is a week old.
 */
export function ProjectUpdates({ projectId }: { projectId: string }) {
  const { updates, canPost, isLoading, draft, aiDraft, post, edit, remove } = useProjectUpdates(projectId)
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-10">
      {canPost && !composer && latest && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
            due ? "border-warning/30 bg-warning/5" : "border-border/60 bg-muted/30",
          )}
        >
          <Megaphone className={cn("h-4 w-4 shrink-0", due ? "text-warning" : "text-muted-foreground")} />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {due
              ? `The last update was ${daysSince(latest.created_at, now)} days ago. The next one is drafted from this week's tasks.`
              : "Post an update when something changes. It's drafted from the project's tasks."}
          </p>
          <Button size="sm" variant={due ? "default" : "outline"} onClick={() => setComposer({})}>
            Write an update
          </Button>
        </div>
      )}

      {composer && !composer.editing && composerFor()}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : updates.length === 0 ? (
        !composer && (
          <EmptyState
            icon={Megaphone}
            title="No updates yet"
            description={
              canPost
                ? "An update says where the project stands (on track, at risk, off track) with a short note. OneCamp drafts it from the project's tasks: what's done, what's stuck or late, and what's next."
                : "The project's admins post updates here: where it stands, and what changed."
            }
            action={canPost ? <Button onClick={() => setComposer({})}>Write the first update</Button> : undefined}
          />
        )
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Updates, newest first">
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
  )
}

function UpdateCard({
  update,
  now,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  update: ProjectUpdate
  now: number
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const edited = Date.parse(update.updated_at) - Date.parse(update.created_at) > 60_000
  return (
    <article className="group rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <HealthPill health={update.health} />
        <p className="min-w-0 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{update.author_name}</span>
          {" · "}
          <time dateTime={update.created_at} title={new Date(update.created_at).toLocaleString()}>
            {ago(update.created_at, now)}
          </time>
          {edited && " · edited"}
        </p>
        {update.shared_with_client && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground" title="Shown on the project's client link">
            <Eye className="h-3 w-3" /> Client can see this
          </span>
        )}
        {(canEdit || canDelete) && (
          <div
            className={cn(
              "ml-auto flex items-center gap-1 transition-opacity",
              // Revealed on hover or focus with a pointer; always there on touch, and while confirming.
              !confirming && "md:pointer-events-none md:opacity-0 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
            )}
          >
            {confirming ? (
              <>
                <span className="text-xs text-muted-foreground">Delete this update?</span>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
                <Button size="sm" variant="destructive" className="h-7" onClick={onDelete}>
                  Delete
                </Button>
              </>
            ) : (
              <>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit the update" onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete the update" onClick={() => setConfirming(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </header>
      <UpdateText body={update.body} />
    </article>
  )
}
