"use client"

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MessageSquare } from "@/lib/icons";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {USER_STATUS_ONLINE} from "@/types/user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusColors } from "@/lib/colors";
import {AttachmentMediaReq} from "@/types/attachment";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { cn } from "@/lib/utils/helpers/cn";
import { isExternalUser } from "@/lib/utils/isExternalUser";

export function MobileOtherUserProfile({ userUUID }: { userUUID: string }) {
    const router = useRouter();
    const dispatch = useDispatch();

    const profileInfo = useFetch<UserProfileInterface>(userUUID ? GetEndpointUrl.SelfProfile + '/' + userUUID : '');
    const {src: imageSrc} = useUserAvatar(profileInfo?.data?.data?.user_profile_object_key);

    const userSeed = profileInfo.data?.data?.user_full_name || profileInfo.data?.data?.user_name || "User";
    const nameIntial = getNameInitials(userSeed);

    const userStatusState = useUserInfoState(userUUID)
    
    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (profileInfo.data?.data?.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (profileInfo.data?.data?.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;
    const isExternal = isExternalUser(profileInfo.data?.data);

    return (
        <div className="flex flex-col h-full bg-background w-full">

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="p-4 md:p-6 lg:p-8 space-y-8 pb-20">
                    
                    {/* Avatar Section */}
                    <div className="flex flex-col justify-center items-center mt-4">
                        <div 
                            className={`relative ${profileInfo.data?.data?.user_profile_object_key ? 'cursor-pointer active:opacity-80 transition-opacity' : ''}`}
                            onClick={() => {
                                if (profileInfo.data?.data?.user_profile_object_key) {
                                    const media: AttachmentMediaReq = {
                                        attachment_uuid: profileInfo.data.data.user_profile_object_key,
                                        attachment_file_name: profileInfo.data.data.user_name + " Profile Image",
                                        attachment_type: "image",
                                        attachment_size: 0,
                                        attachment_created_at: new Date().toISOString(),
                                    } as AttachmentMediaReq;
                                    dispatch(openUI({
                                        key: 'attachmentLightbox',
                                        data: {
                                            media: media,
                                            allMedia: [media],
                                            mediaGetUrl: GetEndpointUrl.PublicAttachmentURL
                                        }
                                    }));
                                }
                            }}
                        >
                            <Avatar className="h-32 w-32 ring-2 ring-border/50 shadow-sm mb-3">
                                <AvatarImage src={imageSrc} alt={`${profileInfo.data?.data?.user_name}'s profile`} />
                                <AvatarFallback className={cn("text-3xl font-semibold", getAvatarFallbackClass(userSeed))}>
                                    {nameIntial}
                                </AvatarFallback>
                            </Avatar>
                            {isOnline && (
                                <div
                                    aria-hidden
                                    className={cn(
                                        "h-6 w-6 rounded-full ring-4 ring-background absolute bottom-4 right-1",
                                        statusColors.online.solid,
                                    )}
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold text-foreground text-center truncate max-w-[60vw]">
                                {profileInfo.data?.data?.user_full_name || profileInfo.data?.data?.user_name || "Loading..."}
                            </h2>
                            {isExternal && (
                                <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                                    External
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 text-center truncate max-w-[80vw]">
                            {profileInfo.data?.data?.user_email_id || "\u00A0"}
                        </p>
                        {/*
                          External users are read-only contacts. OneCamp users
                          are not allowed to start a DM with them, so the
                          Message button is hidden. The BE rejects DM creation
                          to externals as a defence-in-depth check.

                          We also hide the button while profile data is
                          still loading so the Message button does not
                          flash on first paint for an external contact.
                        */}
                        {profileInfo.data?.data && !isExternal && (
                            <Button
                                variant="secondary"
                                className="mt-6 w-full max-w-[200px] gap-2 font-medium"
                                onClick={() => router.push(`/app/chat/${userUUID}`)}
                            >
                                <MessageSquare className="h-4 w-4" />
                                Message
                            </Button>
                        )}
                        {profileInfo.data?.data && isExternal && (
                            <p className="mt-6 text-xs text-muted-foreground text-center max-w-[260px] leading-relaxed">
                                External contacts can&apos;t be messaged directly. Mention them in a task or comment to collaborate.
                            </p>
                        )}
                    </div>

                    {/* Details Section */}
                    <div className="bg-muted/10 p-5 rounded-2xl border space-y-5 shadow-sm">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</p>
                            <p className="text-base font-medium text-foreground">{profileInfo.data?.data?.user_full_name || "—"}</p>
                        </div>
                        
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Display Name</p>
                            <p className="text-base font-medium text-foreground">{profileInfo.data?.data?.user_name || "—"}</p>
                        </div>
                        
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Job Title</p>
                            <p className="text-base font-medium text-foreground">{profileInfo.data?.data?.user_job_title || "—"}</p>
                        </div>
                        
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hobbies</p>
                            <p className="text-base font-medium text-foreground">{profileInfo.data?.data?.user_hobbies || "—"}</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
