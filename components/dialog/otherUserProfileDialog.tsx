"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {useFetch} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import {useDispatch} from "react-redux";
import {useEffect} from "react";
import { statusColors } from "@/lib/colors";
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {USER_STATUS_ONLINE} from "@/types/user";
import { MessageSquare } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import {openUI} from "@/store/slice/uiSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { cn } from "@/lib/utils/helpers/cn";
import { isExternalUser } from "@/lib/utils/isExternalUser";


interface editProfileDialogProps {
    userUUID: string;
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

const OtherProfileDialog: React.FC<editProfileDialogProps> = ({
                                                                  dialogOpenState,
                                                                  setOpenState,
                                                                  userUUID,
                                                              }) => {
    useEffect(() => {
        if (dialogOpenState) {
            // Preload the lightbox dialog JS chunk to avoid "black screen" on first click
            import("@/components/dialog/attachmentLightboxDialog");
        }
    }, [dialogOpenState]);

    const router = useRouter();
    const profileInfo = useFetch<UserProfileInterface>( userUUID && dialogOpenState ? GetEndpointUrl.SelfProfile + '/'+ userUUID :'')

    const {src: imageSrc} = useUserAvatar(profileInfo.data?.data?.user_profile_object_key);

    const dispatch = useDispatch();

    useEffect(() => {

        if(profileInfo.data?.data) {
            dispatch(
                updateUserInfoStatus({
                    userUUID: profileInfo.data?.data.user_uuid || "",
                    profileKey: profileInfo.data?.data.user_profile_object_key || "",
                    userName: profileInfo.data?.data.user_name || "",
                    status: profileInfo.data?.data.user_status || "",
                }),
            )
        }

    }, [profileInfo.data?.data])

    const userStatusState = useUserInfoState(userUUID)

    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (profileInfo.data?.data?.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (profileInfo.data?.data?.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;

    const isExternal = isExternalUser(profileInfo.data?.data);

    function closeModal() {
        setOpenState(false);
    }

    const userSeed = profileInfo.data?.data?.user_full_name || profileInfo.data?.data?.user_name || "User";
    const nameIntial = getNameInitials(userSeed);

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Member profile</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-8 md:flex-row md:gap-12 py-4">
                    {/* Left: Avatar Section */}
                    <div className="flex flex-col items-center gap-4 flex-shrink-0">
                        <div
                            className={`relative ${profileInfo.data?.data?.user_profile_object_key ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                            onClick={() => {
                                if (profileInfo.data?.data?.user_profile_object_key) {
                                    const media: AttachmentMediaReq = {
                                        attachment_uuid: profileInfo.data.data.user_profile_object_key,
                                        attachment_file_name: profileInfo.data.data.user_name + " Profile Image",
                                        attachment_type: "image",
                                        attachment_size: 0,
                                        attachment_created_at: new Date().toISOString(),
                                        attachment_raw_type: "image/jpeg",
                                        initial_url: imageSrc || ""
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
                            <Avatar className="h-32 w-32 ring-2 ring-border/50 shadow-sm">
                                <AvatarImage
                                    src={imageSrc}
                                    alt={`${profileInfo.data?.data?.user_name || 'User'}'s profile`}
                                />
                                <AvatarFallback className={cn("text-2xl font-semibold", getAvatarFallbackClass(userSeed))}>
                                    {nameIntial}
                                </AvatarFallback>
                            </Avatar>
                            {isOnline && (
                                <div
                                    aria-hidden
                                    className={cn(
                                        "h-6 w-6 ring-[4px] ring-background rounded-full absolute bottom-1 right-2",
                                        statusColors.online.solid,
                                    )}
                                />
                            )}
                        </div>
                        <div className="text-center space-y-1">
                            <div className="flex items-center justify-center gap-2">
                                <h2 className="text-lg font-semibold text-foreground truncate max-w-[220px]">
                                    {profileInfo.data?.data?.user_name || "—"}
                                </h2>
                                {isExternal && (
                                    <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                                        External
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate max-w-[260px]">
                                {profileInfo.data?.data?.user_email_id || "\u00A0"}
                            </p>
                        </div>
                        {/*
                          External users are read-only contacts (e.g. GitHub
                          collaborators surfaced through tasks/comments).
                          OneCamp users are not allowed to start a DM with
                          them, so we hide the Message affordance entirely
                          rather than route to a chat that would fail server
                          side. The BE still rejects external DM creation as
                          a defence-in-depth check.

                          We also hide the button while profile data is
                          still loading — otherwise React renders the
                          Message button on first paint (when both
                          `is_external` and the email fallback are
                          undefined) and only hides it after the SWR
                          fetch resolves, which is the flash you would
                          see for an external contact.
                        */}
                        {profileInfo.data?.data && !isExternal && (
                            <Button
                                variant="secondary"
                                className="w-full mt-2 gap-2 font-medium"
                                onClick={() => {
                                    router.push(`/app/chat/${userUUID}`);
                                    closeModal();
                                }}
                            >
                                <MessageSquare className="h-4 w-4" />
                                Message
                            </Button>
                        )}
                        {profileInfo.data?.data && isExternal && (
                            <p className="text-xs text-muted-foreground text-center max-w-[220px] leading-relaxed">
                                External contacts can&apos;t be messaged directly. Mention them in a task or comment to collaborate.
                            </p>
                        )}
                    </div>

                    {/* Right: Details Section */}
                    <div className="flex-1 flex flex-col gap-5">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data?.user_full_name || "—"}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Display Name</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data?.user_name || "—"}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Title</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data?.user_job_title || "—"}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hobbies</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data?.user_hobbies || "—"}</p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        );
};

export default OtherProfileDialog;
