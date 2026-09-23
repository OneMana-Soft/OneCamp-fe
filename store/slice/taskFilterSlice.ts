import {createSlice} from "@reduxjs/toolkit";
import {TaskInfoInterface} from "@/types/task";

/**
 * No sorting and no filters. A factory rather than `{}`: an empty object is
 * truthy, so readers' `|| default` fallbacks never applied and
 * `.filters.length` crashed My Tasks on phones, whose list reads it directly.
 */
export const emptySortFilter = (): sortingAndFilterOptionInterface => ({ sort: [], filters: [] })

const initialState  = {
    projectsSortingAndFilter: {} as ExtendedSortingAndFilterOptionInterface,
    projectsTaskList: {} as ExtendedProjectTaskListInterface,
    myTaskSortingAndFilter: emptySortFilter(),
    myTaskList: [] as TaskInfoInterface[]
};

export interface ExtendedSortingAndFilterOptionInterface {
    [key: string]:  sortingAndFilterOptionInterface;
}

export interface ExtendedProjectTaskListInterface {
    [key: string]:  TaskInfoInterface[];
}


export interface sortingAndFilterOptionInterface {
    sort: sortInterface[]
    filters: filterInterface[]
}

interface inputProjectSortingAndFilterOptionInterface {
    projectId: string
    sort: sortInterface[]
    filters: filterInterface[]
}

interface inputMyTaskSortingAndFilterOptionInterface {
    sort: sortInterface[]
    filters: filterInterface[]
}

interface inputUpdateProjectTaskListTaskStatusInterface {
    projectId: string
    taskUUID: string
    status: string
}

interface inputUpdateMyTaskListTaskStatusInterface {
    taskUUID: string
    status: string
}

interface inputUpdateProjectTaskListInterface {
    projectId: string
    tasks: TaskInfoInterface[]
}

interface inputUpdateMyTaskListInterface {
    tasks: TaskInfoInterface[]
}

export interface filterInterface {
    id: string
    value: string[]
}

export interface sortInterface {
    id: "task_start_date" | "task_due_date" | "task_created_date";
    desc: boolean;
}


interface inputClearProjectSortingAndFilterOptionInterface {
    projectId: string
}

export const taskFilterSlice = createSlice({
    name: "taskFilter",
    initialState,
    reducers: {

        updateProjectSortingAndFiltering(state, action: {payload: inputProjectSortingAndFilterOptionInterface}) {
            const {projectId, sort, filters} = action.payload;
            state.projectsSortingAndFilter[projectId] = {sort, filters};
        },

        updateMyTaskSortingAndFiltering(state, action: {payload: inputMyTaskSortingAndFilterOptionInterface}) {
            const { sort, filters} = action.payload;
            state.myTaskSortingAndFilter = {sort, filters};
        },

        clearProjectSortingFilteringAndTask(state, action: {payload: inputClearProjectSortingAndFilterOptionInterface}) {
            const {projectId} = action.payload;

            state.projectsSortingAndFilter[projectId] = emptySortFilter();
            state.projectsTaskList[projectId] = [] as TaskInfoInterface[];
        },

        clearMyTaskSortingFilteringAndTask(state) {

            state.myTaskSortingAndFilter = emptySortFilter();
            state.myTaskList = [] as TaskInfoInterface[];
        },

        clearProjectTask(state, action: {payload: inputClearProjectSortingAndFilterOptionInterface}) {
            const {projectId} = action.payload;

            state.projectsTaskList[projectId] = [] as TaskInfoInterface[];
        },

        clearMyTask(state) {

            state.myTaskList = [] as TaskInfoInterface[];
        },

        updateProjectTaskList(state, action: {payload: inputUpdateProjectTaskListInterface}) {
            const {projectId, tasks} = action.payload;

            if(!state.projectsTaskList[projectId]) {
                state.projectsTaskList[projectId] = [] as TaskInfoInterface[];
            }

            // Efficient upsert by task_uuid per project to avoid duplicates
            if (!tasks || tasks.length === 0) return;

            const existingList = state.projectsTaskList[projectId];

            const incomingById = new Map<string, TaskInfoInterface>();
            for (const t of tasks) incomingById.set(t.task_uuid, t);

            for (let i = 0; i < existingList.length; i++) {
                const existing = existingList[i];
                const updated = incomingById.get(existing.task_uuid);
                if (updated) {
                    existingList[i] = updated;
                    incomingById.delete(existing.task_uuid);
                }
            }

            if (incomingById.size > 0) {
                for (const t of tasks) {
                    if (incomingById.has(t.task_uuid)) {
                        existingList.push(t);
                    }
                }
            }
        },

        updateMyTaskList(state, action: {payload: inputUpdateMyTaskListInterface}) {
            const { tasks} = action.payload;

            // Efficient upsert: replace existing by id, append new ones, avoid duplicates
            if (!tasks || tasks.length === 0) return;

            // Create a quick lookup for incoming tasks
            const incomingById = new Map<string, TaskInfoInterface>();
            for (const t of tasks) incomingById.set(t.task_uuid, t);

            // Replace existing items in-place when present in incoming
            for (let i = 0; i < state.myTaskList.length; i++) {
                const existing = state.myTaskList[i];
                const updated = incomingById.get(existing.task_uuid);
                if (updated) {
                    state.myTaskList[i] = updated;
                    incomingById.delete(existing.task_uuid);
                }
            }

            // Append remaining new items preserving their original order
            if (incomingById.size > 0) {
                for (const t of tasks) {
                    if (incomingById.has(t.task_uuid)) {
                        state.myTaskList.push(t);
                    }
                }
            }
        },


        updateProjectTaskListTaskStatus(state, action:{payload: inputUpdateProjectTaskListTaskStatusInterface}) {
            const {projectId, status, taskUUID} = action.payload;

            state.projectsTaskList[projectId] = state.projectsTaskList[projectId]?.map((task) => {
                if (task.task_uuid == taskUUID) {
                    task.task_status = status
                }
                return task
            })
        },

        updateMyTaskListTaskStatus(state, action:{payload: inputUpdateMyTaskListTaskStatusInterface}) {
            const { status, taskUUID} = action.payload;

            state.myTaskList = state.myTaskList?.map((task) => {
                if (task.task_uuid == taskUUID) {
                    task.task_status = status
                }
                return task
            })
        }


    },
});

export const {
    updateProjectSortingAndFiltering,
    updateMyTaskSortingAndFiltering,
    clearProjectSortingFilteringAndTask,
    clearMyTaskSortingFilteringAndTask,
    updateMyTaskListTaskStatus,
    updateProjectTaskList,
    updateMyTaskList,
    clearProjectTask,
    clearMyTask,
    updateProjectTaskListTaskStatus

} = taskFilterSlice.actions;

export default taskFilterSlice;
