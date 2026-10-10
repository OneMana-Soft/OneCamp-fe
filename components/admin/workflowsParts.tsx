import { Skeleton } from "@/components/ui/skeleton"

/**
 * What workflows do, said under the title wherever they are listed: the admin
 * tab's section and the settings page's header.
 */
export const WORKFLOWS_DESCRIPTION =
  "When a message in a channel matches a rule, OneCamp replies or turns it into a task. The switches save as you make them."

/**
 * The workflows list while it loads, in a loaded row's shape: the trigger's
 * tile, the name, the rule and the actions, then the switch and three buttons,
 * in the list's own bordered frame. It was a block of generic 40px lines that
 * bordered rows of about 100px then replaced, and on the settings page a
 * second, different placeholder came first while permissions loaded.
 *
 * In the card's parts, not the card, so the settings page can draw it before
 * the card has loaded.
 */
export function WorkflowsListSkeleton({ label = "Loading workflows" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-border rounded-lg border border-border">
      {[0, 1, 2].map((i) => (
        <div key={i} data-workflow-skeleton-row="" aria-hidden="true" className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-24 rounded-sm" />
              <Skeleton className="h-5 w-16 rounded-sm" />
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <Skeleton className="mr-1 h-5 w-9 rounded-full" />
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}
