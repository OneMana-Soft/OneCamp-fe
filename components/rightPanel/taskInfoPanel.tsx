"use client"
import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {Separator} from "@/components/ui/separator"
import {Label} from "@/components/ui/label"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {Badge} from "@/components/ui/badge"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import type {Content} from "@tiptap/core"
import {useDispatch, useSelector} from "react-redux"
import type {RootState} from "@/store/store"
import {priorities, type prioritiesInterface, taskStatuses} from "@/types/table"
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch"
import {
    addTaskComments,
    clearTaskCommentInputState, createNewTaskComment,
    createOrUpdateTaskCommentBody,
    createTaskCommentReaction,
    removeTaskComment,
    removeTaskCommentReaction, TaskCommentInputState,
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
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {cn} from "@/lib/utils/helpers/cn"
import { MessageSquare, Trash2, X, Github } from "@/lib/icons";
import { Activity } from "@/lib/icons";
import {TaskGitHubSection} from "@/components/task/taskGitHubSection"
import {TaskAttachmentsSection} from "@/components/task/taskAttachmentsSection"
import {usePost} from "@/hooks/usePost"
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch"

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
import {TaskCommentComposer} from "@/components/task/taskCommentComposer"
import ResizeableTextInput from "@/components/resizeableTextInput/resizeableTextInput"
import {DateField} from "@/components/task/taskDateField"
import {useDebounce} from "@/hooks/useDebounce"
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice"
import {TaskStatusPriorityControl} from "@/components/task/taskStatusPriorityControl"
import {TaskAssigneePicker} from "@/components/task/taskAssigneePicker"
import {CommentsList} from "@/components/rightPanel/commentsList"
import TaskActivitySection from "@/components/task/taskActivitySection"
import GitHubActivityTab from "@/components/task/GitHubActivityTab"
import {ColorIcon} from "@/components/colorIcon/colorIcon"
import type {AttachmentMediaReq} from "@/types/attachment"
import {SubtasksSection} from "@/components/task/subtasksSection"
import {useRouter} from "next/navigation"
import {app_project_path, app_task_path, app_team_path} from "@/types/paths"
import {useMedia} from "@/context/MediaQueryContext"
import {CreateOrUpdateCommentReaction} from "@/types/reaction";
import {CommentInfoInterface, CreateCommentResInterface} from "@/types/comment";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {useTranslation} from "react-i18next";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {EmptyState} from "@/components/ui/empty-state";
import {mutate} from "swr";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";
import {useMqtt} from "@/components/mqtt/mqttProvider";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";

const CONSTANTS = {
    LABEL_PLACEHOLDER: "addLabel",
    STATUS_DONE: "done",
    DEBOUNCE_DELAY: 500,
    THROTTLE_DELAY: 300,
} as const

type UpdateTaskName = { taskUUID: string; taskName: string }

interface TaskInfoPanelProps {
    taskUUID: string
}

export default function TaskInfoPanel({ taskUUID }: TaskInfoPanelProps) {
    const dispatch = useDispatch()
    const post = usePost()
    const uploadFile = useUploadFile()
    const router = useRouter()
    const { isMobile, isDesktop } = useMedia();
    const { optimisticUpdateTask, optimisticDeleteTask, revalidateTaskKeys } = useTaskUpdate();
    const { connectionState: mqttState } = useMqtt();
    const isMqttHealthy = mqttState.isConnected;

    const {t} = useTranslation()
    const { toast } = useToast()

    const badgeSpanRef = useRef<HTMLSpanElement>(null)
    const fileTaskInputRef = useRef<HTMLInputElement>(null)
    // Debounce task-list revalidation to batch rapid changes (e.g. user
    // clicking through multiple fields) into a single expensive SWR sweep.
    const revalidateTaskListsTimeout = useRef<ReturnType<typeof setTimeout>|null>(null)

    const [taskLabel, setTaskLabel] = useState<string>("")
    const [taskName, setTaskName] = useState<UpdateTaskName>({} as UpdateTaskName)
    const [taskDescription, setTaskDescription] = useState<string>("")
    const [selectedStatus, setSelectedStatus] = useState<prioritiesInterface | undefined>(undefined)
    const [selectedPriority, setSelectedPriority] = useState<prioritiesInterface | undefined>(undefined)
    const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
    const [taskIsDeleted, setTaskIsDeleted] = useState<boolean>(false)
    const [startDate, setStartDate] = useState<Date | undefined>(undefined)
    const [taskSubTasks, setTaskSubTasks] = useState<TaskInfoInterface[]>([])
    const [taskAttachments, setTaskAttachments] = useState<AttachmentMediaReq[]>([])

    const taskNameUpdateDebounce = useDebounce(taskName, CONSTANTS.DEBOUNCE_DELAY)
    const taskDescriptionDebounce = useDebounce(taskDescription, CONSTANTS.DEBOUNCE_DELAY)
    const taskLabelDebounce = useDebounce(taskLabel, CONSTANTS.DEBOUNCE_DELAY)

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
    const githubConnection = useFetch<{ connected: boolean }>(GetEndpointUrl.GetGitHubStatus)
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

    const commentState = useSelector(
        (state: RootState) => state.createTaskComment.taskCommentInputState[taskUUID] || ({} as TaskCommentInputState),
    )
    const taskInputState = useSelector(
        (state: RootState) => state.TaskInfo.taskInfoInputState[taskUUID] || ({} as TaskInfoInputState),
    )

    const taskCommentState = useSelector(
        (state: RootState) => state.createTaskComment.taskComments[taskUUID] || ([] as CommentInfoInterface[]),
    )

    const isAdmin = useMemo(
        () => taskInfo.data?.data.task_project.project_is_admin || false,
        [taskInfo.data?.data.task_project.project_is_admin],
    )

    const canMarkComplete = useMemo(
        () => {

            return selectedStatus?.value !== CONSTANTS.STATUS_DONE
        },
        [selectedStatus],
    )

    const projectMembers = useMemo(
        () => taskInfo.data?.data.task_project.project_members || [],
        [taskInfo.data?.data.task_project.project_members],
    )

    const parentTask = useMemo(() => taskInfo.data?.data.task_parent_task, [taskInfo.data?.data.task_parent_task])


    const handleProjectClick = useCallback(
        (projectUUID: string) => {
            router.push(`${app_project_path}/${projectUUID}`)
        },
        [router],
    )

    const handleTeamClick = useCallback(
        (teamUUID: string) => {
            router.push(`${app_team_path}/${teamUUID}`)
        },
        [router],
    )

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
            if (!name?.trim() || !id || !taskInfo.data?.data.task_project.project_uuid) return

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskName,
                    payload: {
                        task_uuid: id,
                        task_name: name.trim(),
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(updateTaskNameInTaskList({taskId: id, value: name.trim()}))
                    optimisticUpdateTask({ task_uuid: id, task_name: name.trim() }, taskInfo.data!.data.task_project.project_uuid)
                    // No list revalidation needed: name changes don't affect
                    // kanban columns or filter visibility.  Optimistic update
                    // is sufficient for all views.
                })
        },
        [post, taskInfo.data?.data.task_project.project_uuid, dispatch, optimisticUpdateTask],
    )

    const updateTaskStatus = useCallback(
        (status: string, id: string) => {
            if (!status || !id || !taskInfo.data?.data.task_project.project_uuid) return

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
                    payload: {
                        task_status: status,
                        task_uuid: id,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(updateTaskStatusInTaskList({taskId: id, value: status}))
                    optimisticUpdateTask({ task_uuid: id, task_status: status }, taskInfo.data!.data.task_project.project_uuid)
                    // Status affects kanban columns — debounce so rapid clicks
                    // (e.g. todo → in_progress → done) batch into one sweep.
                    revalidateTaskListsDebounced(1500)
                })
        },
        [post, taskInfo, dispatch, optimisticUpdateTask, revalidateTaskListsDebounced],
    )

    const updateTaskPriority = useCallback(
        (priority: string) => {
            if (!priority || !taskInfo.data?.data.task_project.project_uuid) return

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskPriority,
                    payload: {
                        task_priority: priority,
                        task_uuid: taskUUID,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(updateTaskPriorityInTaskList({taskId: taskUUID, value: priority}))
                    optimisticUpdateTask({ task_uuid: taskUUID, task_priority: priority }, taskInfo.data!.data.task_project.project_uuid)
                    // No list revalidation: priority doesn't affect columns or filters.
                })
        },
        [post, taskUUID, taskInfo, dispatch, optimisticUpdateTask],
    )

    const updateTaskLabel = useCallback(
        (label: string) => {
            const trimmedLabel = label.trim()

            // Validate: must be admin, have data, not empty, not placeholder, and no spaces
            if (
                !isAdmin ||
                !taskInfo.data?.data ||
                trimmedLabel === CONSTANTS.LABEL_PLACEHOLDER ||
                (/\s/.test(trimmedLabel)) // Check for any whitespace but not for empty string
            ) {
                return
            }

            // Only update if the value has actually changed
            const currentValue = taskInfo.data.data.task_label || ""
            if (trimmedLabel === currentValue) {
                return
            }

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskLabel,
                    payload: {
                        task_label: trimmedLabel,
                        task_uuid: taskUUID,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(updateTaskLabelInTaskList({taskId: taskUUID, value: trimmedLabel}))
                    optimisticUpdateTask({ task_uuid: taskUUID, task_label: trimmedLabel }, taskInfo.data!.data.task_project.project_uuid)
                    // No list revalidation: label doesn't affect columns or filters.
                })
        },
        [isAdmin, post, taskUUID, taskInfo.data, dispatch, optimisticUpdateTask],
    )

    const updateTaskDesc = useCallback(
        (desc: string) => {
            if (
                !taskInfo.data ||
                taskInfo.isLoading
            ) {
                return
            }
            // Normalize empty HTML paragraphs to empty string to prevent false positives
            const normalizeDesc = (s: string | undefined | null): string => {
                if (!s) return ""
                const trimmed = s.trim()
                if (trimmed === "<p></p>" || trimmed === "<p><br></p>") return ""
                return trimmed
            }
            if (normalizeDesc(desc) === normalizeDesc(taskInfo.data.data.task_description)) {
                return
            }

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskDesc,
                    payload: {
                        task_description: desc,
                        task_uuid: taskUUID,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    // should we do something ?
                })
        },
        [post, taskUUID, taskInfo],
    )

    const updateTaskStartDate = useCallback(
        (date: Date | undefined, id: string) => {
            if (!id || !taskInfo.data?.data.task_project.project_uuid) return

            const startDate = date ? date.toISOString() : ""
            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskStartDate,
                    payload: {
                        task_uuid: id,
                        task_start_date: startDate,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(updateTaskStartDateInTaskList({
                        taskId: id,
                        value: startDate
                    }))
                    // No list revalidation: start date doesn't affect columns or filters.
                })
        },
        [post, taskInfo, dispatch],
    )

    const updateTaskDueDate = useCallback(
        (date: Date | undefined, id: string) => {
            if (!id || !taskInfo.data?.data.task_project.project_uuid) return

            const dueDate =  date ? date.toISOString() : ""
            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskDueDate,
                    payload: {
                        task_uuid: id,
                        task_due_date: dueDate,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(updateTaskDueDateInTaskList({
                        taskId: id,
                        value: dueDate
                    }))
                    // No list revalidation: due date doesn't affect columns or filters.
                })
        },
        [post, taskInfo, dispatch],
    )

    const updateTaskAssignee = useCallback(
        (userInfo: UserProfileDataInterface | undefined, id: string) => {
            if (!id || !taskInfo.data?.data.task_project.project_uuid) return

            // Optimistic update
            dispatch(updateTaskAssigneeInTaskList({
                assignee: userInfo,
                taskId: id
            }))
            optimisticUpdateTask({ task_uuid: id, task_assignee: userInfo }, taskInfo.data!.data.task_project.project_uuid)

            taskInfo.mutate((currentData) => {
                if (!currentData) return currentData
                return {
                    ...currentData,
                    data: {
                        ...currentData.data,
                        task_assignee: userInfo
                    }
                }
            }, { revalidate: false })

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskAssignee,
                    payload: {
                        task_assignee_uuid: userInfo?.user_uuid,
                        task_uuid: id,
                        task_project_uuid: taskInfo.data.data.task_project.project_uuid,
                    },
                })
                .then(() => {
                    // Success already handled optimistically.
                    // Assignee affects "my tasks" views — debounce so rapid
                    // re-assignments batch into one sweep.
                    revalidateTaskListsDebounced(2000)
                })
                .catch(() => {
                    // Revert: re-fetch task info to restore previous assignee.
                    taskInfo.mutate()
                })
        },
        [post, taskInfo, dispatch, optimisticUpdateTask, revalidateTaskListsDebounced],
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
            if (!isAdmin || !taskInfo.data?.data.task_project.project_uuid) return

            const files = e.target.files
            if (!files?.length) return

            uploadFile.makeRequestToUploadToTask(files, taskUUID, taskInfo.data.data.task_project.project_uuid).then(() => {
                if (fileTaskInputRef.current) {
                    fileTaskInputRef.current.value = ""
                }
            })
        },
        [isAdmin, uploadFile, taskUUID, taskInfo.data?.data.task_project.project_uuid],
    )

    const createComment = useCallback((latestContent?: string) => {
        const rawBody = latestContent ?? commentState?.commentBody
        const trimmedBody = removeEmptyPTags(rawBody)
        const hasAttachments = (commentState?.filesUploaded?.length || 0) > 0
        if ((!trimmedBody && !hasAttachments) || post.isSubmitting) return

        post.makeRequest<CreateTaskCommentInterface, CreateCommentResInterface>({
                apiEndpoint: PostEndpointUrl.CreateTaskComment,
                payload: {
                    task_comment_body: trimmedBody,
                    task_uuid: taskUUID,
                    task_comment_attachments: commentState?.filesUploaded || [],
                },
            })
            .then((res) => {
                if(res && selfProfile.data?.data) {
                    dispatch(createNewTaskComment({
                        commentBy: selfProfile.data?.data,
                        taskId: taskUUID,
                        commentText: trimmedBody,
                        attachments: commentState?.filesUploaded || [],
                        commentId: res?.comment_id,
                        commentCreatedAt: res?.comment_created_at
                    }))
                }

                dispatch(clearTaskCommentInputState({ taskUUID }))
            })
    }, [commentState, taskUUID, post, dispatch, selfProfile.data?.data])

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
        setSelectedStatus(taskStatuses.find((s) => s.value === data.task_status))
        setSelectedPriority(priorities.find((p) => p.value === data.task_priority))
        setTaskSubTasks(data.task_sub_tasks||[])
        setTaskLabel(data.task_label || "")
        setTaskDescription(data.task_description || "")
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

    useEffect(() => {
        updateTaskDesc(taskDescriptionDebounce)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskDescriptionDebounce])

    useEffect(() => {
        updateTaskLabel(taskLabelDebounce)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskLabelDebounce])

    useEffect(() => {
        if (taskNameUpdateDebounce.taskName?.trim() && taskNameUpdateDebounce.taskUUID) {
            updateTaskName(taskNameUpdateDebounce.taskName, taskNameUpdateDebounce.taskUUID)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskNameUpdateDebounce])

    const handleStatusSelect = useCallback(
        (value: string) => {
            const status = taskStatuses.find((s) => s.value === value)
            setSelectedStatus(status)
            updateTaskStatus(value, taskUUID)
        },
        [taskUUID, updateTaskStatus],
    )

    const handlePrioritySelect = useCallback(
        (value: string) => {
            const priority = priorities.find((p) => p.value === value)
            setSelectedPriority(priority)
            updateTaskPriority(value)
        },
        [updateTaskPriority],
    )

    const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove all spaces to enforce single-word labels (like tags)
        const sanitizedValue = e.target.value.replace(/\s+/g, "")
        setTaskLabel(sanitizedValue)
    }, [])

    const handleDescriptionChange = useCallback(
        (content: Content) => {
            if (!isAdmin) return
            setTaskDescription(content?.toString() || "")
        },
        [isAdmin],
    )

    const handleCommentBodyChange = useCallback(
        (content: Content) => {
            dispatch(
                createOrUpdateTaskCommentBody({
                    body: content?.toString() || "",
                    taskUUID,
                }),
            )
        },
        [dispatch, taskUUID],
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
                    title: "Deleting chat",
                    description: "Are you sure you want to proceed deleting the chat",
                    confirmText: "Delete post",
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

    const handleDeleteTask = useCallback(
        () => {
            post.makeRequest<CreateTaskInterface>({
                apiEndpoint:PostEndpointUrl.ArchiveTask,
                payload: {
                    task_uuid: taskUUID,
                }
            }).then(() => {
                setTaskIsDeleted(true)
                optimisticDeleteTask(taskUUID, taskInfo.data?.data.task_project.project_uuid || "")
                // Delete affects list visibility — debounce in case user
                // deletes multiple tasks in rapid succession.
                revalidateTaskListsDebounced(500)
            })
        },
        [taskUUID, post, taskInfo.data?.data.task_project.project_uuid, optimisticDeleteTask, revalidateTaskListsDebounced],
    )

    if(taskInfo.isLoading) {
        return <div className="flex h-full items-center text-xs text-muted-foreground">
            <LoadingStateCircle />
        </div>
    }

    return (
        <div className="flex flex-col h-full">
            <div>
                <RightPanelTaskHeader
                    isAdmin={isAdmin}
                    canMarkComplete={canMarkComplete && isAdmin}
                    onMarkComplete={() => handleStatusSelect(CONSTANTS.STATUS_DONE)}
                    onDeleteTask={handleDeleteTask}
                    taskUUID={taskUUID}
                    taskName={taskInfo.data?.data.task_name}
                    hasGitHubLink={!!(taskInfo.data?.data.task_github_issue_url || taskInfo.data?.data.task_github_pr_url || taskInfo.data?.data.task_github_branch)}
                />
                {((isMobile && canMarkComplete) || isDesktop) && <Separator orientation="horizontal" />}
                {taskIsDeleted && (
                    <div className="w-full bg-destructive mb-2 text-sm  px-2 py-2 text-primary-foreground flex justify-between items-center">
                        <div className="flex gap-x-2 items-center">
                            <Trash2 className="h-5 w-5" />
                            <span>This task is deleted</span>
                        </div>
                        <Button variant="ghost" onClick={handleUndeleteTask} className={'hover:text-destructive-foreground'}>
                            Undelete
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pt-4 px-2">


                {parentTask && (
                    <div className="ml-4 pr-4 mb-3 text-sm sm:text-lg break-words">
                        Parent:{" "}
                        <button
                            type="button"
                            className="hover:underline hover:cursor-pointer text-primary break-words"
                            onClick={() => handleChangeTask(parentTask.task_uuid)}
                        >
                            {parentTask.task_name}
                        </button>
                    </div>
                )}

                <div className="px-2 sm:pl-4 sm:pr-4 pb-4">
                    {/*
                      Auto-sizing label chip. The ghost span mirrors the
                      current value (or placeholder) at the same font-size
                      so the parent <span> width matches the typed text;
                      the actual <input> sits absolutely over it. Both
                      use text-sm (not the Input default text-base)
                      otherwise the input text would overflow the
                      ghost-sized container on mobile.
                    */}
                    <label
                        className={cn(
                            "inline-flex items-center h-7 rounded-md text-sm font-medium",
                            "bg-primary text-primary-foreground",
                            "max-w-full overflow-hidden",
                            !isAdmin && "cursor-default",
                        )}
                    >
                        <span className="relative flex items-center max-w-full">
                            <span
                                ref={badgeSpanRef}
                                aria-hidden
                                className="invisible whitespace-pre px-3 py-1 text-sm font-medium pointer-events-none truncate max-w-[60vw] sm:max-w-[280px]"
                            >
                                {taskLabel || t(CONSTANTS.LABEL_PLACEHOLDER)}
                            </span>
                            <input
                                type="text"
                                value={taskLabel}
                                placeholder={t(CONSTANTS.LABEL_PLACEHOLDER)}
                                readOnly={!isAdmin}
                                aria-label="Task label"
                                className={cn(
                                    "absolute inset-0 h-full w-full px-3 py-1",
                                    "text-sm font-medium text-primary-foreground",
                                    "placeholder:font-medium placeholder:text-primary-foreground/80",
                                    "bg-transparent border-0 outline-none ring-0",
                                    "focus:outline-none focus:ring-0",
                                    "cursor-pointer focus:cursor-text",
                                )}
                                onChange={handleLabelChange}
                            />
                        </span>
                    </label>

                    <div className="mt-4 mb-4">
                        <ResizeableTextInput
                            delay={3000}
                            content={taskInfo.data?.data.task_name || ""}
                            textUpdate={(s: string) => setTaskName({ taskName: s, taskUUID })}
                            className="!text-xl sm:!text-2xl font-medium"
                        />
                    </div>

                    <TaskStatusPriorityControl
                        isAdmin={isAdmin}
                        selectedStatus={selectedStatus}
                        selectedPriority={selectedPriority}
                        onSelectStatus={handleStatusSelect}
                        onSelectPriority={handlePrioritySelect}
                    />

                    <TaskAssigneePicker
                        isAdmin={isAdmin}
                        label="Assignee"
                        members={projectMembers}
                        assignee={taskInfo.data?.data.task_assignee}
                        onChange={(uid) => updateTaskAssignee(uid, taskUUID)}
                    />

                    <DateField
                        isAdmin={isAdmin}
                        label="Start Date"
                        value={startDate}
                        onSelect={(d) => {
                            setStartDate(d)
                            updateTaskStartDate(d, taskUUID)
                        }}
                        onClear={() => {
                            setStartDate(undefined)
                            updateTaskStartDate(undefined, taskUUID)
                        }}
                    />
                    <DateField
                        isAdmin={isAdmin}
                        label="Due Date"
                        value={dueDate}
                        onSelect={(d) => {
                            setDueDate(d)
                            updateTaskDueDate(d, taskUUID)
                        }}
                        onClear={() => {
                            setDueDate(undefined)
                            updateTaskDueDate(undefined, taskUUID)
                        }}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-1 sm:gap-0 sm:items-center mb-2">
                        <div className="sm:col-span-1 text-xs capitalize text-muted-foreground sm:text-foreground">
                            <div>Project</div>
                        </div>
                        <div className="sm:col-span-5">
                            <Button
                                variant="ghost"
                                className="md:-ml-4 hover:underline font-normal max-w-full truncate"
                                onClick={() => handleProjectClick(taskInfo.data?.data.task_project.project_uuid || "")}
                            >
                                <ColorIcon size="xs" name={taskInfo.data?.data.task_project.project_uuid || ""} />
                                <span className="truncate">{taskInfo.data?.data.task_project.project_name}</span>
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-1 sm:gap-0 sm:items-center mb-6">
                        <div className="sm:col-span-1 text-xs capitalize text-muted-foreground sm:text-foreground">
                            <div>Team</div>
                        </div>
                        <div className="sm:col-span-5">
                            <Button
                                variant="ghost"
                                className="md:-ml-4 hover:underline font-normal max-w-full truncate"
                                onClick={() => handleTeamClick(taskInfo.data?.data.task_team.team_uuid || "")}
                            >
                                <span className="truncate">{taskInfo.data?.data.task_team.team_name}</span>
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-2 mb-4">
                        <Label>Description</Label>
                        <MinimalTiptapTextInput
                            throttleDelay={CONSTANTS.THROTTLE_DELAY}
                            className={cn("rounded-lg min-h-[18vh] h-auto border p-3 bg-muted/30")}
                            editorContentClassName="overflow-auto h-full"
                            output="html"
                            content={taskInfo.data?.data.task_description || ""}
                            value={taskInfo.data?.data.task_description || ""}
                            placeholder="Add a description..."
                            editable={isAdmin}
                            editorClassName="focus:outline-none px-2 py-2"
                            onChange={handleDescriptionChange}
                        />
                    </div>

                    {taskInfo.data?.data && (
                        <div className="mb-4">
                            <TaskGitHubSection
                                task={taskInfo.data.data}
                                isAdmin={isAdmin}
                                taskUUID={taskUUID}
                                syncStatus={syncStatus.data?.data}
                                githubConnected={!!githubConnection.data?.connected}
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

                    <TaskAttachmentsSection
                        isAdmin={isAdmin}
                        attachments={taskAttachments}
                        previewFiles={taskInputState?.filesPreview || []}
                        projectUUID={taskInfo.data?.data.task_project.project_uuid || ""}
                        fileInputRef={fileTaskInputRef}
                        onFileSelect={handleTaskFileUpload}
                        onRemoveAttachment={deleteTaskAttachment}
                        onAttachmentClick={handleAttachmentIconClick}
                        onRemovePreview={removeTaskPreviewFile}
                    />

                    <SubtasksSection
                        isAdmin={isAdmin}
                        subtasks={taskSubTasks}
                        projectMembers={projectMembers}
                        onToggleStatus={(id, newStatus) => {
                                setTaskSubTasks((prevSubtasks) =>
                                    prevSubtasks.map((subtask) => (subtask.task_uuid === id ? { ...subtask, task_status: newStatus } : subtask)),
                                )
                                updateTaskStatus(newStatus, id)
                            }
                        }
                        onRename={(id, name) => setTaskName({ taskName: name, taskUUID: id })}
                        onUpdateStart={(id, d) => {
                                setTaskSubTasks((prevSubtasks) =>
                                    prevSubtasks.map((subtask) => (subtask.task_uuid === id ? { ...subtask, task_start_date: d?.toISOString() || "" } : subtask)),
                                )
                                updateTaskStartDate(d, id)
                            }
                        }
                        onUpdateDue={(id, d) => {
                                setTaskSubTasks((prevSubtasks) =>
                                    prevSubtasks.map((subtask) => (subtask.task_uuid === id ? { ...subtask, task_due_date: d?.toISOString() || "" } : subtask)),
                                )
                                updateTaskDueDate(d, id)
                            }
                        }
                        onUpdateAssignee={(id, userInfo) => {
                                setTaskSubTasks((prevSubtasks) =>
                                    prevSubtasks.map((subtask) => (subtask.task_uuid === id ? { ...subtask, task_assignee: userInfo } : subtask)),
                                )
                                updateTaskAssignee(userInfo, id)
                            }
                        }
                        onOpen={handleChangeTask}
                        onCreateSubtask={handleCreateSubtask}
                    />

                    <div className="mt-4">
                        <Tabs defaultValue="comments" className="w-full">
                            <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
                                <TabsTrigger value="comments">
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Comments ({taskCommentState.length || 0})
                                </TabsTrigger>
                                <TabsTrigger value="activities">
                                    <Activity className="h-4 w-4 mr-2" />
                                    Activities
                                </TabsTrigger>
                                {(taskInfo.data?.data.task_github_issue_url || taskInfo.data?.data.task_github_pr_url || taskInfo.data?.data.task_github_branch) && (
                                    <TabsTrigger value="github">
                                        <Github className="h-4 w-4 mr-2" />
                                        GitHub
                                    </TabsTrigger>
                                )}
                            </TabsList>
                            <TabsContent value="comments" className="pr-2 pt-2">
                                {taskCommentState?.length ? (
                                    <CommentsList
                                        comments={taskCommentState}
                                        removeReaction={removeCommentReaction}
                                        addOrUpdateReaction={createOrUpdateCommentReaction}
                                        removeComment={handleDeleteTaskComment}
                                        updateComment={handleUpdateTaskComment}
                                        getMediaURL={`${GetEndpointUrl.GetProjectMedia}/${taskInfo.data?.data.task_project.project_uuid}`}
                                    />
                                ) : (
                                    <EmptyState
                                        icon={MessageSquare}
                                        title="No comments yet"
                                        description="Be the first to share an update or ask a question."
                                        className="py-8"
                                    />
                                )}
                            </TabsContent>
                            <TabsContent value="activities" className="p-2 sm:p-4">
                                <TaskActivitySection taskActivity={taskInfo.data?.data.task_activities} />
                            </TabsContent>
                            {(taskInfo.data?.data.task_github_issue_url || taskInfo.data?.data.task_github_pr_url || taskInfo.data?.data.task_github_branch) && (
                                <TabsContent value="github" className="pr-2 pt-2">
                                    <GitHubActivityTab taskUUID={taskUUID} />
                                </TabsContent>
                            )}
                        </Tabs>
                    </div>
                </div>
            </div>

            <TaskCommentComposer
                taskUUID={taskUUID}
                projectUUID={taskInfo.data?.data.task_project.project_uuid || ""}
                commentBody={commentState?.commentBody}
                onChange={handleCommentBodyChange}
                onSend={createComment}
                onAttachmentClick={() => dispatch(openUI({ key: 'taskCommentFileUpload' }))}
                onActionFiles={async (files) => {
                    if (!files?.length || !taskInfo.data?.data.task_project.project_uuid) return;
                    const dt = new DataTransfer();
                    files.forEach(f => dt.items.add(f));
                    await uploadFile.makeRequestToUploadToTaskComment(dt.files, taskInfo.data.data.task_project.project_uuid, taskUUID);
                }}
            />
        </div>
    )
}
