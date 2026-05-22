import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileDataInterface } from "@/types/user"

export const TaskAssigneeCell = ({
    userInfo,
    avatarOnly = false,
}: {
    userInfo: UserProfileDataInterface
    /**
     * When true, only the avatar is rendered (no name). Useful for compact
     * surfaces like the kanban card where horizontal space is limited.
     */
    avatarOnly?: boolean
}) => {
    const { src: imageSrc } = useUserAvatar(userInfo.user_profile_object_key)
    const nameInitial = getNameInitials(userInfo.user_name)

    return (
        <div
            className={cn(
                "flex items-center text-sm text-foreground",
                avatarOnly ? "gap-0" : "gap-2",
            )}
            title={avatarOnly ? userInfo.user_name : undefined}
        >
            <Avatar className="w-6 h-6">
                <AvatarImage src={imageSrc} />
                <AvatarFallback
                    className={cn(
                        "text-[9px] font-semibold",
                        getAvatarFallbackClass(userInfo.user_name),
                    )}
                >
                    {nameInitial}
                </AvatarFallback>
            </Avatar>
            {!avatarOnly && <span className="truncate">{userInfo.user_name}</span>}
        </div>
    )
}
