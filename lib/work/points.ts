/**
 * Points on a project's estimate scale (linear-05), as the client names and
 * counts them. Pure: lib/work/estimates.ts reads and sets them.
 */

export type ScaleKind = "exponential" | "fibonacci" | "linear" | "tshirt"

/** A scale a project may take: its sizes, the two larger the extended scale adds, and the T-shirt names. */
export interface ScaleChoice {
  kind: ScaleKind
  name: string
  sizes: number[]
  more: number[]
  names?: string[]
}

/** A project's scale as the server answers it: the sizes a task may take, smallest first, and their names. */
export interface EstimateScale {
  kind: ScaleKind
  extended: boolean
  allow_zero: boolean
  count_unestimated: boolean
  sizes: number[]
  labels: string[]
}

/** What a project's admin sets: a scale, or hours. */
export interface ScaleSetting {
  kind: ScaleKind | "hours"
  extended: boolean
  allow_zero: boolean
  count_unestimated: boolean
}

/** Points as the scale names them: "M" on T-shirt sizes, "3" on the others; points off the scale are their number. */
export function pointsLabel(scale: Pick<EstimateScale, "sizes" | "labels">, points: number): string {
  const i = scale.sizes.indexOf(points)
  return i >= 0 ? scale.labels[i] : String(points)
}

/**
 * Where a task's points are written (POST; lib/work/estimateWrites). The Offline Store keeps this write like a
 * task's other field changes (lib/offline/tasks), so both name it from here, and services/endPoints.ts, on every
 * route's first load, carries nothing for it.
 */
export const TASK_POINTS_WRITE = "/task/updateTaskPoints"

/** "1 point", "13 points", "2.5 points". */
export const pointsText = (n: number) => {
  const v = Math.round(n * 10) / 10
  return `${v} ${v === 1 ? "point" : "points"}`
}

/** What a task counts as on the scale: its points, or with none one or nothing, as the scale says. */
export const countedPoints = (scale: Pick<EstimateScale, "count_unestimated">, points: number | undefined) => points ?? (scale.count_unestimated ? 1 : 0)
