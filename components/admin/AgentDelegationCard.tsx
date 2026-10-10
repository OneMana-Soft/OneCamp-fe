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
 * effect when nothing changed. So the edits wait in a save bar, which appears only
 * while something actually differs from what is stored.
 *
 * Until the stored policy is read, there is no form. A failed read used to leave
 * the form on its defaults ("off", "Saved."), a false account of the policy with a
 * Save that would have overwritten the real one.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { SettingRow, SettingsList, SettingsSection, SwitchRow, SaveBar } from "@/components/ui/settingsSection"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { ErrorState } from "@/components/ui/error-state"
import { useToast } from "@/hooks/use-toast"
import { ShieldAlert } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { getAIConfig, setAIAgentDelegation, type AIConfig } from "@/services/aiModelService"

// Self-contained: it fetches its own config, like every sibling admin card, so the
// admin page does not have to know this card exists beyond rendering it, and a save
// re-reads rather than trusting local state to match what the server stored.

/** Hops an admin may choose. Mirrors the DB CHECK (1-5) so the UI cannot offer a
 *  value the server will clamp — a silently-corrected setting is a lie. */
const HOP_CHOICES = [1, 2, 3, 4, 5] as const

function AgentDelegationCard() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AIConfig | undefined>()
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const vetoed = !!settings?.agent_delegation_vetoed_by_env

  const [enabled, setEnabled] = useState(false)
  const [maxHops, setMaxHops] = useState(2)
  const [surfaces, setSurfaces] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setSettings(await getAIConfig())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Re-sync whenever stored settings arrive or change, so the form always starts
  // from the truth rather than from a stale first render.
  const resetToStored = useCallback(() => {
    if (!settings) return
    setEnabled(!!settings.agent_delegation_enabled)
    setMaxHops(settings.agent_delegation_max_hops || 2)
    setSurfaces(settings.agent_delegation_surfaces || "")
  }, [settings])
  useEffect(resetToStored, [resetToStored])

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
      toast({ title: "Collaboration policy saved" })
      // Re-read rather than assume: the server clamps hops, so what was stored may
      // differ from what was sent, and the form should show the truth.
      await load()
    } catch (e) {
      toast({
        title: "Couldn't save the collaboration policy",
        description: apiErrorMessage(e, "Try again in a moment."),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Agent collaboration"
      description="Let one AI teammate hand work to another: a triage agent asking a coding agent to open a pull request, for example. Every hop is attributed to the person who started the chain, and an agent can never reach a teammate that person couldn't have asked themselves."
    >
      {!settings && failed ? (
        <ErrorState
          subject="the collaboration policy"
          retrying={retrying}
          onRetry={() => {
            setRetrying(true)
            void load().finally(() => setRetrying(false))
          }}
        />
      ) : !settings ? (
        <div role="status" aria-label="Loading the collaboration policy">
          <SkeletonRows rows={3} avatar={false} />
        </div>
      ) : (
        <>
          {vetoed && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/20 bg-warning/10 p-3" role="status">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-foreground/80">
                Turned off for this server (<code className="text-2xs">AI_AGENT_DELEGATION</code>). Whoever runs it
                has decided agents must not hand work to each other here, and that can&apos;t be changed from this
                page.
              </p>
            </div>
          )}

          <SettingsList>
            <SwitchRow
              label="Allow agents to ask each other"
              description="Off by default. When it's on, an agent's answer can start another agent's work, which spends AI budget."
              checked={enabled}
              disabled={vetoed || saving}
              onChange={setEnabled}
            />
            <SettingRow
              label="Where it's allowed"
              controlId="agent-delegation-surfaces"
              description={
                <>
                  Separated by commas. A channel is its id; a task is <code className="text-2xs">task:</code> and its
                  id; <code className="text-2xs">*</code> is everywhere. Empty means nowhere. Start with one place,
                  watch what the agents do, then widen.
                </>
              }
            >
              <Input
                id="agent-delegation-surfaces"
                aria-describedby="agent-delegation-surfaces-desc"
                className="h-8 w-full sm:w-72"
                value={surfaces}
                disabled={vetoed || saving}
                onChange={(e) => setSurfaces(e.target.value)}
                placeholder="channel id, task:id, or *…"
                spellCheck={false}
                autoComplete="off"
              />
            </SettingRow>
            {/* A choice of one of five: a segmented radio group, not five
                buttons with the chosen one filled in the accent. */}
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-1">
                <p id="agent-delegation-hops" className="text-sm font-medium leading-5">How far a chain can go</p>
                <p id="agent-delegation-hops-desc" className="text-xs text-muted-foreground text-pretty">
                  2 covers a person asking one agent, which asks a second. Higher numbers let a chain run further
                  from the person who started it, and cost more.
                </p>
              </div>
              <div
                role="radiogroup"
                aria-labelledby="agent-delegation-hops"
                aria-describedby="agent-delegation-hops-desc"
                className="inline-flex w-fit shrink-0 gap-1 rounded-md bg-muted p-1"
              >
                {HOP_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={maxHops === n}
                    disabled={vetoed || saving}
                    onClick={() => setMaxHops(n)}
                    className={cn(
                      "h-7 w-8 rounded-sm text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50",
                      maxHops === n ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </SettingsList>

          {enabledButNowhere && !vetoed && (
            <p className="text-xs text-warning-ink">
              Nothing will happen until you name at least one place, or <code>*</code>.
            </p>
          )}

          <SaveBar
            dirty={dirty && !vetoed}
            saving={saving}
            what="collaboration changes"
            onSave={() => void handleSave()}
            onDiscard={resetToStored}
          />
        </>
      )}
    </SettingsSection>
  )
}

export default AgentDelegationCard
