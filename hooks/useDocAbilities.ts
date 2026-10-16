"use client"

import * as React from "react"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { GetEndpointUrl } from "@/services/endPoints"
import { docAbilities, docLevelOf, type DocAbilities, type DocAccessCounts, type DocActionNeeds } from "@/lib/docs/abilities"

/**
 * What each Doc AI action needs on a doc, as the server says (GET /ai/status,
 * doc_action_needs), fetched once. Null where AI is off or the server is too
 * old to say: then every Ask AI action needs edit.
 */
export function useDocActionNeeds(): DocActionNeeds | null {
    const ai = useAIAvailable()
    const status = useFetchOnlyOnce<{ data?: { doc_action_needs?: DocActionNeeds } }>(ai ? GetEndpointUrl.AIStatus : "")
    return ai ? status.data?.data?.doc_action_needs ?? null : null
}

/** What the person may do with a doc, from a doc answer (lib/docs/abilities). */
export function useDocAbilities(doc: DocAccessCounts | null | undefined): DocAbilities {
    const needs = useDocActionNeeds()
    const level = docLevelOf(doc)
    return React.useMemo(() => docAbilities(level, needs), [level, needs])
}
