import { cn } from "@/lib/utils/helpers/cn"

/** 28 x 4px bars, moss when done (hub.md H5, H6): the checklist's progress, and the guided run's step. */
export function SegmentedProgress({ done, total, label }: { done: number; total: number; label?: string }) {
    const bars = Math.min(total, 12)
    const filled = total > 0 ? Math.round((done / total) * bars) : 0
    return (
        <span className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total > 0 ? Math.round((done / total) * 100) : 0} aria-label={label ?? `${done} of ${total} steps done`} data-segmented-progress="">
            {Array.from({ length: bars }, (_, i) => (
                <i key={i} className="relative h-1 w-7 overflow-hidden rounded-[2px] bg-press">
                    <span className={cn("absolute inset-0 origin-left bg-camp-moss transition-transform duration-[320ms] ease-out", i < filled ? "scale-x-100" : "scale-x-0")} />
                </i>
            ))}
        </span>
    )
}
