"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { addDays, isSameDay } from "date-fns";
import { CalendarClock, Plus, Sparkles, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { OverlayBody } from "@/components/ui/overlay";
import { cn } from "@/lib/utils/helpers/cn";
import { defaultHours } from "@/lib/calendar/availability";
import { spanLabel } from "@/lib/calendar/spanLabel";
import { GHOST_LOOK, atMinutes, keyNudge, moveRange, wallMinutes } from "@/lib/calendar/calendarDrag";
import { dateTimeFormat } from "@/lib/utils/date/clock";
import type { DayLayer } from "@/components/calendar/weekView";
import type { onEscape } from "@/lib/keys/onEscape";
import type { onDragCancel } from "@/lib/ui/dragCancel";
import type { EmptyState } from "@/components/ui/empty-state";
import type { ErrorState } from "@/components/ui/error-state";
import type { SkeletonRows } from "@/components/ui/skeletonRows";
import type { usePost } from "@/hooks/usePost";
import type { useToast } from "@/hooks/use-toast";
import type { CalendarEventInterface } from "@/types/calendar";

/** A block the plan proposes for one of your tasks, and why then; after: the task whose block it follows. */
export interface Proposal {
    task_uuid: string;
    task_name: string;
    project_name?: string;
    start: string;
    end: string;
    reason: string;
    after?: string;
}

/** POST /event/planWeek's answer (Availability Engine B13): it writes nothing. */
export interface WeekPlan {
    from: string;
    to: string;
    proposals: Proposal[];
    left: { task_uuid: string; task_name: string; reason: string }[];
    by: "model" | "due";
    model?: string;
    local?: boolean;
    note?: string;
    /** A Google calendar wasn't read: a block may clash there. */
    unread?: boolean;
}

/** A proposal as the preview holds it: moved here only, and kept or not. */
interface Item extends Proposal {
    s: Date;
    e: Date;
    kept: boolean;
}

/** Who ordered the plan (the workspace's own model, where it runs), else why it is by due date. Pure. */
export function planLine(p: WeekPlan): string {
    if (p.by === "model" && p.model) return p.local ? `Ordered by ${p.model} on your server` : `Ordered by ${p.model}, your workspace's model`;
    return p.note ?? "";
}

/** The tasks with a block still to come on the grid: the plan leaves them out. Pure. */
export function plannedTasks(events: CalendarEventInterface[], now: Date): string[] {
    return [...new Set(events.filter((e) => e.event_task && Date.parse(e.event_end_time) > now.getTime()).map((e) => e.event_task!.task_uuid))];
}

const weekday = (d: Date) => dateTimeFormat(undefined, { weekday: "short" }).format(d);
const minutesOf = (it: Item) => Math.max(15, Math.round((it.e.getTime() - it.s.getTime()) / 60_000));
const blocks = (n: number) => `${n} ${n === 1 ? "block" : "blocks"}`;

export interface PlanWeekProps {
    /** A drawer (a phone): the plan as a list. Beside the grid, its proposals are ghosts on the week too. */
    phone: boolean;
    /** The page's requests: the plan is asked quietly, and a failure said here once. */
    post: Pick<ReturnType<typeof usePost>, "makeRequest">;
    /** The grid's events: tasks with a block still to come are skipped. */
    events: CalendarEventInterface[];
    /** The page's one writer of a task's block (quiet: this says how many it made). */
    blockTime: (taskUUID: string, start: Date, end: Date, title?: string, quiet?: boolean) => Promise<{ id?: string } | null>;
    toast: ReturnType<typeof useToast>["toast"];
    /** Shows the plan's week (asked on a weekend, it is next week). */
    goTo: (d: Date) => void;
    /** Draws the proposals in the week's day columns. */
    onLayer: (next: () => DayLayer | undefined) => void;
    /** The page's one Escape (lib/keys/onEscape), passed in: the chunk imports no shared core. */
    escape: typeof onEscape;
    /** The week's own end of a drag (lib/ui/dragCancel: Escape, or the browser taking the pointer), passed in likewise. */
    dragCancel: typeof onDragCancel;
    /** The shared waiting, empty and failed states, passed in likewise. */
    ui: { EmptyState: typeof EmptyState; ErrorState: typeof ErrorState; SkeletonRows: typeof SkeletonRows };
    onClose: () => void;
}

/**
 * "Plan my week" (gcal-16, gcal-new-task-blocks): the Availability Engine's
 * plan for your open tasks over the rest of the week, as a preview. Nothing is
 * written until "Add N blocks": then each kept proposal is made by the page's
 * own block writer, one create each, and a failed one stays here (its request
 * says why). Beside the grid the proposals are ghosts on the week: moved by a
 * drag or by Alt and the arrows, kept or removed; on a phone the plan is a list
 * in a drawer (no drag). Escape, Discard or the close writes nothing; while
 * it is asked for, empty or failed, Close is its one way out. Beside the grid
 * it takes the focus as it opens (its heading). A chunk of its own, loaded by
 * the button: the page asks through its own requests.
 */
export function PlanWeek({ phone, post, events, blockTime, toast, goTo, onLayer, escape, dragCancel, ui, onClose }: PlanWeekProps) {
    const [plan, setPlan] = useState<WeekPlan | null>(null);
    const [failed, setFailed] = useState(false);
    const [tries, setTries] = useState(0);
    const [items, setItems] = useState<Item[]>([]);
    const [busy, setBusy] = useState(false);
    // The ask is made once per try, from the grid as it was when asked.
    const [skip] = useState(() => plannedTasks(events, new Date()));
    const show = useRef(goTo);
    const close = useRef(onClose);
    useEffect(() => void ((show.current = goTo), (close.current = onClose)));
    // By makeRequest, which is stable: usePost's object is new while a request is out, and
    // an ask keyed on it asked again then, its answers each landing on an ask already dropped.
    const ask = post.makeRequest;
    useEffect(() => {
        let live = true;
        ask<object, WeekPlan>({ apiEndpoint: "/event/planWeek", payload: { hours: defaultHours(), skip }, quiet: true }).then(
            (p) => {
                if (!live) return;
                if (!p?.proposals) return void setFailed(true);
                setPlan(p);
                setItems(p.proposals.map((x) => ({ ...x, s: new Date(x.start), e: new Date(x.end), kept: true })));
                show.current(new Date(p.from));
            },
            () => live && setFailed(true),
        );
        return () => void (live = false);
    }, [ask, skip, tries]);

    // By task: a ghost moved to another day is drawn there anew, another element.
    const set = (id: string, change: Partial<Item>) => setItems((all) => all.map((x) => (x.task_uuid === id ? { ...x, ...change } : x)));
    const toggle = (it: Item) => set(it.task_uuid, { kept: !it.kept });
    const kept = items.filter((x) => x.kept);
    // A move of `from` (its place when the move began) by `delta` minutes onto `day`, snapped;
    // drawn only when that lands somewhere new, so a drag draws the week once a snap.
    const place = (from: Item, day: Date, delta: number) => {
        const start = wallMinutes(from.s);
        const r = moveRange(start, start + minutesOf(from), delta);
        const s = atMinutes(day, r.startMin);
        const e = atMinutes(day, r.endMin);
        setItems((all) => {
            const was = all.find((x) => x.task_uuid === from.task_uuid);
            if (!was || (was.s.getTime() === s.getTime() && was.e.getTime() === e.getTime())) return all;
            return all.map((x) => (x === was ? { ...x, s, e } : x));
        });
    };

    // A ghost's drag. Its press is held here, not by the ghost: a drag into another day draws the
    // ghost anew in that day's column, and goes on from there to its release. The window takes the
    // moves first (the week's own create keeps out); the week's own end of a drag (Escape, or the
    // browser taking the pointer) puts it back where it was.
    const unbind = useRef<(() => void) | null>(null);
    useEffect(() => () => unbind.current?.(), []);
    const lift = (it: Item, e: ReactPointerEvent<HTMLElement>) => {
        unbind.current?.();
        const { pointerId, clientY } = e;
        const h = e.currentTarget.parentElement?.getBoundingClientRect().height || 1;
        const move = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            ev.stopPropagation();
            // The day under the pointer, from the column's own mark.
            const col = document.elementsFromPoint?.(ev.clientX, ev.clientY).find((el) => el.hasAttribute("data-day-col"));
            const mark = col?.querySelector("[data-plan-day]")?.getAttribute("data-plan-day");
            place(it, mark ? new Date(mark) : it.s, ((ev.clientY - clientY) / h) * 24 * 60);
        };
        const up = (ev: PointerEvent) => void (ev.pointerId === pointerId && (ev.stopPropagation(), done()));
        const stop = dragCancel(() => (set(it.task_uuid, { s: it.s, e: it.e }), done()));
        const done = () => {
            stop();
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", up, true);
            unbind.current = null;
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
        unbind.current = done;
    };

    // Each kept one through the page's writer, in turn; a made one leaves the preview.
    const add = async () => {
        setBusy(true);
        let made = 0;
        for (const it of kept) {
            if (!(await blockTime(it.task_uuid, it.s, it.e, "", true))) continue;
            made++;
            setItems((all) => all.filter((x) => x.task_uuid !== it.task_uuid));
        }
        setBusy(false);
        if (made) toast({ title: `Added ${blocks(made)} to your week` });
        if (made === kept.length) onClose();
    };

    // Escape discards the preview beside the grid, as a panel: an overlay's own Escape comes first; while adding, it waits.
    useEffect(() => (phone ? undefined : escape("panel", () => void (busy || close.current()))), [phone, busy, escape]);

    // Drawn from the start beside the grid, so the week's own "Nothing on this week" stays away while the plan is open.
    const draw = useMemo<DayLayer | undefined>(() => {
        if (phone) return undefined;
        const Layer: DayLayer = (day, at, tall, keep) => {
            const here = items.filter((x) => isSameDay(x.s, day));
            return (
                <>
                    <i hidden data-plan-day={day.toISOString()} />
                    {here.map((it) => (
                        <Ghost key={it.task_uuid} it={it} at={at} tall={tall} keep={keep} onLift={(e) => lift(it, e)} onMove={(d, delta) => place(it, d, delta)} onToggle={() => toggle(it)} />
                    ))}
                </>
            );
        };
        return Layer;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- lift, place and toggle only reach setItems, a ref and dragCancel (stable)
    }, [phone, items]);
    useEffect(() => onLayer(() => draw), [draw, onLayer]);
    useEffect(() => () => onLayer(() => undefined), [onLayer]);

    const week = plan ? dateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(plan.from)) : "";
    const line = plan && items.length ? planLine(plan) : "";
    const { EmptyState, ErrorState, SkeletonRows } = ui;
    const body: ReactNode = failed ? (
        <ErrorState compact subject="a plan for your week" detail="Nothing was added. This is usually a connection problem: try again in a moment." onRetry={() => (setFailed(false), setTries((n) => n + 1))} />
    ) : !plan ? (
        <div role="status" aria-label="Planning your week" data-plan-loading="" className="px-2 py-1">
            <SkeletonRows rows={3} avatar={false} />
        </div>
    ) : (
        <div className="flex flex-col gap-3 px-2 pb-2">
            {items.length ? (
                <p className="text-meta text-ink-3">
                    Nothing is added until you say so.
                    {phone ? null : " Drag a block to move it."}
                </p>
            ) : (
                <EmptyState
                    icon={CalendarClock}
                    hue="sun"
                    className="py-6"
                    title={plan.left.length ? "No time left for these tasks" : "Nothing to plan"}
                    description={plan.left.length ? "Free up some time, or pick a time for a task from Tasks." : "Assign yourself a task, then plan again."}
                />
            )}
            {line ? (
                <p className="flex items-center gap-1.5 text-meta text-ink-3" data-plan-line="">
                    <Sparkles className="size-3.5 shrink-0 text-brand-text" aria-hidden="true" />
                    {line}
                </p>
            ) : null}
            {plan.unread && plan.proposals.length ? <p className="rounded-lg bg-sunken px-2.5 py-2 text-meta text-ink-2">A Google calendar couldn&apos;t be read: these blocks may clash with it.</p> : null}
            {items.length ? (
                <ul className="flex flex-col gap-1.5" aria-label="Proposed blocks">
                    {items.map((it) => (
                        <li key={it.task_uuid} data-plan-row="" data-kept={it.kept || undefined} className={cn("flex items-start gap-2 rounded-lg border border-dashed px-2.5 py-2", it.kept ? "border-brand/40 bg-brand/6" : "border-line opacity-60")}>
                            <div className="min-w-0 flex-1">
                                <p className={cn("truncate text-ui font-medium text-ink", !it.kept && "line-through")}>{it.task_name}</p>
                                <p className="text-meta tabular-nums text-ink-2">
                                    {weekday(it.s)} {spanLabel(it.s, it.e)}
                                    {it.project_name ? ` · ${it.project_name}` : ""}
                                </p>
                                <p className="text-meta text-ink-3">{it.reason}</p>
                            </div>
                            <Button variant="ghost" size="icon-sm" aria-label={`${it.kept ? "Remove" : "Keep"} ${it.task_name}`} title={it.kept ? "Remove from the plan" : "Keep in the plan"} disabled={busy} onClick={() => toggle(it)}>
                                {it.kept ? <X /> : <Plus />}
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {plan.left.length ? (
                <ul className="flex flex-col gap-1" aria-label="Not planned">
                    {plan.left.map((l) => (
                        <li key={l.task_uuid} className="text-meta text-ink-3">
                            <span className="font-medium text-ink-2">{l.task_name}</span> · Not planned: {l.reason}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
    const footer = items.length ? (
        <div className="flex gap-2">
            <Button variant="secondary" className={cn("flex-1", phone && "h-11")} disabled={busy} onClick={onClose}>
                Discard
            </Button>
            <Button className={cn("flex-1", phone && "h-11")} busy={busy} disabled={!kept.length} onClick={() => void add()}>
                Add {blocks(kept.length)}
            </Button>
        </div>
    ) : (
        // Asked for, empty or failed: nothing to discard or add.
        <Button variant="secondary" className={cn("w-full", phone && "h-11")} onClick={onClose}>
            Close
        </Button>
    );
    // Beside the grid, the focus goes into the plan as it opens (a phone's drawer takes it itself).
    const head = useRef<HTMLHeadingElement>(null);
    useEffect(() => void head.current?.focus({ preventScroll: true }), []);
    const title = plan ? `Plan for the week of ${week}` : "Plan my week";

    if (phone) {
        return (
            <Drawer open onOpenChange={(open) => !open && !busy && onClose()} detent="medium">
                <DrawerContent aria-describedby={undefined} data-calendar-plan="" header={<DrawerTitle className="text-title-3 text-ink">{title}</DrawerTitle>} footer={footer}>
                    <OverlayBody className="mx-0 px-2 pb-2">{body}</OverlayBody>
                </DrawerContent>
            </Drawer>
        );
    }
    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="calendar-plan-title" data-calendar-plan="">
            <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-3">
                <Sparkles className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
                <h2 ref={head} id="calendar-plan-title" tabIndex={-1} className="flex-1 truncate text-ui font-semibold text-ink outline-none">
                    {title}
                </h2>
                {/* With nothing to discard (asked for, empty or failed) the x is Close, as the footer is. */}
                <Button variant="ghost" size="icon-sm" aria-label={items.length ? "Discard the plan" : "Close"} title={items.length ? "Discard · Esc" : "Close · Esc"} disabled={busy} onClick={onClose}>
                    <X />
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                <div className="px-2">{body}</div>
            </div>
            <div className="shrink-0 border-t border-line p-3">{footer}</div>
        </section>
    );
}

/**
 * A proposal on the week: the draft ghost's look (dashed, brand-tinted, so
 * never an event), its task and why. A drag moves it within the week by
 * snaps (the plan holds the drag), Alt and the arrows by the keys; its button
 * removes or keeps it.
 */
function Ghost({
    it,
    at,
    tall,
    keep,
    onLift,
    onMove,
    onToggle,
}: {
    it: Item;
    at: (min: number) => string;
    tall: (min: number, least: number) => string;
    keep: (sel: string) => void;
    onLift: (e: ReactPointerEvent<HTMLElement>) => void;
    onMove: (day: Date, delta: number) => void;
    onToggle: () => void;
}) {
    const down = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        // The column's own create stays out, a press on the ghost's own Remove/Keep included (else the column
        // takes the pointer and the button's click never comes).
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest("button")) onLift(e);
    };
    const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        const n = keyNudge(e);
        if (n && !n.end) {
            e.preventDefault();
            // Another day's column draws it anew: the week puts the focus back on it.
            keep(`[data-plan-ghost="${CSS.escape(it.task_uuid)}"]`);
            return onMove(addDays(it.s, n.days), n.minutes);
        }
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onToggle();
        }
    };
    return (
        <div
            role="group"
            tabIndex={0}
            data-plan-ghost={it.task_uuid}
            data-kept={it.kept || undefined}
            aria-label={`Proposed: ${it.task_name}, ${weekday(it.s)} ${spanLabel(it.s, it.e)}. ${it.reason}. Alt and the arrows move it.`}
            className={cn(
                "absolute inset-x-[2px] z-30 cursor-grab touch-none overflow-hidden py-1 pl-[9px] pr-6 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:cursor-grabbing",
                GHOST_LOOK,
                !it.kept && "border-line bg-sheet opacity-60",
            )}
            style={{ top: at(wallMinutes(it.s)), height: tall(minutesOf(it), 22) }}
            onPointerDown={down}
            onKeyDown={key}
        >
            <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", it.kept ? "bg-brand" : "bg-line")} />
            <span className={cn("block truncate text-meta font-semibold text-[color-mix(in_oklab,var(--brand-text)_85%,var(--ink))]", !it.kept && "line-through")}>{it.task_name}</span>
            <span className="block truncate text-micro text-ink-3">{it.reason}</span>
            <button
                type="button"
                aria-label={`${it.kept ? "Remove" : "Keep"} ${it.task_name}`}
                className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded text-ink-3 hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-3.5"
                onClick={onToggle}
            >
                {it.kept ? <X /> : <Plus />}
            </button>
        </div>
    );
}
