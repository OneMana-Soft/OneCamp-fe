import { useSWRConfig } from "swr";
import { useCallback } from "react";
import { GetEndpointUrl } from "@/services/endPoints";
import { TaskInfoInterface } from "@/types/task";
import { isTimelineKey } from "@/lib/timelineKey";
import { isWorkloadKey, type WorkloadData, type WorkloadTask } from "@/lib/workload";

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

    const matchesFilters = (task: TaskInfoInterface, searchParams: URLSearchParams) => {
        const searchText = searchParams.get("taskSearchString")?.toLowerCase();
        if (searchText && !task.task_name.toLowerCase().includes(searchText)) {
            return false;
        }

        const filtersJson = searchParams.get("filters");
        if (filtersJson) {
            try {
                const filters = JSON.parse(filtersJson);
                for (const filter of filters) {
                    let taskValue = (task as any)[filter.id];
                    
                    // Extract ID from object fields if necessary
                    if (taskValue && typeof taskValue === 'object') {
                        if (filter.id === 'task_assignee' && taskValue.user_uuid) {
                            taskValue = taskValue.user_uuid;
                        } else if (filter.id === 'task_project' && taskValue.project_uuid) {
                            taskValue = taskValue.project_uuid;
                        }
                    }

                    if (filter.value && filter.value.length > 0) {
                        if (Array.isArray(taskValue)) {
                             if (!filter.value.some((v: string) => taskValue.includes(v))) return false;
                        } else {
                             if (!filter.value.includes(taskValue)) return false;
                        }
                    }
                }
            } catch (e) {
                console.error("Error parsing filters in SWR key", e);
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
        const matchedKeys = getTaskKeys(projectId);

        matchedKeys.forEach(key => {
            mutate(key, (currentData: any) => {
                if (!currentData || !currentData.data) return currentData;

                const url = new URL(key, "http://localhost");
                const pathname = url.pathname;
                const searchParams = url.searchParams;
                const pageIndex = parseInt(searchParams.get("pageIndex") || "0");

                if (pageIndex !== 0) return currentData;
                if (!matchesFilters(newTask, searchParams)) return currentData;

                const newData = JSON.parse(JSON.stringify(currentData));
                const data = newData.data;

                // Use exact path matching to avoid overlap
                if (isTimelineKey(pathname)) {
                    // The timeline holds a project's own tasks, newest first.
                    data.tasks = [newTask, ...(data.tasks || [])];
                    data.total = (data.total || 0) + 1;
                } else if (pathname.includes(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    const statusKey = `project_tasks_${statusToKey(newTask.task_status)}` as keyof typeof data;
                    if (Array.isArray(data[statusKey])) {
                        (data[statusKey] as any) = [newTask, ...(data[statusKey] as any)];
                    }
                } else if (pathname.includes(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = [newTask, ...(data.project_tasks || [])];
                    data.project_task_count = (data.project_task_count || 0) + 1;
                } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
                    const statusKey = `user_tasks_${statusToKey(newTask.task_status)}` as keyof typeof data;
                    if (Array.isArray(data[statusKey])) {
                        (data[statusKey] as any) = [newTask, ...(data[statusKey] as any)];
                    }
                } else if (pathname === GetEndpointUrl.GetUserTaskList) {
                    data.user_tasks = [newTask, ...(data.user_tasks || [])];
                    data.user_task_count = (data.user_task_count || 0) + 1;
                }

                return newData;
            }, { revalidate: false }); // Disable immediate revalidation to prevent blinking
        });
    }, [mutate, getTaskKeys]);

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
            if ("task_assignee" in p) next.assignee_uuid = p.task_assignee?.user_uuid || undefined;
            return next;
        };
        keys.forEach(key => {
            mutate(key, (current: { data?: WorkloadData } | undefined) => {
                if (!current?.data) return current;
                const tasks = remove ? current.data.tasks.filter(t => !byId.has(t.task_uuid)) : current.data.tasks.map(patched);
                return { ...current, data: { ...current.data, tasks } };
            }, { revalidate: false });
        });
    }, [cache, mutate]);

    // Several tasks' fields at once (the dates of a chain of tasks moved
    // along, say): one change to each list, whatever the number of tasks,
    // and only the tasks patched are copied. A task moving to another board
    // column goes through optimisticUpdateTask.
    const optimisticUpdateTasks = useCallback((patches: (Partial<TaskInfoInterface> & { task_uuid: string })[], projectId: string) => {
        if (patches.length === 0) return;
        const byId = new Map(patches.map(p => [p.task_uuid, p]));
        const patch = (tasks: TaskInfoInterface[]) => tasks.map(t => {
            const p = byId.get(t.task_uuid);
            return p ? { ...t, ...p } : t;
        });
        const patchColumns = (data: TaskLists, prefix: "project" | "user") => {
            for (const col of BOARD_COLUMNS) {
                const key = `${prefix}_tasks_${col}`;
                const tasks = data[key];
                if (Array.isArray(tasks)) data[key] = patch(tasks);
            }
        };
        // A list filtered on a field that changed drops the tasks that no longer match.
        const patchList = (tasks: unknown, searchParams: URLSearchParams) =>
            Array.isArray(tasks) ? patch(tasks).filter(t => !byId.has(t.task_uuid) || matchesFilters(t, searchParams)) : tasks;

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
        patchWorkload(patches);
    }, [mutate, getTaskKeys, patchWorkload]);

    // placement puts a moved card next to the card it was dropped beside. It
    // beats newIndex: a board column for a project's own status is only part
    // of its category's list in this cache, so an index in the column is not
    // an index in the list.
    const optimisticUpdateTask = useCallback((updatedTask: Partial<TaskInfoInterface> & { task_uuid: string }, projectId: string, newIndex?: number, placement?: { before?: string; after?: string }) => {
        // Fields alone change in place, as for several tasks at once.
        if (updatedTask.task_status === undefined && newIndex === undefined) {
            optimisticUpdateTasks([updatedTask], projectId);
            return;
        }
        patchWorkload([updatedTask]);
        const matchedKeys = getTaskKeys(projectId);

        const updateDataArray = (tasks: TaskInfoInterface[] | undefined) => {
            if (!tasks) return tasks;
            return tasks.map(t => t.task_uuid === updatedTask.task_uuid ? { ...t, ...updatedTask } : t);
        };

        const moveTaskInKanban = (data: any, taskUuid: string, newStatus: string | undefined, prefix: "project" | "user", targetIndex?: number) => {
            const columnKeys = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
            let foundTask: TaskInfoInterface | null = null;
            let sourceCol: string | null = null;
            
            // 1. Find and remove task from source column
            for (const col of columnKeys) {
                const colKey = `${prefix}_tasks_${col}` as keyof typeof data;
                if (Array.isArray(data[colKey])) {
                    const taskIndex = (data[colKey] as any).findIndex((t: any) => t.task_uuid === taskUuid);
                    if (taskIndex > -1) {
                        foundTask = (data[colKey] as any).splice(taskIndex, 1)[0];
                        sourceCol = col;
                        break; // Task found, stop searching
                    }
                }
            }

            // 2. Add task to target column
            if (foundTask) {
                // If newStatus is provided, move to that status. Otherwise stay in source column.
                const targetStatusKey = newStatus ? statusToKey(newStatus) : sourceCol;
                
                if (targetStatusKey) {
                    const targetColKey = `${prefix}_tasks_${targetStatusKey}` as keyof typeof data;
                    
                    // Ensure target column exists
                    if (!Array.isArray(data[targetColKey])) {
                       data[targetColKey] = [];
                    }

                    // Insert beside its neighbour, at a specific index, or at the top
                    const taskToInsert = { ...foundTask, ...(updatedTask as any) };
                    const list = data[targetColKey] as any[];
                    const beforeAt = placement?.before ? list.findIndex((t: any) => t.task_uuid === placement.before) : -1;
                    const afterAt = placement?.after ? list.findIndex((t: any) => t.task_uuid === placement.after) : -1;
                    if (beforeAt >= 0) {
                        list.splice(beforeAt + 1, 0, taskToInsert);
                    } else if (afterAt >= 0) {
                        list.splice(afterAt, 0, taskToInsert);
                    } else if (targetIndex !== undefined) {
                        (data[targetColKey] as any).splice(targetIndex, 0, taskToInsert);
                    } else {
                        (data[targetColKey] as any) = [taskToInsert, ...(data[targetColKey] as any)];
                    }
                } else {
                    // Fallback to original state if we can't determine target status
                    // This should ideally not happen
                    console.warn("Could not determine target status for task move", taskUuid);
                }
            }
        };

        matchedKeys.forEach(key => {
            mutate(key, (currentData: any) => {
                if (!currentData || !currentData.data) return currentData;

                const url = new URL(key, "http://localhost");
                const pathname = url.pathname;
                const newData = JSON.parse(JSON.stringify(currentData));
                const data = newData.data;

                if (isTimelineKey(pathname)) {
                    data.tasks = updateDataArray(data.tasks);
                } else if (pathname.includes(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    if (updatedTask.task_status !== undefined || newIndex !== undefined) {
                        moveTaskInKanban(data, updatedTask.task_uuid, updatedTask.task_status, "project", newIndex);
                    } else {
                        const columnKeys = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
                        columnKeys.forEach(col => {
                            const colKey = `project_tasks_${col}` as keyof typeof data;
                            data[colKey] = updateDataArray(data[colKey] as any);
                        });
                    }
                } else if (pathname.includes(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = updateDataArray(data.project_tasks);
                    const taskInList = data.project_tasks.find((t: any) => t.task_uuid === updatedTask.task_uuid);
                    if (taskInList && !matchesFilters(taskInList, url.searchParams)) {
                         data.project_tasks = data.project_tasks.filter((t: any) => t.task_uuid !== updatedTask.task_uuid);
                    }
                } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
                    if (updatedTask.task_status !== undefined || newIndex !== undefined) {
                        moveTaskInKanban(data, updatedTask.task_uuid, updatedTask.task_status, "user", newIndex);
                    } else {
                        const columnKeys = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
                        columnKeys.forEach(col => {
                            const colKey = `user_tasks_${col}` as keyof typeof data;
                            data[colKey] = updateDataArray(data[colKey] as any);
                        });
                    }
                } else if (pathname === GetEndpointUrl.GetUserTaskList) {
                    data.user_tasks = updateDataArray(data.user_tasks);
                    const taskInList = data.user_tasks.find((t: any) => t.task_uuid === updatedTask.task_uuid);
                    if (taskInList && !matchesFilters(taskInList, url.searchParams)) {
                         data.user_tasks = data.user_tasks.filter((t: any) => t.task_uuid !== updatedTask.task_uuid);
                    }
                }
                return newData;
            }, { revalidate: false });
        });
    }, [mutate, getTaskKeys, optimisticUpdateTasks, patchWorkload]);

    const optimisticDeleteTask = useCallback((taskUuid: string, projectId: string) => {
        patchWorkload([{ task_uuid: taskUuid }], true);
        const matchedKeys = getTaskKeys(projectId);

        matchedKeys.forEach(key => {
            mutate(key, (currentData: any) => {
                if (!currentData || !currentData.data) return currentData;

                const newData = JSON.parse(JSON.stringify(currentData));
                const data = newData.data;
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
                return newData;
            }, { revalidate: false });
        });
    }, [mutate, getTaskKeys, patchWorkload]);

    // Every list of the project fetched again, and the workload, which may hold its tasks.
    const revalidateTaskKeys = useCallback((projectId: string) => {
        const matchedKeys = getTaskKeys(projectId);
        matchedKeys.forEach(key => mutate(key));
        Array.from(cache.keys() as IterableIterator<string>).filter(isWorkloadKey).forEach(key => mutate(key));
    }, [mutate, getTaskKeys, cache]);

    return { optimisticCreateTask, optimisticUpdateTask, optimisticUpdateTasks, optimisticDeleteTask, revalidateTaskKeys };
};
