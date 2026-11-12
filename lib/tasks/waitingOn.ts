/** "Waiting on 2 tasks": a task's open blockers, on a timeline bar and a calendar block. Pure. */
export const waitingOn = (n: number): string => `Waiting on ${n} ${n === 1 ? "task" : "tasks"}`
