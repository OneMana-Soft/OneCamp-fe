"use client"
// A project's triage settings (linear-21 H3 c): its admins turn triage on and off and ask for a
// priority before work leaves it, through the policies call the SLA dialog and ProjectAccessDialog
// make (hooks/useProjectPolicy, handed the page's calls: app/triageLazy.test). A chunk of its own,
// fetched when an admin opens it from the project's tools or the Triage tab. The server decides who
// manages (NeedManage) and records each change.
// linear-21 H4: the sheet also keeps the project's on-duty rota (GET/PUT /project/{id}/triage/rota,
// business/Triage rota.go) and leads to the rules on arriving work (onArrivalRules: TriageSheet opens
// the project's one rules dialog on them). Names come from the project's people the sheet is handed.
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DateField } from "@/components/ui/date-field"
import { OverlayBody, OverlayFooter } from "@/components/ui/overlay"
import { Pick } from "@/components/ui/pick"
import { SavedTick } from "@/components/ui/saveStatus"
import { Switch } from "@/components/ui/switch"
import { PeopleChips } from "@/components/work/rules/PeopleChips"
import { useProjectPolicy, type ProjectCalls } from "@/hooks/useProjectPolicy"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { useKeptRead } from "@/lib/lazy/useKeptRead"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { listOf } from "@/lib/utils/listOf"
import { TRIAGE_ON, TRIAGE_PRIORITY } from "@/lib/work/triage"
import { MAX_ROTA_WEEKS, changeWords, memberNames, nameOf, rotaPath, rotaTurns, today, type Rota, type RotaMember, type RotaRead } from "@/lib/work/triageRota"

function useSwitch(projectId: string, key: string, open: boolean, calls: ProjectCalls) {
  const policy = useProjectPolicy(projectId, key, open, calls)
  const on = policy.picked !== undefined ? policy.picked === true : policy.info?.value === true
  return { policy, on }
}

const TURNS = Array.from({ length: MAX_ROTA_WEEKS }, (_, i) => ({ value: String(i + 1), label: i === 0 ? "1 week" : `${i + 1} weeks` }))

/** Who is on duty now, and until when, in the reader's own time. */
export function dutyWords(r: RotaRead["rota"], names: Map<string, string>) {
  if (!r.on_duty) return "Nobody is on triage duty"
  const until = changeWords(r.next_change)
  return `${nameOf(r.on_duty, names)} is on duty${until ? ` until ${until}` : ""}`
}

/** The project's rota: read for whoever the server lets read it, set by its admins (can_manage). */
function useRota(projectId: string, calls: ProjectCalls, open: boolean) {
  const path = rotaPath(projectId)
  const load = React.useCallback(() => calls.http.get<{ data: RotaRead }>(path, calls.quiet).then((r) => r.data.data), [calls, path])
  const read = useKeptRead<RotaRead>(open ? path : null, load)
  const [draft, setDraft] = React.useState<Rota | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const view = read.data?.rota
  const shown: Rota = draft ?? { people: listOf<string>(view?.people), weeks: view?.weeks || 1, start: view?.start || today() }
  const edit = (patch: Partial<Rota>) => (setError(""), setDraft({ ...shown, ...patch }))
  const save = async (next: Rota) => {
    setSaving(true)
    setError("")
    try {
      const r = await calls.http.put<{ data: { rota: RotaRead["rota"] } }>(path, { people: listOf<string>(next.people), weeks: next.weeks, start: next.start || today() }, calls.quiet)
      // PUT answers without can_manage (V-1182): the one the read gave stands.
      read.keep({ rota: r.data.data.rota, can_manage: read.data?.can_manage })
      setDraft(null)
    } catch (e) {
      setError(apiErrorMessage(e, "The rota couldn't be saved. Try again."))
    } finally {
      setSaving(false)
    }
  }
  return { read, view, shown, dirty: draft !== null, edit, save, saving, error, cancel: () => (setDraft(null), setError("")) }
}

function RotaSection({ rota, names, people, offline }: { rota: ReturnType<typeof useRota>; names: Map<string, string>; people: RotaMember[]; offline: boolean }) {
  const { read, view, shown } = rota
  const manage = !!read.data?.can_manage
  const turns = view ? rotaTurns(view, names) : []
  const humans = React.useMemo(() => people.filter((m) => m.user_uuid && !m.is_bot).map((m) => ({ id: m.user_uuid!, name: nameOf(m.user_uuid!, names) })), [people, names])
  return (
    <section data-testid="triage-rota" aria-labelledby="triage-rota-title" className="space-y-3 border-t border-line pt-4">
      <h3 id="triage-rota-title" className="text-sm font-medium">On duty</h3>
      {!view ? (
        read.failed ? (
          <p className="text-sm text-ink-2" role="alert">
            The rota couldn&apos;t be read. <Button size="sm" variant="ghost" onClick={() => void read.again()}>Try again</Button>
          </p>
        ) : (
          <p className="text-sm text-ink-3" aria-busy="true">Reading the rota…</p>
        )
      ) : (
        <>
          <p className="text-sm">
            <span className="font-medium">{dutyWords(view, names)}</span>
            {!view.on_duty && <span className="block text-xs text-ink-2">Arriving work waits for whoever decides it, and rules that give it to whoever is on duty find nobody.</span>}
          </p>
          {turns.length > 0 && (
            <ol aria-label="Turns" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
              {turns.map((t, i) => <li key={t.id} className={t.now ? "font-medium text-ink" : undefined}>{i + 1}. {t.name}{t.now ? " (now)" : ""}</li>)}
            </ol>
          )}
          {manage && (
            <div className="space-y-3">
              <PeopleChips label="On the rota" lead="Turns" people={humans} picked={listOf<string>(shown.people)} onChange={(people) => rota.edit({ people })} none="nobody yet: pick people in the order they take turns" />
              <div className="flex flex-wrap items-center gap-2">
                <Pick label="Turn length" value={String(shown.weeks)} onChange={(v) => rota.edit({ weeks: Number(v) })} options={TURNS} className="w-full sm:w-32" />
                <label className="flex w-full min-w-0 items-center gap-2 text-xs text-ink-2 sm:w-auto">
                  First turn starts
                  <span className="min-w-0 flex-1 sm:flex-none">
                    <DateField aria-label="First turn starts" pickerTitle="First turn starts" value={shown.start} onChange={(day) => day && rota.edit({ start: day })} className="h-11 md:h-8" />
                  </span>
                </label>
              </div>
              <p className="text-xs text-ink-3">Turns change at midnight UTC, in the order picked.{offline ? " You're offline: save once you're back." : ""}</p>
            </div>
          )}
          {rota.error && <p className="text-sm text-danger-ink" role="alert">{rota.error}</p>}
        </>
      )}
    </section>
  )
}

export function TriageSettings({ projectId, calls, open, onOpenChange, members, onArrivalRules }: {
  projectId: string
  calls: ProjectCalls
  open: boolean
  onOpenChange: (o: boolean) => void
  /** The project's people, from the members list the rules dialog reads (TriageSheet): the rota's names. */
  members?: RotaMember[] | null
  /** Opens the rules on arriving work (TriageSheet). */
  onArrivalRules?: () => void
}) {
  const people = React.useMemo(() => listOf<RotaMember>(members), [members])
  const names = React.useMemo(() => memberNames(people), [people])
  const rota = useRota(projectId, calls, open)
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, () => false)
  const triage = useSwitch(projectId, TRIAGE_ON, open, calls)
  const priority = useSwitch(projectId, TRIAGE_PRIORITY, open, calls)
  const read = triage.policy.info && priority.policy.info
  const failed = [triage.policy.status, priority.policy.status].find((s) => s.state === "error")
  const saving = triage.policy.status.state === "saving" || priority.policy.status.state === "saving"
  const turn = (which: typeof triage, next: boolean, on: string, off: string) => void which.policy.choose(next, next ? on : off, () => turn(which, !next, on, off))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Triage <SavedTick status={failed ?? (triage.policy.status.state !== "idle" ? triage.policy.status : priority.policy.status)} /></DialogTitle>
          <DialogDescription>
            While triage is on, work from outside the board (a form&apos;s answers, the API, agents, GitHub issues, chats) waits here until someone
            accepts, declines, marks a duplicate or snoozes it.
          </DialogDescription>
        </DialogHeader>
        <OverlayBody className="space-y-4">
        {!read ? (
          triage.policy.isError || priority.policy.isError ? (
            <p className="text-sm text-ink-2" role="alert">
              Triage&apos;s settings couldn&apos;t be read. Only the project&apos;s admins change them.{" "}
              <Button size="sm" variant="ghost" onClick={() => (triage.policy.retry(), priority.policy.retry())}>Try again</Button>
            </p>
          ) : (
            <p className="text-sm text-ink-3" aria-busy="true">Reading triage&apos;s settings…</p>
          )
        ) : (
          <>
            {failed && <p className="text-sm text-danger-ink" role="alert">{failed.error || "That couldn't be saved."}</p>}
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Triage on
              <Switch aria-label="Triage on" checked={triage.on} disabled={saving} onCheckedChange={(v) => turn(triage, v === true, "Triage on", "Triage off")} />
            </label>
            <label className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">Needs a priority to leave</span>
                <span className="block text-xs text-ink-2">A task is accepted only once someone gives it a priority.</span>
              </span>
              <Switch aria-label="Needs a priority to leave" checked={priority.on} disabled={saving} onCheckedChange={(v) => turn(priority, v === true, "Priority asked for", "Priority not asked for")} />
            </label>
          </>
        )}
          <RotaSection rota={rota} names={names} people={people} offline={offline} />
          {onArrivalRules && (
            <div className="flex items-start justify-between gap-3 border-t border-line pt-4 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">Rules on arrival</span>
                <span className="block text-xs text-ink-2">Accept or decline work as it arrives, by the door it came in by, and give it to whoever is on duty.</span>
              </span>
              <Button size="sm" variant="outline" aria-label="Set rules on arrival" onClick={onArrivalRules}>Set rules</Button>
            </div>
          )}
        </OverlayBody>
        {rota.dirty && (
          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={rota.cancel} disabled={rota.saving}>Cancel</Button>
            <Button type="button" onClick={() => void rota.save(rota.shown)} busy={rota.saving} disabled={offline}>{rota.saving ? "Saving…" : "Save rota"}</Button>
          </OverlayFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
