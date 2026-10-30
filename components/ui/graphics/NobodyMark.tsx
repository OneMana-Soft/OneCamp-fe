import { cn } from "@/lib/utils/helpers/cn"

/**
 * Nobody (design v3, work.md W19, the unassigned ghost): a dashed ring where
 * a person's face would be, for an empty assignee and the "No one" row of a
 * picker. Decorative: the words beside it, or the control's name, say it.
 * 18px unless told (a class, "size-7 md:size-5", to match a face beside it).
 */
export function NobodyMark({ className }: { className?: string }) {
  return <span aria-hidden="true" data-nobody="" className={cn("inline-block size-[18px] shrink-0 rounded-full border border-dashed border-line-3", className)} />
}
