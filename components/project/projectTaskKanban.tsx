import { useTranslation } from "react-i18next"
import { useCallback, useMemo, useState } from "react"
import { MixerHorizontalIcon } from "@radix-ui/react-icons"
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CirclePlus } from "lucide-react"
import { useDispatch } from "react-redux"
import { TaskKanbanColumnPriorityFilter } from "@/components/task/taskKanbanColumnPriorityFilter"
import { useFetch } from "@/hooks/useFetch"
import type { ProjectInfoRawInterface } from "@/types/project"
import { GetEndpointUrl } from "@/services/endPoints"
import { GetTaskStatusQueryParamByStatus } from "@/lib/utils/getTaskStatusQueryParamByStatus"
import type { TaskInfoInterface } from "@/types/task"
import { openUI } from "@/store/slice/uiSlice"
import { ProjectTaskKanbanAssigneeFilter } from "@/components/project/projectTaskKanbanAssigneeFilter"
import { useMoveTask } from "@/hooks/useMoveTask"
import { isShown, useBoardColumns } from "@/hooks/useBoardColumns"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { columnsByStatus, statusPatch } from "@/lib/taskStatus"
import { ProjectStatusesDialog } from "@/components/project/ProjectStatusesDialog"
import { TaskBoard } from "@/components/kanbanComponents/TaskBoard"
import { CardFieldsContext } from "@/components/task/fieldValue"
import { ProjectFieldsDialog } from "@/components/project/ProjectFieldsDialog"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { KeyboardList } from "@/components/task/KeyboardList"
import { usePost } from "@/hooks/usePost"
import { useTaskFields } from "@/hooks/useTaskFields"
import { useClosedLimit, withQuery } from "@/hooks/useClosedLimit"
import { useStoredState } from "@/hooks/useStoredState"
import { NO_ASSIGNEE, groupByAssignee, type BoardGrouping } from "@/lib/board/groupBy"
import { assigneeLanes, priorityLanes, type BoardLanes } from "@/lib/board/lanes"
import { TaskAssigneeCell } from "@/components/task/taskAssigneeCell"
import { priorities } from "@/types/table"
import { cn } from "@/lib/utils/helpers/cn"
import { TagFilter } from "@/components/tags/TagFilter"
import { hasTag } from "@/lib/tags"
import { taskStatusLabel } from "@/types/task"
import { PostEndpointUrl } from "@/services/endPoints"
import { WorkState, workBody, workToolbar } from "@/components/task/workFrame"
import { BoardSkeleton } from "@/components/kanbanComponents/BoardSkeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { hueFor } from "@/lib/campHue"

const EMPTY: TaskInfoInterface[] = []

/** A priority's arrow in its own colour, before a lane's label. */
function PriorityMark({ value }: { value: string }) {
    const p = priorities.find((x) => x.value === value)
    if (!p) return null
    return (
        <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-md", p.color)}>
            <p.icon className="h-3.5 w-3.5" />
        </span>
    )
}

export const ProjectTaskKanban = ({ projectId = "", className }: { projectId?: string; className?: string }) => {
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const moveTask = useMoveTask()
    const { reassign, setPriority } = useTaskFields()
    // Status columns, or one column per person (Linear's "group by assignee").
    const [grouping, setGrouping] = useStoredState<BoardGrouping>(
        projectId ? `oc_board_grouping:${projectId}` : undefined,
        "status",
        (v): v is BoardGrouping => v === "status" || v === "assignee",
    )
    // Rows across the status columns (swimlanes), when grouped by status.
    const [laneBy, setLaneBy] = useStoredState<BoardLanes>(
        projectId ? `oc_board_lanes:${projectId}` : undefined,
        "none",
        (v): v is BoardLanes => v === "none" || v === "assignee" || v === "priority",
    )

    const [assigneeFilter, setAssigneeFilter] = useState<string[]>([])
    const [priorityFilter, setPriorityFilter] = useState<string[]>([])
    const [tagFilter, setTagFilter] = useState<string[]>([])
    const [viewableStatus, setColumnShown] = useBoardColumns({
        backlog: false,
        todo: true,
        inProgress: true,
        inReview: false,
        done: true,
        canceled: false,
    })

    const urlParam = GetTaskStatusQueryParamByStatus({ assigneeFilter, priorityFilter })
    const closed = useClosedLimit()
    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId ? withQuery(`${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}`, urlParam, closed.param) : "",
    )
    const p = projectInfo.data?.data
    const post = usePost()
    // "Add task" in a column: a task in that column's status (built-in or the
    // project's own), then the board reloads to show it in place.
    const quickAdd = async (column: string, name: string, lane?: string) => {
        // On a board of people the column is who it is for; otherwise its
        // status, and a lane adds who has it or its priority.
        const forPerson = (who: string) => (who === NO_ASSIGNEE ? "" : who)
        const payload: { task_name: string; task_project_uuid: string; task_status: string; task_assignee_uuid?: string; task_priority?: string } =
            grouping === "assignee"
                ? { task_name: name, task_project_uuid: projectId, task_status: "todo", task_assignee_uuid: forPerson(column) }
                : { task_name: name, task_project_uuid: projectId, task_status: column }
        if (grouping === "status" && lane !== undefined) {
            if (laneBy === "assignee") payload.task_assignee_uuid = forPerson(lane)
            if (laneBy === "priority") payload.task_priority = lane
        }
        const res = await post.makeRequest<typeof payload, { task_uuid?: string }>({
            apiEndpoint: PostEndpointUrl.CreateTask,
            payload,
            showErrorToast: true,
        })
        if (!res) return false
        await projectInfo.mutate()
        return true
    }
    // Unknown until the project loads; the server checks again on every move.
    const isAdmin = p?.project_is_admin !== undefined ? Boolean(p.project_is_admin) : false

    // One column per status: the built-in ones, each followed by the project's
    // own that count as it (the server groups tasks by category only).
    const { options: statusOpts } = useProjectStatuses(projectId)
    const [managing, setManaging] = useState(false)
    const [managingFields, setManagingFields] = useState(false)
    // The project's own fields its cards show, and the names for person ones.
    const { fields } = useProjectFields(projectId)
    const { nameOf } = usePeople(projectId, fields)
    const cardFields = useMemo(() => ({ fields: fields.filter((f) => f.on_card), nameOf }), [fields, nameOf])
    const allColumns = useMemo(
        () =>
            columnsByStatus(
                {
                    backlog: p?.project_tasks_backlog ?? EMPTY,
                    todo: p?.project_tasks_todo ?? EMPTY,
                    inProgress: p?.project_tasks_in_progress ?? EMPTY,
                    inReview: p?.project_tasks_in_review ?? EMPTY,
                    done: p?.project_tasks_done ?? EMPTY,
                    canceled: p?.project_tasks_canceled ?? EMPTY,
                },
                statusOpts,
            ),
        [p, statusOpts],
    )
    // The tag filter works on the board as loaded: tasks with any chosen tag.
    const columns = useMemo(() => {
        if (tagFilter.length === 0) return allColumns
        const keep = (t: TaskInfoInterface) => tagFilter.some((tag) => hasTag(t.task_label, tag))
        return Object.fromEntries(Object.entries(allColumns).map(([k, v]) => [k, v.filter(keep)]))
    }, [allColumns, tagFilter])
    const visible = useMemo(() => statusOpts.filter((o) => isShown(viewableStatus, o.value)), [statusOpts, viewableStatus])
    const [hideEmpty, setHideEmpty] = useStoredState<boolean>(
        projectId ? `oc_board_hide_empty:${projectId}` : undefined,
        false,
        (v): v is boolean => typeof v === "boolean",
    )
    const byPerson = useMemo(
        () => (grouping === "assignee" ? groupByAssignee(columns, p?.project_members, hideEmpty) : null),
        [grouping, columns, p?.project_members, hideEmpty],
    )
    const members = p?.project_members
    const lanes = useMemo(() => {
        if (grouping !== "status" || laneBy === "none") return undefined
        if (laneBy === "priority") return priorityLanes(columns, hideEmpty, (id) => <PriorityMark value={id} />)
        return assigneeLanes(columns, members, hideEmpty, (id) => {
            const m = members?.find((x) => x.user_uuid === id)
            return m ? <TaskAssigneeCell userInfo={m} avatarOnly /> : null
        })
    }, [grouping, laneBy, columns, members, hideEmpty])
    const boardTasks = useMemo(() => Object.values(columns).flat(), [columns])
    const canEdit = useCallback(() => isAdmin, [isAdmin])
    // The states, where every tab of a project draws them
    // (components/task/workFrame): the board's columns while it loads, a
    // failed load said as such, and a project with no tasks its spot.
    const loading = projectInfo.isLoading && !p
    const failed = !!projectInfo.isError && !p
    const filtering = assigneeFilter.length > 0 || priorityFilter.length > 0 || tagFilter.length > 0
    const noTasks =
        !!p &&
        !filtering &&
        Object.values(allColumns).every((list) => list.length === 0) &&
        !p.project_tasks_done_count &&
        !p.project_tasks_canceled_count

    return (
        <div className={cn("flex flex-col h-full p-4 overflow-hidden", className)}>
            {/* The tab frame's toolbar row (components/task/workFrame). Wraps
                when narrow (side by side, or a side panel open) instead of
                pushing its last buttons out of sight. */}
            <div data-work-toolbar="" className={cn(workToolbar, "justify-between")}>
                <div className="flex flex-wrap items-center gap-2">
                    <ProjectTaskKanbanAssigneeFilter activeList={assigneeFilter} updateList={setAssigneeFilter} members={p?.project_members} />
                    <TaskKanbanColumnPriorityFilter activeList={priorityFilter} updateList={setPriorityFilter} />
                    <TagFilter projectId={projectId} active={tagFilter} onChange={setTagFilter} />
                </div>
                {/* Create task and View at every width, as on the List; below sm
                    they keep their icons and drop their words. They were hidden
                    below 1024px, so a narrow window or a phone had no View. */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="h-8" aria-label={t("createTask")} onClick={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}>
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
                        <DropdownMenuContent align="end" className="w-[200px]">
                            <DropdownMenuLabel>Group by</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(["status", "assignee"] as const).map((g) => (
                                <DropdownMenuCheckboxItem key={g} checked={grouping === g} onCheckedChange={() => setGrouping(g)}>
                                    {g === "status" ? "Status" : "Assignee"}
                                </DropdownMenuCheckboxItem>
                            ))}
                            {grouping === "status" && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Rows</DropdownMenuLabel>
                                    {(["none", "assignee", "priority"] as const).map((l) => (
                                        <DropdownMenuCheckboxItem key={l} checked={laneBy === l} onCheckedChange={() => setLaneBy(l)}>
                                            {l === "none" ? "None" : l === "assignee" ? "Assignee" : "Priority"}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </>
                            )}
                            {(grouping === "assignee" || laneBy !== "none") && (
                                <DropdownMenuCheckboxItem checked={hideEmpty} onCheckedChange={(v) => setHideEmpty(Boolean(v))}>
                                    {grouping === "assignee" || laneBy === "assignee" ? "Hide people with no tasks" : "Hide empty rows"}
                                </DropdownMenuCheckboxItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {statusOpts.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.value}
                                    className={column.custom ? "pl-10" : undefined}
                                    checked={isShown(viewableStatus, column.value)}
                                    onCheckedChange={(value) => setColumnShown(column.value, value)}
                                >
                                    {column.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                            {isAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => setManaging(true)}>Manage statuses…</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setManagingFields(true)}>Manage fields…</DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {loading ? (
                <div className={cn(workBody, "min-h-0 flex-1")}>
                    <BoardSkeleton />
                </div>
            ) : failed ? (
                <WorkState className={workBody}>
                    <ErrorState subject="this project's board" onRetry={() => void projectInfo.mutate()} />
                </WorkState>
            ) : noTasks ? (
                <WorkState className={workBody}>
                    <EmptyState illustration={<SpotTasks hue={hueFor(projectId)} />} title="No tasks yet" description="Create one and it shows here." />
                </WorkState>
            ) : (
            <KeyboardList tasks={boardTasks} canEdit={canEdit} listProjectId={projectId} statusOptions={statusOpts} placement="overlay" className={cn(workBody, "flex-1 overflow-hidden")}>
                <CardFieldsContext.Provider value={cardFields}>
                    <div className="h-full">
                        {byPerson ? (
                            <TaskBoard
                                columns={byPerson.columns}
                                visible={byPerson.options}
                                canDrag={() => isAdmin}
                                onMove={(task, drop) => {
                                    if (drop.column === (task.task_assignee?.user_uuid || NO_ASSIGNEE)) return
                                    const to = drop.column === NO_ASSIGNEE ? null : p?.project_members?.find((m) => m.user_uuid === drop.column) ?? null
                                    void reassign(task.task_uuid, projectId, to)
                                }}
                                boardKey={`project:${projectId}:assignee`}
                                onQuickAdd={isAdmin ? quickAdd : undefined}
                                badgeFor={(task) => task.task_custom_status_name || taskStatusLabel(task.task_status)}
                            />
                        ) : (
                            <TaskBoard
                                columns={columns}
                                visible={visible}
                                canDrag={() => isAdmin}
                                onMove={(task, drop, lane) => {
                                    void moveTask(task.task_uuid, projectId, drop, statusPatch(drop.column, statusOpts))
                                    // Into another row as well: it changes hands, or priority.
                                    if (!lane || lane.from === lane.to) return
                                    if (laneBy === "priority") void setPriority(task.task_uuid, projectId, lane.to)
                                    else void reassign(task.task_uuid, projectId, lane.to === NO_ASSIGNEE ? null : members?.find((m) => m.user_uuid === lane.to) ?? null)
                                }}
                                lanes={lanes}
                                boardKey={`project:${projectId}`}
                                totals={{ done: p?.project_tasks_done_count, canceled: p?.project_tasks_canceled_count }}
                                onShowMore={closed.showMore}
                                onQuickAdd={isAdmin ? quickAdd : undefined}
                            />
                        )}
                    </div>
                </CardFieldsContext.Provider>
            </KeyboardList>
            )}
            {isAdmin && <ProjectStatusesDialog projectId={projectId} open={managing} onOpenChange={setManaging} />}
            {isAdmin && <ProjectFieldsDialog projectId={projectId} open={managingFields} onOpenChange={setManagingFields} />}
        </div>
    )
}
