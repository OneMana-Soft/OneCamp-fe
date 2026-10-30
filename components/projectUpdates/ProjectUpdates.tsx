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
import { Megaphone, Plus, Sparkles } from "@/lib/icons"
import { HEALTHS, updateDue, type Health, type ProjectUpdate } from "@/lib/projectUpdates"
import { healthColor } from "@/components/projectUpdates/healthTone"
import { daysSince } from "@/lib/utils/relativeTime"
import { UpdateCard } from "@/components/projectUpdates/UpdateCard"
import { UpdateComposer } from "@/components/projectUpdates/UpdateComposer"
import { ErrorState } from "@/components/ui/error-state"
import { SpotDocs } from "@/components/ui/graphics/spots"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { MilestonesSection } from "@/components/work/milestones/MilestonesSection"
import { useProjectHue } from "@/lib/projectHue"

/**
 * A project's updates (design v3, work.md W27): one 720 px column from the
 * tab's left edge. At its top, the prompt card ("How is the project going?")
 * with the three health chips and "Draft from tasks", which opens the
 * composer drafted from the project's tasks; with no updates yet the card IS
 * the empty state. The latest update is the feature card, with a band in its
 * health's colour; the older ones sit on a rail, a dot each.
 */
export function ProjectUpdates({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const { updates, canPost, isLoading, isError, retry, draft, aiDraft, post, edit, remove } = useProjectUpdates(projectId)
  const projectHue = useProjectHue(projectId)
  const hasAI = useFeature(FEATURE_AI)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data?.user_uuid
  const [composer, setComposer] = useState<{ editing?: ProjectUpdate; health?: Health } | null>(null)
  const now = Date.now()
  const latest = updates[0]
  const due = canPost && updateDue(latest, now)

  const composerFor = (editing?: ProjectUpdate, health?: Health) => (
    <UpdateComposer
      key={editing?.id ?? "new"}
      editing={editing}
      initialHealth={health}
      hasAI={hasAI}
      draft={draft}
      aiDraft={aiDraft}
      post={post}
      edit={edit}
      onDone={() => setComposer(null)}
    />
  )
  const card = (u: ProjectUpdate, variant: "feature" | "rail") => (
    <UpdateCard
      update={u}
      now={now}
      variant={variant}
      canEdit={canPost && u.author_uuid === me}
      canDelete={canPost || u.author_uuid === me}
      onEdit={() => setComposer({ editing: u })}
      onDelete={() => remove(u.id).catch(() => {})}
    />
  )

  return (
    <div className="flex w-full flex-col">
      {/* The band every tab of the project draws (workFrame), so a switch to
          Updates moves nothing, with its one primary (PTC-6: no band, and the
          composer 28px lower and 24px further in than the other tabs). */}
      <div data-work-toolbar="" className={cn(workToolbar, "justify-between")}>
        <span className="text-ui-sm text-ink-3">{updates.length > 0 ? `${updates.length} ${updates.length === 1 ? "update" : "updates"}` : "Updates"}</span>
        {canPost && (
          <Button size="sm" className="h-7 gap-1.5 px-2.5" onClick={() => setComposer({})} disabled={isLoading || isError || (!!composer && !composer.editing)}>
            <Plus className="size-3.5" />
            New update
          </Button>
        )}
      </div>
    <div data-updates="" className="flex w-full max-w-[720px] flex-col gap-4 px-4 pb-10 pt-4">
      <MilestonesSection projectId={projectId} />
      {canPost && !isError && !isLoading && (
        composer && !composer.editing ? (
          composerFor(undefined, composer.health)
        ) : (
          <UpdatePrompt
            projectName={projectName}
            hint={latest && due ? `The last update was ${daysSince(latest.created_at, now)} days ago.` : undefined}
            onOpen={(health) => setComposer({ health })}
          />
        )
      )}
      {isLoading ? (
        <div role="status" aria-label="Loading updates" className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} aria-hidden="true" className="rounded-2xl bg-raised p-5 shadow-e1">
              <div className="mb-3 flex items-center gap-3">
                <Skeleton className="h-5 w-20 rounded-sm" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="mt-2 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <WorkState>
          <ErrorState subject="this project's updates" onRetry={() => void retry()} />
        </WorkState>
      ) : updates.length === 0 ? (
        canPost ? (
          <p className="text-sm text-ink-2">An update says where {projectName || "the project"} stands. OneCamp can draft it from the tasks.</p>
        ) : (
          <WorkState>
            <EmptyState illustration={<SpotDocs hue={projectHue} />} title="No updates yet" description="The project's admins post updates here: where it stands, and what changed." />
          </WorkState>
        )
      ) : (
        <>
          {composer?.editing?.id === latest.id ? composerFor(latest) : card(latest, "feature")}
          {updates.length > 1 && (
            <ol className="relative mt-2" aria-label="Earlier updates, newest first">
              <span aria-hidden="true" className="absolute bottom-2 left-[11px] top-2 w-px bg-line-2" />
              {updates.slice(1).map((u) => (
                <li key={u.id}>{composer?.editing?.id === u.id ? composerFor(u) : card(u, "rail")}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
    </div>
  )
}

const PROMPT_HEALTHS: Health[] = ["on_track", "at_risk", "off_track"]

/** The prompt card at the top of the updates: a question, three health chips, and "Draft from tasks". */
export function UpdatePrompt({ projectName, hint, onOpen }: { projectName?: string; hint?: string; onOpen: (health?: Health) => void }) {
  const [picked, setPicked] = useState<Health | null>(null)
  return (
    <section aria-label="Write an update" data-update-prompt="" className="rounded-xl bg-raised p-4 shadow-e1">
      <button type="button" onClick={() => onOpen(picked ?? undefined)} className="block w-full text-left text-ui text-ink-3 hover:text-ink-2">
        How is {projectName || "the project"} going?
      </button>
      {hint && <p className="mt-1 flex items-center gap-1.5 text-xs text-warning-ink"><Megaphone className="size-3.5" aria-hidden="true" />{hint}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PROMPT_HEALTHS.map((h) => {
          const o = HEALTHS.find((x) => x.value === h)!
          const on = picked === h
          return (
            <button
              key={h}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setPicked(h)
                onOpen(h)
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                on ? cn("ring-1 ring-inset ring-foreground", o.pill) : "bg-hover text-ink-2 ring-1 ring-inset ring-line hover:bg-press hover:text-foreground",
              )}
            >
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: healthColor(h) }} />
              {o.label}
            </button>
          )
        })}
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(picked ?? undefined)}>
          <Sparkles className="size-3.5 text-agent-ink" />
          Draft from tasks
        </Button>
      </div>
    </section>
  )
}
