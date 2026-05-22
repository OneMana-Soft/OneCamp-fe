import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface TypingAvatarProps {
    userProfileObjKey: string | undefined
    userName: string
}

export const TypingAvatar = ({ userProfileObjKey, userName }: TypingAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userProfileObjKey)
    const nameInitial = getNameInitials(userName)

    return (
        <Avatar className="w-5 h-5 border border-background">
            <AvatarImage src={imageSrc} className="rounded-full" />
            <AvatarFallback
                className={cn(
                    "text-[8px] font-semibold",
                    getAvatarFallbackClass(userName),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}
