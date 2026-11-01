import { Skeleton } from "@/components/ui/skeleton"
import { fieldRow } from "@/lib/ui/fieldRowGrid"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The event panel's shape while its event is read: a title, its calendar, three facts. It lives beside the shell, not
 * in the panel's own code, so the right panel draws it while that code comes too (V-180: a cold open drew nothing).
 */
export function EventPanelSkeleton() {
    return (
        <div role="status" aria-label="Loading the event">
            <Skeleton className="h-7 w-3/5" />
            <Skeleton className="mt-3 h-4 w-28" />
            <div className="mt-6 space-y-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <div key={i} className={fieldRow()}>
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className={cn("h-4", i === 1 ? "w-28" : "w-40")} />
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * The event panel while its code comes: the right panel's placeholder for it (rightPanel.tsx), under the right panel's
 * head (RightPanelFrame, with Close live): the event's shape at the panel's own padding, so the panel fills in place.
 */
export function EventPanelLoading() {
    return (
        <div className="px-6 pb-8 pt-5" data-event-panel-loading="">
            <EventPanelSkeleton />
        </div>
    )
}
