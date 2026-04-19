import React from "react";
import axios, {AxiosRequestConfig, AxiosResponse} from "axios";
import axiosInstance from "@/lib/axiosInstance";
import {useDispatch} from "react-redux";
import {
    addProjectAttachmentPreviewFiles, addProjectAttachmentUploadedFiles, deleteProjectAttachmentPreviewFiles,
    updateProjectAttachmentPreviewFiles, updateProjectAttachmentPreviewFilesUUID
} from "@/store/slice/projectAttachmentSlice";
import {UploadFileInterfaceRes} from "@/types/file";
import {useToast} from "@/hooks/use-toast";
import {useState} from "react";
import { PostFileUploadURL} from "@/services/endPoints";
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
    addFwdMsgPreviewFiles, addFwdMsgUploadedFiles, deleteFwdMsgPreviewFiles,
    updateFwdMsgPreviewFiles,
    updateFwdMsgPreviewFilesUUID
} from "@/store/slice/fwdMessageSlice";
import {
    addChannelCommentMsgPreviewFiles,
    addChannelCommentMsgUploadedFiles, deleteChannelCommentMsgPreviewFiles,
    updateChannelCommentMsgPreviewFiles, updateChannelCommentMsgPreviewFilesUUID
} from "@/store/slice/channelCommentSlice";
import {getMediaDimensions} from "@/lib/utils/file/getMediaDimensions";
import {
    addCreateTaskDialogPreviewFiles,
    addCreateTaskDialogUploadedFiles, deleteCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFilesUUID
} from "@/store/slice/createTaskDailogSlice";
import {
    addGroupChatPreviewFiles, addGroupChatUploadedFiles, deleteGroupChatPreviewFiles,
    updateGroupChatPreviewFiles,
    updateGroupChatPreviewFilesUUID
} from "@/store/slice/groupChatSlice";
import {
    addDocCommentPreviewFiles, addDocCommentUploadedFiles, deleteDocCommentPreviewFiles,
    updateDocCommentPreviewFiles,
    updateDocCommentPreviewFilesUUID
} from "@/store/slice/createDocCommentSlice";


interface UploadJson {
    src_key: "project" | "channel" | "public" | "chat" | "grpChat" | "doc"
    src_value?:  string
    channel_uuids?: string[]
    chat_uuids?: string[]
}





const uploadFileToProject = (file: File, projectUUID: string, config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "project",
        src_value: projectUUID,
    }
    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}

const uploadFileToPublic = (file: File, config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "public",
    }
    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}

const uploadFileToChannel = (file: File, channelUUID: string, config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "channel",
        src_value: channelUUID
    }

    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}

const uploadFileToDoc = (file: File, docUUID: string, config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "doc",
        src_value: docUUID
    }

    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}


const uploadFileToGroupChat = (file: File, grpId: string, config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "grpChat",
        src_value: grpId
    }

    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}


const uploadFileToChat = (file: File, grpId: string, config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "chat",
        src_value: grpId
    }

    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}

const uploadFileToChannelsAndChats = (file: File, chatUUIDs: string[], channelUUIDs: string[], config: AxiosRequestConfig ={}) => {
    const formData = new FormData();
    formData.append('file', file);

    const jd:UploadJson = {
        src_key: "chat",
        channel_uuids: channelUUIDs,
        chat_uuids: chatUUIDs
    }

    const jsonData = JSON.stringify(jd);
    formData.append('jsonData', jsonData);

    return axiosInstance.post(PostFileUploadURL.UploadFile, formData, config).then((res) => res);
}

export const useUploadFile = () => {

    const dispatch = useDispatch();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);


    const makeRequestToUploadToCreateTask = async (files: FileList, projectId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addCreateTaskDialogPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    projectUUID: projectId,
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateCreateTaskDialogPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            projectUUID: projectId,
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToProject(
                file,
                projectId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateCreateTaskDialogPreviewFilesUUID({
                        projectUUID: projectId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addCreateTaskDialogUploadedFiles({
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
                            projectUUID: projectId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteCreateTaskDialogPreviewFiles({
                            key: uniqueNum,
                            projectUUID: projectId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }


    const makeRequestToUploadToProject = async (files: FileList, projectId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addProjectAttachmentPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    projectUUID: projectId,
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateProjectAttachmentPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            projectUUID: projectId,
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToProject(
                    file,
                    projectId,
                    config
                )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateProjectAttachmentPreviewFilesUUID({
                        projectUUID: projectId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addProjectAttachmentUploadedFiles({
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
                            projectUUID: projectId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteProjectAttachmentPreviewFiles({
                            key: uniqueNum,
                            projectUUID: projectId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }


    const makeRequestToUploadToTask = async (files: FileList, taskId: string, projectId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addTaskInfoPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    taskUUID: taskId,
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateTaskInfoPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            taskUUID: taskId,
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToProject(
                file,
                projectId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateTaskInfoPreviewFilesUUID({
                        taskUUID: taskId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addTaskInfoUploadedFiles({
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
                            taskUUID: taskId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteTaskInfoPreviewFiles({
                            key: uniqueNum,
                            taskUUID: taskId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToTaskComment = async (files: FileList, projectId: string, taskId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addTaskCommentPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    taskUUID: taskId,
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateTaskCommentPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            taskUUID: taskId,
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToProject(
                file,
                projectId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateTaskCommentPreviewFilesUUID({
                        taskUUID: taskId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addTaskCommentUploadedFiles({
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
                            taskUUID: taskId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteTaskCommentPreviewFiles({
                            key: uniqueNum,
                            taskUUID: taskId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToDocComment = async (files: FileList, docId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];
         for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);


            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addDocCommentPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    docUUID: docId
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateDocCommentPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            docUUID: docId
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToDoc(
                file,
                docId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateDocCommentPreviewFilesUUID({
                        docId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addDocCommentUploadedFiles({
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
                            docUUID: docId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteDocCommentPreviewFiles({
                            key: uniqueNum,
                            docUUID: docId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }
    const makeRequestToUploadToChannelComment = async (files: FileList, channelId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);


            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addChannelCommentMsgPreviewFiles({
                    filesUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    channelId: channelId
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateChannelCommentMsgPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            channelId: channelId
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToChannel(
                file,
                channelId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateChannelCommentMsgPreviewFilesUUID({
                        channelId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addChannelCommentMsgUploadedFiles({
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
                            channelId: channelId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteChannelCommentMsgPreviewFiles({
                            key: uniqueNum,
                            channelId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToGroupChatComment = async (files: FileList,  grpId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);


            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addChatCommentPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    chatUUID: grpId
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateChatCommentPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            chatUUID: grpId
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToGroupChat(
                file,
                grpId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateChatCommentPreviewFilesUUID({
                        chatUUID: grpId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addChatCommentUploadedFiles({
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
                            chatUUID: grpId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteChatCommentPreviewFiles({
                            key: uniqueNum,
                            chatUUID: grpId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToChatComment = async (files: FileList, chatMessageUUID: string, grpId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString(); // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);


            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addChatCommentPreviewFiles({
                    fileUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType: attachmentType
                    },
                    chatUUID: chatMessageUUID
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateChatCommentPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            chatUUID: chatMessageUUID
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToChat(
                file,
                grpId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateChatCommentPreviewFilesUUID({
                        chatUUID: chatMessageUUID,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addChatCommentUploadedFiles({
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
                            chatUUID: chatMessageUUID,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteChatCommentPreviewFiles({
                            key: uniqueNum,
                            chatUUID: chatMessageUUID,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToChannel = async (files: FileList, channelId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString() // Added i to prevent duplicate keys

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)


            const mediaInfo = await getMediaDimensions(file);


            dispatch(
                addChannelPreviewFiles({
                    filesUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType
                    },
                    channelId
                })
            );

            setIsSubmitting(true)



            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateChannelPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            channelId
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToChannel(
                file,
                channelId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;


                    dispatch(updateChannelPreviewFilesUUID({
                        channelId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addChannelUploadedFiles({
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
                            channelId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteChannelPreviewFiles({
                            key: uniqueNum,
                            channelId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToChatAndChannels = async (files: FileList, chatUUIDs: string[], channelUUIDs: string[]) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString() // Added i to prevent duplicate keys
            const mediaInfo = await getMediaDimensions(file);


            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addFwdMsgPreviewFiles({
                    filesUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType
                    },
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateFwdMsgPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToChannelsAndChats(
                file,
                chatUUIDs,
                channelUUIDs,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateFwdMsgPreviewFilesUUID({
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addFwdMsgUploadedFiles({
                            filesUploaded: {
                                attachment_file_name: file.name,
                                attachment_obj_key: uniqueNum,
                                attachment_uuid: uploadMediaRes.object_uuid,
                                attachment_size: file.size,
                                attachment_created_at: currentDate,
                                attachment_type: attachmentType,
                                attachment_duration: mediaInfo.duration,
                                attachment_height: mediaInfo.height,
                                attachment_width: mediaInfo.width
                            },
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteFwdMsgPreviewFiles({
                            key: uniqueNum,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToGroupChat = async (files: FileList,  grpId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString() // Added i to prevent duplicate keys

            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addGroupChatPreviewFiles({
                    filesUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType
                    },
                    grpId
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateGroupChatPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            grpId
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToGroupChat(
                file,
                grpId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateGroupChatPreviewFilesUUID({
                        grpId,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addGroupChatUploadedFiles({
                            filesUploaded: {
                                attachment_file_name: file.name,
                                attachment_obj_key: uniqueNum,
                                attachment_uuid: uploadMediaRes.object_uuid,
                                attachment_size: file.size,
                                attachment_created_at: currentDate,
                                attachment_type: attachmentType,
                                attachment_width: mediaInfo.width,
                                attachment_height: mediaInfo.height,
                                attachment_duration: mediaInfo.duration,
                                attachment_raw_type: file.type
                            },
                            grpId,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteGroupChatPreviewFiles({
                            key: uniqueNum,
                            grpId,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }


    const makeRequestToUploadToChat = async (files: FileList, chatUUID: string, grpId: string) => {

        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const cancelToken = axios.CancelToken.source();
            const uniqueNum = (Date.now() + i).toString() // Added i to prevent duplicate keys

            const mediaInfo = await getMediaDimensions(file);

            const currentDate = new Date().toISOString();
            const attachmentType = getAttachmentType(file.name)

            dispatch(
                addChatPreviewFiles({
                    filesUploaded: {
                        key: uniqueNum,
                        fileName: file.name,
                        progress: 0,
                        cancelSource: cancelToken,
                        attachmentType
                    },
                    chatUUID
                })
            );

            setIsSubmitting(true)

            const config: AxiosRequestConfig = {
                cancelToken: cancelToken.token,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / (progressEvent.total || 100)) * 100
                    );

                    dispatch(
                        updateChatPreviewFiles({
                            progress: progress,
                            key: uniqueNum,
                            chatUUID
                        })
                    );
                },
            };

            const uploadPromise = uploadFileToChat(
                file,
                grpId,
                config
            )
                .then((res) => {
                    const uploadMediaRes: UploadFileInterfaceRes = res.data;

                    dispatch(updateChatPreviewFilesUUID({
                        chatUUID,
                        key: uniqueNum,
                        uuid: uploadMediaRes.object_uuid,
                    }))

                    dispatch(
                        addChatUploadedFiles({
                            filesUploaded: {
                                attachment_file_name: file.name,
                                attachment_obj_key: uniqueNum,
                                attachment_uuid: uploadMediaRes.object_uuid,
                                attachment_size: file.size,
                                attachment_created_at: currentDate,
                                attachment_type: attachmentType,
                                attachment_width: mediaInfo.width,
                                attachment_height: mediaInfo.height,
                                attachment_duration: mediaInfo.duration,
                                attachment_raw_type: file.type
                            },
                            chatUUID,
                        })
                    );
                    return res;
                })
                .catch((error) => {
                    dispatch(
                        deleteChatPreviewFiles({
                            key: uniqueNum,
                            chatUUID,
                        })
                    );

                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
                        variant: 'destructive'
                    });
                    throw error; // Re-throw to be caught by Promise.allSettled
                });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete (success or failure)
        try {
            await Promise.allSettled(uploadPromises);
        } catch (error) {
            console.error("Error in upload batch:", error);
        }finally {
            setIsSubmitting(false)
        }

        return
    }

    const makeRequestToUploadToPublic = async (files: FileList): Promise<UploadFileInterfaceRes[]> => {
        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            setIsSubmitting(true); // Note: This sets true for every file—consider moving it outside the loop if unintended.

            const uploadPromise = uploadFileToPublic(file)
                .catch((error) => {
                    toast({
                        title: "Error",
                        description: `error while uploading file: ${file.name}`,
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
    };

    const makeRequestToUploadToDoc = async (files: FileList | File[], docUUID: string) => {
        const uploadPromises: Promise<AxiosResponse<UploadFileInterfaceRes>>[] = [];
        const fileList = Array.isArray(files) ? files : Array.from(files);

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            setIsSubmitting(true)

            const uploadPromise = uploadFileToDoc(
                file,
                docUUID,
            )
            uploadPromises.push(uploadPromise);
        }

        try {
            const results = await Promise.allSettled(uploadPromises);
            const successfulResp = results.filter((r): r is PromiseFulfilledResult<AxiosResponse<UploadFileInterfaceRes>> => r.status === 'fulfilled')
                .map(r => r.value.data);
            return successfulResp;
        } catch (error) {
            console.error("Error in doc upload batch:", error);
            return [];
        } finally {
            setIsSubmitting(false)
        }
    }


    return React.useMemo(() => ({
        makeRequestToUploadToChannel,
        makeRequestToUploadToDoc,
        makeRequestToUploadToDocComment,
        makeRequestToUploadToGroupChatComment,
        makeRequestToUploadToGroupChat,
        makeRequestToUploadToPublic,
        makeRequestToUploadToCreateTask,
        makeRequestToUploadToChannelComment,
        makeRequestToUploadToProject,
        makeRequestToUploadToTask,
        makeRequestToUploadToTaskComment,
        makeRequestToUploadToChatComment,
        makeRequestToUploadToChat,
        makeRequestToUploadToChatAndChannels,
        isSubmitting
    }), [isSubmitting]);
}