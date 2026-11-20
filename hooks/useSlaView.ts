"use client"

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/http/ownErrors"

const ONCE = { shouldRetryOnError: false, revalidateOnFocus: false }

/**
 * Whether a project's list offers its SLA facet, sort and grouping (linear-24), read only `when` asked. A guest's 403,
 * SLAs off or a failed read is `refused`, quietly (fail closed); while the read is out, neither. `read` is whether the
 * settings came back at all (on or off): the project's tools offer its SLAs entry only then, so a guest is offered none.
 */
export function useSlaView(projectId: string | undefined, when: boolean) {
  const { data, isError } = useFetch<{ data?: { on?: boolean } }>(projectId && when ? `/project/${projectId}/sla` : "", undefined, ONCE, OWN_ERRORS)
  const shows = !!data?.data?.on
  return { shows, read: !!data && !isError, refused: !shows && (!!data || !!isError) }
}
