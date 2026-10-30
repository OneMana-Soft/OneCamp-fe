/**
 * How a project estimates (linear-05): in hours, or in points on one of
 * Linear's four scales, which the backlog, burndown and capacity then count.
 * Hours and logged time stay beside points. The read: GET
 * /project/{p}/estimates. The writes are lib/work/estimateWrites, apart, so
 * the task panel, which only reads, doesn't carry them. The points
 * themselves, named and counted, are lib/work/points.ts.
 */
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import type { EstimateScale, ScaleChoice } from "@/lib/work/points"

export interface EstimatesAnswer {
  data: { scale: EstimateScale | null; kinds: ScaleChoice[]; can_edit: boolean }
}

export const estimatesPath = (projectId: string) => `/project/${projectId}/estimates`

/** The project's scale (null: hours) and whether the reader may change it; undefined while it's read. */
export function useEstimates(projectId: string) {
  return useFetch<EstimatesAnswer>(projectId ? estimatesPath(projectId) : "", undefined, undefined, OWN_ERRORS)
}
