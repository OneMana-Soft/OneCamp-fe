"use client"

import { Plus } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotImported, SpotSearch } from "@/components/ui/graphics"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The pieces a project's files share on a phone (ProjectAttachmentList) and
 * on a desktop (ProjectAttachments), so the two say and look the same.
 */

/**
 * The tile after a project's files that adds more. A button with its words:
 * it was a label round a bare plus for a hidden file input, which no
 * keyboard could reach and no screen reader could name.
 */
export function AddFilesTile({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-1.5 self-stretch rounded-xl border border-dashed border-border px-3 text-xs font-medium text-muted-foreground",
        "transition-colors hover:border-input hover:bg-highlight/40 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add files
    </button>
  )
}

/**
 * A project with no files: the tray drawing, what belongs here, and for
 * someone who can add files, the one button that does.
 */
export function ProjectFilesEmpty({ onAdd, className }: { onAdd?: () => void; className?: string }) {
  return (
    <EmptyState
      illustration={<SpotImported />}
      title="No attachments yet"
      description={
        onAdd ? "Add the files this project runs on, like briefs, contracts and designs." : "Files added to this project show here."
      }
      className={className}
      action={
        onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add files
          </Button>
        )
      }
    />
  )
}

/** A search through a project's files that found nothing. */
export function ProjectFilesNoMatch({ query, className }: { query: string; className?: string }) {
  return <EmptyState illustration={<SpotSearch />} title={`No attachments match “${query}”.`} className={className} />
}

/** A project's files while they load: tiles the size of the real ones. */
export function ProjectFilesSkeleton() {
  return (
    <div role="status" aria-label="Loading attachments" className="flex flex-wrap gap-3">
      {[176, 208, 152].map((w) => (
        <Skeleton key={w} aria-hidden="true" className="h-[62px] rounded-xl" style={{ width: w }} />
      ))}
    </div>
  )
}
