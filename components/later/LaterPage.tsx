"use client"

/**
 * Later (hub.md L1–L7): what the member put aside to come back to.
 *
 * The same frame as Activity (HubFrame): a 52px header with the tabs and one
 * sliding ink indicator, Saved carrying its due count as a sun pill, and the
 * 760px start-aligned column. Rows are two-line HubRows: the thing's own lead
 * (the page glyph for a doc, the status glyph for a task, a # for a message),
 * its title, where it came from and when it was saved, and the reminder pill
 * on the right. Hover shows Done, Remind and Remove. Done springs a moss check
 * over the lead, holds, and slides the row out (resolve) with an Undo.
 */
import Link from "next/link"
import { useCallback, useRef, useState, type ReactNode } from "react"

import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { HubRow, HubRowSkeleton, HubToolButton } from "@/components/ui/hubRow"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { HubFrame, HubTabs } from "@/components/activity/hubFrame"
import { HubEmpty, HubError } from "@/components/activity/hubEmpty"
import { Bell, Bookmark, Check, ClipboardList, Clock, FileText, Hash, LayoutDashboard, MessageCircle, Undo2, X } from "@/lib/icons"
import { useLaterActions, useLaterList } from "@/hooks/useLater"
import type { LaterItem } from "@/services/laterService"
import { reminderPill, type ReminderTone } from "@/lib/utils/later"
import { relativeTime } from "@/lib/utils/relativeTime"
import { useResolve } from "@/lib/hub/motion"
import { cn } from "@/lib/utils/helpers/cn"
import { SaveForLaterButton } from "@/components/later/SaveForLater"

/** The lead per kind of thing saved (L2): identity glyphs in ink-3, no hue for messages and docs. */
function leadFor(item: LaterItem): ReactNode {
  switch (item.item_type) {
    case "task":
      return <StatusGlyph status="todo" />
    case "doc":
      return <FileText className="size-4 text-ink-3" />
    case "post":
      return <Hash className="size-4 text-ink-3" />
    case "comment":
    case "chat":
      return <MessageCircle className="size-4 text-ink-3" />
    case "project":
      return <ClipboardList className="size-4 text-ink-3" />
    case "board":
      return <LayoutDashboard className="size-4 text-ink-3" />
    // "Remind me" from the assistant (CAL-BUG-6): a reminder, not a thing saved.
    case "reminder":
      return <Bell className="size-4 text-ink-3" />
    default:
      return <Bookmark className="size-4 text-ink-3" />
  }
}

const PILL_TONE: Record<ReminderTone, string> = {
  later: "bg-hover text-ink-2",
  today: "bg-camp-sun-tint text-camp-sun-ink",
  overdue: "bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-danger-ink",
}

/** The reminder pill (L3): 22px, r6, 12/510, a 12px clock, 24-hour times. */
export function ReminderPill({ at, now = new Date() }: { at: string; now?: Date }) {
  const p = reminderPill(new Date(at), now)
  return (
    <span data-reminder-pill={p.tone} className={cn("inline-flex h-[22px] items-center gap-1 rounded-sm px-1.5 text-meta font-medium tabular-nums", PILL_TONE[p.tone])}>
      <Clock className="size-3" aria-hidden />
      {p.text}
    </span>
  )
}

export function LaterPage() {
  const [tab, setTab] = useState<"open" | "done">("open")
  const { data } = useLaterList("open")
  const due = (data?.data as { due?: number } | undefined)?.due ?? 0

  return (
    <HubFrame
      icon={Bookmark}
      title="Later"
      tabs={
        <HubTabs
          label="Later"
          value={tab}
          onChange={(v) => setTab(v === "done" ? "done" : "open")}
          tabs={[
            // The due count as a sun pill: tabular, and it rolls, so the tab
            // beside it does not slide as items are done.
            { value: "open", label: "Saved", count: due, sun: true },
            { value: "done", label: "Done" },
          ]}
        />
      }
    >
      <div className="flex-1 overflow-y-auto">
        {/* Activity's column: start-aligned, 760px, the same inset. */}
        <div data-later-frame="" key={tab} className="hub-fade-in w-full max-w-[760px] px-1 pb-10 pt-2 md:px-3">
          <LaterItems state={tab} />
        </div>
      </div>
    </HubFrame>
  )
}

/** How long a removal waits for an Undo before it reaches the server. */
export const UNDO_MS = 5000

export function LaterItems({ state }: { state: "open" | "done" }) {
  const { data, isLoading, isError, mutate } = useLaterList(state)
  const actions = useLaterActions()
  const { toast } = useToast()
  const list = useRef<HTMLDivElement>(null)
  const { phase, resolve } = useResolve(list)
  // Rows taken off the list the moment they're acted on, before the server
  // answers. If the change fails, the row comes back (the request layer says why).
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const hide = useCallback((id: string, hidden: boolean) => {
    setGone((prev) => {
      const next = new Set(prev)
      if (hidden) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const items = (data?.data?.items ?? []).filter((i) => !gone.has(i.id))
  const now = new Date()
  const dueItems = state === "open" ? items.filter((i) => i.remind_at && new Date(i.remind_at) <= now) : []
  const rest = items.filter((i) => !dueItems.includes(i))

  // Done can be taken back on the server, so it goes at once, with an Undo.
  const markDone = useCallback(
    (item: LaterItem) => {
      actions.done(item.id, true).catch(() => hide(item.id, false))
      resolve(item.id, () => hide(item.id, true))
      toast({
        title: "Marked done",
        description: item.title || undefined,
        action: (
          <ToastAction altText="Put it back in Saved" onClick={() => actions.done(item.id, false).finally(() => hide(item.id, false))}>
            Undo
          </ToastAction>
        ),
      })
    },
    [actions, hide, resolve, toast],
  )

  // Removing can't be taken back, so it waits behind the Undo.
  const remove = useCallback(
    (item: LaterItem) => {
      resolve(item.id, () => hide(item.id, true))
      let undone = false
      const send = setTimeout(() => {
        if (!undone) actions.remove(item.id).catch(() => hide(item.id, false))
      }, UNDO_MS)
      toast({
        title: "Removed from Later",
        description: item.title || undefined,
        action: (
          <ToastAction
            altText="Keep it"
            onClick={() => {
              undone = true
              clearTimeout(send)
              hide(item.id, false)
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    },
    [actions, hide, resolve, toast],
  )

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading Later">
        {[0, 1, 2].map((i) => (
          <div key={i} data-later-skeleton-row="">
            <HubRowSkeleton density="two-line" />
          </div>
        ))}
      </div>
    )
  }
  if (isError || items.length === 0) {
    return (
      <div data-later-state="" className="flex justify-start px-3 pt-6 md:pt-12">
        {isError ? (
          <HubError text="Later isn't loading." onRetry={() => void mutate()} />
        ) : state === "open" ? (
          <HubEmpty
            spot="bookmark"
            title="Nothing saved for later"
            description="Use the bookmark on any message, task or doc. Add a reminder and it comes back when you need it."
          />
        ) : (
          <HubEmpty spot="check" title="Nothing done yet" description="Things you mark done appear here, and can go back to Saved." />
        )}
      </div>
    )
  }

  const row = (item: LaterItem) => (
    <LaterRow key={item.id} item={item} done={state === "done"} phase={phase(item.id)} onDone={markDone} onRemove={remove} now={now} />
  )
  return (
    <div ref={list}>
      {dueItems.length ? (
        <div data-later-group="" data-flip-key="h:due" className="flex h-7 items-center pl-12 pr-4 text-meta font-medium text-ink-3">
          Due
        </div>
      ) : null}
      {dueItems.map(row)}
      {dueItems.length > 0 && rest.length > 0 ? (
        <div data-later-group="" data-flip-key="h:rest" className="flex h-7 items-center pl-12 pr-4 text-meta font-medium text-ink-3">
          Saved
        </div>
      ) : null}
      {rest.map(row)}
    </div>
  )
}

function LaterRow({
  item,
  done,
  phase,
  now,
  onDone,
  onRemove,
}: {
  item: LaterItem
  done: boolean
  phase?: "done" | "leaving"
  now: Date
  onDone: (item: LaterItem) => void
  onRemove: (item: LaterItem) => void
}) {
  const actions = useLaterActions()
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      // Shown by the request layer.
    } finally {
      setBusy(false)
    }
  }
  const meta = [item.context, done && item.done_at ? `done ${relativeTime(item.done_at)}` : `saved ${relativeTime(item.created_at)}`].filter(Boolean).join(" · ")

  return (
    <HubRow
      data-later-row=""
      flipKey={item.id}
      density="two-line"
      resolve={phase === "leaving" ? "leaving" : undefined}
      lead={
        <>
          {leadFor(item)}
          {phase ? (
            <span aria-hidden className="absolute inset-0 m-auto grid size-5 animate-spring place-items-center rounded-full bg-camp-moss text-white [&_svg]:size-3">
              <Check />
            </span>
          ) : null}
        </>
      }
      title={
        <Link href={item.link} className={cn("relative z-[1] rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", done && "text-ink-3")}>
          {item.title || "Untitled"}
        </Link>
      }
      second={meta}
      meta={!done && item.remind_at ? <ReminderPill at={item.remind_at} now={now} /> : undefined}
      tools={
        done ? (
          <>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(() => actions.done(item.id, false))}>
              <Undo2 />
              Move back
            </Button>
            <HubToolButton label="Remove" shortcut="⌫" onClick={() => onRemove(item)}>
              <X />
            </HubToolButton>
          </>
        ) : (
          <>
            <HubToolButton label="Mark done" shortcut="E" onClick={() => onDone(item)}>
              <Check />
            </HubToolButton>
            <SaveForLaterButton
              target={{ itemType: item.item_type, itemId: item.item_id, link: item.link, title: item.title, context: item.context }}
              className="size-6 [&_svg]:size-3.5"
            />
            <HubToolButton label="Remove" shortcut="⌫" onClick={() => onRemove(item)}>
              <X />
            </HubToolButton>
          </>
        )
      }
    />
  )
}
