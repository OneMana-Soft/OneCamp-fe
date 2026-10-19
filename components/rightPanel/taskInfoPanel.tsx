"use client"
import {startTransition, useCallback, useEffect, useMemo, useRef, useState} from "react"
import { TagPicker } from "@/components/tags/TagPicker"
import { ProjectStatusesDialog } from "@/components/project/ProjectStatusesDialog"
import {Button} from "@/components/ui/button"
import {useDispatch, useSelector} from "react-redux"
import type {RootState} from "@/store/store"
import {priorities, type prioritiesInterface} from "@/types/table"
import { statusOptionOf, statusPatch, type TaskStatusFields } from "@/lib/taskStatus"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch"
import { usePageName } from "@/lib/utils/pageName"
import {
    addTaskComments,
    createTaskCommentReaction,
    removeTaskComment,
    removeTaskCommentReaction,
    updateTaskComment,
    updateTaskCommentReaction,
} from "@/store/slice/createTaskCommentSlice"
import {
    clearTaskInfoInputState,
    deleteTaskInfoPreviewFiles,
    removeTaskInfoUploadedFiles,
    TaskInfoInputState, updateTaskAssigneeInTaskList, updateTaskDueDateInTaskList,
    updateTaskLabelInTaskList, updateTaskNameInTaskList,
    updateTaskPriorityInTaskList, updateTaskStartDateInTaskList,
    updateTaskStatusInTaskList,
} from "@/store/slice/taskInfoSlice"
import {cn} from "@/lib/utils/helpers/cn"
import { Trash2 } from "@/lib/icons";
import {TaskGitHubSection} from "@/components/task/taskGitHubSection"
import {TaskAttachmentsSection} from "@/components/task/taskAttachmentsSection"
import {LinkedItemsSection} from "@/components/entityLink/LinkedItemsSection"
import {usePost} from "@/hooks/usePost"
import { useFeature, FEATURE_GITHUB } from "@/hooks/useClientConfig";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch"
import { accessOf, canCommentTask, canEditTask } from "@/lib/work/access"
import { canDeleteTask } from "@/lib/work/canDelete"

import {useToast} from "@/hooks/use-toast"
import {
    CreateTaskCommentInterface,
    CreateTaskInterface,
    NewSubTaskDraft,
    RemoveTaskAttachmentInterface, TaskInfoInterface,
    TaskInfoRawInterface,
} from "@/types/task"
import {useUploadFile} from "@/hooks/useUploadFile"
import {RightPanelTaskHeader} from "@/components/rightPanel/RightPanelTaskHeader"
import {openUI} from "@/store/slice/uiSlice"
import {TaskCommentBox, TaskCommentNote} from "@/components/task/taskCommentComposer"
import ResizeableTextInput from "@/components/resizeableTextInput/resizeableTextInput"
import {TaskRepeatField} from "@/components/task/taskRepeatField"
import {TaskCycleField} from "@/components/task/taskCycleField"
import {TaskTimeSection} from "@/components/task/taskTimeSection"
import { TaskEstimateField } from "@/components/task/taskEstimateField"
import { TaskFieldsSection } from "@/components/task/taskFieldsSection"
import {TaskClientReview} from "@/components/task/taskClientReview"
import { useSaveOnEdit } from "@/hooks/useSaveOnEdit"
import { useEarlierHistory } from "@/hooks/useEarlierHistory"
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice"
import {TaskStatusPriorityControl} from "@/components/task/taskStatusPriorityControl"
import {TaskAssigneePicker} from "@/components/task/taskAssigneePicker"
import {CommentsList} from "@/components/rightPanel/commentsList"
import TaskActivitySection from "@/components/task/taskActivitySection"
import GitHubActivityTab from "@/components/task/GitHubActivityTab"
import type {AttachmentMediaReq} from "@/types/attachment"
import {SubtasksSection} from "@/components/task/subtasksSection"
import {TaskDescription} from "@/components/task/taskDescription"
import {TaskPanelSkeleton} from "@/components/task/taskPanelSkeleton"
import {TaskDependencies} from "@/components/task/TaskDependencies"
import {useRouter} from "next/navigation"
import {app_my_task_path, app_task_path} from "@/types/paths"
import {useMedia} from "@/context/MediaQueryContext"
import {CreateOrUpdateCommentReaction} from "@/types/reaction";
import {CommentInfoInterface} from "@/types/comment";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import { ErrorState } from "@/components/ui/error-state"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { appMutate as mutate, patchCached } from "@/lib/swrMutate";
import { optimistic } from "@/lib/optimistic";
import { useDeleteTasks } from "@/hooks/useDeleteTasks";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";
import {useMqtt} from "@/components/mqtt/mqttProvider";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {AgentWorkStrip} from "@/components/ai/AgentWorkStrip";
import { SegmentedControl } from "@/components/ui/segmentedControl"
import TaskStream from "@/components/task/TaskStream"
import { DatesProperty, MoreFields, entranceStyle, usePanelEntrance } from "@/components/task/panelParts"
import { propertyLabel, propertyRow, panelSection } from "@/lib/ui/propertyRow"
import { useTaskTime } from "@/hooks/useTaskTime"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"

const CONSTANTS = {
    LABEL_PLACEHOLDER: "addLabel",
    STATUS_DONE: "done",
    DEBOUNCE_DELAY: 500,
    THROTTLE_DELAY: 300,
} as const

type UpdateTaskName = { taskUUID: string; taskName: string }

// What the panel reads from the store for a task that has nothing there yet.
// One value each, made once: a `{}` or `[]` written in the selector is new on
// every call, never equal to the last, so the panel rendered again on every
// change to the store while it was open (a draft keystroke anywhere, a
// message arriving, the typing sweep).
const NO_INPUT = {} as TaskInfoInputState
const NO_COMMENTS: CommentInfoInterface[] = []

interface TaskInfoPanelProps {
    taskUUID: string
    /** On the full task page rather than in the panel: no close, no "open full page". */
    onPage?: boolean
}

type StreamFilter = "all" | "comments" | "history" | "github"



/**
 * A task's own page (W37): two columns, the work and the properties' sticky
 * rail, centred. The composer under the page takes the same columns, so it
 * sits under the work (TaskCommentComposer's frame).
 */
const PAGE_COLUMNS = "mx-auto w-full max-w-[1080px] lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10 lg:px-8"

export default function TaskInfoPanel({ taskUUID, onPage = false }: TaskInfoPanelProps) {
    const dispatch = useDispatch()
    const post = usePost()
    const uploadFile = useUploadFile()
    const router = useRouter()
    const { isMobile, isDesktop } = useMedia();
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();
    const { connectionState: mqttState } = useMqtt();
    const isMqttHealthy = mqttState.isConnected;

    const { toast } = useToast()

    const fileTaskInputRef = useRef<HTMLInputElement>(null)
    // Debounce task-list revalidation to batch rapid changes (e.g. user
    // clicking through multiple fields) into a single expensive SWR sweep.
    const revalidateTaskListsTimeout = useRef<ReturnType<typeof setTimeout>|null>(null)

    // The tags as shown. They are saved only from the picker's change
    // (saveLabel, below), never from this state: a save from its changes also
    // ran on mount with the empty first value, and wiped the tags of a task
    // whose details were already cached (PROJ-BUG-1).
    const [taskLabel, setTaskLabel] = useState<string>("")
    // The tags as the server has them: its last answer, or the last save it took.
    const savedLabel = useRef("")
    const [managingStatuses, setManagingStatuses] = useState(false)
    // The task's status as it stands (category and custom status); the option
    // shown is derived from it and the project's statuses, which may load later.
    const [statusFields, setStatusFields] = useState<TaskStatusFields>({})
    const [selectedPriority, setSelectedPriority] = useState<prioritiesInterface | undefined>(undefined)
    const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
    const [taskIsDeleted, setTaskIsDeleted] = useState<boolean>(false)
    const [startDate, setStartDate] = useState<Date | undefined>(undefined)
    const [taskSubTasks, setTaskSubTasks] = useState<TaskInfoInterface[]>([])
    const [taskAttachments, setTaskAttachments] = useState<AttachmentMediaReq[]>([])
    // The header's hairline shows once the body has scrolled (W28).
    const [scrolled, setScrolled] = useState(false)
    const [streamFilter, setStreamFilter] = useState<StreamFilter>("all")
    const entrance = usePanelEntrance()
    const taskTime = useTaskTime(taskUUID)

    const taskInfo = useFetch<TaskInfoRawInterface>(taskUUID ? `${GetEndpointUrl.GetTaskInfo}/${taskUUID}` : "", undefined, {
        // Long-interval fallback refresh. Catches missed MQTT messages
        // and GitHub-side changes (title, status, PR state) without
        // being noisy. Real-time comment/reaction updates come via
        // MQTT, so when MQTT is healthy we lengthen significantly.
        //
        // refreshWhenHidden: false (SWR default) means a backgrounded
        // tab pauses; refreshWhenOffline: false (default) means an
        // offline laptop doesn't burn retries. The user is reactivating
        // the panel will trigger an immediate revalidate via SWR's
        // built-in revalidateOnFocus.
        refreshInterval: isMqttHealthy ? 5 * 60 * 1000 : 60 * 1000,
        refreshWhenHidden: false,
        refreshWhenOffline: false,
    })
    // On its own page the tab says the task's name ("Task · OneCamp" said
    // which section, not which task: PTC-38); in a panel the page beside it
    // keeps its own.
    usePageName(onPage ? taskInfo.data?.data?.task_name : undefined)
    const { options: statusOpts } = useProjectStatuses(taskInfo.data?.data?.task_project?.project_uuid)
    // The newest history lines come with the task; older ones on asking (PROJ-BUG-8).
    const history = useEarlierHistory(taskUUID, taskInfo.data?.data?.task_activities, taskInfo.data?.data?.task_activity_has_more)
    const selectedStatus = useMemo(
        () => (statusFields.task_status ? statusOptionOf(statusFields, statusOpts) : undefined),
        [statusFields, statusOpts],
    )
    const syncStatus = useFetch<{ data: { status: string; error?: string; attempts: number } }>(
        taskUUID && (taskInfo.data?.data?.task_github_issue_url || taskInfo.data?.data?.task_github_pr_url)
            ? `${GetEndpointUrl.GetGitHubSyncStatus}/${taskUUID}`
            : "",
        undefined,
        {
            refreshInterval: (latestData) => {
                // Aggressive while a sync is in flight: the user is actively
                // waiting on it, and even with MQTT we want maximum
                // responsiveness for "pending" / "failed" transitions.
                if (latestData?.data?.status === "pending") return 5000
                if (latestData?.data?.status === "failed") return 10000
                // Stable. MQTT publishes `sync_status_changed`, so the long
                // fallback only catches missed messages or webhook lag.
                // Lengthen significantly when MQTT is healthy.
                return isMqttHealthy ? 5 * 60 * 1000 : 60 * 1000
            },
            // Pause when hidden / offline so a forgotten tab doesn't
            // hit the API every 5s indefinitely.
            refreshWhenHidden: false,
            refreshWhenOffline: false,
        }
    )
    // Read from the feature registry, not /admin/github/status. That route is in
    // the admin router, so every non-admin opening a task got a 403 and the panel
    // read the failure as "not connected" — right by accident, and noisy.
    const githubConnected = useFeature(FEATURE_GITHUB)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    // Debounced task-list revalidation — defined after taskInfo so the
    // dependency array can reference it without temporal dead zone.
    const revalidateTaskListsDebounced = useCallback((delayMs = 2000) => {
        if (revalidateTaskListsTimeout.current) {
            clearTimeout(revalidateTaskListsTimeout.current)
        }
        revalidateTaskListsTimeout.current = setTimeout(() => {
            const projectUUID = taskInfo.data?.data?.task_project?.project_uuid
            if (projectUUID) {
                revalidateTaskKeys(projectUUID)
            }
            revalidateTaskListsTimeout.current = null
        }, delayMs)
    }, [taskInfo.data?.data?.task_project?.project_uuid, revalidateTaskKeys])

    const taskInputState = useSelector(
        (state: RootState) => state.TaskInfo.taskInfoInputState[taskUUID] || NO_INPUT,
    )

    const taskCommentState = useSelector(
        (state: RootState) => state.createTaskComment.taskComments[taskUUID] || NO_COMMENTS,
    )

    // What the reader may do here, as the server says (Work Access, A1):
    // changing this task is its task_access; deleting it, and the project's
    // statuses, are their own.
    const me = selfProfile.data?.data?.user_uuid
    const access = useMemo(() => accessOf(taskInfo.data?.data.task_project), [taskInfo.data?.data.task_project])
    const canEdit = useMemo(() => canEditTask(taskInfo.data?.data, me), [taskInfo.data?.data, me])
    // A viewer reads the task but can't comment: no box that refuses what they type.
    const canComment = useMemo(() => canCommentTask(taskInfo.data?.data), [taskInfo.data?.data])
    const canDelete = useMemo(() => canDeleteTask(taskInfo.data?.data, me), [taskInfo.data?.data, me])

    const canMarkComplete = useMemo(
        () => {

            // Done or any of the project's statuses that count as done.
            return selectedStatus?.category !== CONSTANTS.STATUS_DONE
        },
        [selectedStatus],
    )

    const projectMembers = useMemo(
        () => taskInfo.data?.data.task_project.project_members || [],
        [taskInfo.data?.data.task_project.project_members],
    )

    const parentTask = useMemo(() => taskInfo.data?.data.task_parent_task, [taskInfo.data?.data.task_parent_task])


    const handleChangeTask = useCallback(
        (taskUUID: string) => {
            if (isMobile) {
                router.push(`${app_task_path}/${taskUUID}`)
            }
            if (isDesktop) {
                dispatch(
                    openRightPanel({
                        channelUUID: "",
                        chatMessageUUID: "",
                        chatUUID: "",
                        postUUID: "",
                        taskUUID: taskUUID,
                        groupUUID: "",
                        docUUID:""
                    }),
                )
            }
        },
        [isMobile, isDesktop, router, dispatch],
    )

    const updateTaskName = useCallback(
        (name: string, id: string) => {
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (!name?.trim() || !id || !projectUUID) return Promise.resolve()

            return post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskName,
                    payload: {
                        task_uuid: id,
                        task_name: name.trim(),
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    dispatch(updateTaskNameInTaskList({taskId: id, value: name.trim()}))
                    optimisticUpdateTask({ task_uuid: id, task_name: name.trim() }, projectUUID)
                    // No list revalidation needed: name changes don't affect
                    // kanban columns or filter visibility.  Optimistic update
                    // is sufficient for all views.
                })
        },
        [post, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask],
    )

    const updateTaskStatus = useCallback(
        (status: string, id: string, patch: TaskStatusFields) => {
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (!status || !id || !projectUUID) return Promise.resolve()

            return post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
                    payload: {
                        task_status: status,
                        task_uuid: id,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    dispatch(updateTaskStatusInTaskList({taskId: id, value: status, patch}))
                    optimisticUpdateTask({ task_uuid: id, ...patch }, projectUUID)
                    // Status affects kanban columns — debounce so rapid clicks
                    // (e.g. todo → in_progress → done) batch into one sweep.
                    revalidateTaskListsDebounced(1500)
                })
        },
        [post, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask, revalidateTaskListsDebounced],
    )

    const updateTaskPriority = useCallback(
        (priority: string) => {
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (!priority || !projectUUID) return Promise.resolve()

            return post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskPriority,
                    payload: {
                        task_priority: priority,
                        task_uuid: taskUUID,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    dispatch(updateTaskPriorityInTaskList({taskId: taskUUID, value: priority}))
                    optimisticUpdateTask({ task_uuid: taskUUID, task_priority: priority }, projectUUID)
                    // No list revalidation: priority doesn't affect columns or filters.
                })
        },
        [post, taskUUID, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask],
    )

    const updateTaskLabel = useCallback(
        (label: string) => {
            const trimmedLabel = label.trim()

            // The label holds the task's tags ("frontend, needs review"); the
            // picker sends them joined the way the server keeps them.
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (
                !canEdit ||
                !projectUUID ||
                trimmedLabel === CONSTANTS.LABEL_PLACEHOLDER
            ) {
                return
            }

            // Only when it differs from what the server has. The cached task
            // isn't patched after a save, so its label would still be the old
            // one: changing the tags and then changing them back sent nothing.
            if (trimmedLabel === savedLabel.current) {
                return
            }

            // A refused save puts back the tags the server has (PTC-2).
            void optimistic({
                key: `task:${taskUUID}:label`,
                apply: () => {},
                revert: () => setTaskLabel(savedLabel.current),
                commit: () => post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskLabel,
                    payload: {
                        task_label: trimmedLabel,
                        task_uuid: taskUUID,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    savedLabel.current = trimmedLabel
                    dispatch(updateTaskLabelInTaskList({taskId: taskUUID, value: trimmedLabel}))
                    optimisticUpdateTask({ task_uuid: taskUUID, task_label: trimmedLabel }, projectUUID)
                    // No list revalidation: label doesn't affect columns or filters.
                }),
            })
        },
        [canEdit, post, taskUUID, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask],
    )

    const updateTaskStartDate = useCallback(
        (date: Date | undefined, id: string) => {
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (!id || !projectUUID) return Promise.resolve()

            const startDate = date ? date.toISOString() : ""
            return post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskStartDate,
                    payload: {
                        task_uuid: id,
                        task_start_date: startDate,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    dispatch(updateTaskStartDateInTaskList({
                        taskId: id,
                        value: startDate
                    }))
                    // The board, the list and the timeline show it at once; no
                    // refetch, as a start date moves no card between columns.
                    optimisticUpdateTask({ task_uuid: id, task_start_date: startDate }, projectUUID)
                })
        },
        [post, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask],
    )

    const updateTaskDueDate = useCallback(
        (date: Date | undefined, id: string) => {
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (!id || !projectUUID) return Promise.resolve()

            const dueDate =  date ? date.toISOString() : ""
            return post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskDueDate,
                    payload: {
                        task_uuid: id,
                        task_due_date: dueDate,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    dispatch(updateTaskDueDateInTaskList({
                        taskId: id,
                        value: dueDate
                    }))
                    // The board, the list and the timeline show it at once; no
                    // refetch, as a due date moves no card between columns.
                    optimisticUpdateTask({ task_uuid: id, task_due_date: dueDate }, projectUUID)
                })
        },
        [post, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask],
    )

    const updateTaskAssignee = useCallback(
        (
            userInfo: UserProfileDataInterface | undefined,
            id: string,
            before: UserProfileDataInterface | undefined,
            /** Where else it shows: a subtask's row in this panel. */
            alsoShow?: (who: UserProfileDataInterface | undefined) => void,
        ) => {
            const projectUUID = taskInfo.data?.data.task_project.project_uuid
            if (!id || !projectUUID) return Promise.resolve()

            // Shown on every list, board and this panel at once; put back on
            // all of them if the server refuses it (the lists kept the new
            // assignee: PTC-2).
            const show = (who: UserProfileDataInterface | undefined) => {
                alsoShow?.(who)
                dispatch(updateTaskAssigneeInTaskList({ assignee: who, taskId: id }))
                optimisticUpdateTask({ task_uuid: id, task_assignee: who }, projectUUID)
                if (id === taskUUID) {
                    patchCached<TaskInfoRawInterface>(`${GetEndpointUrl.GetTaskInfo}/${taskUUID}`, (d) => ({ ...d, data: { ...d.data, task_assignee: who } }))
                }
            }
            return optimistic({
                key: `task:${id}:assignee`,
                apply: () => show(userInfo),
                revert: () => show(before),
                commit: () => post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskAssignee,
                    payload: {
                        task_assignee_uuid: userInfo?.user_uuid,
                        task_uuid: id,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    // Assignee affects "my tasks" views — debounce so rapid
                    // re-assignments batch into one sweep.
                    revalidateTaskListsDebounced(2000)
                }),
            })
        },
        [post, taskInfo.data?.data.task_project.project_uuid, taskUUID, dispatch, optimisticUpdateTask, revalidateTaskListsDebounced],
    )

    const handleUndeleteTask = useCallback(() => {
        post
            .makeRequest<CreateTaskInterface>({
                apiEndpoint: PostEndpointUrl.UnArchiveTask,
                payload: {
                    task_uuid: taskUUID,
                },
            })
            .then(() => {
                setTaskIsDeleted(false)
                optimisticUpdateTask({ task_uuid: taskUUID }, taskInfo.data!.data.task_project.project_uuid)
                // Undelete changes list visibility (task re-appears).
                revalidateTaskListsDebounced(500)
            })
    }, [post, taskUUID, taskInfo, optimisticUpdateTask, revalidateTaskListsDebounced])

    const addAttachmentsToTask = useCallback(() => {
        if (!taskInputState?.filesUploaded?.length || !taskInfo.data?.data.task_project.project_uuid) return

        post
            .makeRequest<CreateTaskInterface>({
                apiEndpoint: PostEndpointUrl.AddAttachmentToTask,
                payload: {
                    task_uuid: taskUUID,
                    task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    task_attachments: taskInputState.filesUploaded,
                },
            })
            .then(() => {

                setTaskAttachments(prevItems => [...prevItems, ...taskInputState.filesUploaded]);
                dispatch(clearTaskInfoInputState({ taskUUID }))
            })
    }, [taskInputState, taskUUID, post, taskInfo, dispatch])

    const handleTaskFileUpload = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (!canEdit || !taskInfo.data?.data.task_project.project_uuid) return

            const files = e.target.files
            if (!files?.length) return

            uploadFile.makeRequestToUploadToTask(files, taskUUID, taskInfo.data.data.task_project.project_uuid).then(() => {
                if (fileTaskInputRef.current) {
                    fileTaskInputRef.current.value = ""
                }
            })
        },
        [canEdit, uploadFile, taskUUID, taskInfo.data?.data.task_project.project_uuid],
    )

    const openCommentFiles = useCallback(() => dispatch(openUI({ key: 'taskCommentFileUpload' })), [dispatch])

    const handleAttachmentIconClick = useCallback(
        (attachmentMedia: AttachmentMediaReq) => {
            if (!taskInfo.data?.data.task_attachments) return

            dispatch(
                openUI({
                    key: 'attachmentLightbox',
                    data: {
                        allMedia: taskInfo.data.data.task_attachments,
                        media: attachmentMedia,
                        mediaGetUrl: `${GetEndpointUrl.GetProjectMedia}/${taskInfo.data.data.task_project.project_uuid}`,
                    }
                }),
            )
        },
        [taskInfo.data, dispatch],
    )

    const deleteTaskAttachment = useCallback(
        (key: string) => {
            post
                .makeRequest<RemoveTaskAttachmentInterface>({
                    apiEndpoint: PostEndpointUrl.RemoveTaskAttachment,
                    payload: {
                        task_uuid: taskUUID,
                        attachment_obj_key: key,
                    },
                })
                .then(() => {
                    setTaskAttachments(prevItems =>
                        prevItems.filter(item => item.attachment_uuid !== key)
                    );
                })
        },
        [post, taskUUID, taskInfo],
    )

    const removeTaskPreviewFile = useCallback(
        (key: string) => {
            dispatch(deleteTaskInfoPreviewFiles({ key, taskUUID }))
            dispatch(removeTaskInfoUploadedFiles({ key, taskUUID }))
        },
        [dispatch, taskUUID],
    )

    const handleCreateSubtask = useCallback(
        (subtaskData: NewSubTaskDraft) => {
            if (!taskInfo.data?.data.task_project.project_uuid) return

            const postBody: CreateTaskInterface = {
                task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                task_uuid: taskUUID,
                task_assignee_uuid: subtaskData.task_assignee?.user_uuid,
                task_name: subtaskData.task_name,
            }

            if (subtaskData.task_start_date) {
                postBody.task_start_date = subtaskData.task_start_date.toISOString()
            }
            if (subtaskData.task_due_date) {
                postBody.task_due_date = subtaskData.task_due_date.toISOString()
            }

            post
                .makeRequest<CreateTaskInterface,TaskInfoInterface>({
                    apiEndpoint: PostEndpointUrl.CreateSubTask,
                    payload: postBody,
                })
                .then((res) => {

                    if(res) {
                        setTaskSubTasks(prevItems => [...prevItems, res]);
                    }
                })
        },
        [post, taskUUID, taskInfo],
    )

    useEffect(() => {
        if (!taskInfo.data?.data) return

        const data = taskInfo.data.data

        // Merge server comments into Redux (idempotent — preserves existing
        // optimistic/MQTT updates via merge logic in addTaskComments).
        dispatch(addTaskComments({taskId: taskUUID, comments: data.task_comments || []}))

        setStartDate(!isZeroEpoch(data.task_start_date) ? new Date(data.task_start_date) : undefined)
        setDueDate(!isZeroEpoch(data.task_due_date) ? new Date(data.task_due_date) : undefined)
        setStatusFields({
            task_status: data.task_status,
            task_custom_status: data.task_custom_status,
            task_custom_status_name: data.task_custom_status_name,
        })
        setSelectedPriority(priorities.find((p) => p.value === data.task_priority))
        setTaskSubTasks(data.task_sub_tasks||[])
        setTaskLabel(data.task_label || "")
        savedLabel.current = data.task_label || ""
        setTaskIsDeleted(!isZeroEpoch(data.task_deleted_at || ''))
        setTaskAttachments(data.task_attachments || [])
    }, [taskInfo.data?.data, taskUUID, dispatch])
    useEffect(() => {
        if (
            taskInputState &&
            taskInputState.filesPreview?.length > 0 &&
            taskInputState.filesPreview.length === taskInputState.filesUploaded.length
        ) {
            addAttachmentsToTask()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskInputState, taskUUID])

    // The tags and the name are saved from the person's own changes only, half
    // a second after the last (hooks/useSaveOnEdit): never on mount, never
    // the server's own answer echoed back.
    const saveLabel = useSaveOnEdit(updateTaskLabel, { delay: CONSTANTS.DEBOUNCE_DELAY, key: taskUUID })
    const editLabel = useCallback(
        (label: string) => {
            setTaskLabel(label)
            saveLabel(label)
        },
        [saveLabel],
    )
    // A refused rename puts the saved name back: the title shows the task's
    // name as the server has it (a new key reads it afresh), a subtask its own.
    const [titleKey, setTitleKey] = useState(0)
    const saveName = useSaveOnEdit(
        (name: UpdateTaskName) => {
            if (name.taskUUID !== taskUUID) {
                changeSubtask(name.taskUUID, "name", { task_name: name.taskName }, () => updateTaskName(name.taskName, name.taskUUID))
                return
            }
            void optimistic({
                key: `task:${taskUUID}:name`,
                apply: () => {},
                revert: () => setTitleKey((k) => k + 1),
                commit: () => updateTaskName(name.taskName, name.taskUUID),
            })
        },
        { delay: CONSTANTS.DEBOUNCE_DELAY, key: taskUUID },
    )

    // A status or priority shows at once and is taken back if the server
    // refuses it: after a failed Mark complete the panel stayed Done while
    // the list said In progress, and the page raised an error (PTC-2).
    const handleStatusSelect = useCallback(
        (value: string) => {
            const patch = statusPatch(value, statusOpts)
            const before = statusFields
            void optimistic({
                key: `task:${taskUUID}:status`,
                apply: () => setStatusFields(patch),
                revert: () => setStatusFields(before),
                commit: () => updateTaskStatus(value, taskUUID, patch),
            })
        },
        [taskUUID, updateTaskStatus, statusOpts, statusFields],
    )

    const handlePrioritySelect = useCallback(
        (value: string) => {
            const priority = priorities.find((p) => p.value === value)
            const before = selectedPriority
            void optimistic({
                key: `task:${taskUUID}:priority`,
                apply: () => setSelectedPriority(priority),
                revert: () => setSelectedPriority(before),
                commit: () => updateTaskPriority(value),
            })
        },
        [taskUUID, updateTaskPriority, selectedPriority],
    )

    // A subtask's own change shows in the list of subtasks at once, and is
    // taken back there if the server refuses it.
    const changeSubtask = useCallback(
        (id: string, field: string, patch: Partial<TaskInfoInterface>, commit: () => Promise<unknown>) => {
            const before = taskSubTasks.find((t) => t.task_uuid === id)
            if (!before) return
            const was = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof TaskInfoInterface]])) as Partial<TaskInfoInterface>
            const set = (p: Partial<TaskInfoInterface>) =>
                setTaskSubTasks((prev) => prev.map((t) => (t.task_uuid === id ? { ...t, ...p } : t)))
            void optimistic({ key: `task:${id}:${field}`, apply: () => set(patch), revert: () => set(was), commit })
        },
        [taskSubTasks],
    )


    const createOrUpdateCommentReaction = (emojiId:string, reactionId:string, commentId:string, commentIdx: number) => {
        post.makeRequest<CreateOrUpdateCommentReaction, CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateTaskCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updateTaskCommentReaction({commentIndex: commentIdx, reactionId, emojiId, taskId: taskUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createTaskCommentReaction({taskId:taskUUID, commentIndex: commentIdx, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
                }
            })
    }

    const removeCommentReaction = (reactionId:string, commentId: string, commentIdx: number) => {

        post.makeRequest<CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.RemoveTaskCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{

                dispatch(removeTaskCommentReaction({commentIndex: commentIdx, reactionId, taskId: taskUUID}))

            })
    }

    const executeDeleteTaskComment = ( commentIndex: number, commentUUID: string) => {

        post.makeRequest<CreateTaskCommentInterface>({
            apiEndpoint: PostEndpointUrl.RemoveTaskComment,
            payload: {
                task_uuid: taskUUID,
                task_comment_uuid: commentUUID,
            },
            showToast: true
        })
            .then(() => {
                dispatch(removeTaskComment({taskId: taskUUID, commentIndex}))
                // dispatch(updateTaskMessageReplyDecrement({messageId: rightPanelState.data.chatMessageUUID, chatId: rightPanelState.data.chatUUID, comment: {comment_uuid: commentUUID, comment_text: ''}}))
            })

    }

    const handleDeleteTaskComment = (commentUUID: string, commentIndex: number) => {

        if(!commentUUID) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Delete this comment?",
                    description: "It's removed from the task for everyone. This can't be undone.",
                    confirmText: "Delete comment",
                    destructive: true,
                    onConfirm: ()=>{executeDeleteTaskComment(commentIndex, commentUUID)}
                }
            }));
        }, 500);


    }

    const handleUpdateTaskComment = ( commentUUID: string, commentHTMLText: string, commentIndex: number) => {

        const trimmedHtml = removeEmptyPTags(commentHTMLText)
        if (!trimmedHtml) return

        post.makeRequest<CreateTaskCommentInterface>({
            apiEndpoint: PostEndpointUrl.UpdateTaskComment,
            payload: {
                task_uuid: taskUUID,
                task_comment_uuid: commentUUID,
                task_comment_body: trimmedHtml,
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateTaskComment({
                        commentIndex: commentIndex,
                        taskId: taskUUID,
                        htmlText: trimmedHtml,
                    }))
                }

            })
    }

    // Deleted with Undo, as everywhere (hooks/useDeleteTasks); the banner
    // under the header stays for whoever comes back to it.
    const deleteTasks = useDeleteTasks(taskInfo.data?.data.task_project?.project_uuid)
    const handleDeleteTask = useCallback(() => {
        const task = taskInfo.data?.data
        if (!task) return
        void deleteTasks([task]).then((r) => {
            if (r.done.length > 0) setTaskIsDeleted(true)
        })
    }, [taskInfo.data?.data, deleteTasks])

    // Opening a task paints its header and fields first; the description and
    // everything under it (two editors, comments, dependencies) follow a frame
    // later, as a transition. With the task already loaded (hovering loads
    // it), the click otherwise waited for the whole panel before its first
    // paint.
    const [settled, setSettled] = useState(false)
    useEffect(() => {
        const id = requestAnimationFrame(() => startTransition(() => setSettled(true)))
        return () => cancelAnimationFrame(id)
    }, [])

    const hasGitHub = !!(taskInfo.data?.data?.task_github_issue_url || taskInfo.data?.data?.task_github_pr_url || taskInfo.data?.data?.task_github_branch)
    const streamOptions = useMemo(
        () => [
            { value: "all" as const, label: "All" },
            { value: "comments" as const, label: taskCommentState.length ? `Comments ${taskCommentState.length}` : "Comments" },
            { value: "history" as const, label: "History" },
            ...(hasGitHub ? [{ value: "github" as const, label: "GitHub" }] : []),
        ],
        [taskCommentState.length, hasGitHub],
    )

    // A run of comments, drawn by the comments' own list with their real
    // indexes, so reacting, editing and deleting reach the right one.
    const renderComments = (start: number, end: number) => (
        <CommentsList
            comments={start === 0 && end === taskCommentState.length ? taskCommentState : taskCommentState.slice(start, end)}
            removeReaction={(reactionId, commentId, idx) => removeCommentReaction(reactionId, commentId, idx + start)}
            addOrUpdateReaction={(emojiId, reactionId, commentId, idx) => createOrUpdateCommentReaction(emojiId, reactionId, commentId, idx + start)}
            removeComment={(id, idx) => handleDeleteTaskComment(id, idx + start)}
            updateComment={(id, body, idx) => handleUpdateTaskComment(id, body, idx + start)}
            getMediaURL={`${GetEndpointUrl.GetProjectMedia}/${taskInfo.data?.data.task_project.project_uuid}`}
        />
    )

    // The panel's shape, not a spinner: it fills in place (taskPanelSkeleton).
    if(taskInfo.isLoading) return <TaskPanelSkeleton />

    // A task that isn't there for this person says so, with the way back:
    // the server answers an id that names nothing, a task deleted for good
    // and one in a project they aren't in alike (404). Only a read that
    // failed offers Try again; it said "a connection problem" about a task
    // that was never there (PTC-4). A page of its earlier history that
    // answers so (the task was deleted, or they left its project, while the
    // panel was open) is the same answer: not a list that can't go on.
    const cantOpen = !taskInfo.data?.data && taskInfo.isError ? taskInfo.isError : history.cantOpen
    if (cantOpen) {
        return (
            <div className="flex h-full flex-col">
                <LoadFailureState
                    error={cantOpen}
                    noun="task"
                    onRetry={() => void taskInfo.mutate()}
                    back={onPage ? { label: "Back to My Tasks", href: app_my_task_path } : isDesktop ? { label: "Close", onClick: () => dispatch(closeRightPanel()) } : undefined}
                    goneDetail="If someone sent you the link, it may be in a project you're not in."
                    noAccessDetail="It's in a project you're not in. Ask one of the project's admins to add you."
                    className="m-auto pt-0"
                />
            </div>
        )
    }

    const projectUUID = taskInfo.data?.data.task_project?.project_uuid || ""
    const isDone = selectedStatus?.category === CONSTANTS.STATUS_DONE

    return (
        <div className="flex flex-col h-full" data-task-panel="">
            <div>
                <RightPanelTaskHeader
                    isAdmin={canEdit}
                    canDelete={canDelete}
                    canMarkComplete={canMarkComplete}
                    onMarkComplete={() => handleStatusSelect(CONSTANTS.STATUS_DONE)}
                    onReopen={() => handleStatusSelect("todo")}
                    onDeleteTask={handleDeleteTask}
                    taskUUID={taskUUID}
                    taskName={taskInfo.data?.data.task_name}
                    projectName={taskInfo.data?.data.task_project?.project_name}
                    projectUUID={projectUUID}
                    scrolled={scrolled}
                    onPage={onPage}
                    deleted={taskIsDeleted}
                    parent={parentTask ? { name: parentTask.task_name, onOpen: () => handleChangeTask(parentTask.task_uuid) } : undefined}
                    hasGitHubLink={!!(taskInfo.data?.data.task_github_issue_url || taskInfo.data?.data.task_github_pr_url || taskInfo.data?.data.task_github_branch)}
                />
                {taskIsDeleted && (
                    // A danger-tint strip, not a solid red bar (W28).
                    <div data-task-deleted="" className="flex h-10 items-center justify-between gap-2 bg-destructive/10 pl-5 pr-2.5 text-ui-sm text-danger-ink">
                        <span className="flex items-center gap-2">
                            <Trash2 className="h-3.5 w-3.5" />
                            This task is deleted
                        </span>
                        {canDelete && (
                            <Button data-tone="danger" variant="ghost" size="sm" onClick={handleUndeleteTask} className="h-7 text-danger-ink hover:text-danger-ink">
                                Undelete
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                onScroll={(e) => {
                    const past = e.currentTarget.scrollTop > 0
                    if (past !== scrolled) setScrolled(past)
                }}
            >
                {/* On the full page (W37) the body is two columns: the work on the
                    left, the properties as a sticky 280px rail on the right. */}
                <div
                    data-task-body={onPage ? "page" : "panel"}
                    className={cn(
                        "px-6 pb-6 pt-[18px]",
                        onPage && cn(PAGE_COLUMNS, "lg:pt-8 lg:[&>*]:col-start-1"),
                    )}
                    style={entranceStyle(entrance, "body")}
                >

                    {/* The title: title-2, edited in place, a hover ground behind it (W29). */}
                    <div className="-mx-1 mb-4 rounded-md transition-colors hover:bg-hover focus-within:bg-transparent" style={entranceStyle(entrance, "title")}>
                        <ResizeableTextInput
                            key={titleKey}
                            delay={3000}
                            content={taskInfo.data?.data.task_name || ""}
                            textUpdate={(s: string) => saveName({ taskName: s, taskUUID })}
                            disabled={!canEdit}
                            className="!min-h-0 !border-0 !bg-transparent !px-1 !py-0.5 !text-title-2 !shadow-none"
                        />
                    </div>

                    {/* The six properties that always show, then the rest (W29). */}
                    <div
                        data-task-properties=""
                        className={cn("mb-6", onPage && "lg:sticky lg:top-6 lg:!col-start-2 lg:row-[1/span_40] lg:mb-0 lg:self-start lg:rounded-lg lg:bg-raised lg:p-4 lg:shadow-e1")}
                    >
                    <TaskStatusPriorityControl
                        isAdmin={canEdit}
                        selectedStatus={selectedStatus}
                        statusOptions={statusOpts}
                        selectedPriority={selectedPriority}
                        onSelectStatus={handleStatusSelect}
                        onSelectPriority={handlePrioritySelect}
                        onManageStatuses={access.manage && projectUUID ? () => setManagingStatuses(true) : undefined}
                    />
                    {access.manage && projectUUID && (
                        <ProjectStatusesDialog
                            projectId={projectUUID}
                            open={managingStatuses}
                            onOpenChange={setManagingStatuses}
                        />
                    )}

                    <TaskAssigneePicker
                        isAdmin={canEdit}
                        label="Assignee"
                        members={projectMembers}
                        assignee={taskInfo.data?.data.task_assignee}
                        onChange={(uid) => void updateTaskAssignee(uid, taskUUID, taskInfo.data?.data.task_assignee)}
                        includeAITeammates
                    />

                    <DatesProperty
                        isAdmin={canEdit}
                        start={startDate}
                        due={dueDate}
                        done={isDone}
                        onStart={(d) => {
                            const before = startDate
                            void optimistic({ key: `task:${taskUUID}:start`, apply: () => setStartDate(d), revert: () => setStartDate(before), commit: () => updateTaskStartDate(d, taskUUID) })
                        }}
                        onDue={(d) => {
                            const before = dueDate
                            void optimistic({ key: `task:${taskUUID}:due`, apply: () => setDueDate(d), revert: () => setDueDate(before), commit: () => updateTaskDueDate(d, taskUUID) })
                        }}
                    />
                    {projectUUID && (
                        <TaskEstimateField
                            taskUUID={taskUUID}
                            projectUUID={projectUUID}
                            minutes={taskInfo.data?.data.task_estimate_minutes}
                            loggedSeconds={taskTime.time?.seconds}
                            canEdit={canEdit}
                        />
                    )}
                    {/* Tags: chips for everyone, the picker for whoever can edit. */}
                    {(canEdit || taskLabel.trim() !== "") && (
                        <div className={propertyRow()} data-property="labels">
                            <span className={propertyLabel}>Labels</span>
                            <div className="min-w-0">
                                <TagPicker projectId={projectUUID} label={taskLabel} canEdit={canEdit} onChange={editLabel} />
                            </div>
                        </div>
                    )}
                    {projectUUID && <TaskTimeSection taskUUID={taskUUID} estimateMinutes={taskInfo.data?.data.task_estimate_minutes} />}

                    <MoreFields>
                        <TaskRepeatField
                            taskUUID={taskUUID}
                            isAdmin={canEdit}
                            isSubtask={!!taskInfo.data?.data.task_parent_task?.task_uuid}
                            dueDate={dueDate}
                        />
                        <TaskCycleField taskUUID={taskUUID} projectId={projectUUID} isAdmin={canEdit} />
                        {projectUUID && (
                            <TaskFieldsSection
                                key={taskUUID}
                                taskUUID={taskUUID}
                                projectUUID={projectUUID}
                                values={taskInfo.data?.data.task_fields}
                                canEdit={canEdit}
                                members={projectMembers}
                            />
                        )}
                        <TaskClientReview taskUUID={taskUUID} />
                    </MoreFields>
                    </div>

                    {settled ? (<>
                    {/* Its own component: typing renders the editor, not the panel. */}
                    <TaskDescription
                        taskUUID={taskUUID}
                        projectUUID={taskInfo.data?.data.task_project?.project_uuid || ""}
                        html={taskInfo.data?.data.task_description || ""}
                        canEdit={canEdit}
                    />

                    <SubtasksSection
                        isAdmin={canEdit}
                        subtasks={taskSubTasks}
                        projectMembers={projectMembers}
                        onToggleStatus={(id, newStatus) => {
                                const patch = statusPatch(newStatus, statusOpts)
                                changeSubtask(id, "status", patch, () => updateTaskStatus(newStatus, id, patch))
                            }
                        }
                        onRename={(id, name) => saveName({ taskName: name, taskUUID: id })}
                        onUpdateStart={(id, d) => changeSubtask(id, "start", { task_start_date: d?.toISOString() || "" }, () => updateTaskStartDate(d, id))}
                        onUpdateDue={(id, d) => changeSubtask(id, "due", { task_due_date: d?.toISOString() || "" }, () => updateTaskDueDate(d, id))}
                        onUpdateAssignee={(id, userInfo) => {
                                const before = taskSubTasks.find((t) => t.task_uuid === id)?.task_assignee
                                void updateTaskAssignee(userInfo, id, before, (who) =>
                                    setTaskSubTasks((prev) => prev.map((t) => (t.task_uuid === id ? { ...t, task_assignee: who } : t))),
                                )
                            }
                        }
                        onOpen={handleChangeTask}
                        onCreateSubtask={handleCreateSubtask}
                    />

                    {/* A project's top-level tasks wait on one another; subtasks are steps inside a task. */}
                    {taskUUID && taskInfo.data?.data.task_project?.project_uuid && !taskInfo.data.data.task_parent_task?.task_uuid && (
                        <TaskDependencies
                            taskUUID={taskUUID}
                            taskName={taskInfo.data.data.task_name}
                            projectUUID={taskInfo.data.data.task_project.project_uuid}
                            canEdit={canEdit}
                            waitingOn={taskInfo.data.data.task_blocked_by ?? []}
                            blocking={taskInfo.data.data.task_blocks ?? []}
                            onOpen={handleChangeTask}
                        />
                    )}

                    <TaskAttachmentsSection
                        isAdmin={canEdit}
                        attachments={taskAttachments}
                        previewFiles={taskInputState?.filesPreview || []}
                        projectUUID={taskInfo.data?.data.task_project.project_uuid || ""}
                        fileInputRef={fileTaskInputRef}
                        onFileSelect={handleTaskFileUpload}
                        onRemoveAttachment={deleteTaskAttachment}
                        onAttachmentClick={handleAttachmentIconClick}
                        onRemovePreview={removeTaskPreviewFile}
                    />

                    {taskUUID && (
                        <LinkedItemsSection sourceType="task" sourceUUID={taskUUID} canEdit={canEdit} />
                    )}

                    {taskInfo.data?.data && (
                        <div className="mb-4">
                            <TaskGitHubSection
                                task={taskInfo.data.data}
                                isAdmin={canEdit}
                                taskUUID={taskUUID}
                                syncStatus={syncStatus.data?.data}
                                githubConnected={githubConnected}
                                onRetrySync={async () => {
                                    try {
                                        await post.makeRequest({
                                            apiEndpoint: PostEndpointUrl.GitHubRetrySync,
                                            appendToUrl: `/${taskUUID}`,
                                            showToast: true,
                                        })
                                        syncStatus.mutate()
                                    } catch {
                                        // Error toast handled by usePost
                                    }
                                }}
                                onRefresh={async () => {
                                    try {
                                        await post.makeRequest({
                                            apiEndpoint: PostEndpointUrl.GitHubRefresh,
                                            appendToUrl: `/${taskUUID}`,
                                            showToast: true,
                                        })
                                        syncStatus.mutate()
                                        mutate(`${GetEndpointUrl.GetTaskInfo}/${taskUUID}`)
                                    } catch {
                                        // Error toast handled by usePost
                                    }
                                }}
                                onBackfill={async () => {
                                    try {
                                        await post.makeRequest({
                                            apiEndpoint: PostEndpointUrl.GitHubRefresh,
                                            appendToUrl: `/${taskUUID}?backfill=true`,
                                            showToast: true,
                                        })
                                        syncStatus.mutate()
                                        mutate(`${GetEndpointUrl.GetTaskInfo}/${taskUUID}`)
                                    } catch {
                                        // Error toast handled by usePost
                                    }
                                }}
                                onUnlink={async () => {
                                    try {
                                        await post.makeRequest({
                                            apiEndpoint: PostEndpointUrl.GitHubUnlinkTask,
                                            appendToUrl: `/${taskUUID}`,
                                            showToast: true,
                                        })
                                        mutate(`${GetEndpointUrl.GetTaskInfo}/${taskUUID}`)
                                    } catch {
                                        // Error toast handled by usePost
                                    }
                                }}
                                onCreatePR={async () => {
                                    try {
                                        const res = await post.makeRequest<{ title: string; body: string }, { pr_number: number }>({
                                            apiEndpoint: PostEndpointUrl.GitHubCreatePR,
                                            appendToUrl: `/${taskUUID}`,
                                            payload: {
                                                title: taskInfo.data?.data.task_name || "",
                                                body: `Related task: ${window.location.origin}/app/task/${taskUUID}`,
                                            },
                                            showErrorToast: true,
                                        })
                                        toast({ title: "PR Created", description: `Draft PR #${res?.pr_number} created.` })
                                        mutate(`${GetEndpointUrl.GetTaskInfo}/${taskUUID}`)
                                    } catch {
                                        // Error toast handled by usePost
                                    }
                                }}
                                onLinkGitHub={() => dispatch(openUI({ key: 'githubLinkTask', data: { taskId: taskUUID } }))}
                            />
                        </div>
                    )}

                    {/* One stream: comments and history in time order, filtered (W32). */}
                    <section className="mt-8" data-task-stream="">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className={panelSection}>Activity</h3>
                            <SegmentedControl
                                aria-label="Show"
                                value={streamFilter}
                                onValueChange={setStreamFilter}
                                options={streamOptions}
                                className="p-0.5"
                                itemClassName="h-6 px-2 text-xs md:h-6"
                            />
                        </div>
                        {taskInfo.isError ? (
                            // Not "no comments yet" on a failed fetch: that invites a
                            // comment onto a thread that may already have one.
                            <ErrorState subject="the activity" onRetry={() => void taskInfo.mutate()} className="py-8" />
                        ) : streamFilter === "github" ? (
                            <GitHubActivityTab taskUUID={taskUUID} />
                        ) : streamFilter === "history" ? (
                            <TaskActivitySection taskActivity={history.activities} earlier={history} />
                        ) : streamFilter === "comments" ? (
                            taskCommentState.length ? renderComments(0, taskCommentState.length) : (
                                <p className="py-6 text-center text-ui-sm text-ink-3">No comments yet. Ask a question or share where it stands.</p>
                            )
                        ) : (
                            <TaskStream
                                activities={history.activities}
                                earlier={history}
                                comments={taskCommentState}
                                renderComments={renderComments}
                            />
                        )}
                    </section>
                    </>) : (
                        // Where the description and the rest go, for the frame before they do.
                        <div aria-hidden className="h-[11.5rem]" />
                    )}
                </div>
            </div>

            {/* An AI teammate working on THIS task, with the control to stop it.
                Sits directly above the composer — the same place a person types a
                correction — and renders nothing when no agent is working. */}
            {settled && (
            <div className="px-4 pb-2 sm:px-6">
                <AgentWorkStrip entityId={taskUUID} revalidateKey={taskCommentState.length} />
            </div>
            )}

            {!canComment ? <TaskCommentNote frame={onPage ? PAGE_COLUMNS : undefined} /> : settled ? <TaskCommentBox
                taskUUID={taskUUID}
                frame={onPage ? PAGE_COLUMNS : undefined}
                projectUUID={taskInfo.data?.data.task_project.project_uuid || ""}
                onAttachmentClick={openCommentFiles}
                onActionFiles={async (files) => {
                    if (!files?.length || !taskInfo.data?.data.task_project.project_uuid) return;
                    const dt = new DataTransfer();
                    files.forEach(f => dt.items.add(f));
                    await uploadFile.makeRequestToUploadToTaskComment(dt.files, taskInfo.data.data.task_project.project_uuid, taskUUID);
                }}
            /> : <div aria-hidden className="h-[7.5rem] flex-shrink-0 border-t" />}
        </div>
    )
}
