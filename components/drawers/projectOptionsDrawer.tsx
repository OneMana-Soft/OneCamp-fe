"use client"

import * as React from "react"
import {Pencil, Users} from "lucide-react"

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {useDispatch} from "react-redux";
import {useEffect, useState} from "react";
import {usePost} from "@/hooks/usePost";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {PostEndpointUrl, GetEndpointUrl} from "@/services/endPoints";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {openUI} from "@/store/slice/uiSlice";
import {useFetch} from "@/hooks/useFetch";
import {NotificationType} from "@/types/channel";
import {ProjectInfoRawInterface, ProjectNotificationInterface} from "@/types/project";


interface projectOptionsDrawerProps {
    drawerOpenState: boolean;
    projectId: string;
    setOpenState: (state: boolean) => void;
}

export function ProjectOptionsDrawer({drawerOpenState, setOpenState, projectId}: projectOptionsDrawerProps) {
    const projectInfo = useFetch<ProjectInfoRawInterface>(projectId ? `${GetEndpointUrl.GetProjectInfo}/${projectId}` : '');

    const [projectNotification, setProjectNotificationType] = useState<string>(NotificationType.NotificationAll);
    const postNotification  = usePost();

    useEffect(() => {
        if(projectInfo.data?.data.notification_type) {
            setProjectNotificationType(projectInfo.data?.data.notification_type);
        }
    }, [projectInfo.data?.data]);

    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(projectNotification);
        await postNotification.makeRequest<ProjectNotificationInterface>({
            payload: {project_id: projectId, notification_type: nextNotification}, 
            apiEndpoint: PostEndpointUrl.UpdateProjectNotification
        });
        setProjectNotificationType(nextNotification);
    };

    const dispatch = useDispatch();

    function closeDrawer() {
        setOpenState(false);
    }

    return (
    <Drawer  onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className=" w-full mb-6">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle className='capitalize'>{process.env.NEXT_PUBLIC_ORG_NAME}</DrawerTitle>
                        <DrawerDescription>Project options</DrawerDescription>

                    </DrawerHeader>
                    <div className="p-4 pb-6">
                        <div className="flex flex-col items-center justify-start space-y-1">
                            <div
                                className='w-full h-16 flex items-center justify-between cursor-pointer transition-colors hover:bg-muted/80 bg-muted/40 rounded-xl px-4 mb-2'
                                onClick={UpdateNotification}
                            >
                                <div className="flex flex-col">
                                    <span className="text-base font-semibold">Notifications</span>
                                    <span className="text-xs text-muted-foreground mt-0.5">
                                        {projectNotification === NotificationType.NotificationAll ? "All messages" :
                                        projectNotification === NotificationType.NotificationMention ? "Mentions only" : "Muted"}
                                    </span>
                                </div>
                                <div className="pointer-events-none -mr-2 bg-background/50 rounded-full shadow-sm flex items-center justify-center">
                                    <NotificationBell notificationType={projectNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                                </div>
                            </div>

                            {(projectInfo.data?.data.project_is_admin) && <div
                                className='w-full h-14 flex space-x-4 items-center cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={()=>{
                                    closeDrawer();
                                    dispatch(openUI({ key: 'editProjectName', data: {projectUUID:projectId} }));
                                }}
                            >
                                <Pencil className="h-5 w-5 text-muted-foreground" />
                                <span className="text-base font-medium">Edit project name</span>
                            </div>}
                            <div
                                className='w-full h-14 flex space-x-4 items-center cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={() => {
                                    closeDrawer();
                                    dispatch(openUI({ key: 'editProjectMember', data: {projectUUID:projectId} }));
                                }}
                            >
                                <Users className="h-5 w-5 text-muted-foreground"/>
                                <span className="text-base font-medium">Project Members</span>
                            </div>

                        </div>

                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
