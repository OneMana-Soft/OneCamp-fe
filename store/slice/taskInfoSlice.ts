import {CancelTokenSource} from "axios";
import {createSlice} from "@reduxjs/toolkit";
import {FilePreview} from "@/store/slice/channelSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import {TaskInfoInterface} from "@/types/task";
import {UserInfoRawInterface, UserProfileDataInterface} from "@/types/user";


export interface TaskInfoInputState {
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

export interface ExtendedTaskInfoInputState {
    [key: string]:  TaskInfoInputState;
}

interface AddPreviewFiles {
    fileUploaded: FilePreview
    taskUUID: string
}

interface RemoveUploadedFile {
    key: string,
    taskUUID: string
}

interface UpdatePreviewFilesUID {
    key: string,
    taskUUID: string
    uuid?: string
}

interface AddTaskToTaskInfoInterface {
    tasksInfo: TaskInfoInterface[]
}

interface UpdateTaskNameORLabelInterface {
    taskId: string,
    value: string
}

interface UpdateTaskAssigneeInterface {
    taskId: string,
    assignee?: UserProfileDataInterface
}


interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    taskUUID: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    taskUUID: string
}

interface ClearTaskComment {
    taskUUID: string
}

const initialState = {
    taskInfoInputState: {} as ExtendedTaskInfoInputState,
    taskListVisibleInfo: [] as TaskInfoInterface[]
}

export const taskInfoSlice = createSlice({
    name: 'TaskInfo',
    initialState,
    reducers: {


        addTaskInfoPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, taskUUID} = action.payload;

            if(!state.taskInfoInputState[taskUUID]) {
                state.taskInfoInputState[taskUUID] = {  filesUploaded: [] , filesPreview: [] };
            }

            state.taskInfoInputState[taskUUID].filesPreview.push(fileUploaded);
        },

        deleteTaskInfoPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, taskUUID } = action.payload;

            if(!state.taskInfoInputState[taskUUID]) {
                state.taskInfoInputState[taskUUID] = { filesUploaded: [] , filesPreview: [] };
            }

            state.taskInfoInputState[taskUUID].filesPreview = state.taskInfoInputState[taskUUID].filesPreview.filter((media) => {
                if (media.key === key) {
                    if(media.progress != 100 && typeof media.cancelSource.cancel === 'function') {
                        media.cancelSource.cancel(`Stopping file upload: ${media.fileName}`);
                    }
                    return false;
                } else {
                    return true;
                }
            });

        },

        updateTaskInfoPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, taskUUID } = action.payload;
            if(!state.taskInfoInputState[taskUUID]) {
                state.taskInfoInputState[taskUUID] = { filesUploaded: [] , filesPreview: [] };
            }
            state.taskInfoInputState[taskUUID].filesPreview = state.taskInfoInputState[taskUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },


        addTaskInfoUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, taskUUID } = action.payload;
            if(!state.taskInfoInputState[taskUUID]) {
                state.taskInfoInputState[taskUUID] = { filesUploaded: [] , filesPreview: [] };
            }
            state.taskInfoInputState[taskUUID].filesUploaded.push(filesUploaded);
        },

        removeTaskInfoUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, taskUUID } = action.payload;
            if(!state.taskInfoInputState[taskUUID]) {
                state.taskInfoInputState[taskUUID] = { filesUploaded: [] , filesPreview: [] };
            }
            state.taskInfoInputState[taskUUID].filesUploaded = state.taskInfoInputState[taskUUID].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearTaskInfoInputState: (state, action :{payload: ClearTaskComment}) => {
            const {taskUUID } = action.payload;

            state.taskInfoInputState[taskUUID] = { filesUploaded: [] , filesPreview: [] };


        },

        updateTaskInfoPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUID}) => {
            const {  key, uuid, taskUUID } = action.payload;

            state.taskInfoInputState[taskUUID].filesPreview = state.taskInfoInputState[taskUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },

        createListForTaskInfo: (state, action: {payload: AddTaskToTaskInfoInterface}) => {
            const { tasksInfo } = action.payload;
            state.taskListVisibleInfo = tasksInfo;

        },

        addTasksToTaskInfoList: (state, action: {payload: AddTaskToTaskInfoInterface}) => {
            const { tasksInfo } = action.payload;
            state.taskListVisibleInfo.push(...tasksInfo);

        },

        updateTaskLabelInTaskList: (state, action: {payload: UpdateTaskNameORLabelInterface}) => {
            const { taskId, value } = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task)=>{
                if(task.task_uuid == taskId) {
                    task.task_label = value
                }
                return task
            })

        },

        updateTaskNameInTaskList: (state, action: {payload: UpdateTaskNameORLabelInterface}) => {
            const { taskId, value } = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task)=>{
                if(task.task_uuid == taskId) {
                    task.task_name = value
                }
                return task
            })

        },

        updateTaskStatusInTaskList: (state, action: {payload: UpdateTaskNameORLabelInterface}) => {
            const { taskId, value } = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task)=>{
                if(task.task_uuid == taskId) {
                    task.task_status = value
                }
                return task
            })

        },

        updateTaskPriorityInTaskList: (state, action: {payload: UpdateTaskNameORLabelInterface}) => {
            const { taskId, value } = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task)=>{
                if(task.task_uuid == taskId) {
                    task.task_priority = value
                }
                return task
            })
        },

        updateTaskStartDateInTaskList: (state, action: {payload: UpdateTaskNameORLabelInterface}) => {
            const {taskId, value} = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task) => {
                if (task.task_uuid == taskId) {
                    task.task_start_date = value
                }
                return task
            })
        },

        updateTaskDueDateInTaskList: (state, action: {payload: UpdateTaskNameORLabelInterface}) => {
            const {taskId, value} = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task) => {
                if (task.task_uuid == taskId) {
                    task.task_due_date = value
                }
                return task
            })
        },

        updateTaskAssigneeInTaskList: (state, action: {payload: UpdateTaskAssigneeInterface}) => {
            const {taskId, assignee} = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task) => {
                if (task.task_uuid == taskId) {
                    task.task_assignee = assignee
                }
                return task
            })
        },

        updateTaskPRStateInTaskList: (state, action: {payload: { taskId: string; prState: string }}) => {
            const {taskId, prState} = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task) => {
                if (task.task_uuid == taskId) {
                    task.task_github_pr_state = prState
                }
                return task
            })
        },

        updateTaskPRIsDraftInTaskList: (state, action: {payload: { taskId: string; isDraft: boolean }}) => {
            const {taskId, isDraft} = action.payload;
            state.taskListVisibleInfo = state.taskListVisibleInfo.map((task) => {
                if (task.task_uuid == taskId) {
                    task.task_github_pr_is_draft = isDraft
                }
                return task
            })
        },

        // Reset the visible task list. Both myTaskTable and projectTask
        // Table read from the same slot, so we clear it on mount to
        // avoid showing the previous surface's tasks while the new
        // fetch is in flight (e.g. project tasks bleeding into the
        // /app/myTask page on first paint).
        clearTaskListVisibleInfo: (state) => {
            state.taskListVisibleInfo = [] as TaskInfoInterface[];
        },

    }
});

export const {
    addTaskInfoPreviewFiles,
    deleteTaskInfoPreviewFiles,
    updateTaskInfoPreviewFiles,
    addTaskInfoUploadedFiles,
    removeTaskInfoUploadedFiles,
    clearTaskInfoInputState,
    updateTaskInfoPreviewFilesUUID,
    updateTaskStatusInTaskList,
    updateTaskPriorityInTaskList,
    updateTaskLabelInTaskList,
    updateTaskNameInTaskList,
    updateTaskStartDateInTaskList,
    updateTaskDueDateInTaskList,
    updateTaskAssigneeInTaskList,
    updateTaskPRStateInTaskList,
    updateTaskPRIsDraftInTaskList,
    createListForTaskInfo,
    addTasksToTaskInfoList,
    clearTaskListVisibleInfo

} =taskInfoSlice.actions