"use client"

/**
 * LegalHoldsCard: when old calendar events are removed for good, and the legal
 * holds that keep people's events through any rule (gcal-new-audit-retention).
 * Google keeps holds to Vault licences; here every plan has them.
 *
 * Not the redaction window beside it (RetentionCard): that blanks old audit
 * records and deletes nothing. A rule here removes items, so it is never saved
 * blind: the count it would remove at the next sweep is shown first, and Save
 * sends that count back (the server refuses a rule whose count moved).
 *
 * Who: workspace admins only (the /admin routes refuse anyone else), and every
 * rule change, hold change, search and export is in the audit log before it is
 * answered. Holds are silent: the people on one are never told.
 *
 * A lazy card that reaches no shared core (LEAD-RULES, 30 Oct 00:13): the page
 * hands it its client (app/firstLoad.test.ts walks it). A save is confirmed in place, with the settings
 * rows' own tick and live region, never by a toast over the next step (main, 3 Nov 02:0x), and each change is
 * offered back there, beside its tick (components/ui/undoInPlace).
 */

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PartRetry } from "@/components/ui/part-retry"
import { NumberUnitInput } from "@/components/ui/settingsControls"
import { SettingRow, SettingsCard, SettingsCardError, SettingsCardFooter, SettingsRowsSkeleton, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { UndoInPlace, useUndoInPlace } from "@/components/ui/undoInPlace"
import { DateField } from "@/components/ui/date-field"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Textarea } from "@/components/ui/textarea"
import {
  SEARCH_CAP,
  daysDraft,
  exportPartLine,
  exportPartOf,
  holdChange,
  holdFileName,
  isPartial,
  itemDay,
  kindChoices,
  peopleChange,
  previewWords,
  queryError,
  partCursor,
  partGap,
  partGapLine,
  putPart,
  queryParams,
  readDays,
  ruleWords,
  type ExportPart,
  type HeldItem,
  type HoldQuery,
  type LegalHold,
  type RetentionHttp,
  type RetentionKind,
  type RetentionRule,
  type RetentionRules,
  type RulePreview,
} from "@/lib/admin/legalHolds"
import { Download, Plus } from "@/lib/icons"
import { displayNameOf, personKeywords } from "@/lib/personName"
import { busyWith } from "@/lib/ui/busyWith"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate, shortDateTime } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import { RetentionRoutes } from "@/services/endpoints/admin.retention"
import type { UserListInterfaceResp, UserProfileDataInterface } from "@/types/user"

type Names = ReadonlyMap<string, string>
type Load = "loading" | "failed" | "ready"
/** A hold change's way back: its words beside the tick, and the call that takes it back. */
type HoldBack = { what: string; take: () => Promise<unknown> }

const nameIn = (names: Names, uuid: string) => names.get(uuid) ?? "A former member"
/**
 * Every call here says its own failure in place (the row's line, the card's retry, the dialog's alert, the offer's
 * words), so none asks the client's shared error toast too: at 390 it lay over the next step (main, 3 Nov 02:0x).
 */
const QUIET = { suppressErrorToast: true } as const

export default function LegalHoldsCard({ http }: { http: RetentionHttp }) {
  const [rules, setRules] = React.useState<RetentionRules | null>(null)
  const [state, setState] = React.useState<Load>("loading")
  const load = React.useCallback(async () => {
    setState("loading")
    try {
      const res = await http.get<{ data: RetentionRules }>(RetentionRoutes.Rules, QUIET)
      setRules(res.data.data)
      setState("ready")
    } catch {
      setState("failed")
    }
  }, [http])
  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <SettingsSection
      id="audit-holds"
      title="Calendar retention and legal holds"
      description="When old calendar events are removed for good, and the holds that keep people's events through any rule."
    >
      {state === "loading" && (
        <SettingsCard aria-label="Loading the retention rules">
          <SettingsRowsSkeleton rows={1} control="field" />
        </SettingsCard>
      )}
      {state === "failed" && <SettingsCardError what="the retention rules" onRetry={() => void load()} />}
      {state === "ready" && rules && rules.rules.map((rule) => <RuleCard key={rule.kind} rule={rule} http={http} onSaved={(r) => setRules({ ...rules, rules: rules.rules.map((x) => (x.kind === r.kind ? r : x)) })} />)}
      <Holds http={http} kinds={rules?.kinds ?? []} />
    </SettingsSection>
  )
}

function RuleCard({ rule, http, onSaved }: { rule: RetentionRule; http: RetentionHttp; onSaved: (r: RetentionRule) => void }) {
  const [draft, setDraft] = React.useState(daysDraft(rule.days))
  const [preview, setPreview] = React.useState<RulePreview | null>(null)
  const [error, setError] = React.useState("")
  const { status, run, clear } = useSaveStatus()
  const back = useUndoInPlace()
  const [asked, setAsked] = React.useState(0)
  const read = readDays(draft, rule)
  const days = read.error === undefined ? read.days : null
  const dirty = days !== rule.days
  const id = `retention-rule-${rule.kind}`

  // The count comes before Save: asked again whenever the days change.
  React.useEffect(() => {
    setPreview(null)
    if (days === null || days === rule.days) return
    let alive = true
    const wait = window.setTimeout(() => {
      http
        .get<{ data: RulePreview }>(`${RetentionRoutes.Rules}/${rule.kind}/preview`, { params: { days }, ...QUIET })
        .then((res) => alive && setPreview(res.data.data))
        .catch((e) => alive && setError(apiErrorMessage(e, "Couldn't count what that would remove. Try again.")))
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(wait)
    }
  }, [days, rule.days, rule.kind, http, asked])

  const shown = preview && preview.days === days ? preview : null
  const put = async (to: number, count: number) => {
    const res = await http.put<{ data: RetentionRule }>(`${RetentionRoutes.Rules}/${rule.kind}`, { days: to, shown: count }, QUIET)
    onSaved(res.data.data)
    setDraft(daysDraft(res.data.data.days))
  }
  const save = async () => {
    if (!shown) return
    setError("")
    back.clear()
    // The row says "Saved" with its tick, or "Not saved." in the server's words where its help was: the settings
    // rows' own status, so no toast lies over what comes next (main, 3 Nov 02:0x). A rule that kept everything is
    // offered back in place, under its row: keeping everything removes nothing, so its count is 0 and the log's
    // shown count stays true. Back to another number of days is the field's own way, with its count first (ruling 3).
    const keptAll = rule.days === 0
    const held = await run(() => put(shown.days, shown.would_remove))
    if (held && keptAll) back.offer({ what: ruleWords(rule.label, shown.days), undo: () => put(0, 0) })
    // A count that moved since it was shown is asked again, never saved blind.
    if (!held) setAsked((n) => n + 1)
  }

  const said = read.error ?? error
  return (
    <SettingsCard
      dirty={dirty}
      footer={
        <SettingsCardFooter
          hint={dirty ? <span data-rule-preview="" aria-live="polite">{shown ? previewWords(shown, rule.label) : days === null ? "" : `Counting the ${rule.label} this would remove…`}</span> : "The sweep runs nightly. Held items are never removed."}
          dirty={dirty}
          saving={status.state === "saving"}
          saveDisabled={!shown}
          onSave={() => void save()}
          onReset={() => {
            setDraft(daysDraft(rule.days))
            setError("")
            clear()
            back.clear()
          }}
        />
      }
    >
      <SettingRow label={`Remove ${rule.label} after`} controlId={id} status={status} description={<>{rule.help} Empty or 0 keeps them all.</>}>
        <NumberUnitInput
          id={id}
          name={id}
          unit="days"
          min={rule.min}
          max={rule.max}
          autoComplete="off"
          value={draft}
          placeholder="Off"
          className="w-28"
          invalid={!!said}
          aria-describedby={said ? `${id}-error` : undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            setError("")
            clear()
            back.clear()
          }}
        />
      </SettingRow>
      <UndoInPlace back={back} className="flex px-4 pb-3" />
      {said && (
        <p id={`${id}-error`} role="alert" className="-mt-2 px-4 pb-3 text-sm text-danger-ink">
          {said}
        </p>
      )}
    </SettingsCard>
  )
}

function Holds({ http, kinds }: { http: RetentionHttp; kinds: RetentionKind[] }) {
  const { status, run } = useSaveStatus()
  const back = useUndoInPlace()
  const [holds, setHolds] = React.useState<LegalHold[]>([])
  const [state, setState] = React.useState<Load>("loading")
  const [members, setMembers] = React.useState<UserProfileDataInterface[] | null>(null)
  const [membersFailed, setMembersFailed] = React.useState(false)
  const [open, setOpen] = React.useState<{ to: "place" } | { to: "change" | "release" | "search"; hold: LegalHold } | null>(null)

  const load = React.useCallback(async () => {
    setState("loading")
    try {
      const res = await http.get<{ data: LegalHold[] }>(RetentionRoutes.Holds, QUIET)
      setHolds(res.data.data ?? [])
      setState("ready")
    } catch {
      setState("failed")
    }
  }, [http])
  // Members are read once for the rows' names and the dialog's people; a failed read is said, with Try again.
  const loadMembers = React.useCallback(() => {
    setMembersFailed(false)
    http
      .get<UserListInterfaceResp>(GetEndpointUrl.GetAllUser, QUIET)
      .then((res) => setMembers(res.data.users ?? []))
      .catch(() => {
        setMembers(null)
        setMembersFailed(true)
      })
  }, [http])
  React.useEffect(() => {
    void load()
    loadMembers()
  }, [load, loadMembers])

  const names = React.useMemo(() => new Map((members ?? []).map((m) => [m.user_uuid, displayNameOf(m)])), [members])
  // A hold placed, changed or released is confirmed in place, beside the list's heading once the list shows it, and
  // offered back there, never by a toast: at 390 one lay over the new row's Search, Change and Release (main, 3 Nov
  // 02:0x). Taking it back reads the list again.
  const changed = (change: HoldBack) => {
    setOpen(null)
    void run(load).then(() =>
      back.offer({
        what: change.what,
        undo: async () => {
          await change.take()
          await load()
        },
      }),
    )
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-foreground">Legal holds</h3>
          <SavedTick status={status} />
          <UndoInPlace back={back} />
        </div>
        <Button type="button" variant="outline" size="sm" className={sectionActionClass} onClick={() => setOpen({ to: "place" })}>
          <Plus className="h-4 w-4" aria-hidden />
          Place a hold
        </Button>
      </div>
      {state === "loading" && (
        <SettingsCard aria-label="Loading the legal holds">
          <SettingsRowsSkeleton rows={2} control="field" />
        </SettingsCard>
      )}
      {state === "failed" && <SettingsCardError what="the legal holds" onRetry={() => void load()} />}
      {state === "ready" && holds.length === 0 && (
        <EmptyState
          headingLevel={4}
          title="No holds"
          description="A hold keeps its people's calendar events, deleted ones included, through every retention rule until it is released."
        />
      )}
      {state === "ready" && holds.length > 0 && (
        <SettingsCard>
          <ul aria-label="Legal holds" className="divide-y divide-border">
            {holds.map((hold) => (
              <HoldRow key={hold.id} hold={hold} names={names} namesFailed={members === null} onRetryNames={loadMembers} onOpen={(to) => setOpen({ to, hold })} />
            ))}
          </ul>
        </SettingsCard>
      )}
      {open?.to === "place" && <HoldDialog http={http} members={members} membersFailed={membersFailed} onRetryMembers={loadMembers} names={names} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.to === "change" && <HoldDialog http={http} hold={open.hold} members={members} membersFailed={membersFailed} onRetryMembers={loadMembers} names={names} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.to === "release" && <ReleaseDialog http={http} hold={open.hold} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.to === "search" && <SearchDialog http={http} hold={open.hold} kinds={kinds} onClose={() => setOpen(null)} />}
    </div>
  )
}

function HoldRow({ hold, names, namesFailed, onRetryNames, onOpen }: { hold: LegalHold; names: Names; namesFailed: boolean; onRetryNames: () => void; onOpen: (to: "change" | "release" | "search") => void }) {
  const live = !hold.released_at
  const retry = namesFailed && hold.people.length > 0
  return (
    <li aria-label={hold.name} data-hold={live ? "live" : "released"} className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">{hold.name}</p>
        <span className={live ? "text-xs font-medium text-success-ink" : "text-xs text-muted-foreground"}>
          {live ? `Live since ${shortDate(new Date(hold.created_at))}` : `Released ${shortDate(new Date(hold.released_at!))}${hold.released_by ? ` by ${nameIn(names, hold.released_by)}` : ""}`}
        </span>
      </div>
      {hold.note && <p className="text-sm text-ink-2 [overflow-wrap:anywhere]">{hold.note}</p>}
      {/* "Show their names" is the shared link Button, whose reach takes a finger (app/phone.css F3). Over a live hold's
          actions its line is a touch group of the Button's size (F3b) with --touch-gap under it, so the two reaches meet
          and never cover each other (DESIGN-BUILD-99 at 390: a low tap opened Change). */}
      <p data-touch-group={retry && live ? "24" : undefined} className={cn("text-sm text-ink-2", retry && live && "mb-[var(--touch-gap,0px)]")}>
        {hold.people.length === 0 ? "Nobody yet." : namesFailed ? `${hold.people.length} ${hold.people.length === 1 ? "person" : "people"}. ` : hold.people.map((p) => nameIn(names, p)).join(", ")}
        {retry && (
          <Button type="button" variant="link" size="xs" className="-my-1 px-1" onClick={onRetryNames}>
            Show their names
          </Button>
        )}
      </p>
      {/* A released hold keeps nothing any more: the server neither changes it nor searches or exports its items (409). */}
      {live && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className={sectionActionClass} aria-label={`Search ${hold.name}`} onClick={() => onOpen("search")}>
            Search
          </Button>
          <Button type="button" variant="outline" size="sm" className={sectionActionClass} aria-label={`Change ${hold.name}`} onClick={() => onOpen("change")}>
            Change
          </Button>
          <Button type="button" variant="destructive" size="sm" className={sectionActionClass} aria-label={`Release ${hold.name}`} onClick={() => onOpen("release")}>
            Release
          </Button>
        </div>
      )}
    </li>
  )
}

function HoldDialog({
  http,
  hold,
  members,
  membersFailed,
  onRetryMembers,
  names,
  onClose,
  onDone,
}: {
  http: RetentionHttp
  hold?: LegalHold
  members: UserProfileDataInterface[] | null
  membersFailed: boolean
  onRetryMembers: () => void
  names: Names
  onClose: () => void
  onDone: (back: HoldBack) => void
}) {
  const [name, setName] = React.useState(hold?.name ?? "")
  const [note, setNote] = React.useState(hold?.note ?? "")
  const [people, setPeople] = React.useState<string[]>(hold?.people ?? [])
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const toggle = (uuid: string) => setPeople((now) => (now.includes(uuid) ? now.filter((p) => p !== uuid) : [...now, uuid]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Give the hold a name, such as the matter it is for.")
      return
    }
    // A change that changes nothing is sent nowhere and offered back nowhere.
    const change = hold ? holdChange(hold, { name, note, people }) : null
    if (hold && !change) {
      onClose()
      return
    }
    setSaving(true)
    try {
      if (hold && change) {
        await http.patch(`${RetentionRoutes.Holds}/${hold.id}`, change, QUIET)
        // Back: the name and note it had, and who joined or left the other way.
        onDone({ what: `Changed ${name.trim()}`, take: () => http.patch(`${RetentionRoutes.Holds}/${hold.id}`, { name: hold.name, note: hold.note, ...peopleChange(people, hold.people) }, QUIET) })
      } else {
        const res = await http.post<{ data: LegalHold }>(RetentionRoutes.Holds, { name: name.trim(), note: note.trim(), add: people }, QUIET)
        const placed = res.data.data
        // Back: the hold just placed is released.
        onDone({ what: `Placed ${name.trim()}`, take: () => http.post(`${RetentionRoutes.Holds}/${placed.id}/release`, undefined, QUIET) })
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save the hold. Try again."))
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form onSubmit={(e) => void submit(e)} className="contents">
          <DialogHeader>
            <DialogTitle>{hold ? "Change the hold" : "Place a legal hold"}</DialogTitle>
            <DialogDescription>Its people&apos;s calendar events, deleted ones included, are kept through every retention rule until it is released. They aren&apos;t told.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="hold-name">Name</Label>
              <Input id="hold-name" value={name} maxLength={120} autoComplete="off" onChange={(e) => (setName(e.target.value), setError(""))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hold-note">Note</Label>
              <Textarea id="hold-note" value={note} maxLength={2000} rows={2} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label id="hold-people">People</Label>
              {/* Each person is the shared Chip, whose × takes a finger (app/phone.css F3). The × is 16px and stands 3px
                  inside its 22px chip, so the list is a touch group of 20 (F3b): under a finger its rows stand --touch-gap
                  apart and "Add people" --touch-gap below, and no two reaches cover each other (DESIGN-BUILD-99 at 390:
                  both taps met the People field). */}
              {people.length > 0 && (
                <ul aria-labelledby="hold-people" data-touch-group="20" className="mb-[var(--touch-gap,0px)] flex flex-wrap gap-1.5">
                  {people.map((p) => (
                    <li key={p} className="flex min-w-0 max-w-full">
                      <Chip onRemove={() => toggle(p)} removeLabel={`Take ${nameIn(names, p)} off the hold`} title={nameIn(names, p)}>
                        {nameIn(names, p)}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
              {membersFailed && !members ? (
                <PartRetry what="the members" retry={onRetryMembers} className="justify-self-start" />
              ) : (
                <Combobox multiple>
                  <ComboboxTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className={`${sectionActionClass} justify-self-start`} disabled={!members}>
                      {members ? "Add people" : "Loading members…"}
                    </Button>
                  </ComboboxTrigger>
                  <ComboboxContent label="Members" portalled={false}>
                    <ComboboxInput placeholder="Find a member…" />
                    <ComboboxList>
                      <ComboboxEmpty>No member by that name.</ComboboxEmpty>
                      {(members ?? []).map((m) => (
                        <ComboboxItem key={m.user_uuid} value={m.user_uuid} keywords={personKeywords(m)} checked={people.includes(m.user_uuid)} onSelect={toggle}>
                          <span className="truncate">{displayNameOf(m)}</span>
                        </ComboboxItem>
                      ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger-ink">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" busy={saving}>
              {hold ? "Save the hold" : "Place the hold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReleaseDialog({ http, hold, onClose, onDone }: { http: RetentionHttp; hold: LegalHold; onClose: () => void; onDone: (back: HoldBack) => void }) {
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const release = async () => {
    setSaving(true)
    try {
      await http.post(`${RetentionRoutes.Holds}/${hold.id}/release`, undefined, QUIET)
      // Back: a release has no way back of its own, so the hold is placed again, with its name, note and people.
      onDone({ what: `Released ${hold.name}`, take: () => http.post(RetentionRoutes.Holds, { name: hold.name, note: hold.note, add: hold.people }, QUIET) })
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't release the hold. Try again."))
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Release {hold.name}?</DialogTitle>
          <DialogDescription>Its people&apos;s calendar events go back under the retention rules. The hold stays listed, and the audit log keeps who released it.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="px-6 pb-2 text-sm text-danger-ink">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" busy={saving} onClick={() => void release()}>
            Release the hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A part of a hold's export the search has made: its file, and where it was made from ("" for part 1). */
type MadePart = { href: string; name: string; format: string; part: ExportPart; from: string }

function SearchDialog({ http, hold, kinds, onClose }: { http: RetentionHttp; hold: LegalHold; kinds: RetentionKind[]; onClose: () => void }) {
  // The kind searched: the first until the admin picks another (calendar events, boards: miro-44 R, V-388 (2)).
  const [kindName, setKindName] = React.useState(kinds[0]?.name ?? "")
  const kind = kinds.find((k) => k.name === kindName) ?? kinds[0]
  const [query, setQuery] = React.useState<HoldQuery>({ q: "", from: "", to: "" })
  const [items, setItems] = React.useState<HeldItem[] | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // Every part of the export made so far, one of each, in order: a legal export never loses a part (V-431).
  const [parts, setParts] = React.useState<MadePart[]>([])
  // The export under way, by what shows it busy (busyWith): one at a time.
  const [exporting, setExporting] = React.useState<string | null>(null)
  const base = kind ? `${RetentionRoutes.Holds}/${hold.id}` : ""
  // The parts as last kept, for what an answer and a close act on; the search it was asked under.
  const made = React.useRef<MadePart[]>([])
  const asked = React.useRef(0)
  // The kind picked now, for what an answer asked under another kind acts on.
  const picked = React.useRef(kind?.name)
  const keep = (next: MadePart[]) => {
    made.current = next
    setParts(next)
  }
  const letGo = () => made.current.forEach((p) => URL.revokeObjectURL(p.href))
  // A changed search: the parts made for the one before it no longer match, so they go, object URLs and all.
  const dropMade = () => {
    asked.current += 1
    letGo()
    keep([])
  }

  // An object URL lives as long as its link: revoked when its part is made again, the search changes, or this closes.
  React.useEffect(() => {
    const own = made
    return () => own.current.forEach((p) => URL.revokeObjectURL(p.href))
  }, [])

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const wrong = queryError(query)
    if (wrong || !kind) return setError(wrong ?? "There's nothing a hold keeps yet.")
    const forKind = kind.name
    setBusy(true)
    setError("")
    try {
      const res = await http.get<{ data: HeldItem[] }>(`${base}/items/${forKind}`, { params: queryParams(query), ...QUIET })
      // An answer for a kind the admin has left is never shown under the one picked now.
      if (picked.current === forKind) setItems(res.data.data ?? [])
    } catch (err) {
      if (picked.current === forKind) setError(apiErrorMessage(err, "Couldn't search the hold. Try again."))
    } finally {
      setBusy(false)
    }
  }
  // Part n of the export, from where the part before it ends (an export past the server's part size comes in parts).
  // `busyAs` is what shows it busy: a format's button for the first export, else the part's own.
  const exportPart = async (format: string, n: number, busyAs: string) => {
    const wrong = queryError(query)
    if (wrong || !kind) return setError(wrong ?? "There's nothing a hold keeps yet.")
    const from = partCursor(made.current, n)
    if (from === null) return
    const search = asked.current
    setExporting(busyAs)
    setError("")
    try {
      const res = await http.get<Blob>(`${base}/export/${kind.name}`, { params: queryParams(query, from ? { format, part: from } : { format }), responseType: "blob", ...QUIET })
      const part = exportPartOf((res.headers ?? {}) as Record<string, unknown>)
      const href = URL.createObjectURL(res.data)
      // Asked under a search that has changed since: it isn't a part of what's asked now.
      if (search !== asked.current) return URL.revokeObjectURL(href)
      const { parts: next, replaced } = putPart(made.current, { href, name: holdFileName(hold.name, kind.label, format, part), format, part, from })
      if (replaced) URL.revokeObjectURL(replaced.href)
      keep(next)
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't export them. Try again."))
    } finally {
      setExporting(null)
    }
  }
  const put = (k: keyof HoldQuery, v: string) => {
    setQuery({ ...query, [k]: v })
    dropMade()
  }
  // Another kind: what the last one found goes with its export; the words and days stay.
  const pick = (name: string) => {
    picked.current = name
    setKindName(name)
    setItems(null)
    setError("")
    dropMade()
  }
  const formId = React.useId()
  const kindsId = React.useId()
  const last = parts.at(-1)
  const inParts = !!last && (parts.length > 1 || isPartial(last.part))
  const gap = partGap(parts)
  const label = kind?.label ?? "items"
  const partBusy = (n: number) => `part ${n}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Search {hold.name}</DialogTitle>
          <DialogDescription>Everything its people&apos;s {kind?.label ?? "items"} hold, deleted ones included. Each search and export is in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-3 overflow-y-auto px-6 py-4">
          {kind && kinds.length > 1 && (
            <div className="grid gap-1.5">
              <p id={kindsId} className="text-sm font-medium leading-none">
                Items
              </p>
              <SegmentedControl aria-labelledby={kindsId} value={kind.name} onValueChange={pick} options={kindChoices(kinds)} className="w-fit" />
            </div>
          )}
          <form id={formId} onSubmit={(e) => void search(e)} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="hold-q">Words</Label>
              <Input id="hold-q" type="search" value={query.q} maxLength={200} onChange={(e) => put("q", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hold-from">From</Label>
              <DateField id="hold-from" value={query.from} onChange={(v) => put("from", v)} pickerTitle="From" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hold-to">To</Label>
              <DateField id="hold-to" value={query.to} onChange={(v) => put("to", v)} pickerTitle="To" />
            </div>
          </form>
          {error && (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          )}
          {last && (
            <p aria-live="polite" data-hold-export="" className="text-sm text-ink-2">
              {gap ? partGapLine(gap.part) : exportPartLine(last.part, label)}
            </p>
          )}
          {inParts && (
            <ol aria-label="The export's parts" className="divide-y divide-border rounded-lg border border-border">
              {parts.map((p) => {
                const n = p.part.part
                const again = partCursor(parts, n) !== null
                return (
                  <li key={n} aria-label={`Part ${n}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    {/* On a phone the label takes the row whole and its actions sit under it, at the right (DB-108 F1:
                        squeezed beside them it broke into three or four lines). */}
                    <p className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere] max-sm:basis-full">
                      <span className="font-medium text-foreground">Part {n}</span>
                      {p.part.count !== null && <span className="text-ink-2"> · {p.part.count.toLocaleString("en-US")} {label}</span>}
                    </p>
                    <div className="ml-auto flex items-center gap-x-3">
                      {again && (
                        <Button type="button" variant="ghost" size="sm" className="h-11 md:h-7" aria-label={`Export again: part ${n}`} {...busyWith(exporting, partBusy(n))} onClick={() => void exportPart(p.format, n, partBusy(n))}>
                          Export again
                        </Button>
                      )}
                      <a href={p.href} download={p.name} aria-label={`Save ${p.name}`} data-hold-file="" className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted md:h-7">
                        <Download className="h-4 w-4" aria-hidden />
                        Save
                      </a>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {items && (
            <p aria-live="polite" className="text-sm text-ink-2">
              {items.length === 0 ? "Nothing matches." : items.length >= SEARCH_CAP ? `The first ${SEARCH_CAP} matches. Narrow the search, or export them all.` : `${items.length} ${items.length === 1 ? "match" : "matches"}.`}
            </p>
          )}
          {items && items.length > 0 && (
            <ul aria-label={`Held ${kind?.label ?? "items"}`} className="divide-y divide-border rounded-lg border border-border">
              {items.map((item) => {
                const day = itemDay(item)
                // What the item has to say of its time; a kind with no date of its own (a board) says none.
                const when = [day && (item.start_date ? shortDate(day) : shortDateTime(day)), item.repeats && "Repeats"].filter(Boolean).join(" · ")
                return (
                  <li key={item.id} aria-label={item.title} data-deleted={item.deleted_at ? "" : undefined} className="grid gap-0.5 px-3 py-2">
                    <p className="font-medium text-foreground [overflow-wrap:anywhere]">{item.title || "Untitled"}</p>
                    {(when || item.deleted_at) && (
                      <p className="text-xs text-muted-foreground">
                        {when}
                        {item.deleted_at && (
                          <span className="font-medium text-danger-ink">
                            {when && " · "}Deleted {shortDate(new Date(item.deleted_at))}
                          </span>
                        )}
                      </p>
                    )}
                    {item.detail && <p className="text-sm text-ink-2 [overflow-wrap:anywhere]">{item.detail}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          {/* The form's own Search, in the footer that stays in view (a sheet's, on a phone), not in what scrolls. */}
          <Button type="submit" form={formId} variant={last ? "outline" : "default"} busy={busy}>
            Search
          </Button>
          {last && !inParts ? (
            <a href={last.href} download={last.name} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground md:h-9" data-hold-file="">
              <Download className="h-4 w-4" aria-hidden />
              Save {last.name}
            </a>
          ) : last ? (
            last.part.next !== "" && (
              <Button type="button" {...busyWith(exporting, partBusy(last.part.part + 1))} onClick={() => void exportPart(last.format, last.part.part + 1, partBusy(last.part.part + 1))}>
                {exporting === partBusy(last.part.part + 1) ? "Exporting…" : `Export part ${last.part.part + 1}`}
              </Button>
            )
          ) : (
            (kind?.formats ?? []).map((format) => (
              <Button key={format} type="button" variant="outline" {...busyWith(exporting, format)} onClick={() => void exportPart(format, 1, format)}>
                {exporting === format ? "Exporting…" : `Export .${format}`}
              </Button>
            ))
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
