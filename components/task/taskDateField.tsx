"use client"
import { shortDate } from "@/lib/utils/date/shortDate"
import { Button } from "@/components/ui/button"
import { Calendar as CalIcon } from "lucide-react";
import { cn } from "@/lib/utils/helpers/cn"
import { useState } from "react"
import { DatePicker } from "@/components/ui/date-field"
import { inlineAffordance, inlineValue } from "@/lib/ui/fieldRow"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"

type DatePropertyProps = {
    isAdmin: boolean
    label: string
    value?: Date
    onSelect: (d: Date | undefined) => void
    onClear?: () => void
    className?: string
    compact?: boolean // when true, renders inline control without outer grid/label
    /** Inline and borderless, for a value written inside a property row ("8 Oct → 10 Oct"). */
    bare?: boolean
    /** What a bare trigger says with no date. */
    emptyText?: string
    /** Notifies the parent when the picker opens/closes (e.g. to pin a
        hover-revealed action row so it doesn't fade while picking). */
    onOpenChange?: (open: boolean) => void
}

/**
 * A date as a property: a task's Start and Due, a field of the date kind, a
 * goal's dates, a memory's due. Its row (its label beside it), `bare` inside
 * another row's words, or `compact` in a dialog. Each opens the one date
 * picker (components/ui/date-field's DatePicker: a typed date, the quick
 * days, the month and Clear, in a popover or a phone's sheet), the one a
 * form's DateField opens.
 */
export function DateProperty({ isAdmin, label, value, onSelect, onClear, className, compact = false, bare = false, emptyText, onOpenChange }: DatePropertyProps) {
    const [open, setOpenState] = useState(false)
    // Wrap setOpen so the parent is always notified of open/close transitions.
    const setOpen = (next: boolean) => {
        setOpenState(next)
        onOpenChange?.(next)
    }

    const TriggerButton = bare ? (
        <button
            type="button"
            aria-label={`${label}: ${value ? shortDate(value) : "none"}`}
            // 24px tall: a finger's 44px (app/phone.css F3; PTC-14, the task
            // page's dates were 55 by 24).
            data-touch-target=""
            className={cn(
                "-mx-1 inline-flex h-6 items-center rounded-sm px-1 text-sm font-[450] tabular-nums transition-colors hover:bg-hover disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-ring",
                value ? "text-foreground" : "text-ink-3",
                className,
            )}
            disabled={!isAdmin}
        >
            {value ? shortDate(value) : emptyText ?? label}
        </button>
    ) : (
        <Button
            variant={compact ? "outline" : "ghost"}
            // Named with its label in every form: a compact one in a dialog
            // (a goal's dates) read only "31 Dec".
            aria-label={`${label}: ${value ? shortDate(value) : "none"}`}
            className={cn(
                compact ? "h-8 px-2 text-xs" : cn(inlineValue, "tabular-nums"),
                !value && "text-muted-foreground",
                className
            )}
            disabled={!isAdmin}
        >
            {value ? shortDate(value) : <span>{compact ? label : isAdmin ? `Add ${label.toLowerCase()}` : "None"}</span>}
            <CalIcon aria-hidden className={compact ? "ml-1 h-3 w-3" : cn(inlineAffordance, "h-3.5 w-3.5")} />
        </Button>
    )

    const Control = (
        <div className="relative w-fit">
            <DatePicker
                trigger={TriggerButton}
                label={label}
                open={open}
                onOpenChange={setOpen}
                value={value}
                clearable={isAdmin}
                onPick={(d) => {
                    if (d) onSelect(d)
                    else if (onClear) onClear()
                    else onSelect(undefined)
                }}
            />
        </div>
    )

    // Bare (the panel's Dates row) is its own row's value: no row of its own,
    // or Dates nested a second label column ("Start date 9 Oct") inside the
    // first and wrapped "9 / Oct" on the task page.
    if (compact || bare) return Control

    return (
        <div className={propertyRow()} data-field-empty={value ? undefined : ""}>
            <div>
                <span className={propertyLabel}>{label}</span>
            </div>
            <div className="min-w-0">{Control}</div>
        </div>
    )
}
