// Who did what an activity item reports: a person, an agent, or an app. The
// server sorts each actor (business/Activity ActorKind); an older server sends
// nothing, and its items count as people's.

import type { UnifiedActivityItem } from "@/types/activity"

export type ActorKind = "person" | "agent" | "app"
export type ActorFilter = "everyone" | ActorKind

export const actorOfItem = (item: Pick<UnifiedActivityItem, "actor_kind">): ActorKind => item.actor_kind ?? "person"

export const matchesActor = (item: Pick<UnifiedActivityItem, "actor_kind">, filter: ActorFilter) =>
  filter === "everyone" || actorOfItem(item) === filter

/** The choices to offer; agents only where this server has AI. */
export function actorFilters(aiAvailable: boolean): { value: ActorFilter; label: string }[] {
  return [
    { value: "everyone", label: "Everyone" },
    { value: "person", label: "People" },
    ...(aiAvailable ? [{ value: "agent" as const, label: "Agents" }] : []),
    { value: "app", label: "Apps" },
  ]
}

export const parseActorFilter = (raw: string | null): ActorFilter =>
  raw === "person" || raw === "agent" || raw === "app" ? raw : "everyone"
