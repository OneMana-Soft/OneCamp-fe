"use client"

import { addressOrHandleOf, displayNameOf, handleOf, secondaryNameOf } from "@/lib/personName";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare } from "@/lib/icons";
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
import { botProfileCopy } from "@/lib/botCopy";
import { AgentCardDetails } from "@/components/ai/AgentCardDetails";
import { InvitePlaceholder } from "@/components/admin/InvitePlaceholder";
import { Skeleton } from "@/components/ui/skeleton";
import { fieldLabel } from "@/lib/ui/fieldRow";
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData";
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction";
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired";

export function MobileOtherUserProfile({ userUUID }: { userUUID: string }) {
    const router = useRouter();
    const dispatch = useDispatch();

    const profileInfo = useFetch<UserProfileInterface>(userUUID ? GetEndpointUrl.SelfProfile + '/' + userUUID : '');
    const {src: imageSrc} = useUserAvatar(profileInfo?.data?.data?.user_profile_object_key);

    const isBotProfile = profileInfo.data?.data?.is_bot === true;
    // By the one name rule; a bot made before bots took their name as
    // user_name has its login handle there, and goes by its full name.
    const shownName = (isBotProfile && profileInfo.data?.data?.user_full_name?.trim()) || displayNameOf(profileInfo.data?.data);
    const fullName = isBotProfile ? "" : secondaryNameOf(profileInfo.data?.data);
    const handle = isBotProfile ? "" : handleOf(profileInfo.data?.data);
    const userSeed = shownName || "User";
    const nameIntial = getNameInitials(userSeed);

    const userStatusState = useUserInfoState(userUUID)
    
    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (profileInfo.data?.data?.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (profileInfo.data?.data?.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;
    const isExternal = isExternalUser(profileInfo.data?.data);
    const isBot = profileInfo.data?.data?.is_bot === true;
    // Same classification as the desktop dialog; see lib/botCopy.ts.
    const botCopy = botProfileCopy(profileInfo.data?.data?.user_bot_kind);
    // The address; without one the handle, unless the line above shows it.
    const contactLine = isBot ? botCopy.subtitle : addressOrHandleOf(profileInfo.data?.data);
    const showContactLine = !!contactLine && contactLine !== `@${handle}`;

    // Their status as set now (see the desktop dialog), and whether it has come.
    const emojiData = useEmojiMartData();
    const status = userStatusState?.emojiStatus?.status_user_emoji_id
        ? userStatusState.emojiStatus
        : profileInfo.data?.data?.user_emoji_statuses?.[0] ?? null;
    const statusExpired = useStatusIsExpired(status?.status_user_emoji_id ? status : null);
    const statusEmoji = status && !statusExpired ? findEmojiMartEmojiByEmojiID(emojiData.data, status.status_user_emoji_id ?? "")?.skins[0].native : undefined;
    const statusText = status && !statusExpired ? status.status_user_emoji_desc : undefined;
    const loading = !profileInfo.data?.data;

    return (
        <div className="flex flex-col h-full bg-background w-full">

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="p-4 md:p-6 lg:p-8 space-y-8 pb-20">
                    
                    {/* Avatar Section */}
                    <div className="flex flex-col justify-center items-center mt-4">
                        <button
                            type="button"
                            disabled={!profileInfo.data?.data?.user_profile_object_key}
                            aria-label={`See ${userSeed}'s photo`}
                            className="relative rounded-full transition-opacity enabled:active:opacity-80 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2"
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
                            <Avatar className="h-32 w-32 ring-2 ring-border/50  mb-3">
                                <AvatarImage src={imageSrc} alt={`${userSeed}'s profile`} />
                                <AvatarFallback className={cn("text-3xl font-semibold", getAvatarFallbackClass(userSeed))}>
                                    {nameIntial}
                                </AvatarFallback>
                            </Avatar>
                            {isOnline && (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "h-6 w-6 rounded-full ring-4 ring-background absolute bottom-4 right-1",
                                        statusColors.online.solid,
                                    )}
                                />
                            )}
                        </button>
                        {loading ? (
                            <div className="flex flex-col items-center gap-2" role="status" aria-label="Loading their profile">
                                <Skeleton className="h-7 w-44" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                        ) : (
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold text-foreground text-center truncate max-w-[60vw]">
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
                        {isOnline && <p className="mt-1 text-xs font-medium text-success-ink">Online</p>}
                        {(fullName || handle) && (
                            <p className="text-sm text-muted-foreground mt-1 text-center truncate max-w-[80vw]">
                                {[fullName, handle && `@${handle}`].filter(Boolean).join(" · ")}
                            </p>
                        )}
                        {showContactLine && (
                            <p className="text-sm text-muted-foreground mt-1 text-center truncate max-w-[80vw]">{contactLine}</p>
                        )}
                        {/*
                          External users are read-only contacts. OneCamp users
                          are not allowed to start a DM with them, so the
                          Message button is hidden. The BE rejects DM creation
                          to externals as a defence-in-depth check.

                          We also hide the button while profile data is
                          still loading so the Message button does not
                          flash on first paint for an external contact.
                        */}
                        {profileInfo.data?.data && (isBot || !isExternal) && (
                            <Button
                                variant="secondary"
                                className="mt-6 w-full max-w-[200px] gap-2 font-medium"
                                onClick={() => router.push(`/app/chat/${userUUID}`)}
                            >
                                <MessageSquare className="h-4 w-4" />
                                {isBot ? botCopy.action : "Message"}
                            </Button>
                        )}
                        {profileInfo.data?.data && isExternal && !isBot && (
                            <div className="mt-6 flex w-full max-w-[260px] flex-col items-center gap-3">
                                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                                    External contacts can&apos;t be messaged directly. Mention them in a task or comment to collaborate.
                                </p>
                                {/* An admin can bring an imported placeholder in. */}
                                <InvitePlaceholder
                                    userUUID={userUUID}
                                    email={profileInfo.data.data.user_email_id}
                                    name={displayNameOf(profileInfo.data.data)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Details Section */}
                    {isBot ? (
                        <div className="rounded-2xl border p-5">
                            {(() => {
                                const about = (
                                    <div className="space-y-1">
                                        <p className="text-xs font-medium text-muted-foreground">About</p>
                                        <p className="text-base text-foreground leading-relaxed">
                                            {profileInfo.data?.data?.user_name || botCopy.defaultName} {botCopy.bio}
                                        </p>
                                    </div>
                                )
                                // Same card as the desktop dialog for an agent.
                                return profileInfo.data?.data?.user_bot_kind === "agent" && userUUID
                                    ? <AgentCardDetails botUserId={userUUID} fallback={about} />
                                    : about
                            })()}
                        </div>
                    ) : (
                    // What else they have set, a quiet label beside each value; the
                    // names are in the header already. Fields nobody filled in are
                    // left out rather than shown as "—".
                    <div className="rounded-xl border p-4">
                        {loading ? (
                            <div className="space-y-3" aria-hidden="true">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ) : (
                        <dl className="divide-y divide-border/60">
                            {statusText && (
                                <div className="flex min-h-11 items-center justify-between gap-4 py-2">
                                    <dt className={fieldLabel}>Status</dt>
                                    <dd className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                                        {statusEmoji && <span aria-hidden="true">{statusEmoji}</span>}
                                        <span className="truncate">{statusText}</span>
                                    </dd>
                                </div>
                            )}
                            {profileInfo.data?.data?.user_job_title && (
                                <div className="flex min-h-11 items-center justify-between gap-4 py-2">
                                    <dt className={fieldLabel}>Job title</dt>
                                    <dd className="truncate text-sm text-foreground">{profileInfo.data.data.user_job_title}</dd>
                                </div>
                            )}
                            {profileInfo.data?.data?.user_hobbies && (
                                <div className="flex min-h-11 items-start justify-between gap-4 py-2">
                                    <dt className={fieldLabel}>Hobbies</dt>
                                    <dd className="text-right text-sm text-foreground">{profileInfo.data.data.user_hobbies}</dd>
                                </div>
                            )}
                            {!statusText && !profileInfo.data?.data?.user_job_title && !profileInfo.data?.data?.user_hobbies && (
                                <p className="py-1 text-sm text-muted-foreground">Nothing else on their profile yet.</p>
                            )}
                        </dl>
                        )}
                    </div>
                    )}

                </div>
            </div>
        </div>
    );
}
