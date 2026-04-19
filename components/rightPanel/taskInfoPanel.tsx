"use client"
import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {Separator} from "@/components/ui/separator"
import {Label} from "@/components/ui/label"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {Badge} from "@/components/ui/badge"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import type {Content} from "@tiptap/core"
import {cn} from "@/lib/utils/helpers/cn"
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
import {Activity, MessageSquare, Plus, SendHorizontal, Trash2, X} from "lucide-react"
import {usePost} from "@/hooks/usePost"
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch"
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
import {TaskCommentFileUpload} from "@/components/fileUpload/taskCommentFileUpload"
import ResizeableTextInput from "@/components/resizeableTextInput/resizeableTextInput"
import {DateField} from "@/components/task/taskDateField"
import {FileTypeIcon} from "@/components/fileIcon/fileTypeIcon"
import {useDebounce} from "@/hooks/useDebounce"
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice"
import {TaskStatusPriorityControl} from "@/components/task/taskStatusPriorityControl"
import {TaskAssigneePicker} from "@/components/task/taskAssigneePicker"
import {CommentsList} from "@/components/rightPanel/commentsList"
import TaskActivitySection from "@/components/task/taskActivitySection"
import {ColorIcon} from "@/components/colorIcon/colorIcon"
import ProjectAttachment from "@/components/project/projectAttachment"
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
import {mutate} from "swr";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";

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

    const {t} = useTranslation()


    const badgeSpanRef = useRef<HTMLSpanElement>(null)
    const fileTaskInputRef = useRef<HTMLInputElement>(null)

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

    const taskInfo = useFetch<TaskInfoRawInterface>(taskUUID ? `${GetEndpointUrl.GetTaskInfo}/${taskUUID}` : "")
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)


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

    const revalidateAllTaskLists = useCallback(() => {
        const projectUUID = taskInfo.data?.data.task_project.project_uuid
        if (!projectUUID) return
        revalidateTaskKeys(projectUUID);
    }, [taskInfo.data?.data.task_project.project_uuid, revalidateTaskKeys])



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
                    revalidateAllTaskLists()
                })
        },
        [post, taskInfo.data?.data.task_project.project_uuid],
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
                    revalidateAllTaskLists()
                })
        },
        [post, taskInfo],
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
                    revalidateAllTaskLists()
                })
        },
        [post, taskUUID, taskInfo],
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
                    // Success handled by centralized error handling
                    dispatch(updateTaskLabelInTaskList({taskId: taskUUID, value: trimmedLabel}))
                    optimisticUpdateTask({ task_uuid: taskUUID, task_label: trimmedLabel }, taskInfo.data!.data.task_project.project_uuid)
                    revalidateAllTaskLists()
                })
        },
        [isAdmin, post, taskUUID, taskInfo.data],
    )

    const updateTaskDesc = useCallback(
        (desc: string) => {
            if (
                !taskInfo.data ||
                desc === taskInfo.data.data.task_description ||
                taskInfo.isLoading ||
                (desc === "" && !taskInfo.data.data.task_description)
            ) {
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
                    revalidateAllTaskLists()
                })
        },
        [post, taskInfo],
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
                    revalidateAllTaskLists()
                })
        },
        [post, taskInfo],
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
                    // Success already handled optimistically
                    taskInfo.mutate()
                    revalidateAllTaskLists()
                })
                .catch(() => {
                    // Revert on failure (optional, but good practice - for now we just rely on revalidation or next fetch)
                    // If strict rollback is needed we would need previous state here.
                    taskInfo.mutate()
                    revalidateAllTaskLists()
                })
        },
        [post, taskInfo, dispatch, optimisticUpdateTask, revalidateAllTaskLists],
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
                revalidateAllTaskLists()
            })
    }, [post, taskUUID, taskInfo])

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

    const createComment = useCallback(() => {
        const commentBody = commentState?.commentBody
        if (!commentBody?.trim() || post.isSubmitting) return

        post.makeRequest<CreateTaskCommentInterface, CreateCommentResInterface>({
                apiEndpoint: PostEndpointUrl.CreateTaskComment,
                payload: {
                    task_comment_body: commentBody,
                    task_uuid: taskUUID,
                    task_comment_attachments: commentState?.filesUploaded || [],
                },
            })
            .then((res) => {
                if(res && selfProfile.data?.data) {
                    dispatch(createNewTaskComment({
                        commentBy: selfProfile.data?.data,
                        taskId: taskUUID,
                        commentText: commentBody,
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

        if(taskCommentState.length == 0){
            dispatch(addTaskComments({taskId: taskUUID, comments: taskInfo.data?.data.task_comments || []}))
        }

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


        post.makeRequest<CreateTaskCommentInterface>({
            apiEndpoint: PostEndpointUrl.UpdateTaskComment,
            payload: {
                task_uuid: taskUUID,
                task_comment_uuid: commentUUID,
                task_comment_body: commentHTMLText,
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateTaskComment({
                        commentIndex: commentIndex,
                        taskId: taskUUID,
                        htmlText: commentHTMLText,
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
                revalidateAllTaskLists()
            })
        },
        [taskUUID],
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

            <div className="flex-1 overflow-y-auto min-h-0 pt-4 pl-2">


                {parentTask && (
                    <div className="ml-4 pr-4 mb-3 text-lg">
                        Parent:{" "}
                        <button
                            type="button"
                            className="hover:underline hover:cursor-pointer text-primary"
                            onClick={() => handleChangeTask(parentTask.task_uuid)}
                        >
                            {parentTask.task_name}
                        </button>
                    </div>
                )}

                <div className="pl-4 pr-4 pb-4">
                    <Badge
                        variant="default"
                        className="text-sm w-fit border-0! p-0 h-7 flex items-center relative overflow-hidden group"
                    >
                        <div className="relative h-full w-full flex items-center">
                            <span ref={badgeSpanRef} className="invisible whitespace-pre px-3 py-1 text-sm font-semibold pointer-events-none">
                              {taskLabel || t(CONSTANTS.LABEL_PLACEHOLDER)}
                            </span>
                            <Input
                                type="text"
                                value={taskLabel}
                                placeholder={t(CONSTANTS.LABEL_PLACEHOLDER)}
                                readOnly={!isAdmin}
                                className="absolute inset-0 h-full w-full border-0! p-0 px-3 py-1 shadow-none !ring-0 focus:border-0 focus:outline-none focus-visible:ring-0 text-left bg-transparent font-semibold text-primary-foreground placeholder:font-semibold placeholder:text-primary-foreground/80 cursor-pointer focus:cursor-text"
                                onChange={handleLabelChange}
                            />
                        </div>
                    </Badge>

                    <div className="mt-4 mb-4">
                        <ResizeableTextInput
                            delay={3000}
                            content={taskInfo.data?.data.task_name || ""}
                            textUpdate={(s: string) => setTaskName({ taskName: s, taskUUID })}
                            className="!text-3xl -ml-1"
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

                    <div className="grid grid-cols-6 items-center mb-2">
                        <div className="col-span-1 text-xs capitalize">
                            <div>Project</div>
                        </div>
                        <div className="col-span-5">
                            <Button
                                variant="ghost"
                                className="md:-ml-4 hover:underline font-normal"
                                onClick={() => handleProjectClick(taskInfo.data?.data.task_project.project_uuid || "")}
                            >
                                <ColorIcon size="xs" name={taskInfo.data?.data.task_project.project_uuid || ""} />
                                {taskInfo.data?.data.task_project.project_name}
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-6 items-center mb-6">
                        <div className="col-span-1 text-xs capitalize">
                            <div>Team</div>
                        </div>
                        <div className="col-span-5">
                            <Button
                                variant="ghost"
                                className="md:-ml-4 hover:underline font-normal"
                                onClick={() => handleTeamClick(taskInfo.data?.data.task_team.team_uuid || "")}
                            >
                                {taskInfo.data?.data.task_team.team_name}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-2 mb-4">
                        <Label>Description</Label>
                        <MinimalTiptapTextInput
                            throttleDelay={CONSTANTS.THROTTLE_DELAY}
                            className={cn("rounded-xl min-h-[18vh] h-auto border p-2 bg-secondary/20")}
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

                    <div className="mb-2">
                        <Label className="inline">Attachments</Label>
                    </div>

                    <div className="flex flex-wrap mb-4 gap-2">
                        {isAdmin && (
                            <div className="flex justify-between items-center">
                                <Label htmlFor="project-file-task-upload" className="cursor-pointer">
                                    <div className="p-2 h-14 w-14 border-dashed bg-background rounded-2xl border-2 text-muted-foreground flex justify-center items-center hover:border-primary hover:text-primary transition-colors">
                                        <Plus size={30} />
                                    </div>
                                </Label>
                                <Input
                                    type="file"
                                    id="project-file-task-upload"
                                    multiple
                                    ref={fileTaskInputRef}
                                    onChange={handleTaskFileUpload}
                                    className="hidden"
                                    key={taskInputState?.filesPreview?.length || 0}
                                />
                            </div>
                        )}
                        {taskAttachments?.map((file) => (
                            <ProjectAttachment
                                key={file.attachment_uuid}
                                attachmentInfo={file}
                                isAdmin={isAdmin}
                                handleRemoveAttachment={deleteTaskAttachment}
                                handleAttachmentIconCLick={() => handleAttachmentIconClick(file)}
                                projectUUID={taskInfo.data?.data.task_project.project_uuid || ""}
                            />
                        ))}
                        {taskInputState?.filesPreview?.map((file) => (
                            <div
                                key={file.key}
                                className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-xl border-border"
                            >
                                <button
                                    type="button"
                                    className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-border border hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                    onClick={() => removeTaskPreviewFile(file.key)}
                                    aria-label="Remove file"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                                <div>
                                    <FileTypeIcon name={file.fileName} fileType={file.attachmentType} />
                                </div>
                                <div className="flex-col">
                                    <div className="text-ellipsis truncate max-w-40 text-xs">{file.fileName}</div>
                                    <div className="text-ellipsis truncate max-w-40 text-xs text-muted-foreground">
                                        Uploading: {file.progress}%
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

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
                            <TabsList>
                                <TabsTrigger value="comments">
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Comments ({taskCommentState.length || 0})
                                </TabsTrigger>
                                <TabsTrigger value="activities">
                                    <Activity className="h-4 w-4 mr-2" />
                                    Activities
                                </TabsTrigger>
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
                                    <div className="text-xs text-muted-foreground">No comments yet</div>
                                )}
                            </TabsContent>
                            <TabsContent value="activities" className="p-4">
                                <TaskActivitySection taskActivity={taskInfo.data?.data.task_activities} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 border-t p-4">
                <MinimalTiptapTextInput
                    throttleDelay={CONSTANTS.THROTTLE_DELAY}
                    attachmentOnclick={() => dispatch(openUI({ key: 'taskCommentFileUpload' }))}
                    onActionFiles={async (files) => {
                        if (!files?.length || !taskInfo.data?.data.task_project.project_uuid) return;
                        await uploadFile.makeRequestToUploadToTaskComment(files as unknown as FileList, taskInfo.data.data.task_project.project_uuid, taskUUID);
                    }}
                    ButtonIcon={SendHorizontal}
                    buttonOnclick={createComment}
                    className={cn("max-w-full rounded-xl h-auto border p-2 bg-secondary/20")}
                    editorContentClassName="overflow-auto"
                    output="html"
                    placeholder="Add a message, if you'd like..."
                    editable={true}
                    toggleToolbar={true}
                    editorClassName="focus:outline-none px-2 py-2"
                    onChange={handleCommentBodyChange}
                    content={commentState?.commentBody}
                >
                    <TaskCommentFileUpload
                        taskUUID={taskUUID}
                        projectUUID={taskInfo.data?.data.task_project.project_uuid || ""}
                    />
                </MinimalTiptapTextInput>
            </div>
        </div>
    )
}
