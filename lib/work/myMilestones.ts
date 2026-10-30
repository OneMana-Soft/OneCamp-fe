/**
 * Every project's milestones, by project (linear-16, GET /project/milestones):
 * what the projects overview reads after its list. Apart from
 * lib/work/milestones, so the overview's first load carries only this.
 */
import type { Milestone } from "@/lib/work/milestones"

export const myMilestonesPath = "/project/milestones"
export interface MyMilestonesAnswer {
  data: { projects: Record<string, Milestone[]> }
}

/** Each project's milestones from that answer, by its id in lower case. */
export function milestonesByProject(answer: MyMilestonesAnswer | undefined): Map<string, Milestone[]> {
  return new Map(Object.entries(answer?.data?.projects ?? {}).map(([id, list]) => [id.toLowerCase(), list]))
}

/** A project's next milestone: the first unfinished one in its order, which the server marks. */
export const nextMilestone = (list: Milestone[] | undefined): Milestone | undefined => list?.find((m) => m.next)
