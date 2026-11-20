"use client"
// A project's triage queue (linear-21 H3 b, on H1's GET /project/{id}/triage and POST
// /task/triage/{task}/decide): what waits, where it came from, who asked and how long ago. J and K
// move, X selects, P sets a priority (the house list keys, hooks/useListKeyboard); 1 accepts, 2
// declines with a reason, 3 marks a duplicate of a task picked with the house picker, H snoozes
// (lib/utils/later's choices). A decision acts on the selection, else the lit row, and lights the
// next; one the server refuses (403, 409) says its words on the row and leaves it. A chunk of its
// own that imports none of the shared core (app/triageLazy.test): the page hands it its calls and
// the shared states.
import * as React from "react"
import { useKeptTaskChoices } from "@/components/task/keptTaskChoices"
import { PriorityList } from "@/components/task/OptionList"
import { ProjectTaskPick } from "@/components/task/ProjectTaskPick"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PartLater } from "@/components/ui/part-retry"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { ListSelectionContext, useRowSelected } from "@/hooks/useListSelection"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { isTyping } from "@/lib/goKeys"
import { ChevronDown, Settings2 } from "@/lib/icons"
import { useKeptRead } from "@/lib/lazy/useKeptRead"
import type { ListField } from "@/lib/listKeys"
import { createSelectionStore } from "@/lib/listSelection"
import { shortAgo } from "@/lib/tasks/activityStream"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { reminderChoices, reminderPill } from "@/lib/utils/later"
import { decidePath, nextAfter, requesterOf, sourceWord, triageKey, triageKeyOf, type TriageChoice, type TriageQueueRead, type TriageRequest } from "@/lib/work/triage"
import { changeWords, memberNames, nameOf, rotaPath, type RotaMember, type RotaRead } from "@/lib/work/triageRota"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/** P is the one field key the queue takes (lib/listKeys); S, A, T and D are the board's work once a task is accepted. */
const FIELDS: readonly ListField[] = ["priority"]
type Overlay = "decline" | "duplicate" | "snooze" | "priority" | null

export interface TriageQueueProps {
  projectId: string
  calls: ProjectCalls
  /** Whether this person manages the project (its policies): the settings are theirs. */
  canManage: boolean
  onSettings: () => void
  /** The project's statuses, for "Accept into…" and the status a row shows. */
  statuses: { value: string; label: string }[]
  /** The shared error state, with the server's words when it said some. */
  failed: (retry: () => void, detail?: string) => React.ReactNode
  /** The shared empty state. */
  empty: (state: { title: string; description: string }) => React.ReactNode
  /** The house skeleton. */
  loading: React.ReactNode
}

/**
 * Who is on triage duty, as the project's rota says (linear-21 H4), for everyone the queue admits.
 * The name comes from the project's members list (the rules dialog's path), read only when someone is
 * on duty; an admin with nobody on duty is offered the rota (the settings sheet).
 */
function OnDuty({ projectId, calls, canManage, onSettings }: Pick<TriageQueueProps, "projectId" | "calls" | "canManage" | "onSettings">) {
  const { http, quiet } = calls
  const path = rotaPath(projectId)
  const loadRota = React.useCallback(() => http.get<{ data: RotaRead }>(path, quiet).then((r) => r.data.data), [http, path, quiet])
  const rota = useKeptRead<RotaRead>(path, loadRota).data?.rota
  const people = rota?.on_duty ? `${GetEndpointUrl.GetProjectMembers}/${projectId}` : null
  const loadPeople = React.useCallback(
    () => http.get<{ data: { project_members?: RotaMember[] | null } }>(`${GetEndpointUrl.GetProjectMembers}/${projectId}`, quiet).then((r) => r.data.data),
    [http, projectId, quiet],
  )
  const members = useKeptRead(people, loadPeople).data
  const names = React.useMemo(() => memberNames(members?.project_members), [members])
  if (!rota) return null
  const until = changeWords(rota.next_change)
  return (
    <p data-testid="triage-on-duty" className="flex min-w-0 flex-wrap items-center gap-x-1.5 px-4 pb-2 text-meta text-ink-2 md:px-6">
      {rota.on_duty ? (
        <span className="min-w-0">
          On duty: <span className="font-medium text-ink">{members ? nameOf(rota.on_duty, names) : "…"}</span>
          {until && `, until ${until}`}
        </span>
      ) : (
        <span>Nobody is on triage duty</span>
      )}
      {canManage && !rota.on_duty && (
        <Button type="button" size="sm" variant="ghost" className="h-auto px-1 py-0 text-brand-text" onClick={onSettings}>Set the rota</Button>
      )}
    </p>
  )
}

export default function TriageQueue({ projectId, calls, canManage, onSettings, statuses, failed, empty, loading }: TriageQueueProps) {
  const { http, quiet, mutate } = calls
  const key = triageKey(projectId)
  const [error, setError] = React.useState<unknown>(null)
  const load = React.useCallback(async () => {
    try {
      const got = (await http.get<{ data: TriageQueueRead }>(key, quiet)).data.data
      setError(null)
      return got
    } catch (e) {
      setError(e)
      throw e
    }
  }, [http, key, quiet])
  const read = useKeptRead<TriageQueueRead>(key, load)
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, () => false)
  const store = React.useMemo(createSelectionStore, [])
  const box = React.useRef<HTMLDivElement>(null)
  const requests = React.useMemo(() => read.data?.requests ?? [], [read.data])
  const order = React.useMemo(() => requests.map((r) => r.task_uuid), [requests])
  const canDecide = !!read.data?.can_decide
  const [overlay, setOverlay] = React.useState<Overlay>(null)
  const [refused, setRefused] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const lit = React.useSyncExternalStore(store.subscribe, () => store.get().highlighted, () => null)
  const current = lit && order.includes(lit) ? lit : (order[0] ?? null)

  // The first row is lit as the queue arrives, with the focus on it while nothing else has it, so the keys work at once.
  const focusRow = React.useCallback((id: string | null) => {
    const el = id ? box.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`) : null
    const at = document.activeElement
    // Not from where the person went since; from the queue, its tab, its own footer, where a closing overlay hands the focus back to its
    // button, or its own overlay (data-triage-overlay) as a pick there closes it.
    if (el && (!at || at === document.body || box.current?.contains(at) || at.closest("[role=tablist], [data-triage-actions], [data-triage-overlay]"))) el.focus({ preventScroll: true })
  }, [])
  React.useEffect(() => {
    const h = store.get().highlighted
    if (h && order.includes(h)) return
    store.highlight(order[0] ?? null)
    focusRow(order[0] ?? null)
  }, [order, store, focusRow])

  // What a decision acts on: the selection, else the lit row.
  const targets = React.useCallback(() => {
    const chosen = order.filter((id) => store.get().selected.has(id))
    return chosen.length ? chosen : current ? [current] : []
  }, [order, store, current])

  const decide = async (choice: TriageChoice, ids = targets()) => {
    if (!canDecide || ids.length === 0 || busy) return false
    setBusy(true)
    const done: string[] = []
    const said: Record<string, string> = {}
    for (const id of ids) {
      try {
        await http.post(decidePath(id), choice, quiet)
        done.push(id)
      } catch (e) {
        said[id] = apiErrorMessage(e, "That couldn't be decided. Try again.")
      }
    }
    setRefused((r) => ({ ...Object.fromEntries(Object.entries(r).filter(([id]) => !ids.includes(id))), ...said }))
    if (done.length && read.data) {
      const last = done[done.length - 1]
      const next = nextAfter(order.filter((id) => id === last || !done.includes(id)), last)
      // A snoozed task waits on, out of the way; any other decision takes it out of the queue.
      const left: TriageRequest[] =
        choice.decision === "snooze" ? requests.map((r) => (done.includes(r.task_uuid) ? { ...r, snoozed_until: choice.until } : r)) : requests.filter((r) => !done.includes(r.task_uuid))
      read.keep({ ...read.data, requests: left })
      store.clear()
      store.highlight(next)
      requestAnimationFrame(() => focusRow(next))
      // The project's count and lists follow: an accepted task joins the board.
      void mutate((k) => typeof k === "string" && k.includes(projectId) && k !== key)
    }
    setBusy(false)
    return Object.keys(said).length === 0
  }

  const setPriority = async (value: string) => {
    setOverlay(null)
    // The row takes the focus as the pick closes the popover, which then hands it to no button (onCloseAutoFocus):
    // 1, 2, 3, H and J/K go on at once, while the write is still out.
    focusRow(current)
    const ids = targets()
    const said: Record<string, string> = {}
    for (const id of ids) {
      try {
        await http.post(PostEndpointUrl.UpdateTaskPriority, { task_uuid: id, task_project_uuid: projectId, task_priority: value }, quiet)
      } catch (e) {
        said[id] = apiErrorMessage(e, "The priority couldn't be set. Try again.")
      }
    }
    setRefused((r) => ({ ...Object.fromEntries(Object.entries(r).filter(([id]) => !ids.includes(id))), ...said }))
  }

  // P, J, K and X are the house list's keys.
  useListKeyboard({ containerRef: box, store, enabled: !!read.data, onEdit: () => canDecide && current && setOverlay("priority"), fields: FIELDS })
  // 1, 2, 3 and H are triage's, taken before the page's tab keys (1 to 9) see them.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = triageKeyOf(e)
      const el = e.target instanceof Element ? e.target : null
      if (!k || e.defaultPrevented || isTyping(el) || !box.current?.isConnected) return
      // Heard from the queue, its own footer, or one of its own overlays once it is closing (the focus leaves it a moment
      // later, as the overlay goes): where focusRow takes the focus back from.
      const ours = !el || el === document.body || box.current.contains(el) || !!el.closest("[data-triage-actions]") || (!overlay && !!el.closest("[data-triage-overlay]"))
      if (!ours) return
      e.preventDefault()
      e.stopPropagation()
      if (!canDecide || overlay || busy || !current || e.repeat) return
      if (k === "accept") void decide({ decision: "accept" })
      else setOverlay(k)
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  })

  const close = () => {
    setOverlay(null)
    // Once the overlay has handed the focus back to its button in the footer: then the row takes it, and 1, 2, 3, H and J/K go on.
    requestAnimationFrame(() => focusRow(current))
  }
  const taken = React.useMemo(() => new Set(current ? [current] : []), [current])
  const pick = useKeptTaskChoices(http, projectId, overlay === "duplicate", taken, (retry) => failed(retry))
  const name = requests.find((r) => r.task_uuid === current)?.name ?? ""

  let body: React.ReactNode
  if (!read.data) {
    body = read.failed ? (
      offline ? <PartLater className="px-6 py-8">Triage shows when you&apos;re back online</PartLater> : failed(() => void read.again(), apiErrorMessage(error) || undefined)
    ) : (
      loading
    )
  } else if (requests.length === 0) {
    body = empty({
      title: "Nothing waits in triage",
      description: "Work from outside the board arrives here: a form's answers, the API, agents, GitHub issues and chats. Someone who can change its tasks accepts, declines, marks a duplicate or snoozes each.",
    })
  } else {
    body = (
      <ListSelectionContext.Provider value={store}>
        {requests.map((r) => (
          <TriageRow key={r.task_uuid} r={r} status={statuses.find((s) => s.value === r.status)?.label ?? r.status} refused={refused[r.task_uuid]} />
        ))}
      </ListSelectionContext.Provider>
    )
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 py-2 md:px-6">
        <p className="min-w-0 flex-1 text-meta text-ink-2">
          {read.data && requests.length > 0 && (canDecide ? `${requests.length} waiting, oldest first` : "You can read what waits here; deciding needs someone who can change its tasks.")}
        </p>
        {canManage && (
          <Button type="button" size="sm" variant="ghost" onClick={onSettings}>
            <Settings2 aria-hidden className="size-4" />
            Triage settings
          </Button>
        )}
      </div>
      <OnDuty projectId={projectId} calls={calls} canManage={canManage} onSettings={onSettings} />
      <div ref={box} role="listbox" aria-label="Triage queue" aria-multiselectable="true" className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        {body}
      </div>
      {read.data && requests.length > 0 && canDecide && current && (
        // The lit row's decisions, pinned at the foot: on a phone the row is tapped, then one of these.
        <div data-triage-actions="" className="sticky bottom-0 flex flex-wrap items-center gap-1.5 border-t border-line bg-surface px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6">
          <div className="flex items-center">
            <Button type="button" size="sm" busy={busy} onClick={() => void decide({ decision: "accept" })} className="rounded-r-none">
              Accept <kbd aria-hidden className="kbd max-md:hidden">1</kbd>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" disabled={busy} aria-label="Status to accept into" className="rounded-l-none border-l border-white/20 px-1.5">
                  <ChevronDown aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {statuses.map((s) => (
                  <DropdownMenuItem key={s.value} onSelect={() => void decide({ decision: "accept", status: s.value })}>
                    Accept into {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOverlay("decline")}>
            Decline <kbd aria-hidden className="kbd max-md:hidden">2</kbd>
          </Button>
          <ProjectTaskPick open={overlay === "duplicate"} onOpenChange={(o) => (o ? setOverlay("duplicate") : close())} {...pick} keepOpen onPick={(t) => void decide({ decision: "duplicate", duplicate_of: t.task_uuid }).then((ok) => ok && setOverlay(null))}>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              Duplicate <kbd aria-hidden className="kbd max-md:hidden">3</kbd>
            </Button>
          </ProjectTaskPick>
          <DropdownMenu open={overlay === "snooze"} onOpenChange={(o) => (o ? setOverlay("snooze") : close())}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" disabled={busy}>
                Snooze <kbd aria-hidden className="kbd max-md:hidden">H</kbd>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" data-triage-overlay="">
              {reminderChoices(new Date()).map((c) => (
                <DropdownMenuItem key={c.key} onSelect={() => void decide({ decision: "snooze", until: c.at.toISOString() })}>
                  <span className="flex-1">{c.label}</span>
                  <span className="text-meta text-ink-3">{c.hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={overlay === "priority"} onOpenChange={(o) => (o ? setOverlay("priority") : close())}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="ghost" disabled={busy}>
                Priority <kbd aria-hidden className="kbd max-md:hidden">P</kbd>
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-64 p-0" data-triage-overlay="" onCloseAutoFocus={(e) => e.preventDefault()}>
              <PriorityList onPick={(v) => void setPriority(v)} />
            </PopoverContent>
          </Popover>
        </div>
      )}
      <DeclineDialog open={overlay === "decline"} name={name} busy={busy} onClose={close} onDecline={(reason) => decide({ decision: "decline", reason }).then((ok) => ok && setOverlay(null))} />
    </div>
  )
}

/** A request's row: its name with the Triage mark beside its status (DECISION-L21 1), where it came from, who asked, how long ago. */
function TriageRow({ r, status, refused }: { r: TriageRequest; status: string; refused?: string }) {
  const selected = useRowSelected(r.task_uuid)
  const who = requesterOf(r)
  const snoozed = r.snoozed_until ? reminderPill(new Date(r.snoozed_until), new Date()) : null
  return (
    <div
      role="option"
      data-task-id={r.task_uuid}
      tabIndex={-1}
      aria-selected={selected}
      className={cn(
        "group/row flex min-h-12 cursor-default flex-col gap-1 border-b border-line px-4 py-2.5 outline-none md:px-6",
        "data-[highlighted]:bg-hover focus-visible:bg-hover aria-selected:bg-accent-soft",
        snoozed && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name}</span>
        <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-ink">Triage</span>
        {status && <span className="shrink-0 text-xs text-ink-2 max-md:hidden">{status}</span>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-ink-2">
        <span>{sourceWord(r.source)}</span>
        {who && <span className="min-w-0 truncate">· {who}</span>}
        <span className="tabular-nums">· {shortAgo(r.arrived_at)}</span>
        {snoozed && <span className="text-ink-3">· Snoozed until {snoozed.text}</span>}
      </div>
      {refused && (
        <p role="alert" className="text-meta text-danger-ink">
          {refused}
        </p>
      )}
    </div>
  )
}

/** "Why": a decline says its reason on the task. A dialog on a computer, a sheet on a phone with its actions pinned at the foot. */
function DeclineDialog({ open, name, busy, onClose, onDecline }: { open: boolean; name: string; busy: boolean; onClose: () => void; onDecline: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = React.useState("")
  React.useEffect(() => {
    if (open) setReason("")
  }, [open])
  const why = reason.trim()
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-triage-overlay="">
        <DialogHeader>
          <DialogTitle>Decline</DialogTitle>
          <DialogDescription>{name ? `“${name}” is cancelled, never deleted, with your reason on it. Whoever asked is told.` : "It is cancelled, never deleted, with your reason on it."}</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Why it's declined" placeholder="Why it's declined" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!why || busy} onClick={() => void onDecline(why)}>
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
