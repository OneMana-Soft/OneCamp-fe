import { displayNameOf } from "@/lib/personName"
import { UserProfileDataInterface } from "@/types/user"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface MessagePreviewAvatarProps {
    userInfo?: UserProfileDataInterface
    /** Its size; 36px unless told (a forwarded message's header draws 24px). */
    className?: string
}

export const MessagePreviewAvatar = ({ userInfo, className }: MessagePreviewAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userInfo?.user_profile_object_key)
    const nameInitial = getNameInitials(userInfo && displayNameOf(userInfo))

    return (
        <Avatar className={cn("h-9 w-9", className)}>
            <AvatarImage src={imageSrc} />
            <AvatarFallback
                className={cn(
                    "text-2xs font-semibold",
                    getAvatarFallbackClass(displayNameOf(userInfo)),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}
