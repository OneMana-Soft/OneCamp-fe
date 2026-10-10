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
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "@/lib/icons"
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
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const [r, ms] = await Promise.all([getModelRouting(), getAuthorizedModels()])
      setRouting(r)
      setModels(ms)
      setValues(Object.fromEntries(r.purposes.map((p) => [p.key, routeValue(r.routes[p.key])])))
      setError("")
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't load model routing."))
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
      toast({ title: "Saved", description: "Background work now runs on the models you chose." })
    } catch (e) {
      toast({ title: "Couldn't save", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Model per job</CardTitle>
        <CardDescription>
          Choose which model does each kind of background work. Use a fast or local model for frequent summaries
          and a large one for long meeting recaps. A person&apos;s own chat and each agent keep the model they were
          given.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!routing && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {routing?.purposes.map((p) => (
          <div key={p.key} className="grid gap-2 sm:grid-cols-[1fr_16rem] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </div>
            <Select
              value={values[p.key] || DEFAULT}
              onValueChange={(v) => setValues((cur) => ({ ...cur, [p.key]: v === DEFAULT ? "" : v }))}
            >
              <SelectTrigger aria-label={`Model for ${p.label}`}>
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
          </div>
        ))}
        {routing && options.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Add models to the allowlist above to route work to them. Until then everything uses the default.
          </p>
        )}
        {routing && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
