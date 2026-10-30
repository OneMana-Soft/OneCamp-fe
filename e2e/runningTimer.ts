// A running timer, as GET /task/time/running answers it (hooks/useTaskTime): the demo visitor's, running for hours,
// as V-68's live walk found it. Its card sits in the shell's left corner stack (components/time/RunningTimerChip).
export const RUNNING_TASK = "Write the launch announcement"

export const RUNNING_TIMER = {
  msg: "ok",
  data: {
    entry: {
      id: "te-v68",
      task_uuid: "7a5c0000-0000-4000-8000-0000000000a1",
      project_uuid: "7a5c0000-0000-4000-8000-0000000000b1",
      user_id: "u-sam",
      started_at: new Date(Date.now() - 3.7 * 3600_000).toISOString(),
      ended_at: null,
      note: "",
      billable: true,
    },
    task_name: RUNNING_TASK,
    seconds: 0,
  },
}
