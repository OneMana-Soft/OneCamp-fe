import { BadgeCheck } from "@/lib/icons"
import type { TaskWaiting } from "@/types/task"

/** A held card's mark on its board (a move or an ask waiting for approval): the approvals badge and the word, in sun. A chunk of its own. */
export default function WaitingMark({ waiting }: { waiting: TaskWaiting }) {
  return (
    <span title="Waiting for approval" data-waiting-mark={waiting.to_status} className="inline-flex shrink-0 items-center gap-0.5 font-medium text-camp-sun-ink">
      <BadgeCheck aria-hidden className="size-3" />
      Waiting<span className="sr-only"> for approval</span>
    </span>
  )
}
