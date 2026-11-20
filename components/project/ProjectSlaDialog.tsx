"use client"

// A project's SLAs (linear-24 W2): its admins turn them on (the project's
// policy "projects.sla", read and saved as who can change tasks is), keep the
// rules in rank order (the first that matches a task is its SLA) and set the
// week the business clock counts. Its members read them, every control off;
// a guest never reaches here (GET /sla is a 403, so the tools offer no entry).
// Every delete is soft: Undo restores, and the server's refusal says why.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { OverlayBody } from "@/components/ui/overlay"
import { Switch } from "@/components/ui/switch"
import { ToggleChip } from "@/components/ui/toggleChip"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { WeekHoursEditor } from "@/components/calendar/workingHours/weekHoursEditor"
import { useProjectPolicy, type ProjectCalls } from "@/hooks/useProjectPolicy"
import { useKeptRead } from "@/lib/lazy/useKeptRead"
import { listOf } from "@/lib/utils/listOf"
import { asBookingHours, weekOrder, weekProblem, WORKING_WEEK, type Week } from "@/lib/calendar/workingHours"
import { PRIORITY_NAMES, priorityLevel } from "@/lib/tasks/priority"
import { slaSpan } from "@/lib/work/sla"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "@/lib/icons"
import { deletedTitle, restore, restoreBy } from "@/services/restoreService"
import { projectTypesPath } from "@/lib/work/workTypes"
import type { ProjectType } from "@/lib/work/keysApi"

/** The policy that turns a project's SLAs on (off by default). */
export const SLA_POLICY = "projects.sla"

export interface SlaRule {
  id: string
  name: string
  priorities: string[]
  labels: string[]
  type_ids: string[]
  sources: string[]
  target_minutes: number
  clock: "business" | "calendar"
  rank: number
  virtual?: boolean
}
interface SlaHours { days: number[]; start: string; end: string; tz: string; week?: Week }
interface SlaView { on: boolean; rules: SlaRule[]; defaults: boolean; hours: SlaHours; hours_set: boolean; can_manage: boolean }
type RuleInput = Omit<SlaRule, "id" | "rank" | "virtual"> & { rank?: number }

const PRIORITIES = ["urgent", "high", "medium", "low"]
const SOURCES: Record<string, string> = { app: "the app", api: "the API", agent: "an agent", form: "a form" }
const CLOCKS = { business: "Business hours", calendar: "Calendar time" } as const

/** The settings with every list a list: the server writes one it never filled as null (a Go nil slice; its defaults
 * name a priority and no labels, types or sources), and the dialog reads them all as lists. Pure. */
const viewOf = (v: SlaView): SlaView => ({
  ...v,
  rules: listOf<SlaRule>(v.rules).map((r) => ({ ...r, priorities: listOf(r.priorities), labels: listOf(r.labels), type_ids: listOf(r.type_ids), sources: listOf(r.sources) })),
})

/** A rule as the server takes it back (PATCH replaces the whole rule). */
const inputOf = ({ name, priorities, labels, type_ids, sources, target_minutes, clock }: SlaRule): RuleInput =>
  ({ name, priorities, labels, type_ids, sources, target_minutes, clock })

/** The project's work types (V-1063), the built-in ones first, as GET /types sends them: none until read; failed, with again(). */
type SlaTypes = { types?: ProjectType[]; failed: boolean; again: () => Promise<void> }

/** A rule's types in words: their names, and a count of any the project no longer lists (or not yet read). Pure. */
function typeWords(ids: string[], types: ProjectType[]): string {
  const named = ids.flatMap((id) => types.find((t) => t.id === id)?.name ?? [])
  const more = ids.length - named.length
  return more ? [...named, `${more} ${named.length ? "more " : ""}type${more === 1 ? "" : "s"}`].join(" or ") : named.join(" or ")
}

/** What a rule matches, in words: its priorities, labels, types and sources; none of them is every task. */
function matchWords(r: SlaRule, types: ProjectType[]): string {
  const parts = [
    r.priorities.map((p) => PRIORITY_NAMES[priorityLevel(p)]).join(" or "),
    r.labels.map((l) => `#${l}`).join(" or "),
    typeWords(r.type_ids, types),
    r.sources.length ? `from ${r.sources.map((s) => SOURCES[s] ?? s).join(" or ")}` : "",
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : "Every task"
}

/** The week the hours carry: their own ranges, else Days from Start to End. */
function weekOf(h?: SlaHours): Week {
  if (h?.week) return h.week
  if (!h?.days?.length) return WORKING_WEEK
  return Object.fromEntries(h.days.map((d) => [String(d), [{ start: h.start, end: h.end }]]))
}

export function ProjectSlaDialog({ projectId, calls, open, onOpenChange }: { projectId: string; calls: ProjectCalls; open: boolean; onOpenChange: (o: boolean) => void }) {
  const key = `/project/${projectId}/sla`
  const { http, quiet, mutate } = calls
  const load = React.useCallback(() => http.get<{ data: SlaView }>(key, quiet).then((r) => ({ ...r.data, data: r.data.data && viewOf(r.data.data) })), [http, key, quiet])
  const read = useKeptRead<{ data: SlaView }>(open ? key : null, load)
  const view = read.data?.data
  const manage = !!view?.can_manage
  const policy = useProjectPolicy(projectId, SLA_POLICY, open && manage, calls)
  const on = policy.picked !== undefined ? policy.picked === true : policy.info ? policy.info.value === true : !!view?.on
  const { status, run } = useSaveStatus()
  const [offline, setOffline] = React.useState(false)
  const [editing, setEditing] = React.useState<SlaRule | "new" | null>(null)
  const [week, setWeek] = React.useState<Week | null>(null)
  const shownWeek = week ?? weekOf(view?.hours)
  const rules = view?.rules ?? []
  // The project's work types, read as hooks/useProjectTypes reads them but through the page's client, so this chunk
  // reaches none of the shared core (app/slaLazy.test): for an admin's form, and for a member's captions that name them.
  const typesPath = open && (manage || rules.some((r) => r.type_ids.length > 0)) ? projectTypesPath(projectId) : null
  const loadTypes = React.useCallback(() => http.get<{ data: ProjectType[] | null }>(projectTypesPath(projectId), quiet).then((r) => listOf<ProjectType>(r.data.data)), [http, projectId, quiet])
  const typesRead = useKeptRead<ProjectType[]>(typesPath, loadTypes)
  const types: SlaTypes = { types: typesRead.data, failed: typesRead.failed, again: typesRead.again }

  // What a rule's SLA is changes every task's under it, so the project's rows are asked again, and the page's
  // own read of the settings (hooks/useSlaView), which offers the SLAs entry.
  const reread = async () => {
    await read.again()
    void mutate((k) => typeof k === "string" && k.includes(projectId))
  }
  const online = () => {
    const is = typeof navigator === "undefined" || navigator.onLine !== false
    setOffline(!is)
    return is
  }
  // Every change offers itself back (instantSaveGuard): its words, and the request that takes it back. The toast says
  // that request's own outcome, the server's words when it refuses (V-1012), and the rows are asked for again after.
  const write = (send: () => Promise<unknown>, back?: { what: string; send: () => Promise<unknown> }) =>
    online() ? run(async () => { await send(); await reread() }, back && { what: back.what, undo: () => restoreBy(back.send, reread) }) : Promise.resolve(false)
  // The rules as the server holds them now, kept as the dialog's read. While the project shows the defaults, the
  // first write makes them its own under fresh ids, so a rule is found again by its name and rank (CR-346 F2).
  const fresh = async () => {
    const now = await load()
    read.keep(now)
    return now.data?.rules ?? []
  }
  const at = (list: SlaRule[], name: string, rank: number) => list.find((x) => x.name === name && x.rank === rank)

  const turn = (next: boolean) => {
    if (online()) void policy.choose(next, next ? "SLAs on" : "SLAs off", () => turn(!next))
  }
  // A new rule goes back softly, by the id the server gave it; a changed one takes its words back, the defaults'
  // own copy found again when it was one of them.
  const save = (r: SlaRule | null, input: RuleInput) => {
    if (!r) {
      let made: SlaRule | undefined
      return write(async () => { made = (await http.post<{ data: SlaRule }>(`${key}/rules`, input, quiet)).data.data }, {
        what: `Added the SLA rule “${input.name}”`,
        send: async () => { if (made) await http.delete(`${key}/rules/${made.id}`, quiet) },
      })
    }
    return write(() => http.patch(`${key}/rules/${r.id}`, { ...input, rank: r.rank }, quiet), {
      what: `Changed the SLA rule “${input.name}”`,
      send: async () => {
        const own = r.virtual ? at(await fresh(), input.name, r.rank) : r
        if (!own) throw new Error("The rule has changed since")
        await http.patch(`${key}/rules/${own.id}`, { ...inputOf(r), rank: r.rank }, quiet)
      },
    })
  }
  // A move swaps the two rules' ranks: the server keeps a rank as given and orders by it (CR-346 F2). While the
  // project shows the defaults, the first write makes them its own under fresh ids, so the neighbour is found again
  // (by its name and rank) in a read after it, and the second write names it by its written id. V-1085: one move on
  // the server, in one transaction. Its way back is the same swap, of the two where they went.
  const swap = async (r: SlaRule, to: SlaRule) => {
    await http.patch(`${key}/rules/${r.id}`, { ...inputOf(r), rank: to.rank }, quiet)
    const other = to.virtual ? at(await fresh(), to.name, to.rank) : to
    if (other) await http.patch(`${key}/rules/${other.id}`, { ...inputOf(other), rank: r.rank }, quiet)
  }
  const move = (i: number, by: -1 | 1) => {
    const r = rules[i], to = rules[i + by]
    if (!r || !to) return
    void write(() => swap(r, to), {
      what: `Moved the SLA rule “${r.name}”`,
      send: async () => {
        const now = await fresh()
        const moved = at(now, r.name, to.rank), other = at(now, to.name, r.rank)
        if (!moved || !other) throw new Error("The rules have changed since")
        await swap(moved, other)
      },
    })
  }
  // A rule of the project's own goes softly, with an Undo. Removing a default writes the defaults as the project's
  // own and drops that one, so nothing can restore it by the default's fixed id (V-1084): it asks first (CR-346 F3).
  const remove = (r: SlaRule) => {
    if (!online()) return
    const drop = () =>
      void write(() => http.delete(`${key}/rules/${r.id}`, quiet), r.virtual ? undefined : { what: deletedTitle(r.name, "SLA rule"), send: () => restore(http, "sla_rule", r.id) })
    if (!r.virtual) return drop()
    calls.confirm({
      title: `Remove the SLA rule "${r.name}"?`,
      description: "These are the defaults: the defaults become this project's own rules, and this one goes. It can't be undone.",
      confirmText: "Remove rule",
      destructive: true,
      onConfirm: drop,
    })
  }
  // The hours go back to the week they showed before.
  const putHours = (w: typeof shownWeek) => () => http.put(`${key}/hours`, { hours: { ...asBookingHours(w, view?.hours?.tz), week: w } }, quiet)
  const saveHours = () =>
    void write(putHours(shownWeek), { what: "Saved the SLA hours", send: putHours(weekOf(view?.hours)) }).then((held) => held && setWeek(null))
  const hoursProblem = week ? weekProblem(week) : null
  // A write the server refused says its words in one line: a rule's or the hours' (status), or "SLAs on" (the
  // policy's own save, as ProjectAccessDialog draws it: CR-346 F4).
  const failed = status.state === "error" ? status : policy.status.state === "error" ? policy.status : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">SLAs <SavedTick status={status} /></DialogTitle>
          <DialogDescription>How long this project&apos;s tasks may wait for an answer, and the hours its clock counts.</DialogDescription>
        </DialogHeader>
        {!view ? (
          read.failed ? (
            <ReadFailed what="The SLAs" again={read.again} />
          ) : (
            <p className="text-sm text-ink-3" aria-busy="true">Reading the SLAs…</p>
          )
        ) : (
          <OverlayBody className="space-y-5">
            {!manage && <p className="text-sm text-ink-2">Only the project&apos;s admins can change its SLAs.</p>}
            {offline && <p className="text-sm text-ink-2" role="status">You&apos;re offline, so nothing was changed. Try again once you&apos;re back online.</p>}
            {failed && <p className="text-sm text-danger-ink" role="alert">{failed.error || "That couldn't be saved."}</p>}
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              SLAs on
              <Switch aria-label="SLAs on" checked={on} disabled={!manage || policy.status.state === "saving"} onCheckedChange={(v) => turn(v === true)} />
            </label>

            <section aria-labelledby="sla-rules" className="space-y-2">
              <h3 id="sla-rules" className="text-sm font-semibold">Rules, first match wins</h3>
              {view.defaults && rules.length > 0 && <p className="text-xs text-ink-2">These are the defaults. They apply until an admin changes them.</p>}
              {rules.length === 0 && editing !== "new" && <p className="text-sm text-ink-2">No SLA rules yet. Without one, no task has an SLA.</p>}
              <ol className="space-y-2">
                {rules.map((r, i) =>
                  editing !== "new" && editing?.id === r.id ? (
                    <li key={r.id}><RuleForm rule={r} types={types} onCancel={() => setEditing(null)} onSave={(input) => save(r, input).then((held) => held && setEditing(null))} /></li>
                  ) : (
                    <li key={r.id} role="group" aria-label={`Rule ${i + 1}: ${r.name}`} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-ink-2">{slaSpan(r.target_minutes * 60_000).long}, {CLOCKS[r.clock] ?? r.clock} · {matchWords(r, types.types ?? [])}</div>
                      </div>
                      {/* A member reads the rules: no actions drawn (CR-346 F5). */}
                      {manage && (
                        <div className="flex shrink-0 items-center gap-1" data-touch-group="">
                          <Button size="icon-sm" variant="ghost" aria-label="Change" title="Change" onClick={() => setEditing(r)}><Pencil /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Move down" title="Move down" disabled={i === rules.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Remove" title="Remove" onClick={() => remove(r)}><Trash2 /></Button>
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ol>
              {editing === "new" && <RuleForm types={types} onCancel={() => setEditing(null)} onSave={(input) => save(null, input).then((held) => held && setEditing(null))} />}
              {manage && editing === null && (
                <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus /> Add a rule</Button>
              )}
            </section>

            <section aria-labelledby="sla-hours" className="space-y-2">
              <h3 id="sla-hours" className="text-sm font-semibold">Business hours</h3>
              <p className="text-xs text-ink-2">
                The business clock counts these hours{view.hours?.tz ? `, in ${view.hours.tz}` : ""}.{view.hours_set ? "" : " Until an admin sets them, it counts Monday to Friday."}
              </p>
              <WeekHoursEditor week={shownWeek} order={weekOrder(1)} onWeek={setWeek} readOnly={!manage} />
              {hoursProblem && <p className="text-xs text-danger-ink">{hoursProblem}</p>}
            </section>
          </OverlayBody>
        )}
        {view && manage && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <Button disabled={!week || !!hoursProblem || status.state === "saving"} onClick={saveHours}>Save hours</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A rule's name, what it matches and its target, for a new rule or one being changed. */
function RuleForm({ rule, types, onSave, onCancel }: { rule?: SlaRule; types: SlaTypes; onSave: (input: RuleInput) => Promise<unknown>; onCancel: () => void }) {
  const [name, setName] = React.useState(rule?.name ?? "")
  const [hours, setHours] = React.useState(rule ? String(rule.target_minutes / 60) : "")
  const [clock, setClock] = React.useState<SlaRule["clock"]>(rule?.clock ?? "business")
  const [priorities, setPriorities] = React.useState<string[]>(rule?.priorities ?? [])
  const [sources, setSources] = React.useState<string[]>(rule?.sources ?? [])
  const [labels, setLabels] = React.useState((rule?.labels ?? []).join(", "))
  const [typeIds, setTypeIds] = React.useState<string[]>(rule?.type_ids ?? [])
  const minutes = Math.round(Number(hours) * 60)
  const ready = name.trim() !== "" && minutes >= 1
  const submit = () => {
    if (ready) void onSave({ name: name.trim(), priorities, labels: labels.split(",").map((l) => l.trim()).filter(Boolean), type_ids: typeIds, sources, target_minutes: minutes, clock })
  }
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const chip = (pressed: boolean, label: string, onClick: () => void, key = label) => (
    <ToggleChip key={key} tone="neutral" pressed={pressed} onPressedChange={onClick}>{label}</ToggleChip>
  )
  // Each choice under a caption that says what it is, and what choosing none means (CR-346 F7).
  const ids = React.useId()
  const choices = (n: number, caption: string, chips: React.ReactNode) => (
    <div className="space-y-1">
      <div id={`${ids}-${n}`} className="text-xs font-medium">{caption}</div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby={`${ids}-${n}`}>{chips}</div>
    </div>
  )
  return (
    <form
      className="space-y-3 rounded-lg border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className="space-y-1 text-xs font-medium">
          <span>Rule name</span>
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>Target, hours</span>
          <Input type="number" inputMode="decimal" min={0.1} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
      </div>
      {choices(1, "Clock", (Object.keys(CLOCKS) as SlaRule["clock"][]).map((c) => chip(clock === c, CLOCKS[c], () => setClock(c))))}
      {choices(2, "Priorities, none is any", PRIORITIES.map((p) => chip(priorities.includes(p), PRIORITY_NAMES[priorityLevel(p)], () => setPriorities(flip(priorities, p)))))}
      {choices(3, "Made in, none is any", Object.entries(SOURCES).map(([s, words]) => chip(sources.includes(s), `From ${words}`, () => setSources(flip(sources, s)))))}
      <TypeChoices types={types} picked={typeIds} chip={chip} choices={choices} onPick={(id) => setTypeIds(flip(typeIds, id))} onDrop={setTypeIds} />
      <label className="block space-y-1 text-xs font-medium">
        <span>Labels, comma separated (none is any)</span>
        <Input aria-label="Labels" value={labels} onChange={(e) => setLabels(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={submit}>Save rule</Button>
      </div>
    </form>
  )
}

/** A read that failed, in the dialog's words, with Try again. */
function ReadFailed({ what, again }: { what: string; again: () => Promise<void> }) {
  return (
    <p className="text-sm text-ink-2" role="status">
      {what} couldn&apos;t be read.{" "}
      <Button size="sm" variant="ghost" onClick={() => void again()}>Try again</Button>
    </p>
  )
}

/**
 * The rule's work types (V-1063) as the form's other choices, the project's types as chips: none is any. While they
 * are read, or when they couldn't be, the dialog says so as it does for the SLAs; a project with none draws nothing.
 * A type the rule names that the project no longer lists stays picked (the server keeps it) under a chip that drops it.
 */
function TypeChoices({
  types,
  picked,
  chip,
  choices,
  onPick,
  onDrop,
}: {
  types: SlaTypes
  picked: string[]
  chip: (pressed: boolean, label: string, onClick: () => void, key?: string) => React.ReactNode
  choices: (n: number, caption: string, chips: React.ReactNode) => React.ReactNode
  onPick: (id: string) => void
  onDrop: (ids: string[]) => void
}) {
  const list = types.types
  if (!list) {
    if (types.failed) return <ReadFailed what="The work types" again={types.again} />
    return <p className="text-xs text-ink-3" aria-busy="true">Reading the work types…</p>
  }
  if (!list.length) return null
  const gone = picked.filter((id) => !list.some((t) => t.id === id))
  return choices(4, "Work types, none is any", [
    ...list.map((t) => chip(picked.includes(t.id), t.name, () => onPick(t.id), t.id)),
    ...(gone.length ? [chip(true, gone.length === 1 ? "A removed type" : `${gone.length} removed types`, () => onDrop(picked.filter((id) => !gone.includes(id))), "gone")] : []),
  ])
}
