"use client"

/**
 * AgentDelegationCard — the admin control for agent-to-agent delegation.
 *
 * Its own card rather than another section inside AIModelsCard (already ~2,700
 * lines) because this is one coherent policy with its own save, and because a
 * setting that changes who can spend money deserves to be findable rather than
 * buried three screens down someone else's form.
 *
 * The three values save TOGETHER, matching the API. They are one policy: enabling
 * delegation while a stale surface list is still stored would open places the admin
 * did not just choose, and saving surfaces without the flag looks like it took
 * effect when nothing changed. So there is one Save, and it is disabled until
 * something actually differs from what is stored — no "did that apply?" ambiguity.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { ShieldAlert, Users } from "@/lib/icons"
import { getAIConfig, setAIAgentDelegation, type AIConfig } from "@/services/aiModelService"

// Self-contained: it fetches its own config, like every sibling admin card, so the
// admin page does not have to know this card exists beyond rendering it, and a save
// re-reads rather than trusting local state to match what the server stored.

/** Hops an admin may choose. Mirrors the DB CHECK (1-5) so the UI cannot offer a
 *  value the server will clamp — a silently-corrected setting is a lie. */
const HOP_CHOICES = [1, 2, 3, 4, 5] as const

export function AgentDelegationCard() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AIConfig | undefined>()
  const vetoed = !!settings?.agent_delegation_vetoed_by_env

  const [enabled, setEnabled] = useState(false)
  const [maxHops, setMaxHops] = useState(2)
  const [surfaces, setSurfaces] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setSettings(await getAIConfig())
    } catch {
      // Leave the form on its defaults. A failed read must not block the rest of
      // the settings screen, and Save re-reads afterwards anyway.
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Re-sync whenever stored settings arrive or change, so the form always starts
  // from the truth rather than from a stale first render.
  useEffect(() => {
    if (!settings) return
    setEnabled(!!settings.agent_delegation_enabled)
    setMaxHops(settings.agent_delegation_max_hops || 2)
    setSurfaces(settings.agent_delegation_surfaces || "")
  }, [settings])

  const dirty = useMemo(() => {
    if (!settings) return false
    return (
      enabled !== !!settings.agent_delegation_enabled ||
      maxHops !== (settings.agent_delegation_max_hops || 2) ||
      surfaces.trim() !== (settings.agent_delegation_surfaces || "").trim()
    )
  }, [settings, enabled, maxHops, surfaces])

  // Enabled with no surface named does nothing, so say so before they save rather
  // than letting them discover it from silence.
  const enabledButNowhere = enabled && surfaces.trim() === ""

  const handleSave = async () => {
    setSaving(true)
    try {
      await setAIAgentDelegation(enabled, maxHops, surfaces.trim())
      toast({ title: "Saved", description: "Agent collaboration policy updated." })
      // Re-read rather than assume: the server clamps hops, so what was stored may
      // differ from what was sent, and the form should show the truth.
      await load()
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : "Failed to update the policy.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Agent collaboration
        </CardTitle>
        <CardDescription>
          Let one AI teammate hand work to another — a triage agent asking a coding agent to
          open a pull request, for example. Every hop is attributed to the person who started
          the chain, and an agent can never reach a teammate that person couldn&apos;t have
          asked themselves.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {vetoed && (
          <div
            className="flex items-start gap-2.5 rounded-md border border-warning/20 bg-warning/10 p-3"
            role="status"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-foreground/80">
              Turned off for this deployment (<code className="text-2xs">AI_AGENT_DELEGATION</code>).
              An operator has decided agents must not hand work to each other here, and that
              cannot be overridden from this screen.
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="agent-delegation-enabled" className="text-sm font-medium">
              Allow agents to ask each other
            </Label>
            <p className="text-xs text-muted-foreground">
              Off by default. Turning this on means an agent&apos;s answer can start another
              agent&apos;s work, which spends AI budget.
            </p>
          </div>
          <Switch
            id="agent-delegation-enabled"
            checked={enabled}
            disabled={vetoed || saving}
            onCheckedChange={setEnabled}
            aria-label="Allow agents to ask each other"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-delegation-surfaces" className="text-sm font-medium">
            Where it&apos;s allowed
          </Label>
          <Input
            id="agent-delegation-surfaces"
            value={surfaces}
            disabled={vetoed || saving}
            onChange={(e) => setSurfaces(e.target.value)}
            placeholder="channel-uuid, task:task-uuid   —   or *  for everywhere"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. A channel is its id; a task is <code className="text-2xs">task:</code>
            followed by its id. Empty means nowhere. Start with one place, watch what the agents
            do, then widen.
          </p>
          {enabledButNowhere && (
            <p className="text-xs text-warning">
              Nothing will happen until you name at least one place, or <code>*</code>.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">How many hands-off deep</Label>
          <div className="flex items-center gap-1.5">
            {HOP_CHOICES.map((n) => (
              <Button
                key={n}
                type="button"
                variant={maxHops === n ? "default" : "outline"}
                size="sm"
                disabled={vetoed || saving}
                aria-pressed={maxHops === n}
                onClick={() => setMaxHops(n)}
                className="w-10"
              >
                {n}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            2 covers a person asking one agent, which asks a second. Higher values let a chain
            run further from the person who started it, and cost more.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes." : "Saved."}
          </p>
          <div className="flex items-center gap-2">
            {!vetoed && enabled && surfaces.trim() !== "" && (
              <Badge variant="outline" className="text-2xs">
                Active
              </Badge>
            )}
            <Button onClick={handleSave} disabled={vetoed || saving || !dirty} size="sm">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default AgentDelegationCard
