"use client"

/**
 * AiModelPicker — lets a member choose which admin-authorized model their AI
 * assistant uses. The choice is persisted server-side as a per-user
 * preference, so the next message automatically runs on it (the backend
 * resolves the model per request). "Workspace default" clears the preference.
 *
 * Renders nothing when the admin has not authorized any extra models, so the
 * UI stays clean for the common single-model setup.
 */

import React, { useEffect, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { getMyModels, setMyModel, type UserModelOption } from "@/services/aiModelService"

const DEFAULT_VALUE = "__default__"

const AiModelPicker: React.FC = () => {
  const { toast } = useToast()
  const [models, setModels] = useState<UserModelOption[]>([])
  const [selected, setSelected] = useState<string>(DEFAULT_VALUE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyModels()
      .then((res) => {
        if (cancelled) return
        setModels(res.models)
        setSelected(res.selected_model_id || DEFAULT_VALUE)
      })
      .catch(() => {
        /* non-fatal: hide the picker */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Nothing to choose from -> don't render anything.
  if (models.length === 0) return null

  const handleChange = async (value: string) => {
    const prev = selected
    setSelected(value)
    setSaving(true)
    try {
      await setMyModel(value === DEFAULT_VALUE ? "" : value)
    } catch {
      setSelected(prev) // revert on failure
      toast({ title: "Error", description: "Couldn't change the model", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Select value={selected} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger
        className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground focus:ring-0"
        aria-label="AI model"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={DEFAULT_VALUE} className="text-xs">
          Workspace default
        </SelectItem>
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id} className="text-xs">
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default AiModelPicker
