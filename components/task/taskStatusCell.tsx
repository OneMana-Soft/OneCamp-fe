import { useTranslation } from "react-i18next";
import {prioritiesInterface} from "@/types/table";
import {cn} from "@/lib/utils/helpers/cn";

export const TaskStatusCell = ({status}: {status: prioritiesInterface}) => {
    // The label, in the reader's language; never the stored value ("inReview").
    const { t } = useTranslation()


    return (
        <div
            className={cn(
                "flex items-center rounded-full px-2 py-1  bg-blue-700 text-xs font-medium  space-x-1",
                status.color,
            )}
        >            {status.icon && (
                <status.icon className=" h-4 w-4 text-muted-foreground" />
            )}
            <div>{t(status.value, { defaultValue: status.label })}</div>
        </div>
    )
}