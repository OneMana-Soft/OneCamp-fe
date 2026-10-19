"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomRepeatSheet } from "@/components/calendar/repeat/customRepeatSheet";
import { customFor, customRule, describeCustom, parseCustom, presetOf, repeatPresets } from "@/lib/calendar/repeat";

const CURRENT = "current";
const CUSTOM = "custom";

/**
 * How an event repeats (PROGRAM.md D-CAL-7): the presets phrased from its
 * start ("Weekly on Tuesday"), the rule it has when it is none of them (in
 * the server's words when it came from elsewhere, and kept unless changed),
 * and Custom…, which opens the sheet. Changes are a rule ("" for none).
 */
export function RepeatControl({
    id,
    start,
    rule,
    text,
    onChange,
    disabled,
}: {
    id?: string;
    start: Date;
    rule: string;
    /** The server's words for rule, when it has them. */
    text?: string;
    onChange: (rule: string) => void;
    disabled?: boolean;
}) {
    const [sheet, setSheet] = useState(false);
    const presets = repeatPresets(start);
    const preset = presetOf(rule, start);
    const editable = parseCustom(rule, start);
    const current = rule && !preset ? text || (editable ? describeCustom(editable, start) : rule) : "";
    const value = preset ? preset.key : current ? CURRENT : "none";
    return (
        <>
            <Select
                value={value}
                disabled={disabled}
                onValueChange={(v) => {
                    if (v === CUSTOM) setSheet(true);
                    else if (v !== CURRENT) onChange(presets.find((p) => p.key === v)?.rule ?? "");
                }}
            >
                <SelectTrigger id={id} aria-label="Repeat" data-repeat-control="">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {presets.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                            {p.label}
                        </SelectItem>
                    ))}
                    {current ? <SelectItem value={CURRENT}>{current}</SelectItem> : null}
                    <SelectSeparator />
                    <SelectItem value={CUSTOM}>Custom…</SelectItem>
                </SelectContent>
            </Select>
            {sheet ? (
                <CustomRepeatSheet
                    start={start}
                    initial={editable ?? customFor(start)}
                    onCancel={() => setSheet(false)}
                    onDone={(c) => {
                        setSheet(false);
                        onChange(customRule(c, start));
                    }}
                />
            ) : null}
        </>
    );
}
