"use client"

// The settings' side of the workspace's plan statuses and labels (linear-15). Only the admin page takes this
// module: the project page's pickers read the registry (usePlanRegistry) and never carry its writes.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { usePlanRegistry } from "@/hooks/useProjectPlan"
import type { PlanCategory } from "@/lib/work/projectPlan"

/**
 * The registry as a workspace admin keeps it (the server refuses anyone else): each change goes in the server's
 * words, a refusal comes back to the caller, and the registry is read again after a change, so every picker shows
 * it. A status keeps its category once added.
 */
export function usePlanRegistryEdits(on: boolean) {
  const plan = usePlanRegistry(on)
  const { registry, retry: readAgain } = plan
  const send = async (path: string, body: object) => {
    await axiosInstance.post(`/project/plan/${path}`, body, OWN_ERRORS)
    await readAgain()
  }
  const one = (kind: "statuses" | "labels", id: string, what: "edit" | "delete") => `${kind}/${encodeURIComponent(id)}/${what}`
  // A status's place is one number across the workspace, which the server lists by. A category's new order is its
  // statuses trading the places they hold (two that share one spread up from it), sending only those that move; the
  // registry is read once after, even when the server refuses one, so the list shows where each really is.
  const order = async (ids: string[]) => {
    const now = new Map((registry?.statuses ?? []).map((s) => [s.id, s.position]))
    const places = ids.map((id) => now.get(id) ?? 0).sort((a, b) => a - b)
    const apart = new Set(places).size === places.length
    try {
      for (const [i, id] of ids.entries()) {
        const position = apart ? places[i] : places[0] + i
        if (now.get(id) !== position) await axiosInstance.post(`/project/plan/${one("statuses", id, "edit")}`, { position }, OWN_ERRORS)
      }
    } finally {
      await readAgain()
    }
  }
  return {
    ...plan,
    addStatus: (status: { name: string; category: PlanCategory; color: string }) => send("statuses", status),
    editStatus: (id: string, change: { name?: string; color?: string; position?: number }) => send(one("statuses", id, "edit"), change),
    deleteStatus: (id: string) => send(one("statuses", id, "delete"), {}),
    addLabel: (label: { name: string; color: string }) => send("labels", label),
    editLabel: (id: string, change: { name?: string; color?: string }) => send(one("labels", id, "edit"), change),
    deleteLabel: (id: string) => send(one("labels", id, "delete"), {}),
    order,
  }
}

export type PlanRegistryEdits = ReturnType<typeof usePlanRegistryEdits>
