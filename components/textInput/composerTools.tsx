"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { Editor } from "@tiptap/react"
import { useDispatch } from "react-redux"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Tile } from "@/components/ui/graphics/Tile"
import { Spark } from "@/components/ui/graphics/motifs"
import { AtSign, ArrowUp, BarChart3, ChevronDown, Clock, ListTodo, Loader2, Mic, Paperclip, Plus, Square, Type, Upload, Video } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { openUI } from "@/store/slice/uiSlice"
import { chatClock } from "@/lib/chat/clock"
import { prefersReducedMotion } from "@/lib/celebrate"
import { toLocalInputValue } from "@/lib/messages/schedulePresets"

const ClipRecorder = dynamic(() => import("@/components/clips/ClipRecorder"), { ssr: false })

/** A tool in the composer's row (design v3 chat, C38): 28px, the icon 16px in ink-3. */
export const COMPOSER_TOOL =
    "size-7 rounded-md p-0 text-ink-3 hover:bg-hover hover:text-ink data-[state=open]:bg-press data-[state=open]:text-ink aria-pressed:bg-press aria-pressed:text-ink [&_svg]:size-4 [&_svg]:text-current"

/** An agent the "+" menu can ask, by its mention. */
export interface ComposerAgent {
    id: string
    name: string
}

/** Inserts a person or agent mention at the cursor, as the @ list would. */
export function insertMention(editor: Editor, agent: ComposerAgent) {
    editor
        .chain()
        .focus()
        .insertContent([
            { type: "mention", attrs: { id: agent.id, label: agent.name } },
            { type: "text", text: " " },
        ])
        .run()
}

// ─── The "+" menu (C42) ──────────────────────────────────────────────────

/**
 * "+" (C42): everything you can add to a message, upward from the button, on
 * the floating material. Each item has a 28px tile in its hue; asking an agent
 * and drafting with AI sit in the agent's tint (AI is the agent hue's only
 * use beyond an agent's identity).
 */
export const ComposerPlusMenu = React.memo(function ComposerPlusMenu({
    editor,
    onUpload,
    onRecordClip,
    onDictate,
    dictateLabel,
    agents,
    onDraftWithAI,
    triggerClassName,
}: {
    editor: Editor
    onUpload?: () => void
    onRecordClip?: () => void
    onDictate?: () => void
    dictateLabel?: string
    agents?: ComposerAgent[]
    onDraftWithAI?: () => void
    /** The trigger's look where a surface draws it (the phone's 36px circle). */
    triggerClassName?: string
}) {
    const dispatch = useDispatch()
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Add to the message" title="Add to the message" className={cn(COMPOSER_TOOL, triggerClassName)}>
                    <Plus aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="pop-surface w-60 p-1">
                {onUpload && (
                    <DropdownMenuItem onSelect={onUpload}>
                        <MenuTile><Upload /></MenuTile> Upload a file
                    </DropdownMenuItem>
                )}
                {onRecordClip && (
                    <DropdownMenuItem onSelect={onRecordClip}>
                        <MenuTile hue="berry"><Video /></MenuTile> Record a clip
                    </DropdownMenuItem>
                )}
                {onDictate && (
                    <DropdownMenuItem onSelect={onDictate}>
                        <MenuTile hue="lake"><Mic /></MenuTile> {dictateLabel || "Dictate"}
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => dispatch(openUI({ key: "createTask", data: {} }))}>
                    <MenuTile hue="moss"><ListTodo /></MenuTile> Create a task
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor.chain().focus().clearContent().insertContent("/poll ").run()}>
                    <MenuTile hue="sun"><BarChart3 /></MenuTile> Create a poll
                </DropdownMenuItem>
                {((agents && agents.length > 0) || onDraftWithAI) && <DropdownMenuSeparator />}
                {agents?.map((a) => (
                    <DropdownMenuItem key={a.id} onSelect={() => insertMention(editor, a)}>
                        <MenuTile agent><Spark size={14} /></MenuTile> Ask {a.name}…
                    </DropdownMenuItem>
                ))}
                {onDraftWithAI && (
                    <DropdownMenuItem onSelect={onDraftWithAI}>
                        <MenuTile agent><Spark size={14} /></MenuTile> Draft with AI
                        <DropdownMenuShortcut>⌘J</DropdownMenuShortcut>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
})

function MenuTile({ hue, agent, children }: { hue?: "berry" | "lake" | "moss" | "sun"; agent?: boolean; children: React.ReactNode }) {
    if (hue) return <Tile hue={hue} size="sm" className="!size-7 rounded-md">{children}</Tile>
    return (
        <span aria-hidden="true" className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md [&>svg]:size-3.5", agent ? "bg-agent-muted text-agent" : "bg-sunken text-ink-2")}>
            {children}
        </span>
    )
}

// ─── "@" (C38) ───────────────────────────────────────────────────────────

/** Starts a mention at the cursor: the list opens as if "@" were typed. */
export const MentionTool = React.memo(function MentionTool({ editor }: { editor: Editor }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Mention someone"
            title="Mention someone"
            className={COMPOSER_TOOL}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
                const { from } = editor.state.selection
                const before = from > 1 ? editor.state.doc.textBetween(from - 1, from) : ""
                editor.chain().focus().insertContent(before && !/\s/.test(before) ? " @" : "@").run()
            }}
        >
            <AtSign aria-hidden="true" />
        </Button>
    )
})

// ─── "Aa" (C40) ──────────────────────────────────────────────────────────

export const FormatToggle = React.memo(function FormatToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={open ? "Hide formatting" : "Show formatting"}
            title="Formatting"
            aria-pressed={open}
            className={COMPOSER_TOOL}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggle}
        >
            <Type aria-hidden="true" />
        </Button>
    )
})

// ─── Record (C46) ────────────────────────────────────────────────────────

/** How long a press on Record must last to start dictating at once. */
export const HOLD_TO_DICTATE_MS = 300

export interface Dictation {
    available: boolean
    recording: boolean
    transcribing: boolean
    busy: boolean
    label: string
    start: () => void
    stop: () => void
    toggle: () => void
    /** Stop, and keep nothing that was said. */
    cancel: () => void
}

const NO_DICTATION: Dictation = {
    available: false,
    recording: false,
    transcribing: false,
    busy: false,
    label: "Dictate",
    start: () => {},
    stop: () => {},
    toggle: () => {},
    cancel: () => {},
}

/**
 * Dictation into the message (C46). This edition has no speech engine, so
 * there is none: Record offers clips only, and the strip never shows.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useComposerDictation(_editor: Editor | null, _onError?: (m: string) => void): Dictation {
    return NO_DICTATION
}

/**
 * Record (C46): one control where there were two microphones. A click offers
 * "Record a clip" (voice, video or screen, up to 5 minutes) and "Dictate into
 * the message"; holding it 300ms starts dictating at once, push-to-talk, and
 * letting go stops.
 */
export const RecordTool = React.memo(function RecordTool({ onRecordClip, dictation, triggerClassName }: { onRecordClip?: () => void; dictation: Dictation; triggerClassName?: string }) {
    const [open, setOpen] = React.useState(false)
    const hold = React.useRef(0)
    const held = React.useRef(false)
    const canDictate = dictation.available
    if (!onRecordClip && !canDictate) return null
    return (
        <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Record"
                    title={canDictate ? "Record a clip or dictate (hold to dictate)" : "Record a clip"}
                    data-icon="mic"
                    className={cn(COMPOSER_TOOL, triggerClassName)}
                    onPointerDown={(e) => {
                        if (!canDictate || e.button !== 0) return
                        held.current = false
                        hold.current = window.setTimeout(() => {
                            held.current = true
                            setOpen(false)
                            dictation.start()
                        }, HOLD_TO_DICTATE_MS)
                    }}
                    onPointerUp={() => {
                        window.clearTimeout(hold.current)
                        if (held.current) dictation.stop()
                    }}
                    onPointerLeave={() => window.clearTimeout(hold.current)}
                    onClick={(e) => {
                        // A hold was push-to-talk, not a click on the menu.
                        if (held.current) {
                            e.preventDefault()
                            held.current = false
                        }
                    }}
                >
                    <Mic aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="pop-surface w-64 p-1">
                {onRecordClip && (
                    <DropdownMenuItem onSelect={onRecordClip} className="h-auto py-1.5">
                        <MenuTile hue="berry"><Video /></MenuTile>
                        <span>
                            <span className="block text-ui-sm text-ink">Record a clip</span>
                            <span className="block text-meta text-ink-3">Voice, video or screen, up to 5 min</span>
                        </span>
                    </DropdownMenuItem>
                )}
                {canDictate && (
                    <DropdownMenuItem onSelect={dictation.toggle} disabled={dictation.busy} className="h-auto py-1.5">
                        <MenuTile hue="lake"><Mic /></MenuTile>
                        <span>
                            <span className="block text-ui-sm text-ink">{dictation.label === "Dictate" ? "Dictate into the message" : dictation.label}</span>
                            <span className="block text-meta text-ink-3">Or hold the button to talk</span>
                        </span>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
})

/** While dictating, the tool row is this live strip (C46). */
export function DictationStrip({ dictation }: { dictation: Dictation }) {
    const [seconds, setSeconds] = React.useState(0)
    React.useEffect(() => {
        if (!dictation.recording) return
        setSeconds(0)
        const t = window.setInterval(() => setSeconds((s) => s + 1), 1000)
        return () => window.clearInterval(t)
    }, [dictation.recording])
    const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    return (
        <div data-dictation-strip="" className="flex min-w-0 flex-1 animate-fade-in items-center gap-2" role="status">
            <span className="hue-lake inline-flex h-7 items-center gap-2 rounded-lg bg-hue-tint px-2.5 text-ui-sm font-medium text-hue-ink">
                {dictation.transcribing ? (
                    <>
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Writing it down…
                    </>
                ) : (
                    <>
                        <span aria-hidden="true" className="relative flex size-2">
                            <span className="absolute inset-0 rounded-full bg-hue motion-safe:animate-live-halo" />
                            <span className="relative size-2 rounded-full bg-hue" />
                        </span>
                        Listening <span className="tabular-nums text-hue-ink/80">{mm}</span>
                    </>
                )}
            </span>
            {dictation.recording && (
                <>
                    <Button type="button" size="xs" variant="ghost" onClick={dictation.stop}>
                        <Square className="!size-3 fill-current" aria-hidden="true" /> Stop <kbd className="kbd ml-0.5">⏎</kbd>
                    </Button>
                    <Button type="button" size="xs" variant="ghost" onClick={dictation.cancel}>
                        Cancel <kbd className="kbd ml-0.5">esc</kbd>
                    </Button>
                </>
            )}
        </div>
    )
}

/** The clip recorder, loaded the first time it is asked for. */
export function ClipRecorderHost({ open, onOpenChange, onRecorded }: { open: boolean; onOpenChange: (o: boolean) => void; onRecorded: (file: File) => void }) {
    const [wanted, setWanted] = React.useState(open)
    React.useEffect(() => {
        if (open) setWanted(true)
    }, [open])
    if (!wanted) return null
    return <ClipRecorder open={open} onOpenChange={onOpenChange} onAttach={onRecorded} />
}

// ─── Send and Send later (C39, C44) ──────────────────────────────────────

interface LaterChoice {
    key: string
    label: string
    at: Date
}

const atHour = (base: Date, days: number, hour: number) => {
    const d = new Date(base)
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
}

/** Send later's presets (C44), in the reader's own time. Pure, for tests. */
export function sendLaterChoices(now: Date): LaterChoice[] {
    const out: LaterChoice[] = []
    const hour = new Date(now.getTime() + 60 * 60 * 1000)
    hour.setSeconds(0, 0)
    out.push({ key: "hour", label: "In 1 hour", at: hour })
    if (now.getHours() < 16) out.push({ key: "evening", label: "This evening", at: atHour(now, 0, 17) })
    out.push({ key: "tomorrow", label: "Tomorrow morning", at: atHour(now, 1, 9) })
    const day = now.getDay()
    // Friday to Sunday: Monday morning too.
    // Friday and Saturday: Monday morning too (on a Sunday it is tomorrow).
    if (day === 5 || day === 6) {
        const toMonday = (8 - day) % 7 || 7
        out.push({ key: "monday", label: "Monday", at: atHour(now, toMonday, 9) })
    }
    return out
}

/** "Tomorrow · 09:00", "Mon · 09:00": a preset's time, on its right. */
function whenLabel(at: Date, now: Date): string {
    const sameDay = at.toDateString() === now.toDateString()
    if (sameDay) return chatClock(at)
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const day = at.toDateString() === tomorrow.toDateString() ? "Tomorrow" : at.toLocaleDateString(undefined, { weekday: "short" })
    return `${day} · ${chatClock(at)}`
}

/**
 * Send (C39): a split button, the 28px square joined to a 20px chevron that
 * opens Send later. Empty, it is the press overlay with an ink-3 arrow and no
 * chevron (its width kept, so nothing shifts when it appears). Ready, the
 * accent with an inner highlight. Pressing it sinks to .9 and springs back,
 * and the arrow lifts 3px.
 */
export const SendSplit = React.memo(function SendSplit({
    nothingToSend,
    disabled = false,
    label,
    onSend,
    onSchedule,
}: {
    nothingToSend: boolean
    disabled?: boolean
    label: string
    onSend: () => void
    onSchedule?: (at: Date) => void
}) {
    const arrow = React.useRef<SVGSVGElement>(null)
    const [open, setOpen] = React.useState(false)
    const [custom, setCustom] = React.useState<string | null>(null)
    const ready = !nothingToSend && !disabled
    const now = new Date()
    const send = () => {
        if (ready && arrow.current && !prefersReducedMotion() && typeof arrow.current.animate === "function") {
            arrow.current.animate([{ translate: "0 0" }, { translate: "0 -3px", offset: 0.4 }, { translate: "0 0" }], { duration: 160, easing: "cubic-bezier(0.3, 1.35, 0.5, 1)" })
        }
        onSend()
    }
    const customAt = custom ? new Date(custom) : null
    const customOk = !!customAt && !Number.isNaN(customAt.getTime()) && customAt.getTime() > Date.now() + 60_000
    return (
        <div data-send-split="" className="flex items-center">
            <button
                type="button"
                aria-label={label}
                title={`${label} (Enter)`}
                disabled={disabled}
                onClick={send}
                className={cn(
                    "relative z-[1] flex size-7 items-center justify-center rounded-md transition-[background-color,color,scale] duration-[160ms] ease-spring active:scale-90 active:duration-[90ms] active:ease-out",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
                    ready ? "bg-brand text-brand-foreground shadow-primary hover:bg-[color-mix(in_oklab,var(--brand)_92%,black)]" : "bg-press text-ink-3",
                    onSchedule && ready && "rounded-r-none",
                )}
            >
                <ArrowUp ref={arrow} className="size-4" aria-hidden="true" />
            </button>
            {onSchedule && (
                <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCustom(null) }} modal={false}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label="Send later"
                            title="Send later"
                            tabIndex={ready ? 0 : -1}
                            aria-hidden={!ready || undefined}
                            className={cn(
                                "flex h-7 w-5 items-center justify-center rounded-r-md border-l border-[color-mix(in_oklab,var(--brand)_70%,black)] bg-brand text-brand-foreground shadow-primary transition-[opacity,translate] duration-[140ms] ease-out hover:bg-[color-mix(in_oklab,var(--brand)_92%,black)]",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                ready ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0",
                            )}
                        >
                            <ChevronDown className="size-3.5" aria-hidden="true" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end" sideOffset={8} className="pop-surface w-72 p-1">
                        <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Send later</DropdownMenuLabel>
                        {custom === null ? (
                            <>
                                {sendLaterChoices(now).map((c) => (
                                    <DropdownMenuItem key={c.key} onSelect={() => onSchedule(c.at)}>
                                        {c.label}
                                        <DropdownMenuShortcut className="whitespace-nowrap tabular-nums">{whenLabel(c.at, now)}</DropdownMenuShortcut>
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault()
                                        setCustom(toLocalInputValue(new Date(now.getTime() + 2 * 60 * 60 * 1000)))
                                    }}
                                >
                                    <Clock className="text-ink-3" aria-hidden="true" /> Custom time…
                                </DropdownMenuItem>
                            </>
                        ) : (
                            // Custom time swaps the menu's content, no second popover.
                            <div className="flex flex-col gap-2 px-2 pb-2 pt-1 animate-fade-in">
                                <input
                                    type="datetime-local"
                                    aria-label="Send at"
                                    value={custom}
                                    min={toLocalInputValue(now)}
                                    onChange={(e) => setCustom(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="field-surface h-8 w-full min-w-0 rounded-md px-2 text-ui-sm"
                                />
                                <Button size="sm" className="self-end" disabled={!customOk} onClick={() => { if (customAt) { onSchedule(customAt); setOpen(false) } }}>
                                    Schedule
                                </Button>
                            </div>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
})

/**
 * After scheduling (C44): a chip rises from Send to the composer's top-left,
 * "Scheduled for tomorrow 09:00 · Undo", for 6 s. Its clock turns once as it
 * lands, the playful moment of send-later.
 */
export function ScheduledChip({ at, onUndo, onDone }: { at: Date; onUndo?: () => void; onDone: () => void }) {
    React.useEffect(() => {
        const t = window.setTimeout(onDone, 6000)
        return () => window.clearTimeout(t)
    }, [onDone])
    return (
        <div role="status" data-scheduled-chip="" className="mb-2 inline-flex h-6 items-center gap-1.5 rounded-xl bg-sunken px-2.5 text-meta text-ink-2 animate-pill-in">
            <Clock className="size-3 motion-safe:animate-clock-once" aria-hidden="true" />
            Scheduled for {whenLabel(at, new Date()).replace(" · ", " ")}
            {onUndo && (
                <>
                    <span aria-hidden="true">·</span>
                    <button type="button" onClick={() => { onUndo(); onDone() }} className="rounded-sm font-medium text-brand-text hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        Undo
                    </button>
                </>
            )}
        </div>
    )
}

// ─── The hint (C38) ──────────────────────────────────────────────────────

const SENDS_KEY = "onecamp-composer-sends"
/** After this many sends the hint has done its job and stays away. */
export const HINT_SENDS = 20

export function composerSends(): number {
    try {
        return Number(window.localStorage.getItem(SENDS_KEY) || 0) || 0
    } catch {
        return 0
    }
}
export function countComposerSend() {
    try {
        window.localStorage.setItem(SENDS_KEY, String(composerSends() + 1))
    } catch {
        // A private window keeps no count; the hint stays, which is harmless.
    }
}

/** "⏎ send ⇧⏎ new line" in kbd chips, until someone has sent twenty messages. */
export function SendHint() {
    const [show] = React.useState(() => typeof window === "undefined" || composerSends() < HINT_SENDS)
    if (!show) return null
    return (
        <span data-send-hint="" className="mr-2 hidden items-center gap-1 whitespace-nowrap text-meta text-ink-3 @[640px]/composer:flex">
            <kbd className="kbd">⏎</kbd> send <kbd className="kbd ml-1.5">⇧⏎</kbd> new line
        </span>
    )
}

