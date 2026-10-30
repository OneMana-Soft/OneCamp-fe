import { toast } from "@/hooks/use-toast"
import { projectTaskListQuery, type TaskListQuery } from "@/lib/tasks/listQuery"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { downloadFrom } from "@/lib/utils/download"
import { withItsWords } from "@/lib/utils/downloadRefusal"
import { browserTZ } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"

/**
 * A project's task list as a CSV file (asana-16, jira-16): the list as its
 * reader has it, sorted, filtered and searched, a row a task with every
 * field, its dates on this browser's calendar. The server writes at most the
 * list's first 50,000 tasks and says how many it holds, so a file that holds
 * only the first part says so. Loaded when the list's Export CSV is asked for.
 */
export async function exportTaskList(projectId: string, { sort, filters, search }: TaskListQuery): Promise<void> {
  const params = projectTaskListQuery({ sort, filters, search })
  params.set("format", "csv")
  params.set("tz", browserTZ())
  try {
    // Asked for as a file, a refusal comes back as one too: its words are
    // read back from it, so the toast below says them.
    const res = await downloadFrom(`${GetEndpointUrl.GetProjectTaskList}/${projectId}?${params}`, "tasks.csv").catch(withItsWords)
    const total = Number(res.headers["x-total-count"])
    const rows = Number(res.headers["x-export-rows"])
    if (rows < total) {
      toast({ title: `Exported the first ${rows.toLocaleString()} of ${total.toLocaleString()} tasks`, description: "Filter the list to export the rest." })
    }
  } catch (e) {
    toast({ title: "Couldn't export the list", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
  }
}
