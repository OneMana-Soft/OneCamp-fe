
"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Separator } from "../ui/separator";
import {useFetch,  useMediaFetch} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {GetMediaURLRes} from "@/types/file";
import {useDispatch} from "react-redux";
import {useEffect} from "react";
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import {Label} from "@/components/ui/label";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {USER_STATUS_ONLINE} from "@/types/user";
import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import {openUI} from "@/store/slice/uiSlice";
import {AttachmentMediaReq} from "@/types/attachment";





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
    const profileInfo = useFetch<UserProfileInterface>( userUUID ? GetEndpointUrl.SelfProfile + '/'+ userUUID :'')

    const profileImageRes = useMediaFetch<GetMediaURLRes>(profileInfo && profileInfo.data?.data.user_profile_object_key ? GetEndpointUrl.PublicAttachmentURL+'/'+profileInfo.data.data.user_profile_object_key : '');

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
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (profileInfo.data?.data.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (profileInfo.data?.data.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;

    function closeModal() {
        setOpenState(false);
    }



    const nameIntialsArray = profileInfo.data?.data.user_name.split(" ") || [
        "Unknown",
    ];

    let nameIntial = nameIntialsArray[0][0].toUpperCase();

    if (nameIntialsArray?.length > 1) {
        nameIntial += nameIntialsArray[1][0].toUpperCase();
    }

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-semibold">Member Profile</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-8 md:flex-row md:gap-12 py-4">
                    {/* Left: Avatar Section */}
                    <div className="flex flex-col items-center gap-4 flex-shrink-0">
                        <div 
                            className={`relative ${profileInfo.data?.data.user_profile_object_key ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                            onClick={() => {
                                if (profileInfo.data?.data.user_profile_object_key) {
                                    const media: AttachmentMediaReq = {
                                        attachment_uuid: profileInfo.data.data.user_profile_object_key,
                                        attachment_file_name: profileInfo.data.data.user_name + " Profile Image",
                                        attachment_type: "image",
                                        attachment_size: 0,
                                        attachment_created_at: new Date().toISOString(),
                                        attachment_raw_type: "image/jpeg",
                                        initial_url: profileImageRes.data?.url || ""
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
                            <Avatar className="h-32 w-32 border ">
                                <AvatarImage
                                    src={profileImageRes.data?.url }
                                    alt={`${profileInfo.data?.data.user_name}'s profile`}
                                />
                                <AvatarFallback className="text-lg font-semibold">{nameIntial}</AvatarFallback>
                            </Avatar>
                            {isOnline && <div className={`h-6 w-6 ring-[4px] ring-background rounded-full bg-green-500 absolute bottom-1 right-2`}></div>}
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-semibold text-foreground">{profileInfo.data?.data.user_name}</h2>
                            <p className="text-sm text-muted-foreground mt-1">{profileInfo.data?.data.user_email_id}</p>
                        </div>
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
                    </div>

                    {/* Right: Details Section */}
                    <div className="flex-1 flex flex-col gap-5">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data.user_full_name || "—"}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Display Name</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data.user_name || "—"}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Title</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data.user_job_title || "—"}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hobbies</p>
                            <p className="text-sm text-foreground">{profileInfo.data?.data.user_hobbies || "—"}</p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        );
};

export default OtherProfileDialog;
