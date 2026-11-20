"use client"

import { useState, useSyncExternalStore, type KeyboardEvent } from "react"
import type { TranscriptLine } from "@/types/transcriptLine"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { downloadFrom } from "@/lib/utils/download"
import { withItsWords } from "@/lib/utils/downloadRefusal"
import { fieldKeyDown } from "@/lib/keys/ime"
import { useSheetMode } from "@/components/ui/overlayMode"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { formatDateForAttachment } from "@/lib/utils/date/formatDateforAttachment"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { FileText, LoaderCircle } from "@/lib/icons"
import {
    TRANSCRIPT_FORMATS,
    correctedMark,
    correctionPath,
    correctionRefusal,
    exportFailure,
    exportUrl,
    maySave,
    type TranscriptFormat,
} from "@/lib/calls/transcriptCorrect"

/*
 * A call's transcript, exported and corrected, in the player's transcript
 * panel (zoom-05). What to offer and what to say is lib/calls/transcriptCorrect's;
 * the server decides every access, and a refusal says so in plain words.
 */

/**
 * A finger's size: 44 px on a phone and on any screen without hover (a touch
 * tablet), as the player's pencil is; a mouse keeps the compact size.
 */
const FINGER = "max-md:min-h-11 [@media(hover:none)]:min-h-11"

/** Whether the app can reach the server, as the offline notice says it. */
function useOffline(): boolean {
    return useSyncExternalStore(subscribeConnectivity, isAppOffline, () => false)
}

/**
 * Export: the panel's own read asked for a file, saved under the name the
 * server gives it. The house's menu, which is an action sheet on a phone.
 * Its button and, after a failure, the failure's own full-width row: the
 * panel's header wraps (flex-wrap), so the sentence is never cut beside the
 * heading.
 */
export function TranscriptExport({ source, fileName }: { source: string; fileName: string }) {
    const offline = useOffline()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState<TranscriptFormat | null>(null)
    const [failure, setFailure] = useState<{ words: string; retry: boolean; format: TranscriptFormat } | null>(null)
    const base = fileName.replace(/\.[^.\s]+$/, "").trim() || "Transcript"

    const run = async (format: TranscriptFormat) => {
        if (busy) return
        setBusy(format)
        setFailure(null)
        try {
            await downloadFrom(exportUrl(source, format), `${base}.${format}`).catch(withItsWords)
            setOpen(false)
        } catch (error) {
            setOpen(false)
            setFailure({ ...exportFailure(error), format })
        } finally {
            setBusy(null)
        }
    }

    return (
        <>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className={cn("h-7 gap-1.5 px-2 text-ui-sm font-normal", FINGER)}>
                        <FileText className="size-4" aria-hidden />
                        Export
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" aria-label="Export the transcript">
                    {TRANSCRIPT_FORMATS.map(({ format, label }) => (
                        <DropdownMenuItem
                            key={format}
                            disabled={offline || (busy !== null && busy !== format)}
                            aria-busy={busy === format || undefined}
                            onSelect={(event) => {
                                // The menu stays open, its row busy, until the file is saved.
                                event.preventDefault()
                                void run(format)
                            }}
                        >
                            {busy === format ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                            {label}
                        </DropdownMenuItem>
                    ))}
                    {offline ? <p className="px-2 py-1.5 text-ui-sm text-muted-foreground">You&apos;re offline</p> : null}
                </DropdownMenuContent>
            </DropdownMenu>
            {failure ? (
                <div role="alert" className="flex basis-full flex-wrap items-center gap-x-1.5 text-ui-sm font-normal text-danger-ink">
                    <span>{failure.words}</span>
                    {failure.retry ? (
                        // A finger's size under a finger, as the Export beside it.
                        <Button type="button" variant="link" size="sm" className={cn("h-auto p-0 text-ui-sm", FINGER)} onClick={() => void run(failure.format)}>
                            Try again
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </>
    )
}

/**
 * A line's correction: in place at 1280, a drawer with its footer pinned on a
 * phone. Sends the words and the words it changes (`was`); a line changed
 * first comes back with the server's sentence, its new words shown and the
 * draft kept, and the next Save goes against those words.
 */
export function LineCorrection({
    egressId,
    line,
    speaker,
    at,
    onSaved,
    onClose,
}: {
    egressId: string
    line: TranscriptLine
    speaker: string
    at: string
    onSaved: (line: TranscriptLine) => void
    onClose: () => void
}) {
    const offline = useOffline()
    // A phone's editor is a drawer, chosen as every sheet is (components/ui/overlayMode).
    const phone = useSheetMode()
    const [draft, setDraft] = useState(line.transcript_text)
    const [was, setWas] = useState(line.transcript_text)
    const [now, setNow] = useState<string | null>(null)
    const [refusal, setRefusal] = useState("")
    const [saving, setSaving] = useState(false)
    const ready = maySave(draft, was, offline) && !saving

    const save = async () => {
        if (!ready || !line.uid) return
        setSaving(true)
        setRefusal("")
        try {
            const res = await axiosInstance.patch<{ line: TranscriptLine }>(correctionPath(egressId, line.uid), { text: draft.trim(), was }, OWN_ERRORS)
            onSaved({ ...line, ...res.data.line })
        } catch (error) {
            const refused = correctionRefusal(error)
            setRefusal(refused.words)
            if (refused.line) {
                // The new words once: the sentence's, or "Now:" where it doesn't say them.
                setNow(refused.now ?? null)
                setWas(refused.line.transcript_text)
            }
        } finally {
            setSaving(false)
        }
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Escape") {
            // The player's own Escape closes the player: this one only leaves the line.
            event.stopPropagation()
            event.preventDefault()
            onClose()
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
        }
    }

    const body = (
        <>
            <textarea
                aria-label="Correct this line"
                value={draft}
                autoFocus
                rows={phone ? 5 : 3}
                onChange={(event) => setDraft(event.target.value)}
                // Its Esc leaves the line, not the player: the one Escape leaves the press here (lib/keys/escape).
                data-escape-own=""
                // An input method's Enter or Escape picks or drops a word, never saves or leaves (lib/keys/ime).
                onKeyDown={fieldKeyDown(onKeyDown)}
                onClick={(event) => event.stopPropagation()}
                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:text-base"
            />
            {now !== null ? <p className="text-ui-sm text-muted-foreground">Now: {now}</p> : null}
            {refusal ? <p role="alert" className="text-ui-sm text-danger-ink">{refusal}</p> : null}
            {offline ? <p className="text-ui-sm text-muted-foreground">You&apos;re offline</p> : null}
        </>
    )
    const buttons = (
        <>
            <Button type="button" variant="ghost" size="sm" className="max-md:h-11 max-md:flex-1" onClick={onClose}>
                Cancel
            </Button>
            <Button type="button" size="sm" className="max-md:h-11 max-md:flex-1" disabled={!ready} onClick={() => void save()}>
                {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Save
            </Button>
        </>
    )

    if (phone) {
        return (
            <Drawer open onOpenChange={(next) => (next ? undefined : onClose())}>
                <DrawerContent data-line-editor="">
                    <DrawerHeader className="text-left">
                        <DrawerTitle>Correct this line</DrawerTitle>
                        <DrawerDescription>
                            {speaker} · {at}
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4">{body}</div>
                    <DrawerFooter className="flex shrink-0 flex-row gap-2">{buttons}</DrawerFooter>
                </DrawerContent>
            </Drawer>
        )
    }
    return (
        <div className="flex flex-col gap-1.5" data-line-editor="" onClick={(event) => event.stopPropagation()}>
            {body}
            <div className="flex justify-end gap-2">{buttons}</div>
        </div>
    )
}

/**
 * A corrected line's mark. What was said always shows under the line, muted
 * and labelled; hover (a mouse) or a tap on "Corrected" adds who changed it
 * when, under it rather than over it.
 */
export function CorrectedMark({ line }: { line: TranscriptLine }) {
    const [open, setOpen] = useState(false)
    const mark = correctedMark(line, formatDateForAttachment)
    if (!mark) return null
    return (
        <div className="flex flex-col items-start gap-0.5" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <p className="text-ui-sm text-muted-foreground [overflow-wrap:anywhere]">{mark.said}</p>
            <button
                type="button"
                aria-expanded={open}
                onClick={(event) => {
                    event.stopPropagation()
                    setOpen(!open)
                }}
                className={cn("rounded-sm text-2xs font-medium text-ink-3 underline decoration-dotted underline-offset-2 hover:text-foreground", FINGER, "max-md:py-3")}
            >
                Corrected
            </button>
            {open ? <p className="text-ui-sm text-muted-foreground">{mark.by}</p> : null}
        </div>
    )
}
