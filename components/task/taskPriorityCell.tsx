import { useTranslation } from "react-i18next";
import {prioritiesInterface} from "@/types/table";
import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils/helpers/cn";

export const TaskPriorityCell = ({priority}: {priority: prioritiesInterface}) => {
    // The label, in the reader's language; never the stored value such as inReview.
    const { t } = useTranslation()

    return (
        <Badge variant="secondary" className={cn("font-medium space-x-1", priority.color)}>
        {priority.icon && (
                <priority.icon className=" h-4 w-4 text-muted-foreground" />
            )}
            <div>{t(priority.value, { defaultValue: priority.label })}</div>
        </Badge>
    )
}