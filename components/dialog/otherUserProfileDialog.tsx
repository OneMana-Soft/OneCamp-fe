"use client"

import { addressOrHandleOf, displayNameOf, handleOf, secondaryNameOf } from "@/lib/personName";
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
import { botProfileCopy } from "@/lib/botCopy";
import { InvitePlaceholder } from "@/components/admin/InvitePlaceholder";
import { Skeleton } from "@/components/ui/skeleton";
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow";
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData";
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction";
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired";


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

    // Their status, as set now: the live copy in the store (MQTT keeps it
    // current), else the one the profile came with; an expired one is none.
    const emojiData = useEmojiMartData();
    const status = userStatusState?.emojiStatus?.status_user_emoji_id
        ? userStatusState.emojiStatus
        : profileInfo.data?.data?.user_emoji_statuses?.[0] ?? null;
    const statusExpired = useStatusIsExpired(status?.status_user_emoji_id ? status : null);
    const statusEmoji = status && !statusExpired ? findEmojiMartEmojiByEmojiID(emojiData.data, status.status_user_emoji_id ?? "")?.skins[0].native : undefined;
    const statusText = status && !statusExpired ? status.status_user_emoji_desc : undefined;
    const loading = !profileInfo.data?.data;

    const isExternal = isExternalUser(profileInfo.data?.data);
    const isBot = profileInfo.data?.data?.is_bot === true;
    // What KIND of bot. Every bot used to be described as the workspace
    // assistant, including agents that do something else entirely.
    const botCopy = botProfileCopy(profileInfo.data?.data?.user_bot_kind);

    function closeModal() {
        setOpenState(false);
    }

    // By the one name rule; a bot made before bots took their name as
    // user_name has its login handle there, and goes by its full name.
    const shownName = (isBot && profileInfo.data?.data?.user_full_name?.trim()) || displayNameOf(profileInfo.data?.data);
    const fullName = isBot ? "" : secondaryNameOf(profileInfo.data?.data);
    const handle = isBot ? "" : handleOf(profileInfo.data?.data);
    // The address; without one the handle, unless the line above shows it.
    const contactLine = isBot ? botCopy.subtitle : addressOrHandleOf(profileInfo.data?.data);
    const showContactLine = !!contactLine && contactLine !== `@${handle}`;
    const userSeed = shownName || "User";
    const nameIntial = getNameInitials(userSeed);

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            {/* One column, 448px: the card's few lines read top to bottom, as the
                task panel's do. Two columns at 672px spent the width on a 128px
                photo and left "Nothing else on their profile yet." alone beside it. */}
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">{isBot ? botCopy.title : "Member profile"}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-5 pt-1">
                    {/* Left: Avatar Section */}
                    <div className="flex flex-col gap-4">
                      <div data-profile-head="" className="flex items-center gap-4">
                        <button
                            type="button"
                            disabled={!profileInfo.data?.data?.user_profile_object_key}
                            aria-label={`See ${userSeed}'s photo`}
                            className="relative rounded-full transition-opacity enabled:cursor-pointer enabled:hover:opacity-90 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2"
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
                            <Avatar className="h-16 w-16 ring-1 ring-border/50">
                                <AvatarImage
                                    src={imageSrc}
                                    alt={`${userSeed}'s profile`}
                                />
                                <AvatarFallback className={cn("text-lg font-semibold", getAvatarFallbackClass(userSeed))}>
                                    {nameIntial}
                                </AvatarFallback>
                            </Avatar>
                            {isOnline && (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "h-3.5 w-3.5 ring-2 ring-background rounded-full absolute bottom-0 right-0",
                                        statusColors.online.solid,
                                    )}
                                />
                            )}
                        </button>
                        <div data-profile-name="" className="min-w-0 flex-1 space-y-0.5">
                            {loading && (
                                <div className="flex flex-col gap-2" role="status" aria-label="Loading their profile">
                                    <Skeleton className="h-6 w-40" />
                                    <Skeleton className="h-4 w-28" />
                                </div>
                            )}
                            {!loading && (
                            <div className="flex min-w-0 items-center gap-2">
                                <h2 className="text-base font-semibold text-foreground truncate">
                                    {shownName || "Unnamed"}
                                </h2>
                                {isBot ? (
                                    <Badge variant="secondary" className="text-2xs h-5 shrink-0">{botCopy.badge}</Badge>
                                ) : isExternal ? (
                                    <Badge variant="secondary" className="text-2xs h-5 shrink-0">External</Badge>
                                ) : null}
                            </div>
                            )}
                            {/* The green dot says it in colour; this says it in words. */}
                            {isOnline && <p className="text-xs font-medium text-success-ink">Online</p>}
                            {(fullName || handle) && (
                                <p className="text-sm text-muted-foreground truncate">
                                    {[fullName, handle && `@${handle}`].filter(Boolean).join(" · ")}
                                </p>
                            )}
                            {showContactLine && (
                                <p className="text-sm text-muted-foreground truncate">{contactLine}</p>
                            )}
                        </div>
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
                        {profileInfo.data?.data && (isBot || !isExternal) && (
                            <Button
                                variant="secondary"
                                className="w-full mt-2 gap-2 font-medium"
                                onClick={() => {
                                    router.push(`/app/chat/${userUUID}`);
                                    closeModal();
                                }}
                            >
                                <MessageSquare className="h-4 w-4" />
                                {isBot ? botCopy.action : "Message"}
                            </Button>
                        )}
                        {profileInfo.data?.data && isExternal && !isBot && (
                            <>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    External contacts can&apos;t be messaged directly. Mention them in a task or comment to collaborate.
                                </p>
                                {/* An admin can bring an imported placeholder in. */}
                                <InvitePlaceholder
                                    userUUID={userUUID}
                                    email={profileInfo.data.data.user_email_id}
                                    name={displayNameOf(profileInfo.data.data)}
                                />
                            </>
                        )}
                    </div>

                    {/* Right: Details Section */}
                    <div className="flex-1 flex flex-col gap-5">
                        {isBot ? (
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">About</p>
                                <p className="text-sm text-foreground leading-relaxed">
                                    {profileInfo.data?.data?.user_name || botCopy.defaultName} {botCopy.bio}
                                    {botCopy.invite ? ` ${botCopy.invite}` : ""}
                                </p>
                            </div>
                        ) : (
                            loading ? (
                                <div className="space-y-3" aria-hidden="true">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className={fieldRow()}>
                                            <Skeleton className="h-3.5 w-16" />
                                            <Skeleton className="h-4 w-40" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                // The name, display name and handle are in the header
                                // already; this lists what else they have set, a quiet
                                // label beside each value, as in the task panel. A row
                                // of "—" for every field nobody filled in said nothing.
                                <dl className="space-y-1">
                                    {statusText && (
                                        <div className={fieldRow()}>
                                            <dt className={fieldLabel}>Status</dt>
                                            <dd className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                                                {statusEmoji && <span aria-hidden="true">{statusEmoji}</span>}
                                                <span className="truncate">{statusText}</span>
                                            </dd>
                                        </div>
                                    )}
                                    {profileInfo.data?.data?.user_job_title && (
                                        <div className={fieldRow()}>
                                            <dt className={fieldLabel}>Job title</dt>
                                            <dd className="truncate text-sm text-foreground">{profileInfo.data.data.user_job_title}</dd>
                                        </div>
                                    )}
                                    {profileInfo.data?.data?.user_hobbies && (
                                        <div className={fieldRow("start")}>
                                            <dt className={fieldLabel}>Hobbies</dt>
                                            <dd className="text-sm text-foreground">{profileInfo.data.data.user_hobbies}</dd>
                                        </div>
                                    )}
                                    {!statusText && !profileInfo.data?.data?.user_job_title && !profileInfo.data?.data?.user_hobbies && (
                                        <p className="text-sm text-muted-foreground">Nothing else on their profile yet.</p>
                                    )}
                                </dl>
                            )
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        );
};

export default OtherProfileDialog;
