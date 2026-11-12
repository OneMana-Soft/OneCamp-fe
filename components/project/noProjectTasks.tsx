import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useProjectHue } from "@/lib/projectHue"
import { openUI } from "@/store/slice/uiSlice"

/** An empty project, on its list, board and phone list (PROJECTS-24); Import for workspace admins. */
export function NoProjectTasks({ projectId, canCreate, admin }: { projectId: string; canCreate: boolean; admin: boolean }) {
  const dispatch = useDispatch()
  const router = useAppRouter()
  return (
    <EmptyState
      illustration={<SpotTasks hue={useProjectHue(projectId)} />}
      title="No tasks yet"
      description={admin ? "Make the first one, or bring them in from Linear, Jira, Asana or Trello." : "Bring tasks in from Linear, Jira, Asana or Trello: a workspace admin can import them."}
      action={
        (canCreate || admin) && (
          <div className="flex items-center gap-2">
            {canCreate && <Button size="sm" onClick={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}>New task</Button>}
            {admin && <Button size="sm" variant="secondary" onClick={() => router.push("/app/admin?tab=import")}>Import</Button>}
          </div>
        )
      }
    />
  )
}
