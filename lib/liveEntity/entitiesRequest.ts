import { CONNECTED_PATHS } from "@/services/endpoints/docs"
import type { EntityAccess } from "./types"

/** One thing as POST /entities answers it, for code that asks only whether the reader may open it. */
export interface EntityAnswer {
  kind: string
  id: string
  access: EntityAccess
}

/** POST /entities as usePost sends it, for a chunk that reads access without the chips' store (a copy's files); quiet. */
export function entitiesRequest(refs: Array<{ kind: string; id: string }>) {
  return { method: "POST", apiEndpoint: CONNECTED_PATHS.entities, payload: { refs }, quiet: true } as const
}
