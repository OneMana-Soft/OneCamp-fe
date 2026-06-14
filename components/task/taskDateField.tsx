"use client"
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

type DateFieldProps = {
    isAdmin: boolean
    label: string
    value?: Date
    onSelect: (d: Date | undefined) => void
    onClear?: () => void
    className?: string
    compact?: boolean // when true, renders inline control without outer grid/label
    /** Notifies the parent when the picker opens/closes (e.g. to pin a
        hover-revealed action row so it doesn't fade while picking). */
    onOpenChange?: (open: boolean) => void
}

export function DateField({ isAdmin, label, value, onSelect, onClear, className, compact = false, onOpenChange }: DateFieldProps) {
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

    const { isMobile } = useMedia()
    const [open, setOpenState] = useState(false)
    // Wrap setOpen so the parent is always notified of open/close transitions.
    const setOpen = (next: boolean) => {
        setOpenState(next)
        onOpenChange?.(next)
    }

    const TriggerButton = (
        <Button
            variant={compact ? "outline" : "ghost"}
            className={cn(
                compact ? "h-8 px-2 text-xs" : "md:-ml-4 text-left font-normal",
                !value && "text-muted-foreground",
                className
            )}
            disabled={!isAdmin}
        >
            {value ? format(value, "dd MMM") : <span>{label}</span>}
            <CalIcon className={cn("ml-2 h-4 w-4", compact && "ml-1 h-3 w-3")} />
        </Button>
    )

    const PickerContent = (
        <>
            <div className="flex items-center justify-between gap-4 font-medium border-b p-2">
                <div className='text-xs'>
                    {label}
                </div>
                <Input
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

            <Calendar
                mode="single"
                selected={value}
                onSelect={(date) => {
                    onSelect(date)
                    if (isMobile) setOpen(false)
                }}
                initialFocus
                captionLayout="dropdown-buttons"
                fromYear={1960}
                toYear={2030}
                className={cn("p-3", isMobile && "w-full flex justify-center")}
                classNames={{
                    caption_dropdowns: "flex justify-center gap-1",
                    caption_label: "hidden",
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
                            if (isMobile) setOpen(false)
                        }}
                        disabled={!isAdmin}
                    >
                        Clear
                    </Button>
                </div>
            )}
        </>
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

    if (compact) return Control

    return (
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-1 sm:gap-0 sm:items-center mb-2">
            <div className="sm:col-span-1">
                <span className="text-xs capitalize text-muted-foreground sm:text-foreground">{label}</span>
            </div>
            <div className="sm:col-span-5">{Control}</div>
        </div>
    )
}
