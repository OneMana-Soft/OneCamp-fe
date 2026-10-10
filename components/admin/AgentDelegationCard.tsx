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
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { ErrorState } from "@/components/ui/error-state"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { useToast } from "@/hooks/use-toast"
import { ShieldAlert } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { setAIAgentDelegation } from "@/services/aiModelService"
import { useAIConfig } from "@/components/admin/ai/useAIConfig"

// Self-contained: the admin page does not have to know this card exists beyond
// rendering it. It reads the AI settings through the key it shares with the
// Models section (one request for both), and a save re-reads rather than
// trusting local state to match what the server stored.

/** Hops an admin may choose. Mirrors the DB CHECK (1-5) so the UI cannot offer a
 *  value the server will clamp — a silently-corrected setting is a lie. */
const HOP_CHOICES = (["1", "2", "3", "4", "5"] as const).map((v) => ({ value: v, label: v }))

function AgentDelegationCard() {
  const { toast } = useToast()
  const { config: settings, error, refresh } = useAIConfig()
  const failed = !!error && !settings
  const [retrying, setRetrying] = useState(false)
  const vetoed = !!settings?.agent_delegation_vetoed_by_env

  const [enabled, setEnabled] = useState(false)
  const [maxHops, setMaxHops] = useState(2)
  const [surfaces, setSurfaces] = useState("")
  const [saving, setSaving] = useState(false)

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
      await refresh()
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
      {failed ? (
        <ErrorState
          compact
          subject="the collaboration policy"
          detail={apiErrorMessage(error, "Try again in a moment.")}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true)
            void refresh().finally(() => setRetrying(false))
          }}
        />
      ) : !settings ? (
        <SectionListSkeleton label="Loading the collaboration policy" rows={3} trailing="control" />
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
                className="w-full @xl:w-72"
                value={surfaces}
                disabled={vetoed || saving}
                onChange={(e) => setSurfaces(e.target.value)}
                placeholder="channel id, task:id, or *…"
                spellCheck={false}
                autoComplete="off"
              />
            </SettingRow>
            {/* A choice of one of five: the house segmented control, as wide as
                the field above it, so the two controls start on one line. */}
            <SettingRow
              label="How far a chain can go"
              controlId="agent-delegation-hops"
              description="2 covers a person asking one agent, which asks a second. Higher numbers let a chain run further from the person who started it, and cost more."
            >
              <SegmentedControl
                id="agent-delegation-hops"
                aria-label="How far a chain can go"
                aria-describedby="agent-delegation-hops-desc"
                value={String(maxHops) as (typeof HOP_CHOICES)[number]["value"]}
                onValueChange={(v) => setMaxHops(Number(v))}
                options={HOP_CHOICES}
                disabled={vetoed || saving}
                className="w-full flex-nowrap @xl:w-72"
                itemClassName="flex-1 tabular-nums"
              />
            </SettingRow>
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
