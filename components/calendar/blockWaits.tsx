"use client";

import type { MouseEvent } from "react";
import { BlockedBadge } from "@/components/task/BlockedBadge";
import { waitingOn } from "@/lib/tasks/waitingOn";
import { workRoute } from "@/lib/work/route";
import type { CalendarEventTask } from "@/types/calendar";

/**
 * What a block's task waits on (gcal-new-task-blocks), on its card and in its
 * form: the stop sign, then the first open task it waits on by name, a link to
 * it, when the reader may read that one, else how many (the timeline's words).
 * `onLink` is the card's way of opening a task. Nothing when it waits on none.
 */
export function BlockWaits({ task, onLink }: { task: CalendarEventTask; onLink?: (e: MouseEvent<HTMLAnchorElement>, uuid: string) => void }) {
    const n = task.task_blocked_open ?? 0;
    if (!n) return null;
    const first = task.task_blocked_by?.[0];
    return (
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-ui-sm text-ink-2" data-block-waits="">
            <span aria-hidden="true" className="flex">
                <BlockedBadge count={n} />
            </span>
            {first?.task_name ? (
                <span className="min-w-0 truncate">
                    Waiting on{" "}
                    <a
                        href={workRoute({ task: first.task_uuid })}
                        onClick={onLink ? (e) => onLink(e, first.task_uuid) : undefined}
                        className="rounded-[4px] font-medium text-ink underline decoration-ink-4 underline-offset-[3px] outline-none hover:decoration-ink-2 focus-visible:ring-2 focus-visible:ring-brand"
                        data-touch-target=""
                    >
                        {first.task_name}
                    </a>
                    {n > 1 ? ` and ${n - 1} more` : ""}
                </span>
            ) : (
                <span>{waitingOn(n)}</span>
            )}
        </span>
    );
}
