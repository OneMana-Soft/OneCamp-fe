"use client"

// Settings > Docs (docs C6-2): the workspace's docs policies, and the work of
// people who left.
//
// - Members can export docs (docs.export.members).
// - Longest a link lasts (guest.link.max_days): lowering it stops older links
//   at once, so the admin is told how many first ("12 links older than 30 days
//   stop working now"); raising it brings them back.
// - Sites docs can embed (embed.allowlist), beyond the built-in ones.
// - People who left with docs or links under their name: hand it all on to
//   someone, or turn their links off.
//
// Each saves on its own, with the saved tick, and the server records it.

import * as React from "react"
import { formatDistanceToNow } from "date-fns"

import { SettingRow, SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { switchOffer, useSaveStatus, type UndoOffer } from "@/components/ui/saveStatus"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AllowListChipInput } from "@/components/admin/AllowListChipInput"
import { EMBED_HOST_RULES } from "@/components/admin/allowListEntries"
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker"
import { useFetch } from "@/hooks/useFetch"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { EMBED_SITE_NAMES } from "@/lib/embeds/origins"
import { ADMIN_POLICIES_KEY, type PolicyInfo } from "@/services/workAccessService"
import {
  DEPARTED_KEY,
  DOCS_EXPORT_MEMBERS,
  EMBED_ALLOWLIST,
  GUEST_LINK_MAX_DAYS,
  handOver,
  lifetimeLabel,
  linksStoppedBy,
  setPolicy,
  turnOffLinks,
  type DepartedPerson,
} from "@/services/docAdminService"
import { workSummary } from "@/lib/docs/workSummary"

/** The lifetimes offered, in days; 0 is no limit of the workspace's own. */
const LIFETIMES = [0, 7, 30, 90, 365]

/** Puts a policy's new state into the list every card reads. */
async function keep(after: PolicyInfo) {
  await appMutate<{ data: PolicyInfo[] }>(ADMIN_POLICIES_KEY, (d) => (d ? { ...d, data: d.data.map((p) => (p.key === after.key ? after : p)) } : d), {
    revalidate: false,
  })
}

function ExportRow({ info }: { info: PolicyInfo }) {
  const { status, run } = useSaveStatus()
  const [pending, setPending] = React.useState<boolean | null>(null)
  const change = async (next: boolean) => {
    setPending(next)
    await run(async () => keep(await setPolicy(DOCS_EXPORT_MEMBERS, next)), switchOffer("Members can export docs", next, change))
    setPending(null)
  }
  return (
    <SwitchRow
      id="docs-export"
      label="Members can export docs"
      description="As Markdown, HTML, PDF or Word. Admins always can."
      checked={pending ?? info.value === true}
      disabled={status.state === "saving"}
      status={status}
      onChange={change}
    />
  )
}

/**
 * The sites docs always embed, all of them: an admin decides what to add from
 * what's already allowed. On a phone, the first three and "and N more", which
 * opens in place.
 */
function BuiltInSites() {
  const [open, setOpen] = React.useState(false)
  const names = EMBED_SITE_NAMES as readonly string[]
  const rest = names.length - 3
  return (
    <p className="mb-2 text-ui-sm text-ink-2 text-pretty" data-built-in-sites="">
      <span className={cn(open ? "inline" : "hidden sm:inline")}>{names.join(", ")} always can.</span>
      {!open ? (
        <span className="sm:hidden">
          {names.slice(0, 3).join(", ")} and{" "}
          <button type="button" onClick={() => setOpen(true)} className="rounded-sm font-medium text-ink underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {rest} more
          </button>{" "}
          always can.
        </span>
      ) : null}
    </p>
  )
}

function LifetimeRow({ info }: { info: PolicyInfo }) {
  const { status, run } = useSaveStatus()
  const confirm = useConfirm()
  const { toast } = useToast()
  const saved = Number(info.value) || 0
  const [pending, setPending] = React.useState<number | null>(null)
  const days = LIFETIMES.includes(saved) ? LIFETIMES : [...LIFETIMES, saved].sort((a, b) => (a || Infinity) - (b || Infinity))
  // Back is the limit before, as it was: raising it brings back the links a shorter one stopped.
  const save = async (next: number) => {
    const before = saved
    setPending(next)
    await run(async () => keep(await setPolicy(GUEST_LINK_MAX_DAYS, next)), { what: `Longest a link lasts: ${lifetimeLabel(next)}`, undo: () => save(before) })
    setPending(null)
  }
  const choose = async (next: number) => {
    if (next === saved) return
    // Shorter than now: older links stop at once, so say how many first.
    if (next > 0 && (saved === 0 || next < saved)) {
      let stopped: number
      try {
        stopped = await linksStoppedBy(next)
      } catch (e) {
        toast({ title: "The links couldn't be counted", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        return
      }
      if (stopped > 0) {
        confirm({
          title: `Shorten links to ${lifetimeLabel(next)}?`,
          description: `${stopped === 1 ? "1 link" : `${stopped} links`} older than ${lifetimeLabel(next)} stop working now. Raising the limit later brings them back.`,
          confirmText: "Shorten links",
          destructive: true,
          onConfirm: () => save(next),
        })
        return
      }
    }
    await save(next)
  }
  return (
    <SettingRow
      label="Longest a link lasts"
      description="Every guest link and published page, from when it was made. Personal meeting rooms aren't limited."
      controlId="docs-link-lifetime"
      status={status}
      layout="stacked"
    >
      <SegmentedControl
        id="docs-link-lifetime"
        aria-label="Longest a link lasts"
        aria-describedby="docs-link-lifetime-desc"
        value={String(pending ?? saved)}
        onValueChange={(v) => void choose(Number(v))}
        options={days.map((d) => ({ value: String(d), label: lifetimeLabel(d) }))}
        disabled={status.state === "saving"}
      />
    </SettingRow>
  )
}

function EmbedRow({ info }: { info: PolicyInfo }) {
  const { status, run } = useSaveStatus()
  const saved = React.useMemo(() => (Array.isArray(info.value) ? (info.value as string[]) : []), [info.value])
  const [draft, setDraft] = React.useState<string[] | null>(null)
  const [refusal, setRefusal] = React.useState("")
  const hosts = draft ?? saved
  const changed = draft !== null && draft.join(" ") !== saved.join(" ")
  const put = async (list: string[], offer?: UndoOffer) => {
    setRefusal("")
    const ok = await run(async () => {
      try {
        await keep(await setPolicy(EMBED_ALLOWLIST, list.length ? list : null))
      } catch (e) {
        setRefusal(apiErrorMessage(e, "Those sites couldn't be saved."))
        throw e
      }
    }, offer)
    if (ok) setDraft(null)
  }
  const save = () => put(hosts, { what: "Sites docs can embed", undo: () => put(saved) })
  return (
    <SettingRow
      label="Sites docs can embed"
      description="Add your own sites; *.example.com covers its subdomains."
      controlId="docs-embed-sites"
      // A refusal is said once, under the field: the row keeps its hint and its dot.
      status={refusal ? { ...status, error: undefined } : status}
      layout="stacked"
      control="field"
    >
      <BuiltInSites />
      <AllowListChipInput
        id="docs-embed-sites"
        value={hosts}
        rules={EMBED_HOST_RULES}
        refusal={refusal}
        describedBy="docs-embed-sites-desc"
        onChange={(next) => {
          setDraft(next)
          setRefusal("")
        }}
      />
      {changed ? (
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={status.state === "saving" || hosts.some((h) => !!EMBED_HOST_RULES.problem(h))}>
            Save sites
          </Button>
        </div>
      ) : null}
    </SettingRow>
  )
}

function HandOverDialog({ person, onClose }: { person: DepartedPerson; onClose(): void }) {
  const [to, setTo] = React.useState<PickedPerson[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const { toast } = useToast()
  const go = async () => {
    if (!to[0] || busy) return
    setBusy(true)
    setError("")
    try {
      const moved = await handOver(person.user_uuid, to[0].uuid)
      toast({
        title: `Handed on to ${to[0].name}`,
        description: moved.failed
          ? `${workSummary(moved.docs, moved.links)} moved. ${moved.failed === 1 ? "1 doc" : `${moved.failed} docs`} couldn't, so try again later.`
          : `${workSummary(moved.docs, moved.links)} moved.`,
      })
      await appMutate(DEPARTED_KEY)
      onClose()
    } catch (e) {
      setError(apiErrorMessage(e, "Their work couldn't be handed on. Try again in a moment."))
      await appMutate(DEPARTED_KEY)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ResponsiveDialog
      title={`Hand on ${person.name}'s work`}
      description={`${workSummary(person.docs, person.links)}. Each doc's people see who it went to, and links and pages keep working.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void go()} busy={busy} disabled={!to[0]}>
            Hand on
          </Button>
        </>
      }
    >
      <label htmlFor="handover-to" className="text-ui-sm font-medium text-ink-2">
        To
      </label>
      <div className="mt-1">
        <PeoplePicker id="handover-to" value={to} onChange={(people) => setTo(people.slice(-1))} placeholder="Someone in the workspace" />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger-ink text-pretty">
          {error}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}

function DepartedRow({ person, onHandOver }: { person: DepartedPerson; onHandOver(): void }) {
  const confirm = useConfirm()
  const { toast } = useToast()
  const left = formatDistanceToNow(new Date(person.left_at), { addSuffix: true })
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-departed={person.user_uuid}>
      <IdentityMark variant="avatar" size={28} id={avatarSeed(person.name)} label={person.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{person.name}</p>
        <p className="text-meta text-ink-3">
          Left {left} · {workSummary(person.docs, person.links)}
        </p>
      </div>
      {/* On a phone the actions take their own line under the name, so the name isn't squeezed. */}
      <div className="flex items-center gap-1 max-sm:basis-full max-sm:pl-10">
        {person.links > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-ink hover:text-danger-ink"
            onClick={() =>
              confirm({
                title: `Turn off ${person.name}'s links?`,
                description: `${person.links === 1 ? "Their 1 link stops" : `All ${person.links} of their links stop`} working now, published pages included. To share again, someone makes a new link.`,
                confirmText: "Turn off links",
                destructive: true,
                onConfirm: async () => {
                  try {
                    const n = await turnOffLinks(person.user_uuid)
                    toast({ title: n === 1 ? "1 link turned off" : `${n} links turned off` })
                  } catch (e) {
                    toast({ title: "Their links weren't turned off", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
                  }
                  await appMutate(DEPARTED_KEY)
                },
              })
            }
          >
            Turn off links
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onHandOver}>
          Hand on…
        </Button>
      </div>
    </li>
  )
}

function DepartedSection() {
  const departed = useFetch<{ data?: { people?: DepartedPerson[] } }>(DEPARTED_KEY, undefined, undefined, OWN_ERRORS)
  const [handing, setHanding] = React.useState<DepartedPerson | null>(null)
  const people = departed.data?.data?.people ?? []
  let body: React.ReactNode
  if (!departed.data && !departed.isError) {
    body = (
      <SettingsCard aria-label="Loading the people who left">
        <SettingsRowsSkeleton rows={2} control="button" />
      </SettingsCard>
    )
  } else if (departed.isError && !departed.data) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the people who left" onRetry={() => void departed.mutate()} />
      </SettingsCard>
    )
  } else if (!people.length) {
    body = (
      <SettingsCard>
        <p className="px-4 py-3 text-ui text-ink-2" data-departed-empty="">
          No one who left has docs or links under their name.
        </p>
      </SettingsCard>
    )
  } else {
    body = (
      <SettingsCard>
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <DepartedRow key={p.user_uuid} person={p} onHandOver={() => setHanding(p)} />
          ))}
        </ul>
      </SettingsCard>
    )
  }
  return (
    <SettingsSection
      id="docs-departed"
      title="People who left"
      description="Their docs stay theirs and their links keep working until you hand them on or turn them off."
    >
      {body}
      {handing ? <HandOverDialog person={handing} onClose={() => setHanding(null)} /> : null}
    </SettingsSection>
  )
}

export default function DocPoliciesCard() {
  const policies = useFetch<{ data: PolicyInfo[] }>(ADMIN_POLICIES_KEY, undefined, undefined, OWN_ERRORS)
  const byKey = new Map((policies.data?.data ?? []).map((p) => [p.key, p]))
  let body: React.ReactNode
  if (!policies.data && !policies.isError) {
    body = (
      <SettingsCard aria-label="Loading the docs policies">
        <SettingsRowsSkeleton rows={3} />
      </SettingsCard>
    )
  } else if (policies.isError && !policies.data) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the docs policies" onRetry={() => void policies.mutate()} />
      </SettingsCard>
    )
  } else {
    const exp = byKey.get(DOCS_EXPORT_MEMBERS)
    const life = byKey.get(GUEST_LINK_MAX_DAYS)
    const embed = byKey.get(EMBED_ALLOWLIST)
    body = (
      <SettingsCard>
        {exp ? <ExportRow info={exp} /> : null}
        {life ? <LifetimeRow info={life} /> : null}
        {embed ? <EmbedRow info={embed} /> : null}
      </SettingsCard>
    )
  }
  return (
    <>
      <SettingsSection id="docs-policies" title="Policies" description="What members can do with docs, and how long the links they share last.">
        {body}
      </SettingsSection>
      <DepartedSection />
    </>
  )
}
