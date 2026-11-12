"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { MoreHorizontal, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { OverlayBody } from "@/components/ui/overlay";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TaskFinderRow } from "@/components/task/taskFinderRow";
import { waitingOn } from "@/lib/tasks/waitingOn";
import { cn } from "@/lib/utils/helpers/cn";
import { useAssignedTasks } from "@/hooks/useAssignedTasks";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { usePost } from "@/hooks/usePost";
import { useToast } from "@/hooks/use-toast";
import { defaultHours } from "@/lib/calendar/availability";
import { firstFree, nextFreeAsk, taskBlockMinutes } from "@/lib/calendar/nextFree";
import type { CarryTask } from "@/components/calendar/weekView";
import type { TaskInfoInterface } from "@/types/task";

export interface TasksPanelProps {
    /** Your open tasks (the page reads them: /user/assignedTaskList?open=1); undefined while they load. */
    tasks?: TaskInfoInterface[];
    /** Their read failed: said here, with Try again. */
    failed?: boolean;
    onRetry?: () => void;
    /** A drawer (a phone): a task tapped, then Block time in its pinned footer. */
    phone?: boolean;
    onClose: () => void;
    /** Starts the week's own carry of a row; false where the grid takes none (a month, the agenda). */
    onCarry?: (task: TaskInfoInterface, e: ReactPointerEvent<HTMLElement>) => boolean;
    /** Blocks the task's next free time and opens the block. */
    onBlock: (task: TaskInfoInterface) => unknown;
    onOpen: (uuid: string) => void;
}

/** A row's name for the keys and a screen reader: the task, its project, and what it waits on. Pure. */
const rowName = (t: TaskInfoInterface) => [t.task_name || "Untitled task", t.task_project?.project_name, t.task_blocked_open ? waitingOn(t.task_blocked_open).toLowerCase() : ""].filter(Boolean).join(", ");

/**
 * The calendar's Tasks list (gcal-new-task-blocks T1): your open tasks, to
 * give time on the grid. Beside the grid a row is carried onto the hours by
 * the week's own drag (one block, the task's estimate long), and its menu
 * blocks your next free time from the keys; on a phone it is a drawer, where
 * a task tapped then "Block time" does that. It only presents: the page reads
 * the tasks and makes the blocks.
 */
export function TasksPanel({ tasks, failed, onRetry, phone, onClose, onCarry, onBlock, onOpen }: TasksPanelProps) {
    const [picked, setPicked] = useState<TaskInfoInterface | null>(null);
    const [busy, setBusy] = useState(false);
    // The week took the last press: its own tap opens the task, so the row's click doesn't again.
    const carried = useRef(false);
    const block = async (t: TaskInfoInterface) => {
        setBusy(true);
        try {
            await onBlock(t);
        } finally {
            setBusy(false);
        }
    };

    const list = failed ? (
        <div className="grid justify-items-start gap-2 px-2 py-3 text-ui-sm text-ink-2" role="alert">
            Couldn&apos;t load your tasks.
            <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
            </Button>
        </div>
    ) : !tasks ? (
        <p className="px-2 py-3 text-ui-sm text-ink-3" aria-busy="true">
            Loading your tasks…
        </p>
    ) : tasks.length === 0 ? (
        <div className="grid gap-1 px-2 py-6 text-center">
            <p className="text-ui-sm font-medium text-ink">No open tasks</p>
            <p className="text-meta text-ink-3">Tasks assigned to you show here until they&apos;re done.</p>
        </div>
    ) : (
        <ul className="grid gap-0.5" aria-label="Your open tasks">
            {tasks.map((t) => (
                <li key={t.task_uuid} className="group/row flex min-w-0 items-start rounded-lg hover:bg-hover">
                    <button
                        type="button"
                        aria-label={rowName(t)}
                        aria-pressed={phone ? picked?.task_uuid === t.task_uuid : undefined}
                        data-touch-target=""
                        className={cn(
                            "flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            phone ? "aria-pressed:bg-press aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-brand" : onCarry && "cursor-grab",
                        )}
                        onPointerDown={(e) => {
                            carried.current = !phone && e.button === 0 && !!onCarry?.(t, e);
                        }}
                        onClick={(e) => {
                            if (phone) setPicked(t);
                            else if (e.detail === 0 || !carried.current) onOpen(t.task_uuid);
                            carried.current = false;
                        }}
                    >
                        <TaskFinderRow task={t} />
                    </button>
                    {!phone ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-xs" aria-label={`More for ${t.task_name || "this task"}`} className="mr-1 mt-1.5 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100">
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem disabled={busy} onSelect={() => void block(t)}>
                                    Block time
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onOpen(t.task_uuid)}>Open task</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </li>
            ))}
        </ul>
    );

    if (phone) {
        return (
            <Drawer open onOpenChange={(open) => !open && onClose()} detent="medium">
                <DrawerContent
                    aria-describedby={undefined}
                    data-calendar-tasks=""
                    header={<DrawerTitle className="text-title-3 text-ink">Tasks</DrawerTitle>}
                    footer={
                        <Button className="h-11 w-full" busy={busy} disabled={!picked} onClick={() => picked && void block(picked)}>
                            Block time
                        </Button>
                    }
                >
                    <OverlayBody className="mx-0 px-2 pb-2">
                        <p className="px-2 pb-2 text-meta text-ink-3">Pick a task, then block your next free time for it.</p>
                        {list}
                    </OverlayBody>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="calendar-tasks-title" data-calendar-tasks="">
            <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-3">
                <h2 id="calendar-tasks-title" className="flex-1 text-ui font-semibold text-ink">
                    Tasks
                </h2>
                <Button variant="ghost" size="icon-sm" aria-label="Close tasks" onClick={onClose}>
                    <X />
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {tasks?.length ? <p className="px-2 pb-2 text-meta text-ink-3">Drag a task onto the calendar to block time for it.</p> : null}
                {list}
            </div>
        </section>
    );
}

export interface TasksAsideProps {
    /** A drawer (a phone), else the list beside the grid. */
    phone: boolean;
    onClose: () => void;
    /** The week's carry, which the week fills while its hours take tasks; none on a phone. */
    carry?: RefObject<CarryTask | null>;
    /** The page's block for a task, as a carry makes it: what it made, or null once its request said why not. */
    onBlockTime: (taskUUID: string, start: Date, end: Date) => Promise<{ id?: string } | null>;
    /** Opens a block made here, to adjust it. */
    onOpenBlock: (id: string) => void;
    onOpen: (uuid: string) => void;
}

/**
 * The Tasks list with its read, loaded on its first open (the calendar's
 * first screen holds only its button): your open tasks
 * (/user/assignedTaskList?open=1, the endpoint's own checks; a failed read is
 * said here, so it raises no toast), soonest due first, undated last. A row
 * carries through the week's own drag, the task's estimate long; "Block
 * time" takes your next free time in the next few days (the Availability
 * Engine, lib/calendar/nextFree), makes it as a carry does, and opens it.
 */
export function TasksAside({ phone, onClose, carry, onBlockTime, onOpenBlock, onOpen }: TasksAsideProps) {
    const { data, isError, mutate } = useAssignedTasks("open=1", OWN_ERRORS);
    const post = usePost();
    const { toast } = useToast();
    const tasks = useMemo(() => {
        const due = (t: TaskInfoInterface) => (t.task_due_date ? Date.parse(t.task_due_date) : Number.MAX_SAFE_INTEGER);
        return data && [...data.data.user_tasks].sort((a, b) => due(a) - due(b));
    }, [data]);
    const onCarry = carry
        ? (t: TaskInfoInterface, e: ReactPointerEvent<HTMLElement>) => {
              if (!carry.current) return false;
              carry.current({ uuid: t.task_uuid, title: t.task_name || "Untitled task", minutes: taskBlockMinutes(t.task_estimate_minutes) }, e);
              return true;
          }
        : undefined;
    // A failed ask or create is said once, by its request.
    const blockNext = async (t: TaskInfoInterface) => {
        let free: ReturnType<typeof firstFree>;
        try {
            free = firstFree(await post.makeRequest<object, Parameters<typeof firstFree>[0]>(nextFreeAsk(new Date(), taskBlockMinutes(t.task_estimate_minutes), defaultHours())));
        } catch {
            return;
        }
        if (!free) return void toast({ title: "No free time in the next few days", description: phone ? undefined : "Drag the task onto the calendar to pick a time.", tone: "info" });
        const made = await onBlockTime(t.task_uuid, free.start, free.end);
        if (!made?.id) return;
        if (phone) onClose();
        onOpenBlock(made.id);
    };
    return <TasksPanel tasks={tasks} failed={!!isError && !data} onRetry={() => void mutate()} phone={phone} onClose={onClose} onCarry={onCarry} onBlock={blockNext} onOpen={onOpen} />;
}
