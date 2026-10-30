"use client";

import { type RefObject } from "react";
import type { Day } from "date-fns";
import { Copy, Printer } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { OverlayBody, OverlayFooter } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmentedControl";
import { choose, useCalendarChoices, type ViewChoices } from "@/lib/calendar/choices";
import type { CalendarSpan } from "@/lib/calendar/route";
import { copyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils/helpers/cn";
import { YourWeekPanel } from "@/components/calendar/yourWeek/yourWeekPanel";

/**
 * How the calendar's views are laid out (B1, gcal-2): Google's custom view
 * and its view settings in one place by the view switch, and on a phone in
 * the calendar options. Each choice is kept on this device in the calendar's
 * one store (lib/calendar/choices), and every view follows it at once.
 */

const setView = (patch: Partial<ViewChoices>) => choose((c) => ({ view: { ...c.view, ...patch } }));
const DAYS = ["2d", "3d", "4d", "5d", "6d", "7d"] as const;
const WEEKS = ["2w", "3w", "4w"] as const;
const STARTS = [
    { value: "1", label: "Monday" },
    { value: "0", label: "Sunday" },
    { value: "6", label: "Saturday" },
];
const DENSITIES: { value: ViewChoices["density"]; label: string; title: string }[] = [
    { value: "comfortable", label: "Roomy", title: "Roomy: comfortable hours" },
    { value: "compact", label: "Compact", title: "Compact: more of the day in view" },
    { value: "fit", label: "Fit", title: "Fit my hours: the working day fills the screen" },
];

function Row({ label, children, phone }: { label: string; children: React.ReactNode; phone?: boolean }) {
    return (
        <div className={cn("flex items-center justify-between gap-3 px-3", phone ? "min-h-11" : "min-h-9")}>
            <span className="text-ui-sm text-ink">{label}</span>
            {children}
        </div>
    );
}

/** The layout's choices: the hour's height, the weekend, week numbers and the week's first day. */
export function ViewOptionRows({ phone }: { phone?: boolean }) {
    const { view } = useCalendarChoices();
    return (
        <div className="flex flex-col py-1" data-view-option-rows="">
            <Row label="Density" phone={phone}>
                <SegmentedControl value={view.density} onValueChange={(density) => setView({ density })} options={DENSITIES} aria-label="Density" />
            </Row>
            <Row label="Show weekends" phone={phone}>
                <Switch checked={view.weekends} onCheckedChange={(on) => setView({ weekends: on })} aria-label="Show weekends" />
            </Row>
            <Row label="Week numbers" phone={phone}>
                <Switch checked={view.weekNumbers} onCheckedChange={(on) => setView({ weekNumbers: on })} aria-label="Week numbers" />
            </Row>
            <Row label="Week starts on" phone={phone}>
                <SegmentedControl
                    value={String(view.weekStartsOn)}
                    onValueChange={(v) => setView({ weekStartsOn: Number(v) as Day })}
                    options={STARTS.map((s) => ({ ...s, label: s.label.slice(0, 3), title: s.label }))}
                    aria-label="Week starts on"
                />
            </Row>
        </div>
    );
}

/**
 * The view switch's options: a custom view's length (choosing one shows it),
 * the layout's choices, a link to this view to send, and Print (the view as
 * drawn, alone on the page: calendar.css). Your week leads them while its
 * button has given its room to the period's title (`withWeek`, which the
 * calendar decides at open). The choices are the body
 * that scrolls when the window is short, and the link and Print stay in view
 * under it (components/ui/overlay, V-43b's design review).
 */
export function ViewOptions({ span, onSpan, link, onPrint, week, withWeek = false }: { span: CalendarSpan; onSpan: () => void; link: () => string; onPrint: () => void; week?: RefObject<Date>; withWeek?: boolean }) {
    const pick = (s: CalendarSpan) => {
        setView({ span: s });
        onSpan();
    };
    const lengths = (label: string, spans: readonly CalendarSpan[]) => (
        <Row label={label}>
            <SegmentedControl value={span} onValueChange={pick} options={spans.map((s) => ({ value: s, label: s[0], title: `${s[0]} ${label.toLowerCase()}` }))} aria-label={`Custom view in ${label.toLowerCase()}`} />
        </Row>
    );
    return (
        <div className="flex flex-col" data-view-options="">
            <OverlayBody className="m-0 p-0">
                {withWeek && week ? (
                    <div className="border-b border-line">
                        <YourWeekPanel weekStart={week.current} />
                    </div>
                ) : null}
                <p className="px-3 pb-0.5 pt-2.5 text-meta font-medium text-ink-3">Custom view</p>
                {lengths("Days", DAYS)}
                {lengths("Weeks", WEEKS)}
                <p className="mt-1 border-t border-line px-3 pb-0.5 pt-2.5 text-meta font-medium text-ink-3">Layout</p>
                <ViewOptionRows />
            </OverlayBody>
            <OverlayFooter className="flex gap-2 border-t border-line p-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => void copyToClipboard(link(), "A link to this view")}>
                    <Copy />
                    Copy link to this view
                </Button>
                <Button variant="secondary" size="sm" onClick={onPrint}>
                    <Printer />
                    Print
                </Button>
            </OverlayFooter>
        </div>
    );
}
