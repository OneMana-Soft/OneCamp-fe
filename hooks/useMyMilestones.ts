import { useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import type { Milestone } from "@/lib/work/milestones"
import { milestonesByProject, myMilestonesPath, type MyMilestonesAnswer } from "@/lib/work/myMilestones"

/**
 * Every project's milestones (linear-16, GET /project/milestones), by project
 * id in lower case, read only once ready: the projects overview reads them
 * after its list, for each row's next one and its timeline's diamonds. They
 * add to rows already drawn, so a failed read leaves the rows as they are.
 */
export function useMyMilestones(ready: boolean): Map<string, Milestone[]> {
  const read = useFetch<MyMilestonesAnswer>(ready ? myMilestonesPath : "", undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  return useMemo(() => milestonesByProject(read.data), [read.data])
}
