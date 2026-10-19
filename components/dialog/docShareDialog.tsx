"use client"

import { apiErrorMessage } from "@/lib/utils/apiError"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import * as React from "react"
import { useSelector } from "react-redux"
import { Building2, Inbox, Lock } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"
import { ChromeSheet } from "@/components/docEditor/chrome/Sheet"
import { InlineError } from "@/components/docEditor/chrome/parts"
import { useEditionGate } from "@/components/docEditor/registry/gate"
import { panelFor } from "@/components/docEditor/registry/registry"
import { PanelOutlet } from "@/components/docEditor/registry/slots"
import { busForDoc } from "@/components/docEditor/registry/commandBus"
import { toast } from "@/hooks/use-toast"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { ACCESS_LEVEL_LABEL } from "@/lib/docAccess"
import { docInfoKey, docShared } from "@/lib/docCache"
import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { appMutate, patchCached } from "@/lib/swrMutate"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { accessRequestsKey, answerDocAccess, docAccessKey, previewDocAccess, updateDocAccess } from "@/services/docAccessService"
import { inviteToDoc, searchPeople } from "@/services/docChromeService"
import { childrenKey, type Envelope } from "@/services/docGraphService"
import { resourceGuestLinksKey, type ResourceGuestLink } from "@/services/guestService"
import { GetEndpointUrl } from "@/services/endPoints"
import type { RootState } from "@/store/store"
import type { DocInfoResponse } from "@/types/doc"
import type { AccessPerson, DocAccess, DocAccessChange, DocAccessRequest, DocAccessRequests, DocSharing, SharedPerson, SharedTeam } from "@/types/docAccess"
import type { DocChildren } from "@/types/docGraph"
import type { TeamListResponseInterface } from "@/types/team"
import type { UserProfileInterface } from "@/types/user"
import {
  AccessCard,
  CopyLinkButton,
  InviteRow,
  LevelMenu,
  ShareHeading,
  ShareRecordedNote,
  ShareTeamRow,
  UntilNote,
  type GrantLevel,
  type InvitePick,
} from "@/components/dialog/shareParts"

const ALL: GrantLevel[] = ["full", "edit", "comment", "view"]
const TEAM: GrantLevel[] = ["edit", "comment", "view"]
type General = DocSharing["general"]
type Audience = "private" | "space" | "workspace"
const RANK: Record<General["level"], number> = { view: 1, comment: 2, edit: 3 }

/** A grant's end, kept when its level changes (A5 ends a grant changed without one). Pure. */
const stillAhead = (until?: string) => (until && new Date(until).getTime() > Date.now() ? until : undefined)

/** The sharing after a change, as the dialog shows it until the server says (N49). Pure. */
export function sharingAfter(s: DocSharing, c: Omit<DocAccessChange, "doc_uuid">, names: Map<string, AccessPerson> = new Map(), teamNames: Map<string, { name: string; members: number }> = new Map()): DocSharing {
  let people = [...s.people]
  let teams = [...s.teams]
  for (const r of c.removes ?? []) {
    if (r.kind === "team") teams = teams.filter((t) => t.team_uuid !== r.uuid)
    else people = people.filter((p) => p.user_uuid !== r.uuid)
  }
  for (const a of c.adds ?? []) {
    if (!a.level) continue
    if (a.kind === "team") {
      const was = teams.find((t) => t.team_uuid === a.uuid)
      const team: SharedTeam = {
        team_uuid: a.uuid,
        team_name: was?.team_name ?? teamNames.get(a.uuid)?.name ?? "Team",
        members: was?.members ?? teamNames.get(a.uuid)?.members ?? 0,
        level: (a.level === "full" ? "edit" : a.level) as SharedTeam["level"],
        until: a.until,
      }
      teams = was ? teams.map((t) => (t.team_uuid === a.uuid ? team : t)) : [...teams, team]
    } else {
      const was = people.find((p) => p.user_uuid === a.uuid)
      const person: SharedPerson = { ...(was ?? names.get(a.uuid) ?? { user_uuid: a.uuid }), user_uuid: a.uuid, level: a.level, until: a.until }
      people = was ? people.map((p) => (p.user_uuid === a.uuid ? person : p)) : [...people, person]
    }
  }
  const general: General = c.general
    ? c.general.level === "none" && c.general.private === undefined
      ? { private: true, level: "view" }
      : { private: c.general.private ?? s.general.private, level: (c.general.level && c.general.level !== "none" ? c.general.level : s.general.level) as General["level"] }
    : s.general
  return { ...s, people, teams, general }
}

/** Who a general access reaches, by name. Pure. */
export function audienceOf(g: General, space?: DocSharing["space"]): Audience {
  return !g.private ? "workspace" : space ? "space" : "private"
}

function PersonRow({ person, you, canEdit, levels, onLevel, onUntil, onRemove }: {
  person: SharedPerson
  you: boolean
  canEdit: boolean
  levels: GrantLevel[]
  onLevel: (l: GrantLevel) => void
  onUntil: (until: string | null) => void
  onRemove: () => void
}) {
  const { src } = useUserAvatar(person.user_profile_object_key ?? undefined)
  const name = displayNameOf(person) || "Someone"
  return (
    <div className="content-row-in flex min-h-11 items-center gap-3 rounded-lg py-1" data-share-row="" data-share-person={person.user_uuid}>
      <IdentityMark variant="avatar" size={28} id={avatarSeed(person)} label={name} src={src} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium text-ink">
          {name}
          {you ? <span className="font-normal text-ink-3"> (you)</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {addressOrHandleOf(person) ? <span className="truncate text-meta text-ink-3">{addressOrHandleOf(person)}</span> : null}
          <UntilNote until={person.until} />
        </span>
      </div>
      <LevelMenu value={person.level as GrantLevel} levels={levels} who={name} canEdit={canEdit && !you} onChange={onLevel} onUntil={onUntil} onRemove={onRemove} />
    </div>
  )
}

/** Someone asking for access, with the level to give them: Approve or Decline. */
function RequestRow({ request, onAnswer }: { request: DocAccessRequest; onAnswer: (approve: boolean, level?: GrantLevel) => Promise<void> }) {
  const [level, setLevel] = React.useState<GrantLevel>(request.level_wanted)
  const [busy, setBusy] = React.useState(false)
  const who = request.requester ? displayNameOf(request.requester) || "Someone" : "Someone"
  const answer = async (approve: boolean) => {
    setBusy(true)
    try {
      await onAnswer(approve, level)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:gap-3" data-share-request={request.id}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IdentityMark variant="avatar" size={28} id={avatarSeed(request.requester)} label={who} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-ui font-medium text-ink">{who}</span>
          <span className="line-clamp-2 text-meta text-ink-2">
            Asks to {request.level_wanted === "view" ? "view" : request.level_wanted === "comment" ? "comment" : "edit"}
            {request.note ? `: “${request.note}”` : ""}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        <LevelMenu value={level} levels={["edit", "comment", "view"]} who={who} canEdit onChange={setLevel} />
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer(false)}>
          Decline
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void answer(true)} data-share-approve="">
          Approve
        </Button>
      </div>
    </div>
  )
}

interface DocShareDialogProps {
  dialogOpenState: boolean
  setOpenState: () => void
  docId?: string
}

/**
 * Share a doc (B6 on A5; content.md D18, collaboration.md P1-C): who has it
 * (its owner, people and teams, each at Full access, Can edit, Can comment
 * or Can view, until a date or for good), the requests waiting, who else
 * may open it (general access, Everyone can edit included), "Change the pages
 * under it too", and its links for people outside the workspace. Full access
 * changes any of it; someone who can edit invites, at their own level or
 * below; everyone else is told who to ask. Each change shows at once and is
 * written back to the cache it came from, so a refresh in between never
 * undoes it (N49). Two tabs, Share and Publish, the second only once C6
 * registers it.
 */
export function DocShareDialog({ dialogOpenState, setOpenState, docId: propDocId }: DocShareDialogProps) {
  const reduxDocId = useSelector((state: RootState) => state.ui.docShare.docId)
  const docId = propDocId || reduxDocId
  const open = dialogOpenState && !!docId
  const gate = useEditionGate()
  const accessQ = useFetch<{ data?: DocAccess }>(open ? docAccessKey(docId) : "", undefined, undefined, OWN_ERRORS)
  const doc = useFetch<DocInfoResponse>(open ? docInfoKey(docId) : "", undefined, undefined, OWN_ERRORS).data?.data
  const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  const [optimistic, setOptimistic] = React.useState<DocAccess | null>(null)
  const pending = React.useRef(0)
  const access = optimistic ?? accessQ.data?.data
  const sharing = access?.sharing
  const full = !!access?.can_share
  const canInvite = full || access?.level === "edit"
  const requests = useFetch<{ data?: DocAccessRequests }>(open && full ? accessRequestsKey(docId) : "", undefined, undefined, OWN_ERRORS)
  const incoming = (requests.data?.data?.incoming ?? []).filter((r) => r.status === "pending" && r.doc_uuid === docId)
  const teamsQ = useFetch<TeamListResponseInterface>(open && canInvite ? GetEndpointUrl.GetUserTeamList : "", undefined, undefined, OWN_ERRORS)
  const kids = useFetch<Envelope<DocChildren>>(open && full ? childrenKey(docId, { limit: 1 }) : "", undefined, undefined, OWN_ERRORS).data?.data
  const links = useFetch<{ data?: ResourceGuestLink[] }>(open && full ? resourceGuestLinksKey("doc", docId) : "", undefined, undefined, OWN_ERRORS).data?.data
  const [subpages, setSubpages] = React.useState(false)
  const [tab, setTab] = React.useState<"share" | "publish">("share")
  // guestLinks: how many guest links the change turns off; null when they couldn't be read.
  const [confirming, setConfirming] = React.useState<null | { change: Omit<DocAccessChange, "doc_uuid">; summary: string; guestLinks: number | null }>(null)
  const [error, setError] = React.useState("")
  const title = doc?.doc_title?.trim() || "Untitled"
  const names = React.useRef(new Map<string, AccessPerson>())
  const teamNames = React.useRef(new Map<string, { name: string; members: number }>())
  const publish = panelFor("doc.publish", gate)

  /**
   * Makes a change: shown at once (the dialog's copy and the cached answer),
   * then sent; the copy stays until the server's answer is back in the
   * cache, so a refresh in flight can't undo it (N49). A failure puts the
   * server's sharing back and says why.
   */
  const apply = async (change: Omit<DocAccessChange, "doc_uuid">, opts: { invite?: boolean } = {}) => {
    const base = access
    setError("")
    if (base?.sharing) {
      const next: DocAccess = { ...base, sharing: sharingAfter(base.sharing, change, names.current, teamNames.current) }
      setOptimistic(next)
      patchCached<{ data?: DocAccess }>(docAccessKey(docId), (a) => (a?.data ? { ...a, data: next } : a))
    }
    pending.current++
    try {
      if (opts.invite) await inviteToDoc({ doc_uuid: docId, adds: change.adds })
      else await updateDocAccess({ doc_uuid: docId, ...change, ...(full && subpages ? { apply_to_subpages: true } : {}) })
      if (change.general) docShared(docId)
    } catch (e) {
      // An invite says so in its own row.
      if (!opts.invite) setError(apiErrorMessage(e, "That change wasn't saved. Try again."))
      throw e
    } finally {
      await appMutate(docAccessKey(docId)).catch(() => undefined)
      pending.current--
      if (pending.current === 0) setOptimistic(null)
    }
  }
  const quietly = (p: Promise<unknown>) => void p.catch(() => undefined)

  const onInvite = async (picked: InvitePick[], level: GrantLevel, until: string | null) => {
    for (const p of picked) {
      if (p.kind === "user") names.current.set(p.id, p.user)
      else teamNames.current.set(p.id, { name: p.name, members: p.members ?? 0 })
    }
    const adds = picked.map((p) => ({ kind: p.kind, uuid: p.id, level: p.kind === "team" && level === "full" ? ("edit" as const) : level, ...(until ? { until } : {}) }))
    await apply({ adds }, { invite: !full })
    toast({ title: picked.length === 1 ? `${picked[0].name} can open it now` : `${picked.length} invited`, description: until ? "Until the date you chose." : undefined })
  }

  /**
   * A change that may take access away is said first: "3 people lose access."
   * It fails closed: when who it reaches couldn't be checked, or the doc's
   * guest links couldn't be read (the server turns them off with a doc made
   * private, D-8), the question is asked anyway.
   */
  const narrow = async (change: Omit<DocAccessChange, "doc_uuid">, makesPrivate: boolean) => {
    const guestLinks = !makesPrivate ? 0 : links ? links.length : null
    try {
      const ex = await previewDocAccess({ doc_uuid: docId, ...change, ...(subpages ? { apply_to_subpages: true } : {}) })
      const losing = ex.lose > 0 || (ex.everyone && ex.everyone.to === "none")
      if (!losing && guestLinks === 0) return quietly(apply(change))
      setConfirming({ change, summary: ex.summary, guestLinks })
    } catch {
      setConfirming({ change, summary: "Couldn't check who gains or loses access.", guestLinks })
    }
  }

  const setGeneral = (audience: Audience, level: General["level"]) => {
    if (!sharing) return
    const change: Omit<DocAccessChange, "doc_uuid"> =
      audience === "private" ? { general: { level: "none" } } : { general: { private: audience === "space", level } }
    const before = sharing.general
    const widening = audience === "workspace" ? before.private || RANK[level] >= RANK[before.level] : audience === "space" && !before.private ? false : RANK[level] > RANK[before.level]
    if (widening) quietly(apply(change))
    else void narrow(change, audience === "private" || (audience === "space" && !before.private))
  }

  const answer = async (r: DocAccessRequest, approve: boolean, level?: GrantLevel) => {
    try {
      await answerDocAccess(r, approve ? { approve, level } : { approve })
      toast({ title: approve ? `${r.requester ? displayNameOf(r.requester) : "They"} can open it now` : "Request declined" })
      void requests.mutate()
    } catch (e) {
      toast({ title: "The request wasn't answered", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }

  const existing = React.useMemo(
    () => new Set([sharing?.owner?.user_uuid, ...(sharing?.people ?? []).map((p) => p.user_uuid), ...(sharing?.teams ?? []).map((t) => t.team_uuid)].filter(Boolean) as string[]),
    [sharing],
  )
  const teams = (teamsQ.data?.data ?? []).map((t) => ({ team_uuid: t.team_uuid, team_name: t.team_name, team_member_count: t.team_member_count }))
  const audience = sharing ? audienceOf(sharing.general, sharing.space) : "private"
  const audiences: { value: Audience; label: string; description: string }[] = sharing?.space
    ? [
        { value: "space", label: `Everyone in ${sharing.space.name}`, description: `Its ${sharing.space.members === 1 ? "1 member" : `${sharing.space.members} members`}, and the people added.` },
        { value: "workspace", label: "Everyone in the workspace", description: "Everyone signed in can find it." },
      ]
    : [
        { value: "private", label: "Only people added", description: "Only the people and teams above can open it." },
        { value: "workspace", label: "Everyone in the workspace", description: "Everyone signed in can find it." },
      ]
  const owner = sharing?.owner
  const youOwn = !!owner && owner.user_uuid === me?.user_uuid

  const shareTab = !access ? (
    <p className="py-6 text-center text-ui-sm text-ink-3">{accessQ.isError ? "Couldn't load who has access. Try again in a moment." : "Loading who has access…"}</p>
  ) : !sharing ? (
    <div className="flex flex-col gap-2 rounded-xl bg-sunken p-4" data-share-reader="">
      <p className="text-ui font-medium text-ink">You can {access.level === "comment" ? "read and comment on" : "read"} this doc</p>
      <p className="text-ui-sm text-ink-2">Only people who can edit it see who else has it. Ask its owner to share it with someone.</p>
    </div>
  ) : (
    <>
      {incoming.length ? (
        <section className="flex flex-col gap-1 rounded-xl bg-[var(--camp-sky-tint)] px-3 py-2" aria-label="Requests" data-share-requests="">
          <ShareHeading>
            <span className="inline-flex items-center gap-1.5 text-[var(--camp-sky-ink)]">
              <Inbox aria-hidden="true" className="size-3.5" />
              {incoming.length === 1 ? "1 person asked for access" : `${incoming.length} people asked for access`}
            </span>
          </ShareHeading>
          {incoming.map((r) => (
            <RequestRow key={r.id} request={r} onAnswer={(approve, level) => answer(r, approve, level)} />
          ))}
        </section>
      ) : null}

      {canInvite ? (
        <InviteRow
          searchPeople={searchPeople}
          teams={teams}
          levels={full ? ALL : TEAM}
          defaultLevel="edit"
          existing={existing}
          onInvite={onInvite}
          placeholder={full ? "Add people or teams" : "Invite people or teams, up to Can edit"}
        />
      ) : null}

      <section className="flex flex-col gap-1.5" aria-label="People with access">
        <ShareHeading>People with access</ShareHeading>
        <div className="flex flex-col">
          {owner ? (
            <div className="flex min-h-11 items-center gap-3 rounded-lg py-1" data-share-owner="">
              <IdentityMark variant="avatar" size={28} id={avatarSeed(owner)} label={displayNameOf(owner) || "Owner"} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-ink">
                  {displayNameOf(owner) || "Someone"}
                  {youOwn ? <span className="font-normal text-ink-3"> (you)</span> : null}
                </span>
                {sharing.recoveries?.length ? <span className="block text-meta text-[var(--camp-sun-ink)]">Recovered by a workspace admin</span> : null}
                {youOwn ? (
                  <button
                    type="button"
                    className="rounded-sm text-meta text-ink-3 underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                    onClick={() => {
                      setOpenState()
                      busForDoc(docId)?.emit("openDialog", { id: "doc.transfer" })
                    }}
                  >
                    Transfer ownership…
                  </button>
                ) : null}
              </div>
              <span className="shrink-0 pr-2 text-ui-sm text-ink-3">Owner</span>
            </div>
          ) : null}
          {sharing.people.map((p) => (
            <PersonRow
              key={p.user_uuid}
              person={p}
              you={p.user_uuid === me?.user_uuid}
              canEdit={full}
              levels={ALL}
              onLevel={(level) => quietly(apply({ adds: [{ kind: "user", uuid: p.user_uuid, level, until: stillAhead(p.until) }] }))}
              onUntil={(until) => quietly(apply({ adds: [{ kind: "user", uuid: p.user_uuid, level: p.level as GrantLevel, ...(until ? { until } : {}) }] }))}
              onRemove={() => quietly(apply({ removes: [{ kind: "user", uuid: p.user_uuid }] }))}
            />
          ))}
          {sharing.teams.map((t) => (
            <ShareTeamRow key={t.team_uuid} name={t.team_name} members={t.members} until={t.until}>
              <LevelMenu
                value={t.level}
                levels={TEAM}
                who={t.team_name}
                canEdit={full}
                onChange={(level) => quietly(apply({ adds: [{ kind: "team", uuid: t.team_uuid, level, until: stillAhead(t.until) }] }))}
                onUntil={(until) => quietly(apply({ adds: [{ kind: "team", uuid: t.team_uuid, level: t.level, ...(until ? { until } : {}) }] }))}
                onRemove={() => void narrow({ removes: [{ kind: "team", uuid: t.team_uuid }] }, false)}
              />
            </ShareTeamRow>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="General access">
        <ShareHeading>General access</ShareHeading>
        <AccessCard
          tile={
            audience === "private" ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-hover text-ink-2 [&>svg]:size-4" data-access-tile="restricted">
                <Lock aria-hidden="true" />
              </span>
            ) : (
              <span className="inline-flex shrink-0" data-access-tile={audience}>
                <Tile hue={audience === "space" ? "dusk" : "sky"} size="md">
                  <Building2 aria-hidden="true" />
                </Tile>
              </span>
            )
          }
          label={audiences.find((a) => a.value === audience)?.label ?? ""}
          description={audiences.find((a) => a.value === audience)?.description ?? ""}
          options={audiences}
          value={audience}
          onChange={(v) => setGeneral(v as Audience, sharing.general.level)}
          disabled={!full}
          aside={
            audience !== "private" ? (
              full ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-ui-sm font-medium text-ink-2" data-share-general-level="">
                      {ACCESS_LEVEL_LABEL[sharing.general.level]}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["edit", "comment", "view"] as const).map((l) => (
                      <DropdownMenuItem key={l} onSelect={() => l !== sharing.general.level && setGeneral(audience, l)} data-level={l}>
                        {ACCESS_LEVEL_LABEL[l]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="shrink-0 text-ui-sm text-ink-3">{ACCESS_LEVEL_LABEL[sharing.general.level]}</span>
              )
            ) : undefined
          }
        />
        {confirming ? (
          <div role="alertdialog" aria-label="Before the change" className="flex flex-col gap-2 rounded-xl bg-[color-mix(in_oklab,var(--destructive)_7%,var(--sunken))] p-3" data-share-confirm="">
            {confirming.summary ? <p className="text-ui-sm font-medium text-ink">{confirming.summary}</p> : null}
            {confirming.guestLinks === null ? (
              <p className="text-ui-sm text-ink-2">Its guest links for people outside the workspace couldn&apos;t be checked. Turn off any it has too?</p>
            ) : confirming.guestLinks ? (
              <p className="text-ui-sm text-ink-2">
                It has {confirming.guestLinks === 1 ? "a guest link" : `${confirming.guestLinks} guest links`} for people outside the workspace. Turn {confirming.guestLinks === 1 ? "it" : "them"} off too?
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              {confirming.guestLinks !== 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const c = confirming.change
                    setConfirming(null)
                    quietly(apply({ ...c, guest_links: "keep" }))
                  }}
                >
                  Keep the links
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="destructive"
                data-share-confirm-change=""
                onClick={() => {
                  const c = confirming.change
                  setConfirming(null)
                  quietly(apply({ ...c, ...(confirming.guestLinks !== 0 ? { guest_links: "revoke" as const } : {}) }))
                }}
              >
                {confirming.guestLinks !== 0 ? "Turn them off" : "Change it"}
              </Button>
            </div>
          </div>
        ) : null}
        {full && (kids?.count ?? 0) + (kids?.hidden ?? 0) > 0 ? (
          <label className="flex items-center gap-3 rounded-xl px-1 py-1.5" data-share-subpages="">
            <span className="min-w-0 flex-1">
              <span className="block text-ui-sm text-ink">Change the pages under it too</span>
              <span className="block text-meta text-ink-3">Each change here reaches its subpages you have full access to.</span>
            </span>
            <Switch checked={subpages} onCheckedChange={setSubpages} aria-label="Change the pages under it too" />
          </label>
        ) : null}
        <GuestLinkSection card resourceType="doc" resourceId={docId} canShare={full} />
      </section>
      <InlineError>{error}</InlineError>
    </>
  )

  return (
    <ChromeSheet
      open={dialogOpenState}
      onClose={setOpenState}
      title={`Share “${title}”`}
      description={full ? "People you add get an email and a link." : canInvite ? "You can invite people at your own level, up to Can edit." : undefined}
      size="md"
      data-share-dialog="doc"
      tertiary={<ShareRecordedNote />}
      footer={
        <>
          <CopyLinkButton href={typeof window !== "undefined" ? `${window.location.origin}/app/doc/${docId}` : undefined} />
          <Button variant="ghost" size="sm" onClick={setOpenState}>
            Done
          </Button>
        </>
      }
    >
      {publish ? (
        <div role="tablist" aria-label="Share or publish" className="flex items-center gap-1 border-b border-line pb-2">
          {(["share", "publish"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-7 rounded-md px-2.5 text-ui-sm outline-none focus-visible:ring-2 focus-visible:ring-brand",
                tab === t ? "bg-press font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              {t === "share" ? "Share" : publish.title}
            </button>
          ))}
        </div>
      ) : null}
      {/* Its own scroller in the dialog only: in the phone's sheet the sheet's body scrolls it (ChromeSheet). */}
      <div className="flex flex-col gap-5 sm:max-h-[min(62dvh,560px)] sm:overflow-y-auto" role={publish ? "tabpanel" : undefined}>
        {tab === "publish" && publish ? <PanelOutlet kind="doc.publish" docId={docId} gate={gate} /> : shareTab}
      </div>
    </ChromeSheet>
  )
}
