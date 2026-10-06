import { useTranslation } from "react-i18next";
import type { ComponentType } from "react";
import {cn} from "@/lib/utils/helpers/cn";
import { isBuiltInStatus } from "@/lib/taskStatus";

/** What a status pill needs: a built-in status, or a project's own. */
interface StatusLike {
    value: string
    label: string
    color: string
    icon?: ComponentType<{ className?: string }>
}

export const TaskStatusCell = ({status}: {status: StatusLike}) => {
    // The label, in the reader's language; never the stored value such as
    // inReview. A project's own status is shown as its admins named it.
    const { t } = useTranslation()
    const label = isBuiltInStatus(status.value) ? t(status.value, { defaultValue: status.label }) : status.label


    return (
        <div
            className={cn(
                // Never two lines: a narrow column truncates the row, not the chip.
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium",
                status.color,
            )}
        >
            {status.icon && <status.icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <div>{label}</div>
        </div>
    )
}