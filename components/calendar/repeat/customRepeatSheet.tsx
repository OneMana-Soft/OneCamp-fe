"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    MAX_COUNT,
    WEEK,
    dayName,
    describeCustom,
    placeInMonth,
    weekdayOf,
    type CustomRepeat,
    type Freq,
    type RepeatEnd,
    type Weekday,
} from "@/lib/calendar/repeat";

const UNITS: { value: Freq; one: string; many: string }[] = [
    { value: "DAILY", one: "day", many: "days" },
    { value: "WEEKLY", one: "week", many: "weeks" },
    { value: "MONTHLY", one: "month", many: "months" },
    { value: "YEARLY", one: "year", many: "years" },
];

const PLACE = ["first", "second", "third", "fourth"];

/**
 * The custom repeat sheet (PROGRAM.md D-CAL-7): every so many days, weeks,
 * months or years, on which days, until when, with the sentence the event
 * will say ("Every 2 weeks on Tuesday and Thursday, until 18 December 2026")
 * as it is set.
 */
export function CustomRepeatSheet({
    start,
    initial,
    onDone,
    onCancel,
}: {
    start: Date;
    initial: CustomRepeat;
    onDone: (c: CustomRepeat) => void;
    onCancel: () => void;
}) {
    const [c, setC] = useState<CustomRepeat>(initial);
    const set = (patch: Partial<CustomRepeat>) => setC((prev) => ({ ...prev, ...patch }));
    const place = placeInMonth(start);
    const startDay = weekdayOf(start);
    const endDate = c.end.kind === "on" ? c.end.date : format(start, "yyyy-MM-dd");
    const endCount = c.end.kind === "after" ? c.end.count : 10;
    const setEnd = (end: RepeatEnd) => set({ end });
    const valid = c.interval >= 1 && (c.end.kind !== "on" || c.end.date >= format(start, "yyyy-MM-dd"));

    return (
        <Dialog open onOpenChange={(open) => !open && onCancel()}>
            <DialogContent size="sm" data-custom-repeat="">
                <DialogHeader>
                    <DialogTitle>Custom repeat</DialogTitle>
                    <DialogDescription aria-live="polite" data-repeat-sentence="">
                        {describeCustom(c, start)}
                    </DialogDescription>
                </DialogHeader>
                <form
                    id="custom-repeat"
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (valid) onDone(c);
                    }}
                >
                    <div className="flex items-center gap-2">
                        <Label htmlFor="repeat-interval" className="shrink-0 font-normal">
                            Every
                        </Label>
                        <Input
                            id="repeat-interval"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={1000}
                            className="w-20"
                            value={c.interval}
                            onChange={(e) => set({ interval: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })}
                        />
                        <Select value={c.freq} onValueChange={(v) => set({ freq: v as Freq, days: c.days.length ? c.days : [startDay] })}>
                            <SelectTrigger aria-label="Repeat unit" className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {UNITS.map((u) => (
                                    <SelectItem key={u.value} value={u.value}>
                                        {c.interval === 1 ? u.one : u.many}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {c.freq === "WEEKLY" ? (
                        <div className="grid gap-2">
                            <span className="text-ui-sm text-ink-3">On</span>
                            <ToggleGroup
                                type="multiple"
                                variant="outline"
                                aria-label="Days of the week"
                                className="justify-start"
                                value={c.days}
                                onValueChange={(days) => set({ days: days.length ? (days as Weekday[]) : [startDay] })}
                            >
                                {WEEK.map((d) => (
                                    <ToggleGroupItem key={d} value={d} aria-label={dayName(d)} className="w-9">
                                        {dayName(d).slice(0, 1)}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>
                    ) : null}

                    {c.freq === "MONTHLY" ? (
                        <Select value={c.monthly} onValueChange={(v) => set({ monthly: v as CustomRepeat["monthly"] })}>
                            <SelectTrigger aria-label="Which day of the month">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date">On day {start.getDate()}</SelectItem>
                                <SelectItem value="place">
                                    On the {place === -1 ? "last" : PLACE[place - 1]} {dayName(startDay)}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}

                    <div className="grid gap-2">
                        <span className="text-ui-sm text-ink-3">Ends</span>
                        <RadioGroup
                            value={c.end.kind}
                            onValueChange={(kind) =>
                                setEnd(kind === "on" ? { kind: "on", date: endDate } : kind === "after" ? { kind: "after", count: endCount } : { kind: "never" })
                            }
                            aria-label="Ends"
                            className="gap-2.5"
                        >
                            <div className="flex h-8 items-center gap-2.5">
                                <RadioGroupItem value="never" id="repeat-never" />
                                <Label htmlFor="repeat-never" className="font-normal">
                                    Never
                                </Label>
                            </div>
                            <div className="flex h-8 items-center gap-2.5">
                                <RadioGroupItem value="on" id="repeat-on" />
                                <Label htmlFor="repeat-on" className="w-12 font-normal">
                                    On
                                </Label>
                                {/* The app's one date field (D14), with its sheet on a phone. */}
                                <DateField
                                    aria-label="Last date"
                                    className="w-40"
                                    min={format(start, "yyyy-MM-dd")}
                                    value={endDate}
                                    disabled={c.end.kind !== "on"}
                                    onChange={(date) => setEnd({ kind: "on", date })}
                                />
                            </div>
                            <div className="flex h-8 items-center gap-2.5">
                                <RadioGroupItem value="after" id="repeat-after" />
                                <Label htmlFor="repeat-after" className="w-12 font-normal">
                                    After
                                </Label>
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    aria-label="How many times"
                                    className="w-20"
                                    min={1}
                                    max={MAX_COUNT}
                                    value={endCount}
                                    disabled={c.end.kind !== "after"}
                                    onChange={(e) => setEnd({ kind: "after", count: Math.max(1, Math.min(MAX_COUNT, Number(e.target.value) || 1)) })}
                                />
                                <span className="text-sm text-muted-foreground">{endCount === 1 ? "time" : "times"}</span>
                            </div>
                        </RadioGroup>
                    </div>
                </form>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" form="custom-repeat" disabled={!valid}>
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
