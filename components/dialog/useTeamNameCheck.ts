"use client"

import { useEffect, useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TeamNameExistsInterface } from "@/types/team"

/**
 * Whether a team name is free, checked by itself a moment after typing stops,
 * as New channel and Edit channel check theirs. The team dialogs asked for a
 * second step instead ("Check availability", a second button) before Save or
 * Create would wake up.
 *
 * `original` is the name being edited: unchanged, it needs no check.
 */
export function useTeamNameCheck(name: string, { valid, original }: { valid: boolean; original?: string }) {
  const trimmed = (name ?? "").trim()
  const unchanged = original !== undefined && trimmed === original.trim()
  const needsCheck = !!trimmed && valid && !unchanged
  const [checked, setChecked] = useState<string | null>(null)

  useEffect(() => {
    if (!needsCheck) return
    const t = setTimeout(() => setChecked(trimmed), 450)
    return () => clearTimeout(t)
  }, [trimmed, needsCheck])

  const current = needsCheck && checked === trimmed
  const { data, isLoading } = useFetch<TeamNameExistsInterface>(
    current ? `${GetEndpointUrl.CheckTeamNameAvailability}?team_name=${encodeURIComponent(trimmed)}` : "",
  )
  return {
    unchanged,
    checking: needsCheck && (!current || isLoading || !data),
    available: current && !isLoading && data?.exists === false,
    taken: current && !isLoading && data?.exists === true,
  }
}
