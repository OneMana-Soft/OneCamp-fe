import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"
import { MixerHorizontalIcon } from "@radix-ui/react-icons"
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CirclePlus } from "lucide-react"
import { useDispatch } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import type { UserInfoRawInterface } from "@/types/user"
import type { TaskInfoInterface } from "@/types/task"
import { GetEndpointUrl } from "@/services/endPoints"
import { GetTaskStatusQueryParamByStatus } from "@/lib/utils/getTaskStatusQueryParamByStatus"
import { TaskKanbanColumnPriorityFilter } from "@/components/task/taskKanbanColumnPriorityFilter"
import { TaskKanbanProjectFilter } from "@/components/task/taskKanbanProjectFilter"
import { openUI } from "@/store/slice/uiSlice"
import { taskStatuses } from "@/types/table"
import { useMoveTask } from "@/hooks/useMoveTask"
import { isShown, useBoardColumns } from "@/hooks/useBoardColumns"
import { BUILT_IN_STATUSES, statusPatch } from "@/lib/taskStatus"
import { TaskBoard } from "@/components/kanbanComponents/TaskBoard"
import { KeyboardList } from "@/components/task/KeyboardList"
import { useClosedLimit, withQuery } from "@/hooks/useClosedLimit"
import { cn } from "@/lib/utils/helpers/cn"
import { WorkState, workBody, workToolbar } from "@/components/task/workFrame"
import { BoardSkeleton } from "@/components/kanbanComponents/BoardSkeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"

const EMPTY: TaskInfoInterface[] = []

/** My Tasks as a board: the tasks assigned to me across projects. */
export const MyTaskKanban = ({ className }: { className?: string } = {}) => {
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const moveTask = useMoveTask()

    const [activeProject, setActiveProject] = useState<string[]>([])
    const [priorityFilter, setPriorityFilter] = useState<string[]>([])
    const [viewableStatus, setColumnShown] = useBoardColumns({
        backlog: false,
        todo: true,
        inProgress: true,
        inReview: false,
        done: true,
        canceled: false,
    })

    // The priority filter used to be left out of this request, so choosing a
    // priority on My Tasks changed nothing.
    const urlParam = GetTaskStatusQueryParamByStatus({ projectFilter: activeProject, priorityFilter })
    const closed = useClosedLimit()
    const userInfo = useFetch<UserInfoRawInterface>(withQuery(GetEndpointUrl.GetUserTaskListForKanban, urlParam, closed.param))
    const u = userInfo.data?.data

    const columns = useMemo(
        () => ({
            backlog: u?.user_tasks_backlog ?? EMPTY,
            todo: u?.user_tasks_todo ?? EMPTY,
            inProgress: u?.user_tasks_in_progress ?? EMPTY,
            inReview: u?.user_tasks_in_review ?? EMPTY,
            done: u?.user_tasks_done ?? EMPTY,
            canceled: u?.user_tasks_canceled ?? EMPTY,
        }),
        [u],
    )
    // Across projects, so only the built-in columns: a task in one of its
    // project's own statuses sits in that status's category and says which.
    const visible = useMemo(() => BUILT_IN_STATUSES.filter((o) => isShown(viewableStatus, o.value)), [viewableStatus])
    const boardTasks = useMemo(() => Object.values(columns).flat(), [columns])
    // The states, where every tab of a task view draws them
    // (components/task/workFrame), as the List does.
    const loading = userInfo.isLoading && !u
    const failed = !!userInfo.isError && !u
    const noTasks =
        !!u &&
        activeProject.length === 0 &&
        priorityFilter.length === 0 &&
        boardTasks.length === 0 &&
        !u.user_tasks_done_count &&
        !u.user_tasks_canceled_count

    return (
        // The project board's toolbar and gutter: the board lines up with the
        // page title, Create task is the one filled button, View is quiet.
        <div className={cn("flex flex-col h-full p-4 overflow-hidden", className)}>
            <div data-work-toolbar="" className={cn(workToolbar, "justify-between")}>
                <div className="flex flex-wrap items-center gap-2">
                    <TaskKanbanProjectFilter activeList={activeProject} updateList={setActiveProject} />
                    <TaskKanbanColumnPriorityFilter activeList={priorityFilter} updateList={setPriorityFilter} />
                </div>
                {/* At every width, as on the List: below sm the icons stay. */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="h-8" aria-label={t("createTask")} onClick={() => dispatch(openUI({ key: "createTask", data: { assignToMe: true } }))}>
                        <CirclePlus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t("createTask")}</span>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" aria-label={t("view")}>
                                <MixerHorizontalIcon className="h-4 w-4" />
                                <span className="hidden sm:inline">{t("view")}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[150px]">
                            <DropdownMenuLabel>{t("toggleColumns")}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {taskStatuses.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.value}
                                    checked={isShown(viewableStatus, column.value)}
                                    onCheckedChange={(value) => setColumnShown(column.value, value)}
                                >
                                    {column.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {loading ? (
                <div className={cn(workBody, "min-h-0 flex-1")}>
                    <BoardSkeleton columns={3} />
                </div>
            ) : failed ? (
                <WorkState className={workBody}>
                    <ErrorState subject="your tasks" onRetry={() => void userInfo.mutate()} />
                </WorkState>
            ) : noTasks ? (
                <WorkState className={workBody}>
                    <EmptyState illustration={<SpotTasks />} title={t("noTasksAssigned", { defaultValue: "Nothing is assigned to you." })} />
                </WorkState>
            ) : (
            <KeyboardList tasks={boardTasks} canEdit={canEditTask} placement="overlay" className={cn(workBody, "flex-1 overflow-hidden")}>
                <div className="h-full">
                    <TaskBoard
                        columns={columns}
                        visible={visible}
                        // Only in projects where I am an admin: the server allows no more.
                        canDrag={canEditTask}
                        onMove={(task, drop) => void moveTask(task.task_uuid, task.task_project.project_uuid, drop, statusPatch(drop.column, BUILT_IN_STATUSES))}
                        boardKey="my-tasks"
                        totals={{ done: u?.user_tasks_done_count, canceled: u?.user_tasks_canceled_count }}
                        onShowMore={closed.showMore}
                    />
                </div>
            </KeyboardList>
            )}
        </div>
    )
}

/** Tasks here come from many projects; each is changed by its own project's admins. */
const canEditTask = (task: TaskInfoInterface) => Boolean(task.task_project?.project_is_admin)
