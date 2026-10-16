"use client"

/**
 * The parts a doc's comment list is made of, beside the doc and on a phone
 * (docs programme B7): Open and Resolved with their counts, a person filter,
 * a new thread being written, and the list's own state (its tab, its filter,
 * a thread asked to be shown).
 */
import * as React from "react"
import { ChevronDown } from "@/lib/icons"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"
import { displayNameOf } from "@/lib/personName"
import type { Anchor, ResolvedAnchor } from "@/lib/anchors/types"
import type { UserProfileDataInterface } from "@/types/user"
import { CommentComposer } from "./CommentComposer"
import { revealThread, setUi, uiOf, useUi } from "./commentsUi"
import { docEditor } from "./inDoc"
import { orderThreads, peopleIn, quoteLine, wroteIn, type Tab } from "./threadView"
import type { DocThreads } from "./useDocThreads"
import { MenuCheck } from "@/components/ui/menuCheck"

const nameOf = (p: UserProfileDataInterface) => displayNameOf(p) || "Someone"

/** The list's tab, its person, and the threads they show, in order; a reveal moves both to show its thread. */
export function useThreadList(docId: string, t: DocThreads, places?: ReadonlyMap<string, ResolvedAnchor>) {
    const [tab, setTab] = React.useState<Tab>("open")
    const [person, setPerson] = React.useState("")
    const me = t.me?.user_uuid
    const people = React.useMemo(() => peopleIn(t.threads, me), [t.threads, me])
    const counts = React.useMemo(
        () => ({ open: t.threads.filter((x) => x.status === "open").length, resolved: t.threads.filter((x) => x.status === "resolved").length }),
        [t.threads],
    )
    const list = React.useMemo(() => {
        const inTab = t.threads.filter((x) => x.status === tab && (!person || wroteIn(x, person)))
        return orderThreads(inTab, tab, places)
    }, [t.threads, tab, person, places])

    // A thread asked for (a marker, its words, a notice): its tab, everyone's
    // threads if the filter hid it, and into view, once it is here.
    const asked = useUi(docId, (ui) => ui.reveal)
    const target = React.useMemo(() => {
        if (!asked) return null
        return t.threads.find((x) => x.id === asked.thread || (!!asked.comment && x.comments.some((c) => c.comment_uuid === asked.comment))) ?? null
    }, [asked, t.threads])
    const handled = React.useRef(0)
    React.useEffect(() => {
        if (!asked || !target || handled.current === asked.n) return
        handled.current = asked.n
        setTab(target.status)
        setPerson((p) => (p && !wroteIn(target, p) ? "" : p))
        if (uiOf(docId).active !== target.id) setUi(docId, { active: target.id })
        requestAnimationFrame(() => {
            const el = document.querySelector<HTMLElement>(`[data-thread-card][data-thread-id="${CSS.escape(target.id)}"]`)
            el?.scrollIntoView({ block: "nearest" })
            el?.focus({ preventScroll: true })
        })
    }, [asked, target, docId])

    const personName = people.find((p) => p.user_uuid === person)
    return { tab, setTab, person, setPerson, people, counts, list, personName: personName ? (person === me ? "you" : nameOf(personName)) : "" }
}

/** Open · Resolved, and whose threads. */
export function ThreadsToolbar({
    tab,
    onTab,
    counts,
    people,
    person,
    onPerson,
    me,
}: {
    tab: Tab
    onTab(t: Tab): void
    counts: { open: number; resolved: number }
    people: UserProfileDataInterface[]
    person: string
    onPerson(p: string): void
    me?: string
}) {
    const chosen = people.find((p) => p.user_uuid === person)
    const label = chosen ? (chosen.user_uuid === me ? "You" : nameOf(chosen)) : "Anyone"
    return (
        <div data-threads-toolbar="" className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2.5">
            <SegmentedControl<Tab>
                aria-label="Which threads"
                value={tab}
                onValueChange={onTab}
                options={[
                    { value: "open", label: <span className="tabular-nums">Open{counts.open ? ` ${counts.open}` : ""}</span> },
                    { value: "resolved", label: <span className="tabular-nums">Resolved{counts.resolved ? ` ${counts.resolved}` : ""}</span> },
                ]}
            />
            {people.length > 1 && (
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Whose threads: ${label}`}
                            className={cn(
                                "inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-ui-sm transition-colors duration-[140ms] ease-out hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-[state=open]:bg-press",
                                person ? "font-medium text-ink" : "text-ink-2",
                            )}
                        >
                            <span className="max-w-32 truncate">{label}</span>
                            <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 min-w-44 overflow-y-auto">
                        <DropdownMenuItem onSelect={() => onPerson("")} aria-current={!person ? "true" : undefined} className="gap-2">
                            <MenuCheck checked={!person} />
                            Anyone
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {people.map((p) => (
                            <DropdownMenuItem key={p.user_uuid} onSelect={() => onPerson(p.user_uuid)} aria-current={person === p.user_uuid ? "true" : undefined} className="gap-2">
                                <MenuCheck checked={person === p.user_uuid} />
                                <span className="truncate">{p.user_uuid === me ? "You" : nameOf(p)}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}

/** A new thread being written on the words chosen (Comment, ⌘⇧M, a block's Comment). */
export function NewThreadCard({ docId, anchor, t }: { docId: string; anchor: Anchor; t: Pick<DocThreads, "start"> }) {
    const quote = quoteLine(anchor.quote)
    return (
        <article data-thread-card="" data-new-thread="" aria-label="New comment" className="content-rise flex flex-col gap-1.5 rounded-xl bg-raised px-1.5 py-1.5 shadow-e2">
            <header className="pl-2.5 pr-1 pt-1">
                <span className="line-clamp-2 border-l-2 border-camp-sun pl-2 text-ui-sm text-ink-2">{quote || "This block"}</span>
            </header>
            <CommentComposer
                docId={docId}
                autoFocus
                placeholder="Add a comment…"
                label="Comment on the selected text"
                sendLabel="Comment"
                onSend={async (b) => {
                    const thread = await t.start(anchor, b)
                    setUi(docId, { pending: null })
                    revealThread(docId, { thread: thread.id })
                }}
                onCancel={() => {
                    setUi(docId, { pending: null })
                    docEditor(docId)?.commands.focus()
                }}
            />
        </article>
    )
}

/** The list's shape while it loads: cards, not a spinner. */
export function ThreadsSkeleton({ cards = 3 }: { cards?: number }) {
    return (
        <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2.5 rounded-xl bg-sunken px-4 py-3">
                    <Skeleton className={cn("h-3 rounded", i % 2 ? "w-1/2" : "w-2/3")} />
                    <div className="flex items-center gap-2.5">
                        <Skeleton variant="circle" className="size-7 shrink-0" />
                        <Skeleton className="h-3 w-24 rounded" />
                    </div>
                    <Skeleton className={cn("h-3 rounded", i % 2 ? "w-4/5" : "w-3/5")} />
                </div>
            ))}
        </div>
    )
}
