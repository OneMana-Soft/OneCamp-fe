"use client"

/**
 * AgentInventoryCard: everything that can act in this workspace without being a
 * person at a keyboard, and who answers for it.
 *
 * Two kinds of thing can act. An agent is an identity with a sponsor, a reach
 * and a brain. A credential is a key someone made for a script, an MCP client or
 * an agent. The agents list never showed credentials, and a credential bound to
 * no agent is still a way in, so both sit here with the same three questions:
 * who is behind it, what can it reach, and what did it do or get refused lately.
 *
 * Two controls, both reversible or confirmed: pausing an agent (which also stops
 * every credential bound to it) and revoking a credential.
 */

import * as React from "react"
import { SettingsSection } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SwitchTick } from "@/components/ui/instantSwitch"
import { useSaveStatus } from "@/components/ui/saveStatus"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Bot, Key } from "@/lib/icons"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { cn } from "@/lib/utils/helpers/cn"
import { relativeTime } from "@/lib/utils/relativeTime"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
  getAgentInventory,
  revokeInventoryCredential,
  setAgentActive,
  type AgentInventory,
  type InventoryAgent,
  type InventoryCredential,
} from "@/services/agentService"

/** Where an agent thinks, in words: this workspace's model, or a named remote. */
export function brainText(brain: string): string {
  if (!brain || brain === "workspace") return "Workspace model"
  const i = brain.indexOf(":")
  if (i < 0) return brain
  const kind = brain.slice(0, i)
  const host = brain.slice(i + 1)
  return `${kind === "a2a" ? "A2A" : kind === "agui" ? "AG-UI" : kind} · ${host}`
}

/** What an agent can reach, in words. */
export function reachText(a: Pick<InventoryAgent, "channels" | "tools">): string {
  const where = a.channels === 0 ? "any channel it is mentioned in" : a.channels === 1 ? "1 channel" : `${a.channels} channels`
  const tools = a.tools === 1 ? "1 tool" : `${a.tools} tools`
  return `${where} · ${tools}`
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`


/** A count with its micro label (hub.md AI16): tabular, so the row never reflows. */
function Count({ n, label, refused }: { n: number; label: string; refused?: boolean }) {
  return (
    <span className="flex flex-col items-end leading-none">
      <span className={cn("text-ui tabular-nums", refused && n > 0 ? "font-semibold text-agent-ink" : "text-foreground")}>{n}</span>
      <span className="mt-1 text-3xs font-medium text-ink-3">{label}</span>
    </span>
  )
}

/** Active in moss, Paused in sun. */
function StatePill({ active }: { active: boolean }) {
  return (
    <span data-agent-state={active ? "active" : "paused"} className={cn("inline-flex h-[18px] items-center rounded-[5px] px-1.5 text-3xs font-medium", active ? "bg-camp-moss-tint text-camp-moss-ink" : "bg-camp-sun-tint text-camp-sun-ink")}>
      {active ? "Active" : "Paused"}
    </span>
  )
}

/**
 * One agent (hub.md AI16): its square, its name with the Agent tag, who
 * answers for it, where it thinks and what it reaches; then what it was asked,
 * did and was refused in the window, the refusals in the agent's ink to match
 * the record (a refusal is the permission system working: never the accent,
 * never the error colour), its state and the pause switch. Pausing asks first
 * and names the credentials that stop with it. An agent with no sponsor gets
 * a sun band saying so.
 */
function InventoryAgentRow({
  agent: a,
  busy,
  onToggle,
}: {
  agent: InventoryAgent
  busy: boolean
  onToggle: (a: InventoryAgent, next: boolean) => Promise<unknown>
}) {
  const [confirming, setConfirming] = React.useState(false)
  // Saved with the row's tick and offered back on the toast. Undo goes
  // straight back: a pause the admin just confirmed needs no second ask.
  const { status, run } = useSaveStatus()
  const change = (next: boolean): Promise<boolean> =>
    run(() => onToggle(a, next), {
      what: next ? `${a.name} resumed` : `${a.name} paused`,
      description: next ? undefined : a.credentials > 0 ? "It stops now, and so do its credentials." : "It stops now. Nothing it started is undone.",
      undo: () => change(!next),
    })
  return (
    <li data-inventory-agent="" className="set-row">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="block size-8 shrink-0">
          <AgentAvatar />
        </span>
        {/* The words keep 14rem before the counts give way: on a phone the
            counts and the switch wrap under them, rather than squeezing them
            into a column a word wide. */}
        <div data-inventory-words="" className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
            <span className="font-medium text-foreground">{a.name}</span>
            <span className="inline-flex h-[18px] items-center rounded-[5px] bg-agent-muted px-1.5 text-3xs font-medium text-agent-ink">Agent</span>
          </p>
          <p className="mt-0.5 text-meta text-ink-3">
            {a.sponsor ? <>Sponsor: {a.sponsor}</> : <span className="italic">sponsor not found</span>} · Thinks with: {brainText(a.brain)} · Reaches {reachText(a)}
            {a.credentials > 0 && <> · {plural(a.credentials, "credential")}</>}
            {a.last_refusal_at && a.refusals_7d > 0 && <> · last refused {relativeTime(a.last_refusal_at)}</>}
          </p>
        </div>
        <div data-inventory-counts="" className="flex shrink-0 items-center gap-4 max-sm:ml-12">
          <Count n={a.runs_7d} label="asked" />
          <Count n={a.actions_7d} label="did" />
          <Count n={a.refusals_7d} label={a.refusals_7d === 1 ? "refusal" : "refusals"} refused />
          <StatePill active={a.is_active} />
          <SwitchTick status={status}>
            <Switch
              checked={a.is_active}
              disabled={busy || confirming}
              onCheckedChange={(next) => (next ? void change(true) : setConfirming(true))}
              aria-busy={status.state === "saving" || undefined}
              aria-label={`${a.is_active ? "Pause" : "Resume"} ${a.name}`}
            />
          </SwitchTick>
        </div>
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label={`Pause ${a.name}?`} className="hub-pop-down mt-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-sunken px-3 py-2 ring-1 ring-inset ring-line">
          <p className="min-w-0 flex-1 text-xs text-foreground">
            Pause {a.name}?{" "}
            {a.credentials > 0
              ? `Its ${plural(a.credentials, "credential")} ${a.credentials === 1 ? "stops" : "stop"} too.`
              : "Nothing it started is undone."}
          </p>
          <Button
            size="xs"
            variant="destructive"
            onClick={() => {
              setConfirming(false)
              void change(false)
            }}
          >
            Pause
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {!a.sponsor ? (
        <p data-no-sponsor="" className="mt-2 rounded-md bg-camp-sun-tint px-3 py-1.5 text-meta text-camp-sun-ink">
          No sponsor. Assign one so someone answers for it.
        </p>
      ) : null}
    </li>
  )
}

/** One live credential: bound to an agent, or said plainly that it is not. */
function InventoryCredentialRow({
  credential: c,
  busy,
  onRevoke,
}: {
  credential: InventoryCredential
  busy: boolean
  onRevoke: (c: InventoryCredential) => void
}) {
  return (
    <li className="set-row flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-hover text-ink-2 [&_svg]:size-4">
        <Key aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
          <span className="font-medium text-foreground">{c.name}</span>
          <code className="rounded-xs bg-hover px-1 text-3xs text-ink-3">{c.token_prefix}…</code>
          {c.agent_id ? (
            <span className="text-meta text-ink-3">Bound to {c.agent_name || "an agent"}</span>
          ) : (
            <span data-unbound="" className="inline-flex h-[18px] items-center rounded-[5px] bg-camp-sun-tint px-1.5 text-3xs font-medium text-camp-sun-ink">
              Not bound to an agent
            </span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-meta tabular-nums text-ink-3">
          <span>{c.sponsor ? <>Sponsor: {c.sponsor}</> : <span className="italic">sponsor not found</span>}</span>
          <span>{c.agent_id ? "Acts as its agent" : "Acts as its maker"}</span>
          <span>{c.scopes.length === 0 ? "no scopes" : c.scopes.join(", ")}</span>
          <span>{c.last_used_at ? `used ${relativeTime(c.last_used_at)}` : "never used"}</span>
          {c.refusals_7d > 0 && <span className="font-semibold text-agent-ink">{plural(c.refusals_7d, "refusal")}</span>}
          {c.expires_at && <span>expires {new Date(c.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
        </p>
      </div>
      <Button size="xs" variant="ghost" className="text-danger-ink hover:text-danger-ink" disabled={busy} onClick={() => onRevoke(c)}>
        Revoke
      </Button>
    </li>
  )
}

export function AgentInventoryCard() {
  const { toast } = useToast()
  const [inv, setInv] = React.useState<AgentInventory | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [failure, setFailure] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState<InventoryCredential | null>(null)

  const load = React.useCallback(async () => {
    try {
      setInv(await getAgentInventory())
      setFailed(false)
    } catch (e) {
      setFailure(apiErrorMessage(e, "Try again in a moment."))
      setFailed(true)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const toggle = React.useCallback(
    async (a: InventoryAgent, next: boolean) => {
      setBusy(a.id)
      // Shown at once; the server's answer is the truth and a reload follows.
      setInv((cur) =>
        cur ? { ...cur, agents: cur.agents.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) } : cur,
      )
      // The row says it is saved and offers it back; a failure says why here
      // and rejects, and the reload below puts the switch back.
      try {
        await setAgentActive(a.id, next)
      } catch (e) {
        toast({
          title: `Couldn't ${next ? "resume" : "pause"} ${a.name}`,
          description: apiErrorMessage(e, "Try again in a moment."),
          variant: "destructive",
        })
        throw e
      } finally {
        setBusy(null)
        void load()
      }
    },
    [load, toast],
  )

  const revoke = React.useCallback(async () => {
    const c = revoking
    if (!c) return
    setRevoking(null)
    setBusy(c.id)
    try {
      await revokeInventoryCredential(c.id)
      toast({ title: `${c.name} revoked`, description: "Its next request is refused." })
    } catch (e) {
      toast({ title: `Couldn't revoke ${c.name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(null)
      void load()
    }
  }, [revoking, load, toast])

  const days = inv?.window_days ?? 7

  // A section of the AI tab like the others, a heading, one line and hairline
  // lists, where it was a bordered card of its own.
  return (
    <SettingsSection
      title="Agent inventory"
      description={`Every agent and credential that can act here, the person each one answers to, and what it did or was refused in the last ${days} days.`}
    >
      {failed && !inv ? (
        <ErrorState compact subject="the agent inventory" detail={failure} onRetry={() => void load()} />
      ) : (
        // The two lists' headings are there from the start, and each list
        // loads in its own shape, so nothing moves when the answer lands.
        <div className="grid gap-6">
          <SettingsSection
            level={3}
            title={
              <>
                Agents {inv && <span className="font-normal text-muted-foreground">{inv.agents.length}</span>}
              </>
            }
          >
            {!inv ? (
              <SectionListSkeleton label="Loading the agents" rows={2} lines={3} trailing="switch" />
            ) : inv.agents.length === 0 ? (
              <div className="set-card">
                <EmptyState
                  icon={Bot}
                  hue={ADMIN_GROUP_HUE.ai}
                  title="No agents yet"
                  description="An agent a member builds shows up here, with the person it answers to."
                  headingLevel={4}
                  className="py-6"
                />
              </div>
            ) : (
              <ul className="set-card">
                {inv.agents.map((a) => (
                  <InventoryAgentRow key={a.id} agent={a} busy={busy === a.id} onToggle={toggle} />
                ))}
              </ul>
            )}
          </SettingsSection>
          <SettingsSection
            level={3}
            title={
              <>
                Credentials {inv && <span className="font-normal text-muted-foreground">{inv.credentials.length}</span>}
              </>
            }
          >
            {!inv ? (
              <SectionListSkeleton label="Loading the credentials" rows={1} lines={3} trailing="button" />
            ) : inv.credentials.length === 0 ? (
              <div className="set-card">
                <EmptyState
                  icon={Key}
                  hue={ADMIN_GROUP_HUE.ai}
                  title="No live credentials"
                  description="Nothing outside can act here."
                  headingLevel={4}
                  className="py-6"
                />
              </div>
            ) : (
              <ul className="set-card">
                {inv.credentials.map((c) => (
                  <InventoryCredentialRow key={c.id} credential={c} busy={busy === c.id} onRevoke={setRevoking} />
                ))}
              </ul>
            )}
          </SettingsSection>
        </div>
      )}

      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Whatever uses it stops working on its next request
              {revoking?.sponsor ? `, and ${revoking.sponsor} will need to make a new one` : ""}. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            {/* It can't be undone: the confirm's danger-solid (it was the
                orange primary, the colour of "go ahead"). */}
            <AlertDialogAction variant="dangerSolid" onClick={() => void revoke()}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}

export default AgentInventoryCard
