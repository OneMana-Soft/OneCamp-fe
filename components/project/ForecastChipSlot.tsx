import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/** The chip's room while its code or its read comes, in its size and shape (rounded-sm), so the line doesn't move. */
export function ForecastChipSlot({ className }: { className?: string }) {
  return <Skeleton data-forecast="loading" aria-hidden className={cn("h-6 w-24 rounded-sm", className)} />
}
