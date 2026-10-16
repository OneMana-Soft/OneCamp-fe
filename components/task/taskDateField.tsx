"use client"
import { shortDate } from "@/lib/utils/date/shortDate"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Calendar as CalIcon } from "lucide-react";
import { cn } from "@/lib/utils/helpers/cn"
import { format, parse, isValid } from "date-fns"
import { Input } from "@/components/ui/input"
import { useEffect, useState } from "react"
import { useMedia } from "@/context/MediaQueryContext"
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
} from "@/components/ui/drawer"
import { inlineAffordance, inlineValue } from "@/lib/ui/fieldRow"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"

/** The quick days above the calendar. */
const QUICK_DAYS: { label: string; days: number | null }[] = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
    { label: "No date", days: null },
]

function addDaysFromToday(days: number): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + days)
    return d
}

type DateFieldProps = {
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

export function DateField({ isAdmin, label, value, onSelect, onClear, className, compact = false, bare = false, emptyText, onOpenChange }: DateFieldProps) {
    const { isMobile } = useMedia()
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

    const PickerContent = (
        <DatePickerPanel
            label={label}
            value={value}
            isAdmin={isAdmin}
            onSelect={onSelect}
            onClear={onClear}
            onClose={() => setOpen(false)}
            closeOnPick={isMobile}
        />
    )

    const Control = (
        <div className="relative w-fit">
            {isMobile ? (
                <Drawer open={open} onOpenChange={setOpen}>
                    <DrawerTrigger asChild>
                        {TriggerButton}
                    </DrawerTrigger>
                    <DrawerContent>
                        <DrawerTitle className="sr-only">{label}</DrawerTitle>
                        <div className="mt-4 border-t pt-4 pb-4 flex flex-col items-center">
                            {PickerContent}
                        </div>
                    </DrawerContent>
                </Drawer>
            ) : (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        {TriggerButton}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        {PickerContent}
                    </PopoverContent>
                </Popover>
            )}
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

/**
 * The date picker itself: a typed date, the quick days, the calendar and
 * Clear. DateField puts it in a popover (a sheet on a phone); a list's bulk
 * bar sets many tasks' due date with it.
 */
export function DatePickerPanel({
    label,
    value,
    isAdmin,
    onSelect,
    onClear,
    onClose,
    closeOnPick = false,
}: {
    label: string
    value?: Date
    isAdmin: boolean
    onSelect: (d: Date | undefined) => void
    onClear?: () => void
    /** Closes whatever holds it, after a quick day. */
    onClose: () => void
    /** Closes after a day or Clear too (a phone's sheet, or one choice for many tasks). */
    closeOnPick?: boolean
}) {
    const { isMobile } = useMedia()
    const [inputValue, setInputValue] = useState<string>(value ? format(value, "dd/MM/yyyy") : "")

    useEffect(() => {
        setInputValue(value ? format(value, "dd/MM/yyyy") : "")
    }, [value])

    function commitInput(val: string) {
        const trimmed = val.trim()
        if (!trimmed) {
            if (onClear) onClear(); else onSelect(undefined)
            return
        }
        const formats = ["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy", "dd MMM yyyy", "MMM d, yyyy"]
        for (const fmt of formats) {
            const parsed = parse(trimmed, fmt, new Date())
            if (isValid(parsed)) {
                onSelect(parsed)
                return
            }
        }
        const fallback = new Date(trimmed)
        if (isValid(fallback)) {
            onSelect(fallback)
        }
    }

    return (
        <>
            <div className="flex items-center justify-between gap-4 font-medium border-b p-2">
                <div className='text-xs'>
                    {label}
                </div>
                <Input dense
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={(e) => commitInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault()
                            commitInput((e.target as HTMLInputElement).value)
                        }
                    }}
                    placeholder="dd/MM/yyyy"
                    className="h-8 w-[180px] text-xs"
                    disabled={!isAdmin}
                />

            </div>

            {/* Quick days first (work.md W29): the dates people pick most. */}
            {isAdmin && (
                <div className="flex flex-wrap gap-1 border-b p-2">
                    {QUICK_DAYS.map((q) => (
                        <button
                            key={q.label}
                            type="button"
                            className="chip h-6 cursor-pointer transition-colors hover:bg-press hover:text-foreground"
                            onClick={() => {
                                const d = q.days === null ? undefined : addDaysFromToday(q.days)
                                if (d) onSelect(d)
                                else if (onClear) onClear()
                                else onSelect(undefined)
                                onClose()
                            }}
                        >
                            {q.label}
                        </button>
                    ))}
                </div>
            )}

            <Calendar
                mode="single"
                selected={value}
                onSelect={(date) => {
                    onSelect(date)
                    if (closeOnPick) onClose()
                }}
                initialFocus
                captionLayout="dropdown-buttons"
                fromYear={1960}
                toYear={2030}
                className={cn("p-3", isMobile && "w-full flex justify-center")}
                classNames={{
                    caption_dropdowns: "flex justify-center gap-1",
                    caption_label: "hidden",
                    // Today is a brand ring; the chosen day a brand fill (W29).
                    day_today: "ring-[1.5px] ring-inset ring-brand font-[510] text-foreground",
                    day_selected: "bg-brand text-brand-foreground hover:bg-brand hover:text-brand-foreground focus:bg-brand focus:text-brand-foreground",
                    ...(isMobile ? {
                        months: "w-full flex flex-col space-y-4 sm:space-x-4 sm:space-y-0",
                        month: "space-y-4 w-full",
                        table: "w-full border-collapse space-y-1",
                        head_row: "flex w-full justify-between",
                        row: "flex w-full mt-2 justify-between",
                        cell: "text-center flex-1 p-0 relative focus-within:relative [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                        head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem]",
                        day: "h-9 w-full p-0 font-normal aria-selected:opacity-100",
                    } : {})
                }}
            />
            {isAdmin && (
                <div className="flex items-center justify-end gap-2 border-t p-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                            if (onClear) {
                                onClear()
                            } else {
                                onSelect(undefined)
                            }
                            if (closeOnPick) onClose()
                        }}
                        disabled={!isAdmin}
                    >
                        Clear
                    </Button>
                </div>
            )}
        </>
    )
}
