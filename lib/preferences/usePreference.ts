"use client"

/**
 * A person's own preference (design #37, Person Preferences): what they chose,
 * or its default, as the server keeps it, and a way to set it. Kept once for
 * every surface: person-wide keys unprefixed (zone, week_start, clock), a
 * surface's own prefixed (calendar.working_hours). A set shows at once and is
 * sent; one the server refuses goes back, and its caller says why. Their
 * other devices follow through the live Preference message.
 */
import { useCallback } from "react"
import { useFetch } from "@/hooks/useFetch"
import { appMutate } from "@/lib/swrMutate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

export type Preferences = Record<string, unknown>
type Answer = { data?: Preferences }

// The signed-in person's own preferences (GET; PUT /{key} sets one). The path
// sits here, not in services/endPoints.ts: only this module asks for it.
const KEY = "/user/preferences"

/** Every preference of the signed-in person, once the server answers. */
export function usePreferences(): Preferences | undefined {
  return useFetch<Answer>(KEY)?.data?.data
}

/** The preferences answer with one key's value changed. Pure. */
export function withPreference(cur: Answer | undefined, key: string, value: unknown): Answer | undefined {
  if (!cur?.data) return cur
  return { ...cur, data: { ...cur.data, [key]: value } }
}

/** A live Preference message ({key, value}) applied to the copy on screen. */
export function applyPreferenceMessage(msg: unknown): void {
  const m = msg as { key?: unknown; value?: unknown } | null
  if (!m || typeof m.key !== "string") return
  void appMutate(KEY, (cur: Answer | undefined) => withPreference(cur, m.key as string, m.value), { revalidate: false })
}

/**
 * Sets one preference: shown at once and sent; refused, it goes back and the
 * error is thrown for the caller to say (a setting's row says why under its
 * label, never a toast: design v3 admin §1.3).
 */
export async function setPreference(key: string, value: unknown, before: unknown): Promise<void> {
  void appMutate(KEY, (cur: Answer | undefined) => withPreference(cur, key, value), { revalidate: false })
  try {
    await axiosInstance.put(`${KEY}/${encodeURIComponent(key)}`, { value }, OWN_ERRORS)
  } catch (err) {
    void appMutate(KEY, (cur: Answer | undefined) => withPreference(cur, key, before), { revalidate: false })
    throw err
  }
}

/** One preference and a way to set it: [value (undefined until read), set]. */
export function usePreference<T>(key: string): [T | undefined, (value: T | null) => Promise<void>] {
  const prefs = usePreferences()
  const value = prefs?.[key] as T | undefined
  const set = useCallback((next: T | null) => setPreference(key, next, value ?? null), [key, value])
  return [value, set]
}
