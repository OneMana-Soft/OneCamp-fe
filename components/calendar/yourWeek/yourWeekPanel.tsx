"use client";

import { format, addDays } from "date-fns";
import { useFetch } from "@/hooks/useFetch";
import { placeHue } from "@/lib/placeHue";
import { hm, usualWords, weekParts, yourWeekPath, type WeekInsights } from "@/lib/calendar/yourWeek";
import { cn } from "@/lib/utils/helpers/cn";

/** Your week (calendar B3): where your own time went in the week on screen. Loads with its popover. */
export function YourWeekPanel({ weekStart }: { weekStart: Date }) {
    const { data, isLoading, isError } = useFetch<{ data: WeekInsights }>(yourWeekPath(weekStart));
    const w = data?.data;
    const range = `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), "d MMM")}`;
    return (
        <section aria-label="Your week" data-your-week="" className="flex flex-col gap-3 p-3">
            <header className="flex items-baseline gap-2">
                <h2 className="text-ui font-semibold">Your week</h2>
                <span className="ml-auto text-meta tabular-nums text-ink-3">{range}</span>
            </header>
            {!w ? (
                <p className="h-[180px] text-ui-sm text-ink-3" data-your-week-state={isError ? "error" : "loading"}>
                    {isError && !isLoading ? "Your week couldn't load. Try again in a moment." : "Adding up your week…"}
                </p>
            ) : (
                <WeekBody w={w} />
            )}
        </section>
    );
}

function WeekBody({ w }: { w: WeekInsights }) {
    const parts = weekParts(w);
    const total = parts.reduce((s, p) => s + p.minutes, 0);
    const usual = usualWords(w);
    return (
        <>
            <div>
                <div className="flex items-baseline gap-2">
                    <span className="text-title-2 font-semibold tabular-nums" data-your-week-meetings="">
                        {hm(w.meeting_minutes)}
                    </span>
                    <span className="text-ui-sm text-ink-2">
                        in {w.meetings} {w.meetings === 1 ? "meeting" : "meetings"}
                    </span>
                </div>
                {usual ? <p className="text-meta text-ink-3">{usual}</p> : null}
            </div>
            {total > 0 ? (
                <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-hover" role="img" aria-label={parts.map((p) => `${p.label} ${hm(p.minutes)}`).join(", ")}>
                    {parts.map((p) => (
                        <span key={p.key} className={cn("h-full", p.hue ? `hue-${p.hue} bg-[var(--hue-a2)]` : "bg-ink-3/25")} style={{ width: `${(100 * p.minutes) / total}%` }} />
                    ))}
                </div>
            ) : (
                <p className="text-ui-sm text-ink-3">Nothing on your calendar this week.</p>
            )}
            <ul className="flex flex-col gap-1.5">
                {parts.map((p) => (
                    <li key={p.key} className="flex min-w-0 items-center gap-1.5 text-ui-sm" data-your-week-part={p.key}>
                        <Dot hue={p.hue} />
                        <span className="truncate text-ink-2">{p.label}</span>
                        <span className="ml-auto whitespace-nowrap tabular-nums text-ink">{hm(p.minutes)}</span>
                    </li>
                ))}
            </ul>
            <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-ui-sm">
                <div>
                    <dt className="text-meta text-ink-3">Average meeting</dt>
                    <dd className="tabular-nums">{w.meetings ? hm(w.average_meeting_minutes) : "—"}</dd>
                </div>
                <div>
                    <dt className="text-meta text-ink-3">To answer</dt>
                    <dd className="tabular-nums" data-your-week-to-answer="">
                        {w.to_answer ? `${w.to_answer} ${w.to_answer === 1 ? "invitation" : "invitations"}` : "None"}
                    </dd>
                </div>
                {w.away_minutes ? (
                    <div>
                        <dt className="text-meta text-ink-3">Away</dt>
                        <dd className="tabular-nums">{hm(w.away_minutes)}</dd>
                    </div>
                ) : null}
            </dl>
            {!w.has_hours ? <p className="text-meta text-ink-3">Set your working hours to see your free working time.</p> : null}
            {w.people.length ? (
                <div className="border-t border-line pt-3">
                    <h3 className="mb-1.5 text-meta font-medium text-ink-3">You meet most with</h3>
                    <ul className="flex flex-col gap-1">
                        {w.people.map((p) => (
                            <li key={p.user_uuid} className="flex min-w-0 items-center gap-2 text-ui-sm" data-your-week-person="">
                                <Dot hue={placeHue("person", p.user_uuid, { person: { user_uuid: p.user_uuid, user_full_name: p.name } }) ?? "sky"} />
                                <span className="truncate">{p.name || "Someone"}</span>
                                <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums text-ink-3">
                                    {hm(p.minutes)} · {p.meetings}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </>
    );
}

/** A dot in a hue, or in ink for free time. */
function Dot({ hue }: { hue?: string }) {
    return (
        <svg aria-hidden viewBox="0 0 8 8" className={cn("size-2 shrink-0", hue ? `hue-${hue} fill-[var(--hue-a2)]` : "fill-current text-ink-3")}>
            <circle cx="4" cy="4" r="4" />
        </svg>
    );
}

export default YourWeekPanel;
