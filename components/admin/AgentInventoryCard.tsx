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
import { buttonVariants } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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

function Sponsor({ name }: { name: string }) {
  return name ? <>for {name}</> : <span className="italic">sponsor not found</span>
}

/**
 * One agent. The counts read left to right as what it was asked, what it did
 * and what it was stopped from doing; a refusal is the permission system
 * working, so it takes the brand colour, never the error colour.
 */
function InventoryAgentRow({
  agent: a,
  busy,
  onToggle,
}: {
  agent: InventoryAgent
  busy: boolean
  onToggle: (a: InventoryAgent, next: boolean) => void
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium text-foreground">{a.name}</span>
          <span className="text-muted-foreground">
            <Sponsor name={a.sponsor} />
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {brainText(a.brain)} · {reachText(a)}
          {a.credentials > 0 && <> · {plural(a.credentials, "credential")}</>}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
          <span>{plural(a.runs_7d, "run")}</span>
          <span>{plural(a.actions_7d, "action")}</span>
          <span className={cn(a.refusals_7d > 0 && "font-medium text-primary")}>
            {plural(a.refusals_7d, "refusal")}
            {a.last_refusal_at && a.refusals_7d > 0 && `, last ${relativeTime(a.last_refusal_at)}`}
          </span>
          {a.last_run_at && <span>last ran {relativeTime(a.last_run_at)}</span>}
        </p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {a.is_active ? "Active" : "Paused"}
        <Switch
          checked={a.is_active}
          disabled={busy}
          onCheckedChange={(next) => onToggle(a, next)}
          aria-label={`${a.is_active ? "Pause" : "Resume"} ${a.name}`}
        />
      </label>
    </li>
  )
}

/** One live credential. */
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
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium text-foreground">{c.name}</span>
          <code className="rounded bg-muted px-1 text-2xs text-muted-foreground">{c.token_prefix}…</code>
          <span className="text-muted-foreground">
            <Sponsor name={c.sponsor} />
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {c.agent_id ? <>Acts as {c.agent_name || "an agent"}</> : "Acts as its maker"}
          {" · "}
          {c.scopes.length === 0 ? "no scopes" : c.scopes.join(", ")}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
          <span>{c.last_used_at ? `used ${relativeTime(c.last_used_at)}` : "never used"}</span>
          {c.refusals_7d > 0 && (
            <span className="font-medium text-primary">{plural(c.refusals_7d, "refusal")}</span>
          )}
          {c.expires_at && <span>expires {new Date(c.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onRevoke(c)}>
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
      try {
        await setAgentActive(a.id, next)
        toast({
          title: next ? `${a.name} resumed` : `${a.name} paused`,
          description: next
            ? undefined
            : a.credentials > 0
              ? "It stops now, and so do its credentials."
              : "It stops now. Nothing it started is undone.",
        })
      } catch (e) {
        toast({
          title: `Couldn't ${next ? "resume" : "pause"} ${a.name}`,
          description: apiErrorMessage(e, "Try again in a moment."),
          variant: "destructive",
        })
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
              <div className="rounded-lg border border-border">
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
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
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
              <div className="rounded-lg border border-border">
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
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
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
            {/* Destructive: it can't be undone. It was the orange primary,
                the colour of "go ahead". */}
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => void revoke()}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}

export default AgentInventoryCard
