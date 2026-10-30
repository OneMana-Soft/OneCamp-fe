"use client"

import * as React from "react"
import { useCallback } from "react"
import { SwitchRow } from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { useAIConfig } from "@/components/admin/ai/useAIConfig"
import type { AIConfig } from "@/services/aiModelService"

/** The AI settings that are a plain on/off. */
export type AIConfigSwitch = {
  [K in keyof AIConfig]: AIConfig[K] extends boolean ? K : never
}[keyof AIConfig]

/**
 * One AI on/off, saved the moment it changes (admin §1.3, Instant): the
 * shared copy of the settings flips at once, the row says Saved with the moss
 * tick, and a refusal puts it back with the server's reason under the label
 * and the row's shake. Every one of these used to toast its own sentence,
 * on and off, for a change the row itself can say.
 */
export function useConfigSwitch(field: AIConfigSwitch, request: (on: boolean) => Promise<unknown>, label: string) {
  const { config, setConfig } = useAIConfig()
  const { status, run } = useSaveStatus()
  const set = useCallback(
    async function flip(on: boolean): Promise<boolean> {
      setConfig((c) => (c ? { ...c, [field]: on } : c))
      const held = await run(() => request(on), switchOffer(label, on, flip))
      if (!held) setConfig((c) => (c ? { ...c, [field]: !on } : c))
      return held
    },
    [field, label, request, run, setConfig],
  )
  return { checked: !!config?.[field], status, set }
}

/** A switch row bound to one AI setting. */
export function ConfigSwitchRow({
  field,
  request,
  label,
  description,
  disabled,
  locked,
  id,
}: {
  field: AIConfigSwitch
  request: (on: boolean) => Promise<unknown>
  label: string
  description?: React.ReactNode
  disabled?: boolean
  locked?: string
  id?: string
}) {
  const { checked, status, set } = useConfigSwitch(field, request, label)
  return (
    <SwitchRow
      id={id}
      label={label}
      description={description}
      checked={checked}
      disabled={disabled || status.state === "saving"}
      locked={locked}
      status={status}
      onChange={(v) => void set(v)}
    />
  )
}
