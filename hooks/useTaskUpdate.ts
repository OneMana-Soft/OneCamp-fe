import { useSWRConfig } from "swr";
import { useCallback } from "react";
import { GetEndpointUrl } from "@/services/endPoints";
import { TaskInfoInterface } from "@/types/task";

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
                if (pathname.includes(GetEndpointUrl.GetProjectTaskListForKanban)) {
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

    // placement puts a moved card next to the card it was dropped beside. It
    // beats newIndex: a board column for a project's own status is only part
    // of its category's list in this cache, so an index in the column is not
    // an index in the list.
    const optimisticUpdateTask = useCallback((updatedTask: Partial<TaskInfoInterface> & { task_uuid: string }, projectId: string, newIndex?: number, placement?: { before?: string; after?: string }) => {
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

                if (pathname.includes(GetEndpointUrl.GetProjectTaskListForKanban)) {
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
    }, [mutate, getTaskKeys]);

    const optimisticDeleteTask = useCallback((taskUuid: string, projectId: string) => {
        const matchedKeys = getTaskKeys(projectId);

        matchedKeys.forEach(key => {
            mutate(key, (currentData: any) => {
                if (!currentData || !currentData.data) return currentData;

                const newData = JSON.parse(JSON.stringify(currentData));
                const data = newData.data;

                if (key.includes(GetEndpointUrl.GetProjectTaskList)) {
                    data.project_tasks = (data.project_tasks || []).filter((t: any) => t.task_uuid !== taskUuid);
                    data.project_task_count = Math.max(0, (data.project_task_count || 0) - 1);
                } else if (key.includes(GetEndpointUrl.GetProjectTaskListForKanban)) {
                    const columns = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
                    columns.forEach(col => {
                        const colKey = `project_tasks_${col}` as keyof typeof data;
                        if (Array.isArray(data[colKey])) {
                            data[colKey] = (data[colKey] as any).filter((t: any) => t.task_uuid !== taskUuid);
                        }
                    });
                } else if (key.includes(GetEndpointUrl.GetUserTaskList)) {
                    data.user_tasks = (data.user_tasks || []).filter((t: any) => t.task_uuid !== taskUuid);
                    data.user_task_count = Math.max(0, (data.user_task_count || 0) - 1);
                } else if (key.includes(GetEndpointUrl.GetUserTaskListForKanban)) {
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
    }, [mutate, getTaskKeys]);

    const revalidateTaskKeys = useCallback((projectId: string) => {
        const matchedKeys = getTaskKeys(projectId);
        matchedKeys.forEach(key => mutate(key));
    }, [mutate, getTaskKeys]);

    return { optimisticCreateTask, optimisticUpdateTask, optimisticDeleteTask, revalidateTaskKeys };
};
