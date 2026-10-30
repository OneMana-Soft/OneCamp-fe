import React from "react";
import axios, {AxiosResponse} from "axios";
import type { UnknownAction } from "@reduxjs/toolkit";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { postUpload, type UploadTarget } from "@/lib/upload";
import {useDispatch, useStore} from "react-redux";
import type {RootState} from "@/store/store";
import type { ConversationRef } from "@/lib/conversation/types";
import {
    addProjectAttachmentPreviewFiles, addProjectAttachmentUploadedFiles, deleteProjectAttachmentPreviewFiles, markProjectAttachmentPreviewFailed,
    updateProjectAttachmentPreviewFiles, updateProjectAttachmentPreviewFilesUUID
} from "@/store/slice/projectAttachmentSlice";
import {UploadFileInterfaceRes} from "@/types/file";
import {useToast} from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/utils/apiError";
import {useState} from "react";
import {
    addTaskInfoPreviewFiles,
    addTaskInfoUploadedFiles, deleteTaskInfoPreviewFiles,
    updateTaskInfoPreviewFiles,
    updateTaskInfoPreviewFilesUUID
} from "@/store/slice/taskInfoSlice";

import {
    addTaskCommentPreviewFiles,
    addTaskCommentUploadedFiles, deleteTaskCommentPreviewFiles,
    updateTaskCommentPreviewFiles, updateTaskCommentPreviewFilesUUID
} from "@/store/slice/createTaskCommentSlice";
import {
    addChatCommentPreviewFiles,
    addChatCommentUploadedFiles, deleteChatCommentPreviewFiles,
    updateChatCommentPreviewFiles, updateChatCommentPreviewFilesUUID
} from "@/store/slice/chatCommentSlice";
import {
    addChannelPreviewFiles, addChannelUploadedFiles,
    deleteChannelPreviewFiles,
    updateChannelPreviewFiles, updateChannelPreviewFilesUUID
} from "@/store/slice/channelSlice";
import {getAttachmentType} from "@/lib/utils/file/getAttachmentType";
import {
    addChatPreviewFiles,
    addChatUploadedFiles, deleteChatPreviewFiles,
    updateChatPreviewFiles,
    updateChatPreviewFilesUUID
} from "@/store/slice/chatSlice";
import {
    addChannelCommentMsgPreviewFiles,
    addChannelCommentMsgUploadedFiles, deleteChannelCommentMsgPreviewFiles,
    updateChannelCommentMsgPreviewFiles, updateChannelCommentMsgPreviewFilesUUID
} from "@/store/slice/channelCommentSlice";
import {getMediaDimensions} from "@/lib/utils/file/getMediaDimensions";
import {useClientConfig} from "@/hooks/useClientConfig";
import {exceedsUploadLimit, uploadLimitMessage} from "@/lib/utils/uploadLimit";
import {
    addCreateTaskDialogPreviewFiles,
    addCreateTaskDialogUploadedFiles, deleteCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFilesUUID
} from "@/store/slice/createTaskDailogSlice";
import {
    addGroupChatPreviewFiles, addGroupChatUploadedFiles, deleteGroupChatPreviewFiles,
    groupNotYetOnServer,
    updateGroupChatPreviewFiles,
    updateGroupChatPreviewFilesUUID
} from "@/store/slice/groupChatSlice";

/** An action creator of a slice's, whatever its payload: each kind below names five. */
type Act = (payload: never) => UnknownAction

/**
 * One kind of upload whose files show as cards while they go up (a message's,
 * a comment's, a task's, a project's), called with the ids in `A`: where a
 * file goes (lib/upload's target), the key its slice keeps the cards under,
 * and the slice's actions for a card (made, its progress, its file's id, the
 * file kept for what is sent, taken away). Eleven copies of one loop did
 * this, each naming its slice by hand.
 */
interface UploadKind<A extends unknown[]> {
    to: (state: RootState, ...args: A) => UploadTarget
    under: (...args: A) => Record<string, string>
    add: Act; progress: Act; uuid: Act; uploaded: Act; remove: Act
    /** A failed file keeps its card, which says so and offers Retry (content.md F04); otherwise the card goes. */
    failed?: Act
    /** What the slice calls a new card. */
    card: "fileUploaded" | "filesUploaded"
    /** The card holds the file itself, for Retry. */
    keepsFile?: boolean
}

const kind = <A extends unknown[]>(k: UploadKind<A>) => k

const toProject = (projectId: string): UploadTarget => ({ src_key: "project", src_value: projectId })

const UPLOADS = {
    createTask: kind<[projectId: string]>({
        to: (_, projectId) => toProject(projectId),
        under: (projectId) => ({ projectUUID: projectId }),
        add: addCreateTaskDialogPreviewFiles, progress: updateCreateTaskDialogPreviewFiles, uuid: updateCreateTaskDialogPreviewFilesUUID,
        uploaded: addCreateTaskDialogUploadedFiles, remove: deleteCreateTaskDialogPreviewFiles, card: "fileUploaded",
    }),
    project: kind<[projectId: string]>({
        to: (_, projectId) => toProject(projectId),
        under: (projectId) => ({ projectUUID: projectId }),
        add: addProjectAttachmentPreviewFiles, progress: updateProjectAttachmentPreviewFiles, uuid: updateProjectAttachmentPreviewFilesUUID,
        uploaded: addProjectAttachmentUploadedFiles, remove: deleteProjectAttachmentPreviewFiles, failed: markProjectAttachmentPreviewFailed,
        card: "fileUploaded", keepsFile: true,
    }),
    task: kind<[taskId: string, projectId: string]>({
        to: (_, _taskId, projectId) => toProject(projectId),
        under: (taskId) => ({ taskUUID: taskId }),
        add: addTaskInfoPreviewFiles, progress: updateTaskInfoPreviewFiles, uuid: updateTaskInfoPreviewFilesUUID,
        uploaded: addTaskInfoUploadedFiles, remove: deleteTaskInfoPreviewFiles, card: "fileUploaded",
    }),
    taskComment: kind<[projectId: string, taskId: string]>({
        to: (_, projectId) => toProject(projectId),
        under: (_projectId, taskId) => ({ taskUUID: taskId }),
        add: addTaskCommentPreviewFiles, progress: updateTaskCommentPreviewFiles, uuid: updateTaskCommentPreviewFilesUUID,
        uploaded: addTaskCommentUploadedFiles, remove: deleteTaskCommentPreviewFiles, card: "fileUploaded",
    }),
    channel: kind<[channelId: string]>({
        to: (_, channelId) => ({ src_key: "channel", src_value: channelId }),
        under: (channelId) => ({ channelId }),
        add: addChannelPreviewFiles, progress: updateChannelPreviewFiles, uuid: updateChannelPreviewFilesUUID,
        uploaded: addChannelUploadedFiles, remove: deleteChannelPreviewFiles, card: "filesUploaded",
    }),
    channelComment: kind<[channelId: string, threadId: string]>({
        to: (_, channelId) => ({ src_key: "channel", src_value: channelId }),
        under: (_channelId, threadId) => ({ threadId }),
        add: addChannelCommentMsgPreviewFiles, progress: updateChannelCommentMsgPreviewFiles, uuid: updateChannelCommentMsgPreviewFilesUUID,
        uploaded: addChannelCommentMsgUploadedFiles, remove: deleteChannelCommentMsgPreviewFiles, card: "filesUploaded",
    }),
    // A file goes only to a group the server can tell the uploader is in. A group made here whose first
    // message hasn't gone yet isn't on the server, so the upload names its people (groupNotYetOnServer).
    groupChat: kind<[grpId: string]>({
        to: (state, grpId) => {
            const people = groupNotYetOnServer(state.groupChat, grpId)?.participants.map((p) => p.user_uuid)
            return { src_key: "grpChat", src_value: grpId, ...(people?.length ? { participants: people } : {}) }
        },
        under: (grpId) => ({ grpId }),
        add: addGroupChatPreviewFiles, progress: updateGroupChatPreviewFiles, uuid: updateGroupChatPreviewFilesUUID,
        uploaded: addGroupChatUploadedFiles, remove: deleteGroupChatPreviewFiles, card: "filesUploaded",
    }),
    groupChatComment: kind<[grpId: string, threadId: string]>({
        to: (_, grpId) => ({ src_key: "grpChat", src_value: grpId }),
        under: (_grpId, threadId) => ({ threadId }),
        add: addChatCommentPreviewFiles, progress: updateChatCommentPreviewFiles, uuid: updateChatCommentPreviewFilesUUID,
        uploaded: addChatCommentUploadedFiles, remove: deleteChatCommentPreviewFiles, card: "fileUploaded",
    }),
    chat: kind<[chatUUID: string, grpId: string]>({
        to: (_, _chatUUID, grpId) => ({ src_key: "chat", src_value: grpId }),
        under: (chatUUID) => ({ chatUUID }),
        add: addChatPreviewFiles, progress: updateChatPreviewFiles, uuid: updateChatPreviewFilesUUID,
        uploaded: addChatUploadedFiles, remove: deleteChatPreviewFiles, card: "filesUploaded",
    }),
    chatComment: kind<[chatMessageUUID: string, grpId: string]>({
        to: (_, _chatMessageUUID, grpId) => ({ src_key: "chat", src_value: grpId }),
        under: (chatMessageUUID) => ({ threadId: chatMessageUUID }),
        add: addChatCommentPreviewFiles, progress: updateChatCommentPreviewFiles, uuid: updateChatCommentPreviewFilesUUID,
        uploaded: addChatCommentUploadedFiles, remove: deleteChatCommentPreviewFiles, card: "fileUploaded",
    }),
}

type Uploads = typeof UPLOADS
/** What an upload of `K` is called with, after its files. */
type UploadArgs<K extends keyof Uploads> = Uploads[K] extends UploadKind<infer A> ? A : never

export const useUploadFile = () => {

    const dispatch = useDispatch();
    const store = useStore<RootState>();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const clientConfig = useClientConfig();

    // validateFiles enforces the workspace upload limit on the client BEFORE
    // any bytes leave the browser. Oversized files are rejected with a precise,
    // friendly toast ("X.X MB exceeds the 10 MB limit") and excluded from the
    // upload set. Returns the files that are within the limit. The server still
    // enforces the same cap (defence in depth) and returns a 413 the upload
    // callers also surface, but this gives instant feedback with no wasted
    // request or progress bar.
    const validateFiles = React.useCallback(
        (files: FileList | File[]): File[] => {
            const within: File[] = []
            const tooBig: File[] = []
            const arr = Array.from(files as ArrayLike<File>)
            for (const f of arr) {
                // Shared rule (lib/utils/uploadLimit): the board canvas and the doc
                // editor ask the same question, so all three refuse the same things.
                if (exceedsUploadLimit(f.size, clientConfig.upload_limit_bytes)) tooBig.push(f)
                else within.push(f)
            }
            if (tooBig.length > 0) {
                toast({
                    title: tooBig.length === 1 ? "File too large" : "Some files too large",
                    description: tooBig
                        .map((f) => uploadLimitMessage(f.size, clientConfig.upload_limit_mb, f.name))
                        .join(" "),
                    variant: "destructive",
                })
            }
            return within
        },
        [clientConfig.upload_limit_bytes, clientConfig.upload_limit_mb, toast],
    )

    /**
     * Sends each file where an upload of `kind` goes, with a card for it in
     * that kind's slice: its progress, then its id and the file kept for what
     * is sent. A file that fails is named in a toast, with why in the server's
     * words, and its card goes (or stays, saying so, where the kind keeps it).
     * A cancelled file just goes: it raised "Couldn't upload" as well,
     * everywhere but a project's files.
     */
    const upload = React.useCallback(async <K extends keyof Uploads>(kind: K, files: FileList | File[], ...args: UploadArgs<K>) => {
        const k = UPLOADS[kind] as unknown as UploadKind<UploadArgs<K>>
        const under = k.under(...args)
        // Every slice's action takes the same payload, under the kind's own key.
        const put = (act: Act, payload: object) => dispatch(act({ ...payload, ...under } as never))
        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            put(k.add, {
                [k.card]: {
                    key: uniqueNum,
                    fileName: file.name,
                    progress: 0,
                    cancelSource: cancelToken,
                    attachmentType,
                    ...(k.keepsFile ? { file, size: file.size } : {}),
                },
            });

            setIsSubmitting(true)

            const uploadPromise = postUpload(file, k.to(store.getState(), ...args), {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );
                    put(k.progress, { progress, key: uniqueNum });
                },
            })
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    put(k.uuid, { key: uniqueNum, uuid: uploadMediaRes.object_uuid })

                    put(k.uploaded, {
                        filesUploaded: {
                            attachment_file_name: file.name,
                            attachment_obj_key: uniqueNum,
                            attachment_uuid: uploadMediaRes.object_uuid,
                            attachment_size: file.size,
                            attachment_created_at: currentDate,
                            attachment_type: attachmentType,
                            attachment_duration: mediaInfo.duration,
                            attachment_height: mediaInfo.height,
                            attachment_width: mediaInfo.width,
                            attachment_raw_type: file.type
                        },
                    });
                    return res;
                })
                .catch((error) => {
                    const cancelled = axios.isCancel(error)
                    put(k.failed && !cancelled ? k.failed : k.remove, { key: uniqueNum })
                    if (!cancelled) {
                        toast({
                            title: `Couldn't upload ${file.name}`,
                            description: apiErrorMessage(error, "Try again in a moment."),
                            variant: 'destructive'
                        });
                    }
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } finally {
            setIsSubmitting(false)
        }
    }, [dispatch, store, toast])

    const makeRequestToUploadToPublic = React.useCallback(async (files: FileList): Promise<UploadFileInterfaceRes[]> => {
        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            setIsSubmitting(true); // Note: This sets true for every file—consider moving it outside the loop if unintended.

            const uploadPromise = postUpload(file, { src_key: "public" })
                .catch((error) => {
                    toast({
                        title: `Couldn't upload ${file.name}`,
                        description: apiErrorMessage(error, "Try again in a moment."),
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        const results = await Promise.allSettled(uploadPromises);

        const successfulResponses: UploadFileInterfaceRes[] = results
            .filter((result): result is PromiseFulfilledResult<AxiosResponse<UploadFileInterfaceRes>> => result.status === 'fulfilled')
            .map((result) => result.value.data);

        const failedResults = results.filter((result) => result.status === 'rejected');
        if (failedResults.length > 0) {
            console.error("Failed uploads:", failedResults.map((f) => f.reason));
        }

        setIsSubmitting(false); // Moved to after processing (no finally needed now)

        return successfulResponses; // Return array of UploadFileInterfaceRes
    }, [toast]);

    /**
     * One image for a doc, with its progress and a way to abandon it: the
     * editor's image placeholder shows the progress, and Retry runs it again.
     * Throws when it fails, so the placeholder can say so.
     */
    const uploadImageToDoc = React.useCallback(
        async (file: File, docUUID: string, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}) => {
            const res = await postUpload(file, { src_key: "doc", src_value: docUUID }, {
                // The picture or file says it failed, with Try again: no toast as well.
                ...OWN_ERRORS,
                signal: options.signal,
                onUploadProgress: (e) => {
                    if (e.total) options.onProgress?.(e.loaded / e.total)
                },
            })
            return res.data as UploadFileInterfaceRes
        },
        [],
    )


    // Each kind under the name its callers use.
    return React.useMemo(() => ({
        // A conversation's message box: a channel's, a DM's (by the other person, sent to the pair) or a group's.
        makeRequestToUploadToConversation: (files: FileList | File[], c: ConversationRef) =>
            c.kind === "channel" ? upload("channel", files, c.id) : c.kind === "dm" ? upload("chat", files, c.other, c.id) : upload("groupChat", files, c.id),
        uploadImageToDoc,
        makeRequestToUploadToGroupChatComment: (files: FileList, grpId: string, threadId: string) => upload("groupChatComment", files, grpId, threadId),
        makeRequestToUploadToPublic,
        makeRequestToUploadToCreateTask: (files: FileList, projectId: string) => upload("createTask", files, projectId),
        makeRequestToUploadToChannelComment: (files: FileList, channelId: string, threadId: string) => upload("channelComment", files, channelId, threadId),
        makeRequestToUploadToProject: (files: FileList | File[], projectId: string) => upload("project", files, projectId),
        makeRequestToUploadToTask: (files: FileList, taskId: string, projectId: string) => upload("task", files, taskId, projectId),
        makeRequestToUploadToTaskComment: (files: FileList, projectId: string, taskId: string) => upload("taskComment", files, projectId, taskId),
        makeRequestToUploadToChatComment: (files: FileList, chatMessageUUID: string, grpId: string) => upload("chatComment", files, chatMessageUUID, grpId),
        validateFiles,
        uploadLimitMB: clientConfig.upload_limit_mb,
        isSubmitting
    }), [upload, makeRequestToUploadToPublic, uploadImageToDoc, validateFiles, clientConfig.upload_limit_mb, isSubmitting]);
}
