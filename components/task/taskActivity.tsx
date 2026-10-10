import { displayNameOf } from "@/lib/personName"
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
    const nameInitial = getNameInitials(displayNameOf(taskActivity.activity_by)||'');


    const {t} = useTranslation()

    // A kind of change this build doesn't know (a newer server's) is left
    // out rather than taking the whole history down with it.
    const phrase = taskActivityConst[taskActivity.activity_type]?.key
    if (!phrase) return null

    return (


        <div className="flex items-start gap-2 relative">
            <div className="relative">
                <Avatar className="h-8 w-8 mr-2">
                    <AvatarImage src={imageSrc} alt="@shadcn" />
                    <AvatarFallback className={cn("text-3xs font-semibold", getAvatarFallbackClass(displayNameOf(taskActivity.activity_by)))}>{nameInitial}</AvatarFallback>
                </Avatar>{" "}
            </div>
            <div className="flex-1 pt-2">
                <p className="text-sm ">
                    <span className="font-medium hover:underline cursor-pointer" onClick={()=>{openOtherUserProfile(taskActivity.activity_by.user_uuid)}}>{displayNameOf(taskActivity.activity_by)}</span>{" "}
                    {/* After the name, mid-sentence: "Sam Rivera updated the
                        description", not "Sam Rivera Updated...". */}
                    {lowerFirst(t(phrase, { field: taskActivity.activity_next_state }))}.{" "}
                    <span className="text-muted-foreground">{formatTimeForPostOrComment(taskActivity.activity_time)}</span>
                </p>
            </div>
        </div>


    )
}

/** The phrase's first letter in lower case, where it follows a name; a field's own name keeps its case. */
function lowerFirst(s: string) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}
