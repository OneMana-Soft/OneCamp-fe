/**
 * The writes of a project's estimates (linear-05): its scale, POST
 * /project/{p}/estimates, and a task's points, POST /task/updateTaskPoints.
 * The read is lib/work/estimates.
 */
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { estimatesPath } from "@/lib/work/estimates"
import { TASK_POINTS_WRITE, type EstimateScale, type ScaleSetting } from "@/lib/work/points"

/** Puts the project on a scale, or back on hours; answers the scale, null for hours. */
export async function saveScale(projectId: string, s: ScaleSetting): Promise<EstimateScale | null> {
  const res = await axiosInstance.post(estimatesPath(projectId), s, OWN_ERRORS)
  return (res.data.data?.scale ?? null) as EstimateScale | null
}

/** Gives a task points, a size on its project's scale, or (null) takes them off. */
export async function setTaskPoints(taskUUID: string, points: number | null): Promise<void> {
  await axiosInstance.post(TASK_POINTS_WRITE, { task_uuid: taskUUID, task_estimate_points: points }, OWN_ERRORS)
}
