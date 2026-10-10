"use client"

/**
 * ModelRoutingCard: which model each kind of background work runs on.
 *
 * Catch-ups, briefings, meeting recaps and memory all used the one default
 * model. A workspace on a large cloud model paid that price for every catch-up;
 * one on a small local model got thin meeting recaps. Here an admin sends each
 * kind of work to a model on the allowlist. A person's own chat and an agent's
 * runs are not listed: someone chose those models, and routing never overrides
 * a choice.
 *
 * A section of the AI tab like the others: a heading, one line, and a hairline
 * list of rows, each row a job with its picker at one x. Choices wait for Save,
 * so a save bar says so while one is waiting.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SettingRow, SettingsList, SettingsSection, SaveBar } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
  getAuthorizedModels,
  getModelRouting,
  routableModels,
  routeValue,
  routesFromValues,
  setModelRouting,
  type AuthorizedModel,
  type ModelRouting,
} from "@/services/aiModelService"

const DEFAULT = "__default__"

export default function ModelRoutingCard() {
  const { toast } = useToast()
  const [routing, setRouting] = useState<ModelRouting | null>(null)
  const [models, setModels] = useState<AuthorizedModel[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failure, setFailure] = useState("")
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, ms] = await Promise.all([getModelRouting(), getAuthorizedModels()])
      setRouting(r)
      setModels(ms)
      setValues(Object.fromEntries(r.purposes.map((p) => [p.key, routeValue(r.routes[p.key])])))
      setFailed(false)
    } catch (e) {
      setFailure(apiErrorMessage(e, "Try again in a moment."))
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo(() => routableModels(models), [models])
  const stored = useMemo(
    () => (routing ? Object.fromEntries(routing.purposes.map((p) => [p.key, routeValue(routing.routes[p.key])])) : {}),
    [routing],
  )
  const dirty = routing !== null && JSON.stringify(values) !== JSON.stringify(stored)

  const save = async () => {
    setSaving(true)
    try {
      await setModelRouting(routesFromValues(values))
      await load()
      toast({ title: "Model choices saved", description: "Background work now runs on the models you chose." })
    } catch (e) {
      toast({ title: "Couldn't save the model choices", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Model per job"
      description="Choose which model does each kind of background work: a fast or local one for frequent summaries, a large one for long meeting recaps. A person's own chat and each agent keep the model they were given."
    >
      {failed && !routing ? (
        <ErrorState
          compact
          subject="the model choices"
          detail={failure}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true)
            void load().finally(() => setRetrying(false))
          }}
        />
      ) : !routing ? (
        <SectionListSkeleton label="Loading the model choices" rows={4} trailing="control" />
      ) : (
        <>
          <SettingsList>
            {routing.purposes.map((p) => (
              <SettingRow key={p.key} label={p.label} description={p.description} controlId={`route-${p.key}`}>
                <Select
                  value={values[p.key] || DEFAULT}
                  onValueChange={(v) => setValues((cur) => ({ ...cur, [p.key]: v === DEFAULT ? "" : v }))}
                >
                  <SelectTrigger id={`route-${p.key}`} aria-describedby={`route-${p.key}-desc`} className="w-full @xl:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT}>Workspace default</SelectItem>
                    {options.map((m) => (
                      <SelectItem key={m.id} value={routeValue({ provider_id: m.provider_id, model: m.model })}>
                        {(m.label || m.model) + " · " + m.provider_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
            ))}
          </SettingsList>
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add models to the allowlist above to send work to them. Until then everything uses the default.
            </p>
          )}
          <SaveBar
            dirty={dirty}
            saving={saving}
            what="model choices"
            onSave={() => void save()}
            onDiscard={() => setValues(stored)}
          />
        </>
      )}
    </SettingsSection>
  )
}
