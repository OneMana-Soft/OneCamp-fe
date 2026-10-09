import { useTranslation } from "react-i18next";
import {prioritiesInterface} from "@/types/table";
import {cn} from "@/lib/utils/helpers/cn";

/** A priority as a 6px dot and its name in plain text, like a status. */
export const TaskPriorityCell = ({priority, className}: {priority: prioritiesInterface; className?: string}) => {
    // The label, in the reader's language; never the stored value such as inReview.
    const { t } = useTranslation()

    return (
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-foreground", className)}>
            <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priority.dot ?? "bg-muted-foreground")} />
            <span>{t(priority.value, { defaultValue: priority.label })}</span>
        </span>
    )
}
