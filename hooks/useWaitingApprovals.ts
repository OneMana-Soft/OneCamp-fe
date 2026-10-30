"use client"

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import type { WaitingApproval } from "@/lib/rules/approvals"

/**
 * The requests waiting for the reader's answer (GET /approvals/waiting): one
 * read that Home and My tasks share, and that a task's card re-reads after an
 * answer (appMutate on the same key). A server without approvals answers 404,
 * and that is no toast's business: each place draws its own state.
 */
export function useWaitingApprovals() {
  return useFetch<{ data: { items: WaitingApproval[] } }>(GetEndpointUrl.ApprovalsWaiting, undefined, undefined, OWN_ERRORS)
}
