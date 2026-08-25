"use client"

/**
 * DataInventoryButton — "where does this person's data live?", per user.
 *
 * Answering a subject access request or an erasure request starts with that
 * question, and until now it could only be answered by reading the schema by
 * hand across more than forty tables.
 *
 * LAZY ON PURPOSE. The endpoint runs one COUNT per user-referencing column, and
 * there are 47 of them. That is fine when an admin asks and wrong on every render
 * of the user list, so nothing is fetched until the dialog is opened.
 *
 * Self-contained, like ChannelWeeklyReportSetting: it owns its trigger, its
 * dialog and its request, so adding it to a row costs one line and no new props
 * threaded through the page.
 */

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Database, Loader2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
    getPersonalDataInventory,
    type PersonalDataInventory,
} from "@/services/dataSubjectService"

interface Props {
    userUUID: string
    /** Shown in the dialog title so an admin knows whose data they are looking at. */
    displayName: string
}

export const DataInventoryButton: React.FC<Props> = ({ userUUID, displayName }) => {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [inventory, setInventory] = useState<PersonalDataInventory | null>(null)
    const { toast } = useToast()

    const load = async () => {
        setLoading(true)
        try {
            setInventory((await getPersonalDataInventory(userUUID)) ?? null)
        } catch (e: unknown) {
            toast({
                title: "Could not build the inventory",
                description: apiErrorMessage(e, "failed"),
                variant: "destructive",
            })
            setOpen(false)
        } finally {
            setLoading(false)
        }
    }

    const onOpenChange = (next: boolean) => {
        setOpen(next)
        // Fetch on open, and again on re-open: rows change, and a stale count is
        // worse than a slow one when it is being used as evidence.
        if (next) void load()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label={`Show where data for ${displayName} is stored`}
                        >
                            <Database className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Where this person&apos;s data is stored</TooltipContent>
            </Tooltip>

            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-start">Stored data for {displayName}</DialogTitle>
                    <DialogDescription className="text-start">
                        Every table holding rows for this person, with a count each.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Counting rows across every table…
                    </div>
                ) : !inventory ? null : inventory.locations.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">
                        No stored rows were found for this person.
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground tabular-nums">
                                {inventory.total_rows}
                            </span>{" "}
                            row{inventory.total_rows === 1 ? "" : "s"} across{" "}
                            <span className="font-medium text-foreground tabular-nums">
                                {inventory.locations.length}
                            </span>{" "}
                            location{inventory.locations.length === 1 ? "" : "s"}.
                        </p>

                        <div className="max-h-[52vh] overflow-auto rounded-lg border border-border">
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Table</th>
                                        <th className="px-3 py-2 text-left font-medium">Column</th>
                                        <th className="px-3 py-2 text-right font-medium">Rows</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.locations.map((l) => (
                                        <tr key={`${l.table}.${l.column}`} className="border-t border-border/60">
                                            <td className="px-3 py-1.5 font-mono text-xs">{l.table}</td>
                                            <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                                                {l.column}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{l.rows}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* The backend says plainly that counts are not a subject access
                            response. Repeating it here is the point: the person reading
                            this screen is the one who would otherwise assume it was. */}
                        {inventory.note && (
                            <p className="text-xs text-muted-foreground">{inventory.note}</p>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

export default DataInventoryButton
