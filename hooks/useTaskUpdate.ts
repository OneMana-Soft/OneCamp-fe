import { useSWRConfig } from "swr";
import { useCallback } from "react";
import { GetEndpointUrl } from "@/services/endPoints";
import { TaskInfoInterface } from "@/types/task";
import { isTimelineKey } from "@/lib/timelineKey";
import { isWorkloadKey, type WorkloadData, type WorkloadTask } from "@/lib/workload";
import { taskDate } from "@/lib/timeline";
import { fieldFilterMatches, fieldIdOfFilter, withField, type FieldValue } from "@/lib/tasks/fields";

/** A task list's response, whose lists of tasks are keyed by name. */
type TaskLists = Record<string, unknown>;

/** A board's columns, by status category, as its cache keys them. */
const BOARD_COLUMNS = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];

export const useTaskUpdate = () => {
    const { mutate, cache } = useSWRConfig();

    const statusToKey = (status: string) => {
        const mapping: Record<string, string> = {
            backlog: "backlog",
            todo: "todo",
            inProgress: "in_progress",
            inReview: "in_review",
            done: "done",
            canceled: "canceled",
        };
        return mapping[status] || status.replace(/ /g, "_");
    };

    // Whether a task belongs in a list filtered as the key says, as far as can
    // be told here. A filter only the server can answer (a cycle, an assignee
    // by graph id, overdue) answers `unsure`: an edited task stays in the list
    // (dropping it lost the task after any edit), and a new one stays out until
    // the list is fetched again.
    const matchesFilters = (task: TaskInfoInterface, searchParams: URLSearchParams, unsure = true) => {
        const searchText = searchParams.get("taskSearchString")?.toLowerCase();
        if (searchText && !task.task_name.toLowerCase().includes(searchText)) {
            return false;
        }

        const filtersJson = searchParams.get("filters");
        if (!filtersJson) return true;
        let filters: { id: string; value: unknown }[];
        try {
            filters = JSON.parse(filtersJson);
        } catch (e) {
            console.error("Error parsing filters in SWR key", e);
            return true;
        }
        for (const filter of Array.isArray(filters) ? filters : []) {
            // Most filters are lists of values; a few (overdue) are one string.
            const values = Array.isArray(filter.value) ? filter.value.map(String) : filter.value ? [String(filter.value)] : [];
            if (values.length === 0) continue;
            if (filter.id === "task_priority" && !values.includes(task.task_priority)) return false;
            // As the server reads it: a built-in status matches a task in no
            // status of the project's own; a project's status matches by id.
            if (filter.id === "task_status") {
                const own = task.task_custom_status;
                if (!(own ? values.includes(own) : values.includes(task.task_status))) return false;
            }
            if (fieldIdOfFilter(filter.id)) {
                if (!fieldFilterMatches(task.task_fields, filter.id, values)) return false;
            } else if (filter.id !== "task_priority" && filter.id !== "task_status" && !unsure) {
                return false;
            }
        }
        return true;
    };

    const getTaskKeys = useCallback((projectId: string) => {
        const projectListPath = GetEndpointUrl.GetProjectTaskList;
        const projectKanbanPath = GetEndpointUrl.GetProjectTaskListForKanban;
        const userListPath = GetEndpointUrl.GetUserTaskList;
        const userKanbanPath = GetEndpointUrl.GetUserTaskListForKanban;

        const allKeys = Array.from(cache.keys() as IterableIterator<string>);
        return allKeys.filter(key => {
            const url = new URL(key, "http://localhost");
            const pathname = url.pathname;
            
            // Check for project-specific endpoints
            if (pathname.startsWith(projectListPath) || pathname.startsWith(projectKanbanPath)) {
                return pathname.includes(projectId);
            }
            if (isTimelineKey(pathname)) return isTimelineKey(pathname, projectId);
            
            // Check for user-specific endpoints
            return pathname === userListPath || pathname === userKanbanPath;
        });
    }, [cache]);

    const optimisticCreateTask = useCallback((newTask: TaskInfoInterface, projectId: string) => {
        // The workload lists open tasks with dates, and counts those without.
        Array.from(cache.keys() as IterableIterator<string>).filter(isWorkloadKey).forEach(key => void mutate(key));
        const matchedKeys = getTaskKeys(projectId);

        matchedKeys.forEach(key => {
            mutate(key, (currentData: any) => {
                if (!currentData || !currentData.data) return currentData;

                const url = new URL(key, "http://localhost");
                const pathname = url.pathname;
                const searchParams = url.searchParams;
                const pageIndex = parseInt(searchParams.get("pageIndex") || "0");

                if (pageIndex !== 0) return currentData;
                if (!matchesFilters(newTask, searchParams, false)) return currentData;

                // A copy of what changes, the rest shared: see optimisticUpdateTask.
                const data = { ...currentData.data };

                // Use exact path matching to avoid overlap
                if (isTimelineKey(pathname)) {
                    // The timeline holds a project's own tasks, newest first.
                    data.tasks = [newTask, ...(data.tasks || [])];
                    data.total = (data.total || 0) + 1;
                } else if (pathname.includes(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    const statusKey = `project_tasks_${statusToKey(newTask.task_status)}`;
                    if (Array.isArray(data[statusKey])) data[statusKey] = [newTask, ...data[statusKey]];
                } else if (pathname.includes(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = [newTask, ...(data.project_tasks || [])];
                    data.project_task_count = (data.project_task_count || 0) + 1;
                } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
                    const statusKey = `user_tasks_${statusToKey(newTask.task_status)}`;
                    if (Array.isArray(data[statusKey])) data[statusKey] = [newTask, ...data[statusKey]];
                } else if (pathname === GetEndpointUrl.GetUserTaskList) {
                    data.user_tasks = [newTask, ...(data.user_tasks || [])];
                    data.user_task_count = (data.user_task_count || 0) + 1;
                }

                return { ...currentData, data };
            }, { revalidate: false }); // Disable immediate revalidation to prevent blinking
        });
    }, [cache, mutate, getTaskKeys]);

    // The workload holds tasks of every project, its own way: the assignee as
    // assignee_uuid, the other fields it shows under the task's own names. A
    // finished task stays in its list and the view leaves it out.
    const patchWorkload = useCallback((patches: (Partial<TaskInfoInterface> & { task_uuid: string })[], remove = false) => {
        const keys = Array.from(cache.keys() as IterableIterator<string>).filter(isWorkloadKey);
        if (keys.length === 0 || patches.length === 0) return;
        const byId = new Map(patches.map(p => [p.task_uuid, p]));
        const patched = (t: WorkloadTask): WorkloadTask => {
            const p = byId.get(t.task_uuid);
            if (!p) return t;
            const next = { ...t };
            for (const field of ["task_name", "task_status", "task_custom_status", "task_custom_status_name", "task_start_date", "task_due_date"] as const) {
                if (p[field] !== undefined) next[field] = p[field] ?? undefined;
            }
            if (p.task_estimate_minutes !== undefined) next.task_estimate_minutes = p.task_estimate_minutes || undefined;
            if ("task_assignee" in p) next.assignee_uuid = p.task_assignee?.user_uuid || undefined;
            return next;
        };
        // It holds only open tasks with dates, and counts the rest: a task given
        // its first dates, losing its last, or moved to another project changes
        // what the server would send, so the workload is fetched again.
        const reshapes = (p: Partial<TaskInfoInterface>, listed: boolean) =>
            "task_project" in p ||
            ((p.task_start_date !== undefined || p.task_due_date !== undefined) && (!listed || (!taskDate(p.task_start_date) && !taskDate(p.task_due_date))));
        keys.forEach(key => {
            let refetch = false;
            void mutate(key, (current: { data?: WorkloadData } | undefined) => {
                if (!current?.data) return current;
                const listed = new Set(current.data.tasks.map(t => t.task_uuid));
                refetch = !remove && patches.some(p => reshapes(p, listed.has(p.task_uuid)));
                const tasks = remove ? current.data.tasks.filter(t => !byId.has(t.task_uuid)) : current.data.tasks.map(patched);
                return { ...current, data: { ...current.data, tasks } };
            }, { revalidate: false }).then(() => {
                if (refetch) void mutate(key);
            });
        });
    }, [cache, mutate]);

    // Changes tasks in every list of the project that holds them: one change
    // to each list, whatever the number of tasks, and only the tasks changed
    // are copied. A list filtered on what changed drops the tasks that no
    // longer match.
    const updateTasksInLists = useCallback((projectId: string, change: Map<string, (t: TaskInfoInterface) => TaskInfoInterface>) => {
        if (change.size === 0) return;
        const patch = (tasks: TaskInfoInterface[]) => tasks.map(t => {
            const f = change.get(t.task_uuid);
            return f ? f(t) : t;
        });
        const patchColumns = (data: TaskLists, prefix: "project" | "user") => {
            for (const col of BOARD_COLUMNS) {
                const key = `${prefix}_tasks_${col}`;
                const tasks = data[key];
                if (Array.isArray(tasks)) data[key] = patch(tasks);
            }
        };
        const patchList = (tasks: unknown, searchParams: URLSearchParams) =>
            Array.isArray(tasks) ? patch(tasks).filter(t => !change.has(t.task_uuid) || matchesFilters(t, searchParams)) : tasks;

        getTaskKeys(projectId).forEach(key => {
            mutate(key, (currentData: { data?: TaskLists } | undefined) => {
                if (!currentData || !currentData.data) return currentData;
                const url = new URL(key, "http://localhost");
                const pathname = url.pathname;
                const data: TaskLists = { ...currentData.data };
                if (isTimelineKey(pathname)) {
                    if (Array.isArray(data.tasks)) data.tasks = patch(data.tasks);
                } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    patchColumns(data, "project");
                } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = patchList(data.project_tasks, url.searchParams);
                } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
                    patchColumns(data, "user");
                } else if (pathname === GetEndpointUrl.GetUserTaskList) {
                    data.user_tasks = patchList(data.user_tasks, url.searchParams);
                }
                return { ...currentData, data };
            }, { revalidate: false });
        });
    }, [mutate, getTaskKeys]);

    // Several tasks' fields at once (the dates of a chain of tasks moved
    // along, say). A task moving to another board column goes through
    // optimisticUpdateTask.
    const optimisticUpdateTasks = useCallback((patches: (Partial<TaskInfoInterface> & { task_uuid: string })[], projectId: string) => {
        if (patches.length === 0) return;
        updateTasksInLists(projectId, new Map(patches.map(p => [p.task_uuid, (t: TaskInfoInterface) => ({ ...t, ...p })])));
        patchWorkload(patches);
    }, [updateTasksInLists, patchWorkload]);

    // One task's value of one of its project's own fields (null to take it
    // off), merged into the values it has in each list: a value set elsewhere
    // mustn't wipe the task's others.
    const optimisticSetTaskField = useCallback((taskUUID: string, projectId: string, fieldId: string, value: FieldValue | null) => {
        updateTasksInLists(projectId, new Map([[taskUUID, (t: TaskInfoInterface) => ({ ...t, task_fields: withField(t.task_fields, fieldId, value) })]]));
    }, [updateTasksInLists]);

    // placement puts a moved card next to the card it was dropped beside. It
    // beats newIndex: a board column for a project's own status is only part
    // of its category's list in this cache, so an index in the column is not
    // an index in the list.
    //
    // Only what changes is copied: the moved task, and the lists it leaves and
    // enters. Every other task keeps its object, so a board's memoised cards
    // skip it, and SWR's comparison (which hashes objects it has not seen)
    // goes over two lists, not the board. A JSON copy of every list, as this
    // was, made each of 270 cards render again after a drop, the slowest frame
    // of the drag.
    const optimisticUpdateTask = useCallback((updatedTask: Partial<TaskInfoInterface> & { task_uuid: string }, projectId: string, newIndex?: number, placement?: { before?: string; after?: string }) => {
        // Fields alone change in place, as for several tasks at once.
        if (updatedTask.task_status === undefined && newIndex === undefined) {
            optimisticUpdateTasks([updatedTask], projectId);
            return;
        }
        patchWorkload([updatedTask]);
        const matchedKeys = getTaskKeys(projectId);
        const id = updatedTask.task_uuid;

        const patchOne = (tasks: unknown) =>
            Array.isArray(tasks) ? (tasks as TaskInfoInterface[]).map(t => t.task_uuid === id ? { ...t, ...updatedTask } : t) : tasks;

        // Out of the column it is in, into its new status's column beside its
        // neighbour (or at newIndex, or at the top).
        const moveInColumns = (data: TaskLists, prefix: "project" | "user") => {
            let fromKey: string | null = null;
            let at = -1;
            for (const col of BOARD_COLUMNS) {
                const list = data[`${prefix}_tasks_${col}`];
                if (!Array.isArray(list)) continue;
                const i = (list as TaskInfoInterface[]).findIndex(t => t.task_uuid === id);
                if (i >= 0) {
                    fromKey = `${prefix}_tasks_${col}`;
                    at = i;
                    break;
                }
            }
            if (fromKey === null) return;
            const source = [...(data[fromKey] as TaskInfoInterface[])];
            const [found] = source.splice(at, 1);
            data[fromKey] = source;
            const toKey = updatedTask.task_status !== undefined ? `${prefix}_tasks_${statusToKey(updatedTask.task_status)}` : fromKey;
            const target = toKey === fromKey ? source : Array.isArray(data[toKey]) ? [...(data[toKey] as TaskInfoInterface[])] : [];
            const moved = { ...found, ...updatedTask } as TaskInfoInterface;
            const beforeAt = placement?.before ? target.findIndex(t => t.task_uuid === placement.before) : -1;
            const afterAt = placement?.after ? target.findIndex(t => t.task_uuid === placement.after) : -1;
            if (beforeAt >= 0) target.splice(beforeAt + 1, 0, moved);
            else if (afterAt >= 0) target.splice(afterAt, 0, moved);
            else if (newIndex !== undefined) target.splice(newIndex, 0, moved);
            else target.unshift(moved);
            data[toKey] = target;
        };
        // A filtered list keeps the task only while it still matches.
        const patchList = (tasks: unknown, searchParams: URLSearchParams) => {
            const patched = patchOne(tasks);
            return Array.isArray(patched) ? patched.filter(t => t.task_uuid !== id || matchesFilters(t, searchParams)) : patched;
        };

        matchedKeys.forEach(key => {
            mutate(key, (currentData: { data?: TaskLists } | undefined) => {
                if (!currentData || !currentData.data) return currentData;
                const url = new URL(key, "http://localhost");
                const pathname = url.pathname;
                const data: TaskLists = { ...currentData.data };
                // A list's path is the start of its board's, so each board is
                // tested before its list.
                if (isTimelineKey(pathname)) {
                    data.tasks = patchOne(data.tasks);
                } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    moveInColumns(data, "project");
                } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = patchList(data.project_tasks, url.searchParams);
                } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
                    moveInColumns(data, "user");
                } else if (pathname === GetEndpointUrl.GetUserTaskList) {
                    data.user_tasks = patchList(data.user_tasks, url.searchParams);
                }
                return { ...currentData, data };
            }, { revalidate: false });
        });
    }, [mutate, getTaskKeys, optimisticUpdateTasks, patchWorkload]);

    const optimisticDeleteTask = useCallback((taskUuid: string, projectId: string) => {
        patchWorkload([{ task_uuid: taskUuid }], true);
        const matchedKeys = getTaskKeys(projectId);

        matchedKeys.forEach(key => {
            mutate(key, (currentData: any) => {
                if (!currentData || !currentData.data) return currentData;

                // Lists without the task, the other tasks shared: see optimisticUpdateTask.
                const data = { ...currentData.data };
                const pathname = new URL(key, "http://localhost").pathname;

                // A list's path is the start of its board's ("/project/taskList"
                // and "/project/taskListForKanban"), so each board is tested
                // before its list; tested the other way round, a deleted card
                // stayed on the board until it was fetched again.
                if (isTimelineKey(pathname)) {
                    const had = (data.tasks || []).length;
                    data.tasks = (data.tasks || []).filter((t: TaskInfoInterface) => t.task_uuid !== taskUuid);
                    if (data.tasks.length < had) data.total = Math.max(0, (data.total || 0) - 1);
                } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    const columns = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
                    columns.forEach(col => {
                        const colKey = `project_tasks_${col}` as keyof typeof data;
                        if (Array.isArray(data[colKey])) {
                            data[colKey] = (data[colKey] as any).filter((t: any) => t.task_uuid !== taskUuid);
                        }
                    });
                } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = (data.project_tasks || []).filter((t: any) => t.task_uuid !== taskUuid);
                    data.project_task_count = Math.max(0, (data.project_task_count || 0) - 1);
                } else if (pathname === GetEndpointUrl.GetUserTaskList) {
                    data.user_tasks = (data.user_tasks || []).filter((t: any) => t.task_uuid !== taskUuid);
                    data.user_task_count = Math.max(0, (data.user_task_count || 0) - 1);
                } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
                    const columns = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
                    columns.forEach(col => {
                        const colKey = `user_tasks_${col}` as keyof typeof data;
                        if (Array.isArray(data[colKey])) {
                            data[colKey] = (data[colKey] as any).filter((t: any) => t.task_uuid !== taskUuid);
                        }
                    });
                }
                return { ...currentData, data };
            }, { revalidate: false });
        });
    }, [mutate, getTaskKeys, patchWorkload]);

    // Every list of the project fetched again, and the workload, which may hold its tasks.
    const revalidateTaskKeys = useCallback((projectId: string) => {
        const matchedKeys = getTaskKeys(projectId);
        matchedKeys.forEach(key => mutate(key));
        Array.from(cache.keys() as IterableIterator<string>).filter(isWorkloadKey).forEach(key => mutate(key));
    }, [mutate, getTaskKeys, cache]);

    return { optimisticCreateTask, optimisticUpdateTask, optimisticUpdateTasks, optimisticSetTaskField, optimisticDeleteTask, revalidateTaskKeys };
};
