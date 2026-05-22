"use client";


import { useEffect, useRef } from "react"
import { useMedia } from "@/context/MediaQueryContext"
import { useDispatch } from "react-redux"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { useParams, useRouter } from "next/navigation"
import TaskInfoPanel from "@/components/rightPanel/taskInfoPanel"
import { app_my_task_path } from "@/types/paths"

/**
 * /app/task/[task-id]
 *
 * Mobile renders the TaskInfoPanel as a full-page surface.
 * Desktop has no standalone task page — task details live in the right
 * panel on top of the My Tasks list. If a desktop user lands here
 * directly (deep link, refresh) we open the right panel for the task
 * and replace the URL with /app/myTask so Back doesn't bounce through
 * an empty stub.
 *
 * `handledRef` guards against StrictMode double-invocation re-firing
 * the redirect.
 */
export default function Page() {
    const { isMobile, isDesktop } = useMedia()

    const dispatch = useDispatch()
    const params = useParams()
    const taskId = params?.["task-id"] as string
    const router = useRouter()
    const handledRef = useRef(false)

    useEffect(() => {
        if (isDesktop && !handledRef.current && taskId) {
            handledRef.current = true
            dispatch(
                openRightPanel({
                    taskUUID: taskId,
                    chatMessageUUID: "",
                    chatUUID: "",
                    channelUUID: "",
                    postUUID: "",
                    groupUUID: "",
                    docUUID: ""
                }),
            )
            router.replace(app_my_task_path)
        }
    }, [isDesktop, taskId, dispatch, router])

    return <>{isMobile && <TaskInfoPanel taskUUID={taskId} />}</>
}
