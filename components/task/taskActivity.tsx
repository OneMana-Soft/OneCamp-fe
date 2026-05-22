import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import {getNameInitials} from "@/lib/utils/getNameInitials";
import {getAvatarFallbackClass} from "@/lib/utils/getAvatarColor";
import {cn} from "@/lib/utils/helpers/cn";
import {taskActivityConst} from "@/types/taskActivity";
import {TaskActivityInterface} from "@/types/task";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {useTranslation} from "react-i18next";

interface  TaskActivityProps {
    taskActivity: TaskActivityInterface
    openOtherUserProfile: (id: string) => void
}

export default function TaskActivity({taskActivity, openOtherUserProfile}: TaskActivityProps) {

    const {src: imageSrc} = useUserAvatar(taskActivity.activity_by.user_profile_object_key);
    const nameInitial = getNameInitials(taskActivity.activity_by.user_name||'');


    const {t} = useTranslation()



    return (


        <div className="flex items-start gap-2 relative">
            <div className="relative">
                <Avatar className="h-8 w-8 mr-2">
                    <AvatarImage src={imageSrc} alt="@shadcn" />
                    <AvatarFallback className={cn("text-[10px] font-semibold", getAvatarFallbackClass(taskActivity.activity_by.user_name))}>{nameInitial}</AvatarFallback>
                </Avatar>{" "}
            </div>
            <div className="flex-1 pt-2">
                <p className="text-sm ">
                    <span className="font-medium hover:underline cursor-pointer" onClick={()=>{openOtherUserProfile(taskActivity.activity_by.user_uuid)}}>{taskActivity.activity_by.user_name}</span>{" "}
                    {t(taskActivityConst[taskActivity.activity_type].key)}.{" "}
                    <span className="text-muted-foreground">{formatTimeForPostOrComment(taskActivity.activity_time)}</span>
                </p>
            </div>
        </div>


    )
}

